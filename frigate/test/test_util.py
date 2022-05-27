import unittest

from frigate.config import FrigateConfig
from frigate.util import BoundingBoxTriggerEnum

class TestConfig(unittest.TestCase):
    def setUp(self):
        self.config = {
            "mqtt": {"host": "mqtt"},
            "record": {
                "events": {"retain": {"default": 20, "objects": {"person": 30}}}
            },
            "cameras": {
                "back": {
                    "ffmpeg": {
                        "inputs": [
                            {"path": "rtsp://10.0.0.1:554/video", "roles": ["detect"]}
                        ]
                    },
                    "detect": {
                        "height": 1080,
                        "width": 1920,
                        "fps": 5,
                    },
                    "zones": {"test": {"coordinates": "100,100,400,400"}},
                }
            },
        }

    def test_bounding_box_trigger_points_in_zone(self):
        frigate_config = FrigateConfig(**self.config)
        centroid = (200, 200)
        box = (150, 150, 350, 350)
        zone = frigate_config.cameras["back"].zones["test"]

        assert BoundingBoxTriggerEnum.bottom_center.is_in_zone(centroid, box, zone.contour)
        assert BoundingBoxTriggerEnum.left_center.is_in_zone(centroid, box, zone.contour)
        assert BoundingBoxTriggerEnum.right_center.is_in_zone(centroid, box, zone.contour)
        assert BoundingBoxTriggerEnum.top_center.is_in_zone(centroid, box, zone.contour)

    def test_bounding_box_trigger_points_outside_zone(self):
        frigate_config = FrigateConfig(**self.config)
        centroid = (200, 200)
        box = (0, 0, 500, 500)
        zone = frigate_config.cameras["back"].zones["test"]

        assert not BoundingBoxTriggerEnum.bottom_center.is_in_zone(centroid, box, zone.contour)
        assert not BoundingBoxTriggerEnum.left_center.is_in_zone(centroid, box, zone.contour)
        assert not BoundingBoxTriggerEnum.right_center.is_in_zone(centroid, box, zone.contour)
        assert not BoundingBoxTriggerEnum.top_center.is_in_zone(centroid, box, zone.contour)
