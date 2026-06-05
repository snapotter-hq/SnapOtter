import { CATEGORIES, PYTHON_SIDECAR_TOOLS, TOOL_BUNDLE_MAP, TOOLS } from "@snapotter/shared";
import { Clock, Download, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ImageViewer } from "@/components/common/image-viewer";
import { MultiImageViewer } from "@/components/common/multi-image-viewer";
import { AppLayout } from "@/components/layout/app-layout";
import { useTranslation } from "@/contexts/i18n-context";
import { ICON_MAP } from "@/lib/icon-map";
import { getCategoryName, getToolName } from "@/lib/tool-i18n";
import { useFeaturesStore } from "@/stores/features-store";
import { useFileStore } from "@/stores/file-store";
import { useSettingsStore } from "@/stores/settings-store";

// Tools shown prominently as "quick actions" at the top
const QUICK_ACTION_IDS = ["resize", "compress", "convert", "remove-background"];

let hasAppliedDefaultRedirect = false;

export function HomePage() {
  const { t } = useTranslation();
  const {
    setFiles,
    files,
    reset,
    originalBlobUrl,
    selectedFileName,
    selectedFileSize,
    currentEntry,
  } = useFileStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { fetch: fetchSettings, defaultToolView, loaded: settingsLoaded } = useSettingsStore();
  const { fetch: fetchFeatures, bundles, installing, queued } = useFeaturesStore();

  useEffect(() => {
    if (location.state?.fromLibrary) {
      navigate(".", { replace: true, state: {} });
    } else {
      reset();
    }
  }, [reset, location.state, navigate]);

  useEffect(() => {
    fetchSettings();
    fetchFeatures();
  }, [fetchSettings, fetchFeatures]);

  useEffect(() => {
    if (
      !hasAppliedDefaultRedirect &&
      settingsLoaded &&
      defaultToolView === "fullscreen" &&
      files.length === 0
    ) {
      hasAppliedDefaultRedirect = true;
      navigate("/fullscreen", { replace: true });
    }
  }, [settingsLoaded, defaultToolView, files.length, navigate]);

  const getToolStatus = useMemo(() => {
    return (toolId: string) => {
      const isAi = (PYTHON_SIDECAR_TOOLS as readonly string[]).includes(toolId);
      if (!isAi) return "installed";
      const bundleId = TOOL_BUNDLE_MAP[toolId];
      if (!bundleId) return "installed";
      if (queued.includes(bundleId)) return "queued";
      if (installing[bundleId]) return "installing";
      const bundle = bundles.find((b) => b.id === bundleId);
      return bundle?.status === "installed" ? "installed" : "not_installed";
    };
  }, [bundles, installing, queued]);

  const handleFiles = useCallback(
    (newFiles: File[]) => {
      reset();
      setFiles(newFiles);
    },
    [setFiles, reset],
  );

  const handleUrlImport = useCallback(
    (file: File) => {
      setFiles([file]);
    },
    [setFiles],
  );

  const hasFile = files.length > 0;

  // If no file uploaded, show default layout (tool panel + dropzone)
  if (!hasFile) {
    return <AppLayout onFiles={handleFiles} onUrlImport={handleUrlImport} />;
  }

  // File uploaded — show tool selector on left, image preview on right
  return (
    <AppLayout showToolPanel={false} onFiles={handleFiles}>
      <div className="flex h-full w-full">
        {/* Left panel: Tool selector */}
        <div className="w-80 border-r border-border overflow-y-auto shrink-0">
          {/* File info */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2 text-sm">
              <ICON_MAP.CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              <span className="truncate font-medium text-foreground">
                {selectedFileName ?? files[0].name}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedFileSize ? `${(selectedFileSize / 1024).toFixed(1)} KB` : ""}
              {files.length > 1 && ` — ${files.length} files`}
            </p>
            <button
              type="button"
              onClick={reset}
              className="text-xs text-muted-foreground hover:text-foreground mt-2"
            >
              {t.homePage.changeFile}
            </button>
          </div>

          {/* Quick actions */}
          <div className="p-4 border-b border-border">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-3">
              {t.homePage.quickActions}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACTION_IDS.map((id) => {
                const tool = TOOLS.find((t) => t.id === id);
                if (!tool) return null;
                const Icon =
                  (ICON_MAP[tool.icon] as React.ComponentType<{ className?: string }>) ??
                  ICON_MAP.FileImage;
                const status = getToolStatus(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => navigate(tool.route)}
                    className="flex items-center gap-2 p-3 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors text-start"
                  >
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-medium text-foreground">
                      {getToolName(t, tool.id, tool.name)}
                    </span>
                    {status === "not_installed" && (
                      <Download className="h-3.5 w-3.5 text-muted-foreground ms-auto" />
                    )}
                    {status === "queued" && (
                      <Clock className="h-3.5 w-3.5 text-muted-foreground ms-auto" />
                    )}
                    {status === "installing" && (
                      <Loader2 className="h-3.5 w-3.5 text-muted-foreground ms-auto animate-spin" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* All tools by category */}
          <div className="p-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-3">
              {t.homePage.allTools}
            </h3>
            {CATEGORIES.map((category) => {
              const categoryTools = TOOLS.filter((t) => t.category === category.id);
              if (categoryTools.length === 0) return null;
              return (
                <div key={category.id} className="mb-4">
                  <p
                    className="text-xs font-medium text-muted-foreground mb-1.5"
                    style={{ color: category.color }}
                  >
                    {getCategoryName(t, category.id, category.name)}
                  </p>
                  <div className="space-y-0.5">
                    {categoryTools.map((tool) => {
                      const Icon =
                        (ICON_MAP[tool.icon] as React.ComponentType<{ className?: string }>) ??
                        ICON_MAP.FileImage;
                      const status = getToolStatus(tool.id);
                      return (
                        <button
                          key={tool.id}
                          type="button"
                          onClick={() => navigate(tool.route)}
                          className="flex items-center gap-2.5 w-full py-1.5 px-2 rounded-lg text-start transition-colors hover:bg-muted text-foreground"
                        >
                          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm">{getToolName(t, tool.id, tool.name)}</span>
                          {status === "not_installed" && (
                            <Download className="h-3.5 w-3.5 text-muted-foreground ms-auto" />
                          )}
                          {status === "queued" && (
                            <Clock className="h-3.5 w-3.5 text-muted-foreground ms-auto" />
                          )}
                          {status === "installing" && (
                            <Loader2 className="h-3.5 w-3.5 text-muted-foreground ms-auto animate-spin" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right panel: Image preview */}
        <div className="flex-1 flex items-center justify-center p-6 min-h-0">
          {files.length > 1 ? (
            <MultiImageViewer />
          ) : currentEntry?.previewLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
              <p className="text-sm text-muted-foreground">{t.homePage.generatingPreview}</p>
              <p className="text-xs text-muted-foreground/60">{selectedFileName}</p>
            </div>
          ) : originalBlobUrl ? (
            <ImageViewer
              src={originalBlobUrl}
              filename={selectedFileName ?? files[0].name}
              fileSize={selectedFileSize ?? files[0].size}
            />
          ) : (
            <div className="text-center text-muted-foreground">
              <p>{t.homePage.loadingPreview}</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
