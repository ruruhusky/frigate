"""Utilities for builtin types manipulation."""

import copy
import datetime
import logging
import pytz
import re
import shlex
import urllib.parse
from collections import Counter
from collections.abc import Mapping
from typing import Any, Tuple

import yaml

from frigate.const import REGEX_HTTP_CAMERA_USER_PASS, REGEX_RTSP_CAMERA_USER_PASS


logger = logging.getLogger(__name__)


class EventsPerSecond:
    def __init__(self, max_events=1000, last_n_seconds=10):
        self._start = None
        self._max_events = max_events
        self._last_n_seconds = last_n_seconds
        self._timestamps = []

    def start(self):
        self._start = datetime.datetime.now().timestamp()

    def update(self):
        now = datetime.datetime.now().timestamp()
        if self._start is None:
            self._start = now
        self._timestamps.append(now)
        # truncate the list when it goes 100 over the max_size
        if len(self._timestamps) > self._max_events + 100:
            self._timestamps = self._timestamps[(1 - self._max_events) :]
        self.expire_timestamps(now)

    def eps(self):
        now = datetime.datetime.now().timestamp()
        if self._start is None:
            self._start = now
        # compute the (approximate) events in the last n seconds
        self.expire_timestamps(now)
        seconds = min(now - self._start, self._last_n_seconds)
        # avoid divide by zero
        if seconds == 0:
            seconds = 1
        return len(self._timestamps) / seconds

    # remove aged out timestamps
    def expire_timestamps(self, now):
        threshold = now - self._last_n_seconds
        while self._timestamps and self._timestamps[0] < threshold:
            del self._timestamps[0]


def deep_merge(dct1: dict, dct2: dict, override=False, merge_lists=False) -> dict:
    """
    :param dct1: First dict to merge
    :param dct2: Second dict to merge
    :param override: if same key exists in both dictionaries, should override? otherwise ignore. (default=True)
    :return: The merge dictionary
    """
    merged = copy.deepcopy(dct1)
    for k, v2 in dct2.items():
        if k in merged:
            v1 = merged[k]
            if isinstance(v1, dict) and isinstance(v2, Mapping):
                merged[k] = deep_merge(v1, v2, override)
            elif isinstance(v1, list) and isinstance(v2, list):
                if merge_lists:
                    merged[k] = v1 + v2
            else:
                if override:
                    merged[k] = copy.deepcopy(v2)
        else:
            merged[k] = copy.deepcopy(v2)
    return merged


def load_config_with_no_duplicates(raw_config) -> dict:
    """Get config ensuring duplicate keys are not allowed."""

    # https://stackoverflow.com/a/71751051
    class PreserveDuplicatesLoader(yaml.loader.Loader):
        pass

    def map_constructor(loader, node, deep=False):
        keys = [loader.construct_object(node, deep=deep) for node, _ in node.value]
        vals = [loader.construct_object(node, deep=deep) for _, node in node.value]
        key_count = Counter(keys)
        data = {}
        for key, val in zip(keys, vals):
            if key_count[key] > 1:
                raise ValueError(
                    f"Config input {key} is defined multiple times for the same field, this is not allowed."
                )
            else:
                data[key] = val
        return data

    PreserveDuplicatesLoader.add_constructor(
        yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, map_constructor
    )
    return yaml.load(raw_config, PreserveDuplicatesLoader)


def clean_camera_user_pass(line: str) -> str:
    """Removes user and password from line."""
    if "rtsp://" in line:
        return re.sub(REGEX_RTSP_CAMERA_USER_PASS, "://*:*@", line)
    else:
        return re.sub(REGEX_HTTP_CAMERA_USER_PASS, "user=*&password=*", line)


def escape_special_characters(path: str) -> str:
    """Cleans reserved characters to encodings for ffmpeg."""
    try:
        found = re.search(REGEX_RTSP_CAMERA_USER_PASS, path).group(0)[3:-1]
        pw = found[(found.index(":") + 1) :]
        return path.replace(pw, urllib.parse.quote_plus(pw))
    except AttributeError:
        # path does not have user:pass
        return path


def get_ffmpeg_arg_list(arg: Any) -> list:
    """Use arg if list or convert to list format."""
    return arg if isinstance(arg, list) else shlex.split(arg)


def load_labels(path, encoding="utf-8"):
    """Loads labels from file (with or without index numbers).
    Args:
      path: path to label file.
      encoding: label file encoding.
    Returns:
      Dictionary mapping indices to labels.
    """
    with open(path, "r", encoding=encoding) as f:
        labels = {index: "unknown" for index in range(91)}
        lines = f.readlines()
        if not lines:
            return {}

        if lines[0].split(" ", maxsplit=1)[0].isdigit():
            pairs = [line.split(" ", maxsplit=1) for line in lines]
            labels.update({int(index): label.strip() for index, label in pairs})
        else:
            labels.update({index: line.strip() for index, line in enumerate(lines)})
        return labels


def get_tz_modifiers(tz_name: str) -> Tuple[str, str]:
    seconds_offset = (
        datetime.datetime.now(pytz.timezone(tz_name)).utcoffset().total_seconds()
    )
    hours_offset = int(seconds_offset / 60 / 60)
    minutes_offset = int(seconds_offset / 60 - hours_offset * 60)
    hour_modifier = f"{hours_offset} hour"
    minute_modifier = f"{minutes_offset} minute"
    return hour_modifier, minute_modifier


def to_relative_box(
    width: int, height: int, box: Tuple[int, int, int, int]
) -> Tuple[int, int, int, int]:
    return (
        box[0] / width,  # x
        box[1] / height,  # y
        (box[2] - box[0]) / width,  # w
        (box[3] - box[1]) / height,  # h
    )
