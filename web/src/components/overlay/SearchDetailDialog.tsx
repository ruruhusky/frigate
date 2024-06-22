import { isDesktop, isIOS } from "react-device-detect";
import { Sheet, SheetContent } from "../ui/sheet";
import { Drawer, DrawerContent } from "../ui/drawer";
import { SearchResult } from "@/types/search";
import useSWR from "swr";
import { FrigateConfig } from "@/types/frigateConfig";
import { useFormattedTimestamp } from "@/hooks/use-date-utils";
import { getIconForLabel } from "@/utils/iconUtil";
import { useApiHost } from "@/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useState } from "react";

type SearchDetailDialogProps = {
  search?: SearchResult;
  setSearch: (search: SearchResult | undefined) => void;
};
export default function SearchDetailDialog({
  search,
  setSearch,
}: SearchDetailDialogProps) {
  const { data: config } = useSWR<FrigateConfig>("config", {
    revalidateOnFocus: false,
  });

  const apiHost = useApiHost();

  // data

  const [desc, setDesc] = useState(search?.description);
  const formattedDate = useFormattedTimestamp(
    search?.start_time ?? 0,
    config?.ui.time_format == "24hour"
      ? "%b %-d %Y, %H:%M"
      : "%b %-d %Y, %I:%M %p",
  );

  // content

  const Overlay = isDesktop ? Sheet : Drawer;
  const Content = isDesktop ? SheetContent : DrawerContent;

  return (
    <Overlay
      open={search != undefined}
      onOpenChange={(open) => {
        if (!open) {
          setSearch(undefined);
        }
      }}
    >
      <Content
        className={
          isDesktop ? "sm:max-w-xl" : "max-h-[75dvh] overflow-hidden p-2 pb-4"
        }
      >
        {search && (
          <div className="flex size-full flex-col gap-5">
            <div className="flex w-full flex-row">
              <div className="flex w-full flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <div className="text-sm text-primary/40">Label</div>
                  <div className="flex flex-row items-center gap-2 text-sm capitalize">
                    {getIconForLabel(search.label, "size-4 text-white")}
                    {search.label}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="text-sm text-primary/40">Score</div>
                  <div className="text-sm">
                    {Math.round(search.score * 100)}%
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
                  className="aspect-video select-none transition-opacity"
                  style={
                    isIOS
                      ? {
                          WebkitUserSelect: "none",
                          WebkitTouchCallout: "none",
                        }
                      : undefined
                  }
                  draggable={false}
                  src={
                    search.thumb_path
                      ? `${apiHost}${search.thumb_path.replace("/media/frigate/", "")}`
                      : `${apiHost}api/events/${search.id}/thumbnail.jpg`
                  }
                />
                <Button>Find Similar</Button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-sm text-primary/40">Description</div>
              <Input
                placeholder="Description of the event"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
              <div className="flex w-full flex-row justify-end">
                <Button variant="select">Save</Button>
              </div>
            </div>
          </div>
        )}
      </Content>
    </Overlay>
  );
}
