import { useEventUtils } from "@/hooks/use-event-utils";
import { useSegmentUtils } from "@/hooks/use-segment-utils";
import { Event } from "@/types/event";
import { useMemo } from "react";

type EventSegmentProps = {
  events: Event[];
  segmentTime: number;
  segmentDuration: number;
  timestampSpread: number;
  showMinimap: boolean;
  minimapStartTime?: number;
  minimapEndTime?: number;
  severityType: string;
};

export function EventSegment({
  events,
  segmentTime,
  segmentDuration,
  timestampSpread,
  showMinimap,
  minimapStartTime,
  minimapEndTime,
  severityType,
}: EventSegmentProps) {
  const { isStartOfEvent, isEndOfEvent } = useEventUtils(
    events,
    segmentDuration
  );
  const {
    getSeverity,
    getReviewed,
    displaySeverityType,
    shouldShowRoundedCorners,
  } = useSegmentUtils(segmentDuration, events, severityType);

  const { alignDateToTimeline } = useEventUtils(events, segmentDuration);

  const severity = useMemo(
    () => getSeverity(segmentTime),
    [getSeverity, segmentTime]
  );
  const reviewed = useMemo(
    () => getReviewed(segmentTime),
    [getReviewed, segmentTime]
  );
  const showRoundedCorners = useMemo(
    () => shouldShowRoundedCorners(segmentTime),
    [shouldShowRoundedCorners, segmentTime]
  );

  const timestamp = useMemo(() => new Date(segmentTime), [segmentTime]);
  const segmentKey = useMemo(
    () => Math.floor(segmentTime / 1000),
    [segmentTime]
  );

  const alignedMinimapStartTime = useMemo(
    () => alignDateToTimeline(minimapStartTime ?? 0),
    [minimapStartTime, alignDateToTimeline]
  );
  const alignedMinimapEndTime = useMemo(
    () => alignDateToTimeline(minimapEndTime ?? 0),
    [minimapEndTime, alignDateToTimeline]
  );

  const isInMinimapRange = useMemo(() => {
    return (
      showMinimap &&
      minimapStartTime &&
      minimapEndTime &&
      segmentTime > minimapStartTime &&
      segmentTime < minimapEndTime
    );
  }, [showMinimap, minimapStartTime, minimapEndTime, segmentTime]);

  const isFirstSegmentInMinimap = useMemo(() => {
    return showMinimap && segmentTime === alignedMinimapStartTime;
  }, [showMinimap, segmentTime, alignedMinimapStartTime]);

  const isLastSegmentInMinimap = useMemo(() => {
    return showMinimap && segmentTime === alignedMinimapEndTime;
  }, [showMinimap, segmentTime, alignedMinimapEndTime]);

  const segmentClasses = `flex flex-row ${
    showMinimap
      ? isInMinimapRange
        ? "bg-muted"
        : isLastSegmentInMinimap
          ? ""
          : "opacity-80"
      : ""
  } ${
    isFirstSegmentInMinimap || isLastSegmentInMinimap
      ? "relative h-2 border-b border-gray-500"
      : ""
  }`;

  return (
    <div key={segmentKey} className={segmentClasses}>
      {isFirstSegmentInMinimap && (
        <div className="absolute inset-0 -bottom-5 w-full flex items-center justify-center text-xs text-primary font-medium z-20 text-center text-[9px]">
          {new Date(alignedMinimapStartTime).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            month: "short",
            day: "2-digit",
          })}
        </div>
      )}

      {isLastSegmentInMinimap && (
        <div className="absolute inset-0 -top-1 w-full flex items-center justify-center text-xs text-primary font-medium z-20 text-center text-[9px]">
          {new Date(alignedMinimapEndTime).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            month: "short",
            day: "2-digit",
          })}
        </div>
      )}
      <div className="w-5 h-2 flex justify-left items-end">
        {!isFirstSegmentInMinimap && !isLastSegmentInMinimap && (
          <div
            className={`h-0.5 ${
              timestamp.getMinutes() % timestampSpread === 0 &&
              timestamp.getSeconds() === 0
                ? "w-4 bg-gray-400"
                : "w-2 bg-gray-600"
            }`}
          ></div>
        )}
      </div>
      <div className="w-10 h-2 flex justify-left items-top z-10">
        {!isFirstSegmentInMinimap && !isLastSegmentInMinimap && (
          <div
            key={`${segmentKey}_timestamp`}
            className="text-[8px] text-gray-400"
          >
            {timestamp.getMinutes() % timestampSpread === 0 &&
              timestamp.getSeconds() === 0 &&
              timestamp.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
          </div>
        )}
      </div>

      {severity == displaySeverityType && (
        <div className="mr-3 w-2 h-2 flex justify-left items-end">
          <div
            key={`${segmentKey}_primary_data`}
            className={`
          w-full h-2 bg-gradient-to-r
          ${
            showRoundedCorners && isStartOfEvent(segmentTime)
              ? "rounded-bl-full rounded-br-full"
              : ""
          }
          ${
            showRoundedCorners && isEndOfEvent(segmentTime)
              ? "rounded-tl-full rounded-tr-full"
              : ""
          }
          ${
            reviewed
              ? severity === 1
                ? "from-yellow-200/30 to-yellow-400/30"
                : severity === 2
                  ? "from-orange-400/30 to-orange-600/30"
                  : severity === 3
                    ? "from-red-500/30 to-red-800/30"
                    : ""
              : severity === 1
                ? "from-yellow-200 to-yellow-400"
                : severity === 2
                  ? "from-orange-400 to-orange-600"
                  : severity === 3
                    ? "from-red-500 to-red-800"
                    : ""
          }

          `}
          ></div>
        </div>
      )}

      {severity != displaySeverityType && (
        <div className="h-2 flex flex-grow justify-end items-end">
          <div
            key={`${segmentKey}_secondary_data`}
            className={`
            w-1 h-2 bg-gradient-to-r
            ${
              showRoundedCorners && isStartOfEvent(segmentTime)
                ? "rounded-bl-full rounded-br-full"
                : ""
            }
            ${
              showRoundedCorners && isEndOfEvent(segmentTime)
                ? "rounded-tl-full rounded-tr-full"
                : ""
            }
            ${
              reviewed
                ? severity === 1
                  ? "from-yellow-200/30 to-yellow-400/30"
                  : severity === 2
                    ? "from-orange-400/30 to-orange-600/30"
                    : severity === 3
                      ? "from-red-500/30 to-red-800/30"
                      : ""
                : severity === 1
                  ? "from-yellow-200 to-yellow-400"
                  : severity === 2
                    ? "from-orange-400 to-orange-600"
                    : severity === 3
                      ? "from-red-500 to-red-800"
                      : ""
            }

          `}
          ></div>
        </div>
      )}
    </div>
  );
}

export default EventSegment;
