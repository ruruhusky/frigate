import { h } from 'preact';
import useSWR from 'swr';
import ActivityIndicator from './ActivityIndicator';
import { formatUnixTimestampToDateTime } from '../utils/dateUtil';
import PlayIcon from '../icons/Play';
import ExitIcon from '../icons/Exit';
import { Zone } from '../icons/Zone';
import { useState } from 'preact/hooks';
import Button from './Button';

export default function TimelineSummary({ event, onFrameSelected }) {
  const { data: eventTimeline } = useSWR([
    'timeline',
    {
      source_id: event.id,
    },
  ]);

  const { data: config } = useSWR('config');

  const [timeIndex, setTimeIndex] = useState(-1);

  const onSelectMoment = async (index) => {
    setTimeIndex(index);
    onFrameSelected(eventTimeline[index]);
  };

  if (!eventTimeline || !config) {
    return <ActivityIndicator />;
  }

  return (
    <div className="flex flex-col">
      <div className="h-14 flex justify-center">
        <div className="w-1/4 flex flex-row flex-nowrap justify-between overflow-auto">
          {eventTimeline.map((item, index) =>
            item.class_type == 'visible' || item.class_type == 'gone' ? (
              <Button
                className="rounded-full"
                type="text"
                color={index == timeIndex ? 'blue' : 'gray'}
                aria-label={getTimelineItemDescription(config, item, event)}
                onClick={() => onSelectMoment(index)}
              >
                {item.class_type == 'visible' ? <PlayIcon className="w-8" /> : <ExitIcon className="w-8" />}
              </Button>
            ) : (
              <Button
                className="rounded-full"
                type="text"
                color={index == timeIndex ? 'blue' : 'gray'}
                aria-label={getTimelineItemDescription(config, item, event)}
                onClick={() => onSelectMoment(index)}
              >
                <Zone className="w-8" />
              </Button>
            )
          )}
        </div>
      </div>
      {timeIndex >= 0 ? (
        <div className="bg-gray-500 p-4 m-2 max-w-md self-center">
          Disclaimer: This data comes from the detect feed but is shown on the recordings, it is unlikely that the
          streams are perfectly in sync so the bounding box and the footage will not line up perfectly.
        </div>
      ) : null}
    </div>
  );
}

function getTimelineItemDescription(config, timelineItem, event) {
  if (timelineItem.class_type == 'visible') {
    return `${event.label} detected at ${formatUnixTimestampToDateTime(timelineItem.timestamp, {
      date_style: 'short',
      time_style: 'medium',
      time_format: config.ui.time_format,
    })}`;
  } else if (timelineItem.class_type == 'entered_zone') {
    return `${event.label.replaceAll('_', ' ')} entered ${timelineItem.data.zones
      .join(' and ')
      .replaceAll('_', ' ')} at ${formatUnixTimestampToDateTime(timelineItem.timestamp, {
      date_style: 'short',
      time_style: 'medium',
      time_format: config.ui.time_format,
    })}`;
  }

  return `${event.label} left at ${formatUnixTimestampToDateTime(timelineItem.timestamp, {
    date_style: 'short',
    time_style: 'medium',
    time_format: config.ui.time_format,
  })}`;
}
