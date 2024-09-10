import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useApiHost } from "@/api";
import { getIconForLabel } from "@/utils/iconUtil";
import TimeAgo from "../dynamic/TimeAgo";
import useSWR from "swr";
import { FrigateConfig } from "@/types/frigateConfig";
import { isIOS, isMobile, isSafari } from "react-device-detect";
import Chip from "@/components/indicators/Chip";
import { useFormattedTimestamp } from "@/hooks/use-date-utils";
import useImageLoaded from "@/hooks/use-image-loaded";
import { useSwipeable } from "react-swipeable";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import ImageLoadingIndicator from "../indicators/ImageLoadingIndicator";
import ActivityIndicator from "../indicators/activity-indicator";
import { capitalizeFirstLetter } from "@/utils/stringUtil";
import { SearchResult } from "@/types/search";
import useContextMenu from "@/hooks/use-contextmenu";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";

type SearchThumbnailProps = {
  searchResult: SearchResult;
  scrollLock?: boolean;
  findSimilar: () => void;
  onClick: (searchResult: SearchResult, detail: boolean) => void;
};

export default function SearchThumbnail({
  searchResult,
  scrollLock = false,
  findSimilar,
  onClick,
}: SearchThumbnailProps) {
  const apiHost = useApiHost();
  const { data: config } = useSWR<FrigateConfig>("config");
  const [imgRef, imgLoaded, onImgLoad] = useImageLoaded();

  // interaction

  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => setDetails(false),
    onSwipedRight: () => setDetails(true),
    preventScrollOnSwipe: true,
  });

  useContextMenu(imgRef, () => {
    onClick(searchResult, true);
  });

  // Hover Details

  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>();
  const [details, setDetails] = useState(false);
  const [tooltipHovering, setTooltipHovering] = useState(false);
  const showingMoreDetail = useMemo(
    () => details && !tooltipHovering,
    [details, tooltipHovering],
  );
  const [isHovered, setIsHovered] = useState(false);

  const handleOnClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!showingMoreDetail) {
        onClick(searchResult, e.metaKey);
      }
    },
    [searchResult, showingMoreDetail, onClick],
  );

  useEffect(() => {
    if (isHovered && scrollLock) {
      return;
    }

    if (isHovered && !tooltipHovering) {
      setHoverTimeout(
        setTimeout(() => {
          setDetails(true);
          setHoverTimeout(null);
        }, 500),
      );
    } else {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
      }

      setDetails(false);
    }
    // we know that these deps are correct
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHovered, scrollLock, tooltipHovering]);

  // date

  const formattedDate = useFormattedTimestamp(
    searchResult.start_time,
    config?.ui.time_format == "24hour" ? "%b %-d, %H:%M" : "%b %-d, %I:%M %p",
  );

  return (
    <Popover
      open={showingMoreDetail}
      onOpenChange={(open) => {
        if (!open) {
          setDetails(false);
        }
      }}
    >
      <PopoverTrigger asChild>
        <div
          className="relative size-full cursor-pointer"
          onMouseOver={isMobile ? undefined : () => setIsHovered(true)}
          onMouseLeave={isMobile ? undefined : () => setIsHovered(false)}
          onClick={handleOnClick}
          {...swipeHandlers}
        >
          <ImageLoadingIndicator
            className="absolute inset-0"
            imgLoaded={imgLoaded}
          />
          <div className={`${imgLoaded ? "visible" : "invisible"}`}>
            <img
              ref={imgRef}
              className={cn(
                "size-full select-none opacity-100 transition-opacity",
                searchResult.search_source == "thumbnail" && "object-contain",
              )}
              style={
                isIOS
                  ? {
                      WebkitUserSelect: "none",
                      WebkitTouchCallout: "none",
                    }
                  : undefined
              }
              draggable={false}
              src={`${apiHost}api/events/${searchResult.id}/thumbnail.jpg`}
              loading={isSafari ? "eager" : "lazy"}
              onLoad={() => {
                onImgLoad();
              }}
            />

            <div className="absolute left-0 top-2 z-40">
              <Tooltip>
                <div
                  className="flex"
                  onMouseEnter={() => setTooltipHovering(true)}
                  onMouseLeave={() => setTooltipHovering(false)}
                >
                  <TooltipTrigger asChild>
                    <div className="mx-3 pb-1 text-sm text-white">
                      {
                        <>
                          <Chip
                            className={`z-0 flex items-start justify-between space-x-1 bg-gray-500 bg-gradient-to-br from-gray-400 to-gray-500`}
                            onClick={() => onClick(searchResult, true)}
                          >
                            {getIconForLabel(
                              searchResult.label,
                              "size-3 text-white",
                            )}
                          </Chip>
                        </>
                      }
                    </div>
                  </TooltipTrigger>
                </div>
                <TooltipContent className="capitalize">
                  {[...new Set([searchResult.label])]
                    .filter(
                      (item) =>
                        item !== undefined && !item.includes("-verified"),
                    )
                    .map((text) => capitalizeFirstLetter(text))
                    .sort()
                    .join(", ")
                    .replaceAll("-verified", "")}
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="rounded-t-l pointer-events-none absolute inset-x-0 top-0 z-10 h-[30%] w-full bg-gradient-to-b from-black/60 to-transparent"></div>
            <div className="rounded-b-l pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[20%] w-full bg-gradient-to-t from-black/60 to-transparent">
              <div className="mx-3 flex h-full items-end justify-between pb-1 text-sm text-white">
                {searchResult.end_time ? (
                  <TimeAgo time={searchResult.start_time * 1000} dense />
                ) : (
                  <div>
                    <ActivityIndicator size={24} />
                  </div>
                )}
                {formattedDate}
              </div>
            </div>
          </div>
          <PopoverContent>
            <SearchDetails search={searchResult} findSimilar={findSimilar} />
          </PopoverContent>
        </div>
      </PopoverTrigger>
    </Popover>
  );
}

type SearchDetailProps = {
  search?: SearchResult;
  findSimilar: () => void;
};
function SearchDetails({ search, findSimilar }: SearchDetailProps) {
  const { data: config } = useSWR<FrigateConfig>("config", {
    revalidateOnFocus: false,
  });

  const apiHost = useApiHost();

  // data

  const formattedDate = useFormattedTimestamp(
    search?.start_time ?? 0,
    config?.ui.time_format == "24hour"
      ? "%b %-d %Y, %H:%M"
      : "%b %-d %Y, %I:%M %p",
  );

  const score = useMemo(() => {
    if (!search) {
      return 0;
    }

    const value = search.score ?? search.data.top_score;

    return Math.round(value * 100);
  }, [search]);

  const subLabelScore = useMemo(() => {
    if (!search) {
      return undefined;
    }

    if (search.sub_label) {
      return Math.round((search.data?.top_score ?? 0) * 100);
    } else {
      return undefined;
    }
  }, [search]);

  if (!search) {
    return;
  }

  return (
    <div className="mt-3 flex size-full flex-col gap-5 md:mt-0">
      <div className="flex w-full flex-row">
        <div className="flex w-full flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="text-sm text-primary/40">Label</div>
            <div className="flex flex-row items-center gap-2 text-sm capitalize">
              {getIconForLabel(search.label, "size-4 text-primary")}
              {search.label}
              {search.sub_label && ` (${search.sub_label})`}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="text-sm text-primary/40">Score</div>
            <div className="text-sm">
              {score}%{subLabelScore && ` (${subLabelScore}%)`}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="text-sm text-primary/40">Camera</div>
            <div className="text-sm capitalize">
              {search.camera.replaceAll("_", " ")}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="text-sm text-primary/40">Timestamp</div>
            <div className="text-sm">{formattedDate}</div>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 px-6">
          <img
            className="aspect-video select-none rounded-lg object-contain transition-opacity"
            style={
              isIOS
                ? {
                    WebkitUserSelect: "none",
                    WebkitTouchCallout: "none",
                  }
                : undefined
            }
            draggable={false}
            src={`${apiHost}api/events/${search.id}/thumbnail.jpg`}
          />
          <Button variant="secondary" onClick={findSimilar}>
            Find Similar
          </Button>
        </div>
      </div>
    </div>
  );
}
