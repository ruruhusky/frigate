import ActivityIndicator from "../indicators/activity-indicator";
import { LuPencil, LuTrash } from "react-icons/lu";
import { Button } from "../ui/button";
import { useState } from "react";
import { isDesktop } from "react-device-detect";
import { FaPlay } from "react-icons/fa";
import Chip from "../indicators/Chip";
import { Skeleton } from "../ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import useKeyboardListener from "@/hooks/use-keyboard-listener";
import { Export } from "@/types/export";

type ExportProps = {
  className: string;
  exportedRecording: Export;
  onSelect: (selected: Export) => void;
  onRename: (original: string, update: string) => void;
  onDelete: (file: string) => void;
};

export default function ExportCard({
  className,
  exportedRecording,
  onSelect,
  onRename,
  onDelete,
}: ExportProps) {
  const [hovered, setHovered] = useState(false);
  const [loading, setLoading] = useState(true);

  // editing name

  const [editName, setEditName] = useState<{
    original: string;
    update: string;
  }>();

  useKeyboardListener(
    editName != undefined ? ["Enter"] : [],
    (_, down, repeat) => {
      if (down && !repeat && editName && editName.update.length > 0) {
        onRename(editName.original, editName.update);
        setEditName(undefined);
      }
    },
  );

  return (
    <>
      <Dialog
        open={editName != undefined}
        onOpenChange={(open) => {
          if (!open) {
            setEditName(undefined);
          }
        }}
      >
        <DialogContent>
          <DialogTitle>Rename Export</DialogTitle>
          {editName && (
            <>
              <Input
                className="mt-3"
                type="search"
                placeholder={editName?.original}
                value={editName?.update}
                onChange={(e) =>
                  setEditName({
                    original: editName.original ?? "",
                    update: e.target.value,
                  })
                }
              />
              <DialogFooter>
                <Button
                  size="sm"
                  variant="select"
                  disabled={(editName?.update?.length ?? 0) == 0}
                  onClick={() => {
                    onRename(
                      editName.original,
                      editName.update.replaceAll(" ", "_"),
                    );
                    setEditName(undefined);
                  }}
                >
                  Save
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <div
        className={`relative aspect-video bg-black rounded-2xl flex justify-center items-center ${className}`}
        onMouseEnter={
          isDesktop && !exportedRecording.in_progress
            ? () => setHovered(true)
            : undefined
        }
        onMouseLeave={
          isDesktop && !exportedRecording.in_progress
            ? () => setHovered(false)
            : undefined
        }
        onClick={
          isDesktop || exportedRecording.in_progress
            ? undefined
            : () => setHovered(!hovered)
        }
      >
        {hovered && (
          <>
            <div className="absolute inset-0 z-10 bg-black bg-opacity-60 rounded-2xl" />
            <div className="absolute top-1 right-1 flex items-center gap-2">
              <Chip
                className="bg-gradient-to-br from-gray-400 to-gray-500 bg-gray-500 rounded-md cursor-pointer"
                onClick={() =>
                  setEditName({ original: exportedRecording.id, update: "" })
                }
              >
                <LuPencil className="size-4 text-white" />
              </Chip>
              <Chip
                className="bg-gradient-to-br from-gray-400 to-gray-500 bg-gray-500 rounded-md cursor-pointer"
                onClick={() => onDelete(exportedRecording.id)}
              >
                <LuTrash className="size-4 text-destructive fill-destructive" />
              </Chip>
            </div>

            <Button
              className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-20 h-20 z-20 text-white hover:text-white hover:bg-transparent"
              variant="ghost"
              onClick={() => {
                onSelect(exportedRecording);
              }}
            >
              <FaPlay />
            </Button>
          </>
        )}
        {exportedRecording.in_progress ? (
          <ActivityIndicator />
        ) : (
          <img
            className="absolute inset-0 object-contain aspect-video rounded-2xl"
            src={exportedRecording.thumb_path.replace("/media/frigate", "")}
            onLoad={() => setLoading(false)}
          />
        )}
        {loading && (
          <Skeleton className="absolute inset-0 aspect-video rounded-2xl" />
        )}
        <div className="absolute bottom-0 inset-x-0 rounded-b-l z-10 h-[20%] bg-gradient-to-t from-black/60 to-transparent pointer-events-none rounded-2xl">
          <div className="flex h-full justify-between items-end mx-3 pb-1 text-white text-sm capitalize">
            {exportedRecording.name}
          </div>
        </div>
      </div>
    </>
  );
}
