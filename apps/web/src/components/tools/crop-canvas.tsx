import { useRef, useCallback, useEffect } from "react";
import ReactCrop, { type Crop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

export interface CropCanvasProps {
  imageSrc: string;
  crop: Crop;
  aspect: number | undefined;
  showGrid: boolean;
  imgDimensions: { width: number; height: number } | null;
  onCropChange: (crop: Crop) => void;
  onImageLoad: (dims: { width: number; height: number }) => void;
}

export function CropCanvas({
  imageSrc,
  crop,
  aspect,
  showGrid,
  imgDimensions,
  onCropChange,
  onImageLoad,
}: CropCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      onImageLoad({ width: img.naturalWidth, height: img.naturalHeight });
    },
    [onImageLoad],
  );

  // Keyboard nudging
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 10 : 1;
      const { naturalWidth, naturalHeight } = imgRef.current ?? {
        naturalWidth: 0,
        naturalHeight: 0,
      };
      if (!naturalWidth || !naturalHeight) return;

      // Convert step from pixels to percentage
      const stepX = (step / naturalWidth) * 100;
      const stepY = (step / naturalHeight) * 100;

      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowLeft") dx = -stepX;
      else if (e.key === "ArrowRight") dx = stepX;
      else if (e.key === "ArrowUp") dy = -stepY;
      else if (e.key === "ArrowDown") dy = stepY;
      else if (e.key === "Escape") {
        // Reset to full image
        onCropChange({
          unit: "%",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        });
        e.preventDefault();
        return;
      } else if (e.key === "Enter") {
        // Submit the crop form (find and submit closest form)
        const form = document.querySelector<HTMLFormElement>(
          'form[data-crop-form]',
        );
        if (form) form.requestSubmit();
        e.preventDefault();
        return;
      } else return;

      e.preventDefault();
      onCropChange({
        ...crop,
        x: Math.max(0, Math.min(100 - crop.width, crop.x + dx)),
        y: Math.max(0, Math.min(100 - crop.height, crop.y + dy)),
      });
    };

    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [crop, onCropChange]);

  // Auto-focus the container on mount
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Calculate pixel dimensions for the badge
  const pixelWidth =
    imgDimensions ? Math.round((crop.width / 100) * imgDimensions.width) : 0;
  const pixelHeight =
    imgDimensions ? Math.round((crop.height / 100) * imgDimensions.height) : 0;

  return (
    <div
      ref={containerRef}
      className="flex flex-col w-full h-full max-w-4xl mx-auto outline-none"
      tabIndex={0}
    >
      {/* Crop area */}
      <div className="flex-1 flex items-center justify-center overflow-hidden bg-muted/20 p-4">
        <ReactCrop
          crop={crop}
          onChange={(_pixelCrop, percentCrop) => onCropChange(percentCrop)}
          aspect={aspect}
          className="max-h-full"
          ruleOfThirds={showGrid}
        >
          <img
            ref={imgRef}
            src={imageSrc}
            alt="Crop preview"
            onLoad={handleImageLoad}
            className="max-w-full max-h-[calc(100vh-12rem)] select-none"
            draggable={false}
          />
        </ReactCrop>
      </div>

      {/* Info bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border text-xs text-muted-foreground shrink-0">
        <span>
          Crop region: {pixelWidth} x {pixelHeight}
        </span>
        {imgDimensions && (
          <span>
            Original: {imgDimensions.width} x {imgDimensions.height}
          </span>
        )}
      </div>
    </div>
  );
}
