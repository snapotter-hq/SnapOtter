import { useParams } from "react-router-dom";
import { useMemo, useCallback, useState, useEffect } from "react";
import type { Crop } from "react-image-crop";
import { TOOLS } from "@stirling-image/shared";
import { AppLayout } from "@/components/layout/app-layout";
import { Dropzone } from "@/components/common/dropzone";
import { MultiImageViewer } from "@/components/common/multi-image-viewer";
import { ImageViewer } from "@/components/common/image-viewer";
import { BeforeAfterSlider } from "@/components/common/before-after-slider";
import { SideBySideComparison } from "@/components/common/side-by-side-comparison";
import { ReviewPanel } from "@/components/common/review-panel";
import type { PreviewTransform } from "@/components/tools/rotate-settings";
import { useFileStore } from "@/stores/file-store";
import { useMobile } from "@/hooks/use-mobile";
import { formatFileSize } from "@/lib/download";
import { ResizeSettings } from "@/components/tools/resize-settings";
import { CropSettings } from "@/components/tools/crop-settings";
import { CropCanvas } from "@/components/tools/crop-canvas";
import { RotateSettings } from "@/components/tools/rotate-settings";
import { ConvertSettings } from "@/components/tools/convert-settings";
import { CompressSettings } from "@/components/tools/compress-settings";
import { StripMetadataSettings } from "@/components/tools/strip-metadata-settings";
import { ColorSettings } from "@/components/tools/color-settings";
// Phase 3: Watermark & Overlay
import { WatermarkTextSettings } from "@/components/tools/watermark-text-settings";
import { WatermarkImageSettings } from "@/components/tools/watermark-image-settings";
import { TextOverlaySettings } from "@/components/tools/text-overlay-settings";
import { ComposeSettings } from "@/components/tools/compose-settings";
// Phase 3: Utilities
import { InfoSettings } from "@/components/tools/info-settings";
import { CompareSettings } from "@/components/tools/compare-settings";
import { FindDuplicatesSettings } from "@/components/tools/find-duplicates-settings";
import { ColorPaletteSettings } from "@/components/tools/color-palette-settings";
import { QrGenerateSettings } from "@/components/tools/qr-generate-settings";
import { BarcodeReadSettings } from "@/components/tools/barcode-read-settings";
// Phase 3: Layout & Composition
import { CollageSettings } from "@/components/tools/collage-settings";
import { SplitSettings } from "@/components/tools/split-settings";
import { BorderSettings } from "@/components/tools/border-settings";
// Phase 3: Format & Conversion
import { SvgToRasterSettings } from "@/components/tools/svg-to-raster-settings";
import { VectorizeSettings } from "@/components/tools/vectorize-settings";
import { GifToolsSettings } from "@/components/tools/gif-tools-settings";
// Phase 3: Optimization extras
import { BulkRenameSettings } from "@/components/tools/bulk-rename-settings";
import { FaviconSettings } from "@/components/tools/favicon-settings";
import { ImageToPdfSettings } from "@/components/tools/image-to-pdf-settings";
// Phase 3: Adjustments extra
import { ReplaceColorSettings } from "@/components/tools/replace-color-settings";
// Phase 4: AI Tools
import { RemoveBgSettings } from "@/components/tools/remove-bg-settings";
import { UpscaleSettings } from "@/components/tools/upscale-settings";
import { OcrSettings } from "@/components/tools/ocr-settings";
import { BlurFacesSettings } from "@/components/tools/blur-faces-settings";
import { EraseObjectSettings } from "@/components/tools/erase-object-settings";
import { SmartCropSettings } from "@/components/tools/smart-crop-settings";
import * as icons from "lucide-react";
import { CheckCircle2, Download } from "lucide-react";

const COLOR_TOOL_IDS = new Set([
  "brightness-contrast",
  "saturation",
  "color-channels",
  "color-effects",
]);

// Tools that don't need a file dropzone (they generate content or have custom UI)
const NO_DROPZONE_TOOLS = new Set(["qr-generate"]);
const SIDE_BY_SIDE_TOOLS = new Set(["resize", "crop"]);
const LIVE_PREVIEW_TOOLS = new Set(["rotate"]);
const INTERACTIVE_CROP_TOOLS = new Set(["crop"]);

function ToolSettingsPanel({
  toolId,
  onPreviewTransform,
  cropProps,
}: {
  toolId: string;
  onPreviewTransform?: (t: PreviewTransform) => void;
  cropProps?: {
    cropState: {
      crop: Crop;
      aspect: number | undefined;
      showGrid: boolean;
      imgDimensions: { width: number; height: number } | null;
    };
    onCropChange: (crop: Crop) => void;
    onAspectChange: (aspect: number | undefined) => void;
    onGridToggle: (show: boolean) => void;
  };
}) {
  // Phase 2: Core tools
  if (toolId === "resize") return <ResizeSettings />;
  if (toolId === "crop" && cropProps) return <CropSettings {...cropProps} />;
  if (toolId === "rotate") return <RotateSettings onPreviewTransform={onPreviewTransform} />;
  if (toolId === "convert") return <ConvertSettings />;
  if (toolId === "compress") return <CompressSettings />;
  if (toolId === "strip-metadata") return <StripMetadataSettings />;
  if (COLOR_TOOL_IDS.has(toolId)) return <ColorSettings toolId={toolId} />;
  // Phase 3: Watermark & Overlay
  if (toolId === "watermark-text") return <WatermarkTextSettings />;
  if (toolId === "watermark-image") return <WatermarkImageSettings />;
  if (toolId === "text-overlay") return <TextOverlaySettings />;
  if (toolId === "compose") return <ComposeSettings />;
  // Phase 3: Utilities
  if (toolId === "info") return <InfoSettings />;
  if (toolId === "compare") return <CompareSettings />;
  if (toolId === "find-duplicates") return <FindDuplicatesSettings />;
  if (toolId === "color-palette") return <ColorPaletteSettings />;
  if (toolId === "qr-generate") return <QrGenerateSettings />;
  if (toolId === "barcode-read") return <BarcodeReadSettings />;
  // Phase 3: Layout & Composition
  if (toolId === "collage") return <CollageSettings />;
  if (toolId === "split") return <SplitSettings />;
  if (toolId === "border") return <BorderSettings />;
  // Phase 3: Format & Conversion
  if (toolId === "svg-to-raster") return <SvgToRasterSettings />;
  if (toolId === "vectorize") return <VectorizeSettings />;
  if (toolId === "gif-tools") return <GifToolsSettings />;
  // Phase 3: Optimization extras
  if (toolId === "bulk-rename") return <BulkRenameSettings />;
  if (toolId === "favicon") return <FaviconSettings />;
  if (toolId === "image-to-pdf") return <ImageToPdfSettings />;
  // Phase 3: Adjustments extra
  if (toolId === "replace-color") return <ReplaceColorSettings />;
  // Phase 4: AI Tools
  if (toolId === "remove-background") return <RemoveBgSettings />;
  if (toolId === "upscale") return <UpscaleSettings />;
  if (toolId === "ocr") return <OcrSettings />;
  if (toolId === "blur-faces") return <BlurFacesSettings />;
  if (toolId === "erase-object") return <EraseObjectSettings />;
  if (toolId === "smart-crop") return <SmartCropSettings />;

  return (
    <p className="text-xs text-muted-foreground italic">
      Settings for this tool are coming soon.
    </p>
  );
}

/** File selection indicator shown in left panel */
function FileSelectionInfo({
  files,
  selectedFileName,
  selectedFileSize,
  onClear,
  onAddMore,
}: {
  files: File[];
  selectedFileName: string | null;
  selectedFileSize: number | null;
  onClear: () => void;
  onAddMore: () => void;
}) {
  if (files.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Drop or upload an image to get started
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">Files ({files.length})</span>
        <button onClick={onAddMore} className="text-xs text-primary hover:text-primary/80">+ Add more</button>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-foreground bg-muted rounded px-2 py-1.5">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
        <span className="truncate flex-1">{selectedFileName ?? files[0].name}</span>
        <span className="text-muted-foreground shrink-0 ml-1">{formatFileSize(selectedFileSize ?? files[0].size)}</span>
      </div>
      <button onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground">Clear all</button>
    </div>
  );
}

export function ToolPage() {
  const { toolId } = useParams<{ toolId: string }>();
  const tool = useMemo(() => TOOLS.find((t) => t.id === toolId), [toolId]);
  const {
    files,
    entries,
    setFiles,
    addFiles,
    reset,
    processedUrl,
    originalBlobUrl,
    originalSize,
    processedSize,
    selectedFileName,
    selectedFileSize,
    undoProcessing,
    batchZipBlob,
    batchZipFilename,
  } = useFileStore();
  const isMobile = useMobile();
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(true);
  const [previewTransform, setPreviewTransform] = useState<PreviewTransform | null>(null);

  const [cropCrop, setCropCrop] = useState<Crop>({
    unit: "%",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
  const [cropAspect, setCropAspect] = useState<number | undefined>(undefined);
  const [cropShowGrid, setCropShowGrid] = useState(true);
  const [cropImgDimensions, setCropImgDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const cropState = useMemo(
    () => ({
      crop: cropCrop,
      aspect: cropAspect,
      showGrid: cropShowGrid,
      imgDimensions: cropImgDimensions,
    }),
    [cropCrop, cropAspect, cropShowGrid, cropImgDimensions],
  );

  // Reset crop state when the image changes
  useEffect(() => {
    setCropCrop({ unit: "%", x: 0, y: 0, width: 100, height: 100 });
    setCropImgDimensions(null);
  }, [originalBlobUrl]);

  const handleFiles = useCallback(
    (newFiles: File[]) => {
      reset();
      setFiles(newFiles);
    },
    [setFiles, reset],
  );

  const handleUndo = useCallback(() => {
    undoProcessing();
  }, [undoProcessing]);

  const handleAddMore = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*";
    input.onchange = (e) => {
      const newFiles = Array.from((e.target as HTMLInputElement).files || []);
      if (newFiles.length > 0) addFiles(newFiles);
    };
    input.click();
  }, [addFiles]);

  const handleDownloadAll = useCallback(() => {
    if (!batchZipBlob) return;
    const url = URL.createObjectURL(batchZipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = batchZipFilename ?? "processed-images.zip";
    a.click();
    URL.revokeObjectURL(url);
  }, [batchZipBlob, batchZipFilename]);

  if (!tool) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Tool not found
        </div>
      </AppLayout>
    );
  }

  const IconComponent =
    (
      icons as unknown as Record<
        string,
        React.ComponentType<{ className?: string }>
      >
    )[tool.icon] || icons.FileImage;

  const hasFile = files.length > 0;
  const hasProcessed = !!processedUrl;
  const isNoDropzone = NO_DROPZONE_TOOLS.has(tool.id);

  // Derive processed file info from context
  const processedFileName = selectedFileName
    ? `processed-${selectedFileName}`
    : "processed-image";
  const processedFileType = selectedFileName
    ? selectedFileName.split(".").pop()?.toUpperCase() || "IMAGE"
    : "IMAGE";

  // Mobile layout: settings above dropzone (stacked)
  if (isMobile) {
    return (
      <AppLayout showToolPanel={false}>
        <div className="flex flex-col w-full h-full">
          {/* Tool header */}
          <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
            <div className="p-2 rounded-lg bg-primary text-primary-foreground">
              <IconComponent className="h-5 w-5" />
            </div>
            <h2 className="font-semibold text-lg text-foreground flex-1">
              {tool.name}
            </h2>
            <button
              onClick={() => setMobileSettingsOpen(!mobileSettingsOpen)}
              className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted"
            >
              {mobileSettingsOpen ? "Hide Settings" : "Settings"}
            </button>
          </div>

          {/* Collapsible settings */}
          {mobileSettingsOpen && (
            <div className="p-4 border-b border-border space-y-3 shrink-0 max-h-[40vh] overflow-y-auto">
              {/* File info */}
              {!isNoDropzone && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Files
                  </h3>
                  <FileSelectionInfo
                    files={files}
                    selectedFileName={selectedFileName}
                    selectedFileSize={selectedFileSize}
                    onClear={reset}
                    onAddMore={handleAddMore}
                  />
                </div>
              )}

              <div className="border-t border-border" />

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Settings
                </h3>
                <ToolSettingsPanel
                  toolId={tool.id}
                  onPreviewTransform={LIVE_PREVIEW_TOOLS.has(tool.id) ? setPreviewTransform : undefined}
                  cropProps={INTERACTIVE_CROP_TOOLS.has(tool.id) ? {
                    cropState,
                    onCropChange: setCropCrop,
                    onAspectChange: setCropAspect,
                    onGridToggle: setCropShowGrid,
                  } : undefined}
                />
              </div>

              {/* Review panel (mobile) */}
              {hasProcessed && processedSize != null && (
                <ReviewPanel
                  filename={processedFileName}
                  fileSize={processedSize}
                  fileType={processedFileType}
                  downloadUrl={processedUrl}
                  previewUrl={processedUrl}
                  onUndo={handleUndo}
                  currentToolId={tool.id}
                />
              )}
            </div>
          )}

          {/* Main area: Dropzone / Image Viewer / Before-After */}
          <div className="flex-1 flex items-center justify-center p-4">
            {isNoDropzone ? (
              <div className="text-center text-muted-foreground">
                <p className="text-sm">Configure settings and generate.</p>
              </div>
            ) : files.length > 1 ? (
              <MultiImageViewer />
            ) : INTERACTIVE_CROP_TOOLS.has(tool.id) && hasFile && !hasProcessed && originalBlobUrl ? (
              <CropCanvas
                imageSrc={originalBlobUrl}
                crop={cropCrop}
                aspect={cropAspect}
                showGrid={cropShowGrid}
                imgDimensions={cropImgDimensions}
                onCropChange={setCropCrop}
                onImageLoad={setCropImgDimensions}
              />
            ) : hasProcessed && originalBlobUrl && SIDE_BY_SIDE_TOOLS.has(tool.id) ? (
              <SideBySideComparison
                beforeSrc={originalBlobUrl}
                afterSrc={processedUrl}
                beforeSize={originalSize ?? undefined}
                afterSize={processedSize ?? undefined}
              />
            ) : hasProcessed && originalBlobUrl && LIVE_PREVIEW_TOOLS.has(tool.id) ? (
              <ImageViewer
                src={processedUrl}
                filename={processedFileName}
                fileSize={processedSize ?? 0}
              />
            ) : hasProcessed && originalBlobUrl ? (
              <BeforeAfterSlider
                beforeSrc={originalBlobUrl}
                afterSrc={processedUrl}
                beforeSize={originalSize ?? undefined}
                afterSize={processedSize ?? undefined}
              />
            ) : hasFile && originalBlobUrl ? (
              <ImageViewer
                src={originalBlobUrl}
                filename={selectedFileName ?? files[0].name}
                fileSize={selectedFileSize ?? files[0].size}
                {...(LIVE_PREVIEW_TOOLS.has(tool.id) && previewTransform
                  ? {
                      cssRotate: previewTransform.rotate,
                      cssFlipH: previewTransform.flipH,
                      cssFlipV: previewTransform.flipV,
                    }
                  : {})}
              />
            ) : (
              <Dropzone
                onFiles={handleFiles}
                accept="image/*"
                multiple
                currentFiles={files}
              />
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  // Desktop layout: side-by-side
  return (
    <AppLayout showToolPanel={false}>
      <div className="flex h-full w-full">
        {/* Tool Settings Panel */}
        <div className="w-72 border-r border-border p-4 space-y-4 overflow-y-auto shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary text-primary-foreground">
              <IconComponent className="h-5 w-5" />
            </div>
            <h2 className="font-semibold text-lg text-foreground">
              {tool.name}
            </h2>
          </div>

          {/* File info - hidden for tools that don't need files */}
          {!isNoDropzone && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Files
              </h3>
              <FileSelectionInfo
                files={files}
                selectedFileName={selectedFileName}
                selectedFileSize={selectedFileSize}
                onClear={reset}
                onAddMore={handleAddMore}
              />
            </div>
          )}

          <div className="border-t border-border" />

          {/* Tool-specific settings */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Settings
            </h3>
            <ToolSettingsPanel
              toolId={tool.id}
              onPreviewTransform={LIVE_PREVIEW_TOOLS.has(tool.id) ? setPreviewTransform : undefined}
              cropProps={INTERACTIVE_CROP_TOOLS.has(tool.id) ? {
                cropState,
                onCropChange: setCropCrop,
                onAspectChange: setCropAspect,
                onGridToggle: setCropShowGrid,
              } : undefined}
            />
          </div>

          {/* Review panel (desktop - below settings) */}
          {hasProcessed && processedSize != null && (
            <ReviewPanel
              filename={processedFileName}
              fileSize={processedSize}
              fileType={processedFileType}
              downloadUrl={processedUrl}
              previewUrl={processedUrl}
              onUndo={handleUndo}
              currentToolId={tool.id}
            />
          )}

          {/* Batch download */}
          {entries.length > 1 && hasProcessed && batchZipBlob && (
            <div className="space-y-2">
              <div className="border-t border-border pt-2" />
              <button
                onClick={handleDownloadAll}
                className="w-full py-2 rounded-lg bg-primary text-primary-foreground flex items-center justify-center gap-1.5 text-xs font-medium hover:bg-primary/90"
              >
                <Download className="h-3.5 w-3.5" />
                Download All (ZIP)
              </button>
            </div>
          )}
        </div>

        {/* Main area: Dropzone / Image Viewer / Before-After */}
        <div className="flex-1 flex items-center justify-center p-6">
          {isNoDropzone ? (
            <div className="text-center text-muted-foreground">
              <p className="text-sm">Configure settings and generate.</p>
            </div>
          ) : files.length > 1 ? (
            <MultiImageViewer />
          ) : INTERACTIVE_CROP_TOOLS.has(tool.id) && hasFile && !hasProcessed && originalBlobUrl ? (
            <CropCanvas
              imageSrc={originalBlobUrl}
              crop={cropCrop}
              aspect={cropAspect}
              showGrid={cropShowGrid}
              imgDimensions={cropImgDimensions}
              onCropChange={setCropCrop}
              onImageLoad={setCropImgDimensions}
            />
          ) : hasProcessed && originalBlobUrl && SIDE_BY_SIDE_TOOLS.has(tool.id) ? (
            <SideBySideComparison
              beforeSrc={originalBlobUrl}
              afterSrc={processedUrl}
              beforeSize={originalSize ?? undefined}
              afterSize={processedSize ?? undefined}
            />
          ) : hasProcessed && originalBlobUrl && LIVE_PREVIEW_TOOLS.has(tool.id) ? (
            <ImageViewer
              src={processedUrl}
              filename={processedFileName}
              fileSize={processedSize ?? 0}
            />
          ) : hasProcessed && originalBlobUrl ? (
            <BeforeAfterSlider
              beforeSrc={originalBlobUrl}
              afterSrc={processedUrl}
              beforeSize={originalSize ?? undefined}
              afterSize={processedSize ?? undefined}
            />
          ) : hasFile && originalBlobUrl ? (
            <ImageViewer
              src={originalBlobUrl}
              filename={selectedFileName ?? files[0].name}
              fileSize={selectedFileSize ?? files[0].size}
              {...(LIVE_PREVIEW_TOOLS.has(tool.id) && previewTransform
                ? {
                    cssRotate: previewTransform.rotate,
                    cssFlipH: previewTransform.flipH,
                    cssFlipV: previewTransform.flipV,
                  }
                : {})}
            />
          ) : (
            <Dropzone
              onFiles={handleFiles}
              accept="image/*"
              multiple
              currentFiles={files}
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
