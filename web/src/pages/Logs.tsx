import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LogData, LogLine, LogSeverity } from "@/types/log";
import copy from "copy-to-clipboard";
import { useCallback, useMemo, useRef, useState } from "react";
import { IoIosAlert } from "react-icons/io";
import { GoAlertFill } from "react-icons/go";
import { LuCopy } from "react-icons/lu";
import useSWR from "swr";

const logTypes = ["frigate", "go2rtc", "nginx"] as const;
type LogType = (typeof logTypes)[number];

const frigateDateStamp = /\[[\d\s-:]*]/;
const frigateSeverity = /(DEBUG)|(INFO)|(WARNING)|(ERROR)/;
const frigateSection = /[\w.]*/;

const goSeverity = /(DEB )|(INF )|(WARN )|(ERR )/;
const goSection = /\[[\w]*]/;

const ngSeverity = /(GET)|(POST)|(PATCH)|(DELETE)/;

function Logs() {
  const [logService, setLogService] = useState<LogType>("frigate");

  const { data: frigateLogs } = useSWR<LogData>("logs/frigate", {
    refreshInterval: 1000,
  });
  const { data: go2rtcLogs } = useSWR<LogData>("logs/go2rtc", {
    refreshInterval: 1000,
  });
  const { data: nginxLogs } = useSWR<LogData>("logs/nginx", {
    refreshInterval: 1000,
  });

  // convert to log data

  const logs = useMemo(() => {
    if (logService == "frigate") {
      return frigateLogs;
    } else if (logService == "go2rtc") {
      return go2rtcLogs;
    } else if (logService == "nginx") {
      return nginxLogs;
    } else {
      return undefined;
    }
  }, [logService, frigateLogs, go2rtcLogs, nginxLogs]);

  const logLines = useMemo<LogLine[]>(() => {
    if (logService == "frigate") {
      if (!frigateLogs) {
        return [];
      }

      return frigateLogs.lines
        .map((line) => {
          const match = frigateDateStamp.exec(line);

          if (!match) {
            return null;
          }

          const sectionMatch = frigateSection.exec(
            line.substring(match.index + match[0].length).trim(),
          );

          if (!sectionMatch) {
            return null;
          }

          return {
            dateStamp: match.toString().slice(1, -1),
            severity: frigateSeverity
              .exec(line)
              ?.at(0)
              ?.toString()
              ?.toLowerCase() as LogSeverity,
            section: sectionMatch.toString(),
            content: line
              .substring(line.indexOf(":", match.index + match[0].length) + 2)
              .trim(),
          };
        })
        .filter((value) => value != null) as LogLine[];
    } else if (logService == "go2rtc") {
      if (!go2rtcLogs) {
        return [];
      }

      return go2rtcLogs.lines
        .map((line) => {
          if (line.length == 0) {
            return null;
          }

          const severity = goSeverity.exec(line);

          let section =
            goSection.exec(line)?.toString()?.slice(1, -1) ?? "startup";

          if (frigateSeverity.exec(section)) {
            section = "startup";
          }

          let contentStart;

          if (section == "startup") {
            if (severity) {
              contentStart = severity.index + severity[0].length;
            } else {
              contentStart = line.lastIndexOf("]") + 1;
            }
          } else {
            contentStart = line.indexOf(section) + section.length + 2;
          }

          return {
            dateStamp: line.substring(0, 19),
            severity: "INFO",
            section: section,
            content: line.substring(contentStart).trim(),
          };
        })
        .filter((value) => value != null) as LogLine[];
    } else if (logService == "nginx") {
      if (!nginxLogs) {
        return [];
      }

      return nginxLogs.lines
        .map((line) => {
          if (line.length == 0) {
            return null;
          }

          return {
            dateStamp: line.substring(0, 19),
            severity: "INFO",
            section: ngSeverity.exec(line)?.at(0)?.toString() ?? "META",
            content: line.substring(line.indexOf(" ", 20)).trim(),
          };
        })
        .filter((value) => value != null) as LogLine[];
    } else {
      return [];
    }
  }, [logService, frigateLogs, go2rtcLogs, nginxLogs]);

  const handleCopyLogs = useCallback(() => {
    if (logs) {
      copy(logs.lines.join("\n"));
    }
  }, [logs]);

  // scroll to bottom button

  const contentRef = useRef<HTMLDivElement | null>(null);
  const [endVisible, setEndVisible] = useState(true);
  const observer = useRef<IntersectionObserver | null>(null);
  const endLogRef = useCallback(
    (node: HTMLElement | null) => {
      if (observer.current) observer.current.disconnect();
      try {
        observer.current = new IntersectionObserver((entries) => {
          setEndVisible(entries[0].isIntersecting);
        });
        if (node) observer.current.observe(node);
      } catch (e) {
        // no op
      }
    },
    [setEndVisible],
  );

  return (
    <div className="size-full p-2 flex flex-col">
      <div className="flex justify-between items-center">
        <ToggleGroup
          className="*:px-3 *:py-4 *:rounded-2xl"
          type="single"
          size="sm"
          value={logService}
          onValueChange={(value: LogType) =>
            value ? setLogService(value) : null
          } // don't allow the severity to be unselected
        >
          {Object.values(logTypes).map((item) => (
            <ToggleGroupItem
              key={item}
              className={`flex items-center justify-between gap-2 ${logService == item ? "" : "text-gray-500"}`}
              value={item}
              aria-label={`Select ${item}`}
            >
              <div className="capitalize">{`${item} Logs`}</div>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div>
          <Button
            className="flex justify-between items-center gap-2"
            size="sm"
            onClick={handleCopyLogs}
          >
            <LuCopy />
            <div className="hidden md:block">Copy to Clipboard</div>
          </Button>
        </div>
      </div>

      {!endVisible && (
        <Button
          className="absolute bottom-8 left-[50%] -translate-x-[50%] rounded-xl bg-accent-foreground text-white bg-gray-400 z-20 p-2"
          variant="secondary"
          onClick={() =>
            contentRef.current?.scrollTo({
              top: contentRef.current?.scrollHeight,
              behavior: "smooth",
            })
          }
        >
          Jump to Bottom
        </Button>
      )}

      <div
        ref={contentRef}
        className="w-full h-min my-2 font-mono text-sm rounded py-4 sm:py-2 whitespace-pre-wrap overflow-auto"
      >
        <div className="py-2 sticky top-0 -translate-y-1/4 grid grid-cols-5 sm:grid-cols-8 md:grid-cols-12 bg-background *:p-2">
          <div className="p-1 flex items-center capitalize border-y border-l">
            Type
          </div>
          <div className="col-span-2 sm:col-span-1 flex items-center border-y border-l">
            Timestamp
          </div>
          <div className="col-span-2 flex items-center border-y border-l border-r sm:border-r-0">
            Tag
          </div>
          <div className="col-span-5 sm:col-span-4 md:col-span-8 flex items-center border">
            Message
          </div>
        </div>
        {logLines.map((log, idx) => (
          <LogLineData key={`${idx}-${log.content}`} offset={idx} line={log} />
        ))}
        <div ref={endLogRef} />
      </div>
    </div>
  );
}

type LogLineDataProps = {
  line: LogLine;
  offset: number;
};
function LogLineData({ line, offset }: LogLineDataProps) {
  // long log message

  const contentRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);

  const contentOverflows = useMemo(() => {
    if (!contentRef.current) {
      return false;
    }

    return contentRef.current.scrollWidth > contentRef.current.clientWidth;
    // update on ref change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentRef.current]);

  // severity coloring

  const severityClassName = useMemo(() => {
    switch (line.severity) {
      case "info":
        return "text-secondary-foreground rounded-md";
      case "warning":
        return "text-yellow-400 rounded-md";
      case "error":
        return "text-danger rounded-md";
    }
  }, [line]);

  return (
    <div
      className={`py-2 grid grid-cols-5 sm:grid-cols-8 md:grid-cols-12 gap-2 ${offset % 2 == 0 ? "bg-secondary" : "bg-secondary/80"} border-t border-x`}
    >
      <div
        className={`h-full p-1 flex items-center gap-2 capitalize ${severityClassName}`}
      >
        {line.severity == "error" ? (
          <GoAlertFill className="size-5" />
        ) : (
          <IoIosAlert className="size-5" />
        )}
        {line.severity}
      </div>
      <div className="h-full col-span-2 sm:col-span-1 flex items-center">
        {line.dateStamp}
      </div>
      <div className="h-full col-span-2 flex items-center overflow-hidden text-ellipsis">
        {line.section}
      </div>
      <div className="w-full col-span-5 sm:col-span-4 md:col-span-8 flex justify-between items-center">
        <div
          ref={contentRef}
          className={`w-[94%] flex items-center" ${expanded ? "" : "overflow-hidden whitespace-nowrap text-ellipsis"}`}
        >
          {line.content}
        </div>
        {contentOverflows && (
          <Button className="mr-4" onClick={() => setExpanded(!expanded)}>
            ...
          </Button>
        )}
      </div>
    </div>
  );
}

export default Logs;
