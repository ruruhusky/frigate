import cv2
import imutils
import numpy as np

from frigate.config import MotionConfig
from frigate.motion import MotionDetector


class ImprovedMotionDetector(MotionDetector):
    def __init__(
        self,
        frame_shape,
        config: MotionConfig,
        fps: int,
        improve_contrast,
        threshold,
        contour_area,
    ):
        self.config = config
        self.frame_shape = frame_shape
        self.resize_factor = frame_shape[0] / config.frame_height
        self.motion_frame_size = (
            config.frame_height,
            config.frame_height * frame_shape[1] // frame_shape[0],
        )
        self.avg_frame = np.zeros(self.motion_frame_size, np.float32)
        self.avg_delta = np.zeros(self.motion_frame_size, np.float32)
        self.motion_frame_count = 0
        self.frame_counter = 0
        resized_mask = cv2.resize(
            config.mask,
            dsize=(self.motion_frame_size[1], self.motion_frame_size[0]),
            interpolation=cv2.INTER_LINEAR,
        )
        self.mask = np.where(resized_mask == [0])
        self.save_images = False
        self.improve_contrast = improve_contrast
        self.threshold = threshold
        self.contour_area = contour_area

    def detect(self, frame):
        motion_boxes = []

        gray = frame[0 : self.frame_shape[0], 0 : self.frame_shape[1]]

        # resize frame
        resized_frame = cv2.resize(
            gray,
            dsize=(self.motion_frame_size[1], self.motion_frame_size[0]),
            interpolation=cv2.INTER_LINEAR,
        )

        resized_frame = cv2.GaussianBlur(resized_frame, (3, 3), cv2.BORDER_DEFAULT)

        # Improve contrast
        if self.improve_contrast.value:
            resized_frame = cv2.equalizeHist(resized_frame)

        # mask frame
        resized_frame[self.mask] = [255]

        if self.save_images:
            self.frame_counter += 1
        # compare to average
        frameDelta = cv2.absdiff(resized_frame, cv2.convertScaleAbs(self.avg_frame))

        # compute the threshold image for the current frame
        thresh = cv2.threshold(
            frameDelta, self.threshold.value, 255, cv2.THRESH_BINARY
        )[1]

        # dilate the thresholded image to fill in holes, then find contours
        # on thresholded image
        thresh_dilated = cv2.dilate(thresh, None, iterations=1)
        cnts = cv2.findContours(
            thresh_dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        cnts = imutils.grab_contours(cnts)

        # loop over the contours
        for c in cnts:
            # if the contour is big enough, count it as motion
            contour_area = cv2.contourArea(c)
            if contour_area > self.contour_area.value:
                x, y, w, h = cv2.boundingRect(c)
                motion_boxes.append(
                    (
                        int(x * self.resize_factor),
                        int(y * self.resize_factor),
                        int((x + w) * self.resize_factor),
                        int((y + h) * self.resize_factor),
                    )
                )

        if self.save_images:
            thresh_dilated = cv2.cvtColor(thresh_dilated, cv2.COLOR_GRAY2BGR)
            for c in cnts:
                contour_area = cv2.contourArea(c)
                if contour_area > self.contour_area.value:
                    x, y, w, h = cv2.boundingRect(c)
                    cv2.rectangle(
                        thresh_dilated,
                        (x, y),
                        (x + w, y + h),
                        (0, 0, 255),
                        2,
                    )
            cv2.imwrite(
                f"debug/frames/improved-{self.frame_counter}.jpg", thresh_dilated
            )

        if len(motion_boxes) > 0:
            self.motion_frame_count += 1
            if self.motion_frame_count >= 10:
                # only average in the current frame if the difference persists for a bit
                cv2.accumulateWeighted(
                    resized_frame, self.avg_frame, self.config.frame_alpha
                )
        else:
            # when no motion, just keep averaging the frames together
            cv2.accumulateWeighted(
                resized_frame, self.avg_frame, self.config.frame_alpha
            )
            self.motion_frame_count = 0

        return motion_boxes
