import QRCodeStyling from "qr-code-styling";
import { useEffect, useMemo, useRef, useState } from "react";
import { encodeQrData, useQrStore } from "@/stores/qr-store";

const CHECKER_BG = "repeating-conic-gradient(#e5e5e5 0% 25%, #ffffff 0% 50%) 0 0 / 20px 20px";

function clearChildren(el: HTMLElement) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

export function QrGeneratePreview() {
  const store = useQrStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<QRCodeStyling | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const data = encodeQrData(store);

  const options = useMemo(() => {
    const hasData = !!data;
    setIsEmpty(!hasData);

    const dotsColor = store.dotGradientEnabled ? undefined : store.dotColor;
    const dotsGradient = store.dotGradientEnabled
      ? {
          type: store.dotGradientType as "linear" | "radial",
          rotation: store.dotGradientRotation * (Math.PI / 180),
          colorStops: [
            { offset: 0, color: store.dotGradientColor1 },
            { offset: 1, color: store.dotGradientColor2 },
          ],
        }
      : undefined;

    return {
      width: 300,
      height: 300,
      data: hasData ? data : "https://example.com",
      margin: 8,
      qrOptions: {
        errorCorrectionLevel: store.errorCorrection,
      },
      dotsOptions: {
        type: store.dotType,
        ...(dotsColor ? { color: dotsColor } : {}),
        ...(dotsGradient ? { gradient: dotsGradient } : {}),
      },
      cornersSquareOptions: {
        type: store.cornerSquareType,
        color: store.useCustomCornerColors ? store.cornerSquareColor : undefined,
      },
      cornersDotOptions: {
        type: store.cornerDotType,
        color: store.useCustomCornerColors ? store.cornerDotColor : undefined,
      },
      backgroundOptions: store.bgTransparent ? { color: "transparent" } : { color: store.bgColor },
      image: store.logoDataUrl || "",
      imageOptions: {
        hideBackgroundDots: store.hideBackgroundDots,
        imageSize: store.logoSize,
        margin: store.logoMargin,
      },
    };
  }, [
    data,
    store.dotType,
    store.dotColor,
    store.dotGradientEnabled,
    store.dotGradientType,
    store.dotGradientColor1,
    store.dotGradientColor2,
    store.dotGradientRotation,
    store.cornerSquareType,
    store.cornerDotType,
    store.cornerSquareColor,
    store.cornerDotColor,
    store.useCustomCornerColors,
    store.bgColor,
    store.bgTransparent,
    store.errorCorrection,
    store.logoDataUrl,
    store.logoSize,
    store.logoMargin,
    store.hideBackgroundDots,
  ]);

  // Create QR instance on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: options is intentionally excluded to only create QR instance once on mount
  useEffect(() => {
    const qr = new QRCodeStyling(options as never);
    qrRef.current = qr;
    if (containerRef.current) {
      clearChildren(containerRef.current);
      qr.append(containerRef.current);
    }
  }, []);

  // Update QR on state changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (qrRef.current) {
        qrRef.current.update(options as never);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [options]);

  return (
    <div className="flex flex-col items-center justify-center h-full w-full gap-4">
      <div
        className="rounded-xl border border-border p-6 shadow-sm"
        style={store.bgTransparent ? { background: CHECKER_BG } : undefined}
      >
        <div ref={containerRef} className="flex items-center justify-center" />
      </div>
      {isEmpty && (
        <p className="text-sm text-muted-foreground">Enter content to generate a QR code</p>
      )}
    </div>
  );
}
