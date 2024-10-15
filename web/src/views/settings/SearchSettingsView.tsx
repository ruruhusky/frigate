import Heading from "@/components/ui/heading";
import { FrigateConfig, SearchModelSize } from "@/types/frigateConfig";
import useSWR from "swr";
import axios from "axios";
import ActivityIndicator from "@/components/indicators/activity-indicator";
import { useCallback, useContext, useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { Link } from "react-router-dom";
import { LuExternalLink } from "react-icons/lu";
import { StatusBarMessagesContext } from "@/context/statusbar-provider";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

type SearchSettingsViewProps = {
  setUnsavedChanges: React.Dispatch<React.SetStateAction<boolean>>;
};

type SearchSettings = {
  enabled?: boolean;
  reindex?: boolean;
  model_size?: SearchModelSize;
};

export default function SearchSettingsView({
  setUnsavedChanges,
}: SearchSettingsViewProps) {
  const { data: config, mutate: updateConfig } =
    useSWR<FrigateConfig>("config");
  const [changedValue, setChangedValue] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { addMessage, removeMessage } = useContext(StatusBarMessagesContext)!;

  const [searchSettings, setSearchSettings] = useState<SearchSettings>({
    enabled: undefined,
    reindex: undefined,
    model_size: undefined,
  });

  const [origSearchSettings, setOrigSearchSettings] = useState<SearchSettings>({
    enabled: undefined,
    reindex: undefined,
    model_size: undefined,
  });

  useEffect(() => {
    if (config) {
      if (searchSettings?.enabled == undefined) {
        setSearchSettings({
          enabled: config.semantic_search.enabled,
          reindex: config.semantic_search.reindex,
          model_size: config.semantic_search.model_size,
        });
      }

      setOrigSearchSettings({
        enabled: config.semantic_search.enabled,
        reindex: config.semantic_search.reindex,
        model_size: config.semantic_search.model_size,
      });
    }
    // we know that these deps are correct
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const handleSearchConfigChange = (newConfig: Partial<SearchSettings>) => {
    setSearchSettings((prevConfig) => ({ ...prevConfig, ...newConfig }));
    setUnsavedChanges(true);
    setChangedValue(true);
  };

  const saveToConfig = useCallback(async () => {
    setIsLoading(true);

    axios
      .put(
        `config/set?semantic_search.enabled=${searchSettings.enabled}&semantic_search.reindex=${searchSettings.reindex}&semantic_search.model_size=${searchSettings.model_size}`,
      )
      .then((res) => {
        if (res.status === 200) {
          toast.success("Search settings have been saved.", {
            position: "top-center",
          });
          setChangedValue(false);
          updateConfig();
        } else {
          toast.error(`Failed to save config changes: ${res.statusText}`, {
            position: "top-center",
          });
        }
      })
      .catch((error) => {
        toast.error(
          `Failed to save config changes: ${error.response.data.message}`,
          { position: "top-center" },
        );
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [
    updateConfig,
    searchSettings.enabled,
    searchSettings.reindex,
    searchSettings.model_size,
  ]);

  const onCancel = useCallback(() => {
    setSearchSettings(origSearchSettings);
    setChangedValue(false);
    removeMessage("search_settings", "search_settings");
  }, [origSearchSettings, removeMessage]);

  useEffect(() => {
    if (changedValue) {
      addMessage(
        "search_settings",
        `Unsaved search settings changes)`,
        undefined,
        "search_settings",
      );
    } else {
      removeMessage("search_settings", "search_settings");
    }
    // we know that these deps are correct
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changedValue]);

  useEffect(() => {
    document.title = "Search Settings - Frigate";
  }, []);

  if (!config) {
    return <ActivityIndicator />;
  }

  return (
    <div className="flex size-full flex-col md:flex-row">
      <Toaster position="top-center" closeButton={true} />
      <div className="scrollbar-container order-last mb-10 mt-2 flex h-full w-full flex-col overflow-y-auto rounded-lg border-[1px] border-secondary-foreground bg-background_alt p-2 md:order-none md:mb-0 md:mr-2 md:mt-0">
        <Heading as="h3" className="my-2">
          Search Settings
        </Heading>
        <div className="my-3 space-y-3 text-sm text-muted-foreground">
          <p>
            Semantic Search in Frigate allows you to find tracked objects within
            your review items using either the image itself, a user-defined text
            description, or an automatically generated one. This feature works
            by creating embeddings — numerical vector representations — for both
            the images and text descriptions of your tracked objects. By
            comparing these embeddings, Frigate assesses their similarities to
            deliver relevant search results.
          </p>

          <div className="flex items-center text-primary">
            <Link
              to="https://docs.frigate.video/configuration/semantic_search"
              target="_blank"
              rel="noopener noreferrer"
              className="inline"
            >
              Read the documentation
              <LuExternalLink className="ml-2 inline-flex size-3" />
            </Link>
          </div>
        </div>
        <Separator className="my-2 flex bg-secondary" />
        <div className="flex w-full flex-col space-y-6">
          <div className="flex flex-row items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="improve-contrast">Enabled</Label>
            </div>
            <Switch
              id="enabled"
              className="ml-3"
              disabled={searchSettings.enabled === undefined}
              checked={searchSettings.enabled === true}
              onCheckedChange={(isChecked) => {
                handleSearchConfigChange({ enabled: isChecked });
              }}
            />
          </div>
          <div className="flex flex-row items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="improve-contrast">Re-Index On Startup</Label>
              <div className="text-sm text-muted-foreground">
                Re-indexing will reprocess all thumbnails and descriptions (if
                enabled) and apply the embeddings on each startup. Don't forget
                to disable the option after restarting!
              </div>
            </div>
            <Switch
              id="enabled"
              className="ml-3"
              disabled={searchSettings.reindex === undefined}
              checked={searchSettings.reindex === true}
              onCheckedChange={(isChecked) => {
                handleSearchConfigChange({ reindex: isChecked });
              }}
            />
          </div>
          <Separator className="my-2 flex bg-secondary" />
          <div className="mt-2 space-y-3">
            <div className="space-y-0.5">
              <div className="text-md">Model Size</div>
              <div className="my-2 space-y-1 text-sm text-muted-foreground">
                <p>
                  Configure the size of the model used for semantic search
                  embeddings:
                </p>
                <p>
                  • Configuring the <em>small</em> model employs a quantized
                  version of the model that uses much less RAM and runs faster
                  on CPU with a very negligible difference in embedding quality.
                </p>
                <p>
                  • Configuring the <em>large</em> model employs the full Jina
                  model and will automatically run on the GPU if applicable.
                </p>
              </div>
            </div>
            <Select
              value={searchSettings.model_size}
              onValueChange={(value) =>
                handleSearchConfigChange({
                  model_size: value as SearchModelSize,
                })
              }
            >
              <SelectTrigger className="w-20">
                {searchSettings.model_size}
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {["small", "large"].map((size) => (
                    <SelectItem
                      key={size}
                      className="cursor-pointer"
                      value={size}
                    >
                      {size}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-end">
          <div className="flex flex-row gap-2 pt-5">
            <Button className="flex flex-1" onClick={onCancel}>
              Reset
            </Button>
            <Button
              variant="select"
              disabled={!changedValue || isLoading}
              className="flex flex-1"
              onClick={saveToConfig}
            >
              {isLoading ? (
                <div className="flex flex-row items-center gap-2">
                  <ActivityIndicator />
                  <span>Saving...</span>
                </div>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
