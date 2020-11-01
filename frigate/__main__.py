import faulthandler; faulthandler.enable()
import os 
import json
import yaml
import multiprocessing as mp

from playhouse.sqlite_ext import *
from typing import Dict, List

from frigate.config import FRIGATE_CONFIG_SCHEMA
from frigate.edgetpu import EdgeTPUProcess
from frigate.http import create_app
from frigate.models import Event
from frigate.mqtt import create_mqtt_client
from frigate.object_processing import TrackedObjectProcessor
from frigate.video import get_frame_shape, track_camera

class FrigateApp():
    def __init__(self):
        self.stop_event = mp.Event()
        self.config: dict = None
        self.detection_queue = mp.Queue()
        self.detectors: Dict[str: EdgeTPUProcess] = {}
        self.detection_out_events: Dict[str: mp.Event] = {}
        self.detection_shms: List[mp.shared_memory.SharedMemory] = []
    
    def init_config(self):
        config_file = os.environ.get('CONFIG_FILE', '/config/config.yml')

        if config_file.endswith(".yml"):
            with open(config_file) as f:
                config = yaml.safe_load(f)
        elif config_file.endswith(".json"):
            with open(config_file) as f:
                config = json.load(f)
        
        self.config = FRIGATE_CONFIG_SCHEMA(config)

        for camera_config in self.config['cameras'].values():
            if 'width' in camera_config and 'height' in camera_config:
                frame_shape = (camera_config['height'], camera_config['width'], 3)
            else:
                frame_shape = get_frame_shape(camera_config['ffmpeg']['input'])
        
            camera_config['frame_shape'] = frame_shape

        # TODO: sub in FRIGATE_ENV vars

    def init_queues(self):
        # Queue for clip processing
        self.event_queue = mp.Queue()

        # Queue for cameras to push tracked objects to
        self.detected_frames_queue = mp.Queue(maxsize=len(self.config['cameras'].keys())*2)

    def init_database(self):
        self.db = SqliteExtDatabase(f"/{os.path.join(self.config['save_clips']['clips_dir'], 'frigate.db')}")
        models = [Event]
        self.db.bind(models)
        self.db.create_tables(models, safe=True)

    def init_web_server(self):
        self.flask_app = create_app(self.db)

    def init_mqtt(self):
        # TODO: create config class
        mqtt_config = self.config['mqtt']
        self.mqtt_client = create_mqtt_client(
            mqtt_config['host'],
            mqtt_config['port'],
            mqtt_config['topic_prefix'],
            mqtt_config['client_id'],
            mqtt_config.get('user'),
            mqtt_config.get('password')
        )

    def start_detectors(self):
        for name in self.config['cameras'].keys():
            self.detection_out_events[name] = mp.Event()
            shm_in = mp.shared_memory.SharedMemory(name=name, create=True, size=300*300*3)
            shm_out = mp.shared_memory.SharedMemory(name=f"out-{name}", create=True, size=20*6*4)
            self.detection_shms.append(shm_in)
            self.detection_shms.append(shm_out)

        for name, detector in self.config['detectors'].items():
            if detector['type'] == 'cpu':
                self.detectors[name] = EdgeTPUProcess(self.detection_queue, out_events=self.detection_out_events, tf_device='cpu')
            if detector['type'] == 'edgetpu':
                self.detectors[name] = EdgeTPUProcess(self.detection_queue, out_events=self.detection_out_events, tf_device=detector['device'])

    def start_detected_frames_processor(self):
        self.detected_frames_processor = TrackedObjectProcessor(self.config['cameras'], self.mqtt_client, self.config['mqtt']['topic_prefix'], 
            self.detected_frames_queue, self.event_queue, self.stop_event)
        self.detected_frames_processor.start()

    def start_camera_processors(self):
        self.camera_process_info = {}
        for name, config in self.config['cameras'].items():
            self.camera_process_info[name] = {
                'camera_fps': mp.Value('d', 0.0),
                'skipped_fps': mp.Value('d', 0.0),
                'process_fps': mp.Value('d', 0.0),
                'detection_fps': mp.Value('d', 0.0),
                'detection_frame': mp.Value('d', 0.0),
                'read_start': mp.Value('d', 0.0),
                'ffmpeg_pid': mp.Value('i', 0),
                'frame_queue': mp.Queue(maxsize=2)
            }
            camera_process = mp.Process(target=track_camera, args=(name, config,
                self.detection_queue, self.detection_out_events[name], self.detected_frames_queue, 
                self.camera_process_info[name]))
            camera_process.daemon = True
            self.camera_process_info[name]['process'] = camera_process
            camera_process.start()
            print(f"Camera process started for {name}: {camera_process.pid}")

    def start_camera_capture_processes(self):
        pass

    def start_watchdog(self):
        pass

    def start(self):
        self.init_config()
        self.init_queues()
        self.init_database()
        self.init_web_server()
        self.init_mqtt()
        self.start_detectors()
        self.start_detected_frames_processor()
        self.start_camera_processors()
        self.start_camera_capture_processes()
        self.start_watchdog()
        self.flask_app.run(host='0.0.0.0', port=self.config['web_port'], debug=False)
        self.stop()
    
    def stop(self):
        print(f"Stopping...")
        self.stop_event.set()

        self.detected_frames_processor.join()

        for detector in self.detectors.values():
            detector.stop()

        while len(self.detection_shms) > 0:
            shm = self.detection_shms.pop()
            shm.close()
            shm.unlink()

if __name__ == '__main__':
    frigate_app = FrigateApp()

    frigate_app.start()
