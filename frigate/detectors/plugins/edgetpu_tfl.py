import logging

import numpy as np
from pydantic import Field
from typing_extensions import Literal

from frigate.detectors.detection_api import DetectionApi
from frigate.detectors.detector_config import BaseDetectorConfig
import frigate.detectors.yolo_utils as yolo_utils

try:
    from tflite_runtime.interpreter import Interpreter, load_delegate
except ModuleNotFoundError:
    from tensorflow.lite.python.interpreter import Interpreter, load_delegate


logger = logging.getLogger(__name__)

DETECTOR_KEY = "edgetpu"


class EdgeTpuDetectorConfig(BaseDetectorConfig):
    type: Literal[DETECTOR_KEY]
    device: str = Field(default=None, title="Device Type")


class EdgeTpuTfl(DetectionApi):
    type_key = DETECTOR_KEY

    def __init__(self, detector_config: EdgeTpuDetectorConfig):
        device_config = {}
        if detector_config.device is not None:
            device_config = {"device": detector_config.device}

        edge_tpu_delegate = None

        try:
            device_type = (
                device_config["device"] if "device" in device_config else "auto"
            )
            logger.info(f"Attempting to load TPU as {device_type}")
            edge_tpu_delegate = load_delegate("libedgetpu.so.1.0", device_config)
            logger.info("TPU found")
            self.interpreter = Interpreter(
                model_path=detector_config.model.path,
                experimental_delegates=[edge_tpu_delegate],
            )
        except ValueError:
            logger.error(
                "No EdgeTPU was detected. If you do not have a Coral device yet, you must configure CPU detectors."
            )
            raise

        self.interpreter.allocate_tensors()

        self.tensor_input_details = self.interpreter.get_input_details()
        self.tensor_output_details = self.interpreter.get_output_details()
        self.model_type = detector_config.model.model_type

        self.class_aggregation = yolo_utils.generate_class_aggregation_from_config(detector_config)

    def detect_raw(self, tensor_input):
        if self.model_type == 'yolov8':
            scale, zero_point = self.tensor_input_details[0]['quantization']
            tensor_input = ((tensor_input - scale * zero_point * 255) * (1.0 / (scale * 255))).astype(self.tensor_input_details[0]['dtype'])

        self.interpreter.set_tensor(self.tensor_input_details[0]["index"], tensor_input)
        self.interpreter.invoke()

        if self.model_type == 'yolov8':
            scale, zero_point = self.tensor_output_details[0]['quantization']
            tensor_output = self.interpreter.get_tensor(self.tensor_output_details[0]['index'])
            tensor_output = (tensor_output.astype(np.float32) - zero_point) * scale
            model_input_shape = self.tensor_input_details[0]['shape']
            tensor_output[:, [0, 2]] *= model_input_shape[2]
            tensor_output[:, [1, 3]] *= model_input_shape[1]
            return yolo_utils.yolov8_postprocess(model_input_shape, tensor_output, class_aggregation = self.class_aggregation)

        boxes = self.interpreter.tensor(self.tensor_output_details[0]["index"])()[0]
        class_ids = self.interpreter.tensor(self.tensor_output_details[1]["index"])()[0]
        scores = self.interpreter.tensor(self.tensor_output_details[2]["index"])()[0]
        count = int(
            self.interpreter.tensor(self.tensor_output_details[3]["index"])()[0]
        )

        detections = np.zeros((20, 6), np.float32)

        for i in range(count):
            if scores[i] < 0.4 or i == 20:
                break
            detections[i] = [
                class_ids[i],
                float(scores[i]),
                boxes[i][0],
                boxes[i][1],
                boxes[i][2],
                boxes[i][3],
            ]

        return detections
