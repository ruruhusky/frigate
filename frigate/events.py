import datetime
import logging
import os
import queue
import threading
from pathlib import Path

from peewee import fn

from frigate.config import EventsConfig, FrigateConfig
from frigate.const import CLIPS_DIR
from frigate.models import Event
from frigate.timeline import TimelineSourceEnum
from frigate.types import CameraMetricsTypes
from frigate.util import to_relative_box

from multiprocessing.queues import Queue
from multiprocessing.synchronize import Event as MpEvent
from typing import Dict

logger = logging.getLogger(__name__)


def should_update_db(prev_event: Event, current_event: Event) -> bool:
    """If current_event has updated fields and (clip or snapshot)."""
    if current_event["has_clip"] or current_event["has_snapshot"]:
        # if this is the first time has_clip or has_snapshot turned true
        if not prev_event["has_clip"] and not prev_event["has_snapshot"]:
            return True
        # or if any of the following values changed
        if (
            prev_event["top_score"] != current_event["top_score"]
            or prev_event["entered_zones"] != current_event["entered_zones"]
            or prev_event["thumbnail"] != current_event["thumbnail"]
            or prev_event["end_time"] != current_event["end_time"]
        ):
            return True
    return False


class EventProcessor(threading.Thread):
    def __init__(
        self,
        config: FrigateConfig,
        camera_processes: dict[str, CameraMetricsTypes],
        event_queue: Queue,
        event_processed_queue: Queue,
        timeline_queue: Queue,
        stop_event: MpEvent,
    ):
        threading.Thread.__init__(self)
        self.name = "event_processor"
        self.config = config
        self.camera_processes = camera_processes
        self.event_queue = event_queue
        self.event_processed_queue = event_processed_queue
        self.timeline_queue = timeline_queue
        self.events_in_process: Dict[str, Event] = {}
        self.stop_event = stop_event

    def run(self) -> None:
        # set an end_time on events without an end_time on startup
        Event.update(end_time=Event.start_time + 30).where(
            Event.end_time == None
        ).execute()

        while not self.stop_event.is_set():
            try:
                event_type, camera, event_data = self.event_queue.get(timeout=1)
            except queue.Empty:
                continue

            logger.debug(f"Event received: {event_type} {camera} {event_data['id']}")

            self.timeline_queue.put(
                (
                    camera,
                    TimelineSourceEnum.tracked_object,
                    event_type,
                    self.events_in_process.get(event_data["id"]),
                    event_data,
                )
            )

            # if this is the first message, just store it and continue, its not time to insert it in the db
            if event_type == "start":
                self.events_in_process[event_data["id"]] = event_data
                continue

            if should_update_db(self.events_in_process[event_data["id"]], event_data):
                camera_config = self.config.cameras[camera]
                event_config: EventsConfig = camera_config.record.events
                width = camera_config.detect.width
                height = camera_config.detect.height
                first_detector = list(self.config.detectors.values())[0]

                start_time = event_data["start_time"] - event_config.pre_capture
                end_time = (
                    None
                    if event_data["end_time"] is None
                    else event_data["end_time"] + event_config.post_capture
                )
                # score of the snapshot
                score = (
                    None
                    if event_data["snapshot"] is None
                    else event_data["snapshot"]["score"]
                )
                # detection region in the snapshot
                region = (
                    None
                    if event_data["snapshot"] is None
                    else to_relative_box(
                        width,
                        height,
                        event_data["snapshot"]["region"],
                    )
                )
                # bounding box for the snapshot
                box = (
                    None
                    if event_data["snapshot"] is None
                    else to_relative_box(
                        width,
                        height,
                        event_data["snapshot"]["box"],
                    )
                )

                # keep these from being set back to false because the event
                # may have started while recordings and snapshots were enabled
                # this would be an issue for long running events
                if self.events_in_process[event_data["id"]]["has_clip"]:
                    event_data["has_clip"] = True
                if self.events_in_process[event_data["id"]]["has_snapshot"]:
                    event_data["has_snapshot"] = True

                Event.replace(
                    id=event_data["id"],
                    label=event_data["label"],
                    camera=camera,
                    start_time=start_time,
                    end_time=end_time,
                    top_score=event_data["top_score"],
                    score=score,
                    zones=list(event_data["entered_zones"]),
                    thumbnail=event_data["thumbnail"],
                    region=region,
                    box=box,
                    has_clip=event_data["has_clip"],
                    has_snapshot=event_data["has_snapshot"],
                    model_hash=first_detector.model.model_hash,
                    model_type=first_detector.model.model_type,
                    detector_type=first_detector.type,
                ).execute()

                # update the stored copy for comparison on future update messages
                self.events_in_process[event_data["id"]] = event_data

            if event_type == "end":
                del self.events_in_process[event_data["id"]]
                self.event_processed_queue.put((event_data["id"], camera))

        # set an end_time on events without an end_time before exiting
        Event.update(end_time=datetime.datetime.now().timestamp()).where(
            Event.end_time == None
        ).execute()
        logger.info(f"Exiting event processor...")


class EventCleanup(threading.Thread):
    def __init__(self, config: FrigateConfig, stop_event: MpEvent):
        threading.Thread.__init__(self)
        self.name = "event_cleanup"
        self.config = config
        self.stop_event = stop_event
        self.camera_keys = list(self.config.cameras.keys())

    def expire(self, media_type: str) -> None:
        # TODO: Refactor media_type to enum
        ## Expire events from unlisted cameras based on the global config
        if media_type == "clips":
            retain_config = self.config.record.events.retain
            file_extension = "mp4"
            update_params = {"has_clip": False}
        else:
            retain_config = self.config.snapshots.retain
            file_extension = "jpg"
            update_params = {"has_snapshot": False}

        distinct_labels = (
            Event.select(Event.label)
            .where(Event.camera.not_in(self.camera_keys))
            .distinct()
        )

        # loop over object types in db
        for l in distinct_labels:
            # get expiration time for this label
            expire_days = retain_config.objects.get(l.label, retain_config.default)
            expire_after = (
                datetime.datetime.now() - datetime.timedelta(days=expire_days)
            ).timestamp()
            # grab all events after specific time
            expired_events = Event.select().where(
                Event.camera.not_in(self.camera_keys),
                Event.start_time < expire_after,
                Event.label == l.label,
                Event.retain_indefinitely == False,
            )
            # delete the media from disk
            for event in expired_events:
                media_name = f"{event.camera}-{event.id}"
                media_path = Path(
                    f"{os.path.join(CLIPS_DIR, media_name)}.{file_extension}"
                )
                media_path.unlink(missing_ok=True)
                if file_extension == "jpg":
                    media_path = Path(
                        f"{os.path.join(CLIPS_DIR, media_name)}-clean.png"
                    )
                    media_path.unlink(missing_ok=True)

            # update the clips attribute for the db entry
            update_query = Event.update(update_params).where(
                Event.camera.not_in(self.camera_keys),
                Event.start_time < expire_after,
                Event.label == l.label,
                Event.retain_indefinitely == False,
            )
            update_query.execute()

        ## Expire events from cameras based on the camera config
        for name, camera in self.config.cameras.items():
            if media_type == "clips":
                retain_config = camera.record.events.retain
            else:
                retain_config = camera.snapshots.retain
            # get distinct objects in database for this camera
            distinct_labels = (
                Event.select(Event.label).where(Event.camera == name).distinct()
            )

            # loop over object types in db
            for l in distinct_labels:
                # get expiration time for this label
                expire_days = retain_config.objects.get(l.label, retain_config.default)
                expire_after = (
                    datetime.datetime.now() - datetime.timedelta(days=expire_days)
                ).timestamp()
                # grab all events after specific time
                expired_events = Event.select().where(
                    Event.camera == name,
                    Event.start_time < expire_after,
                    Event.label == l.label,
                    Event.retain_indefinitely == False,
                )
                # delete the grabbed clips from disk
                for event in expired_events:
                    media_name = f"{event.camera}-{event.id}"
                    media_path = Path(
                        f"{os.path.join(CLIPS_DIR, media_name)}.{file_extension}"
                    )
                    media_path.unlink(missing_ok=True)
                    if file_extension == "jpg":
                        media_path = Path(
                            f"{os.path.join(CLIPS_DIR, media_name)}-clean.png"
                        )
                        media_path.unlink(missing_ok=True)
                # update the clips attribute for the db entry
                update_query = Event.update(update_params).where(
                    Event.camera == name,
                    Event.start_time < expire_after,
                    Event.label == l.label,
                    Event.retain_indefinitely == False,
                )
                update_query.execute()

    def purge_duplicates(self) -> None:
        duplicate_query = """with grouped_events as (
          select id,
            label,
            camera,
          	has_snapshot,
          	has_clip,
          	row_number() over (
              partition by label, camera, round(start_time/5,0)*5
              order by end_time-start_time desc
            ) as copy_number
          from event
        )

        select distinct id, camera, has_snapshot, has_clip from grouped_events
        where copy_number > 1;"""

        duplicate_events = Event.raw(duplicate_query)
        for event in duplicate_events:
            logger.debug(f"Removing duplicate: {event.id}")
            media_name = f"{event.camera}-{event.id}"
            media_path = Path(f"{os.path.join(CLIPS_DIR, media_name)}.jpg")
            media_path.unlink(missing_ok=True)
            media_path = Path(f"{os.path.join(CLIPS_DIR, media_name)}-clean.png")
            media_path.unlink(missing_ok=True)
            media_path = Path(f"{os.path.join(CLIPS_DIR, media_name)}.mp4")
            media_path.unlink(missing_ok=True)

        (
            Event.delete()
            .where(Event.id << [event.id for event in duplicate_events])
            .execute()
        )

    def run(self) -> None:
        # only expire events every 5 minutes
        while not self.stop_event.wait(300):
            self.expire("clips")
            self.expire("snapshots")
            self.purge_duplicates()

            # drop events from db where has_clip and has_snapshot are false
            delete_query = Event.delete().where(
                Event.has_clip == False, Event.has_snapshot == False
            )
            delete_query.execute()

        logger.info(f"Exiting event cleanup...")
