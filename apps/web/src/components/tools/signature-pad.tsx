import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";

const INK_COLORS = ["#13315c", "#1a1814", "#1f6feb"];
const PEN_WIDTHS = { S: 2, M: 3.5, L: 6 } as const;
const FONTS = [
  { label: "Signature", css: "'Brush Script MT', 'Segoe Script', cursive" },
  { label: "Cursive", css: "'Snell Roundhand', 'Apple Chancery', cursive" },
  { label: "Italic", css: "Georgia, serif" },
];

type Tab = "draw" | "type" | "upload";

export interface SignaturePadProps {
  onSave: (dataUrl: string, remember: boolean) => void;
  onCancel: () => void;
}

/** Trim transparent margins; returns a tightly-cropped PNG data URL or null. */
function cropToInk(source: HTMLCanvasElement): string | null {
  const ctx = source.getContext("2d");
  if (!ctx) return null;
  const { width, height } = source;
  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!found) return null;
  const pad = 8;
  const w = Math.min(width, maxX - minX + pad * 2);
  const h = Math.min(height, maxY - minY + pad * 2);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")?.drawImage(source, minX - pad, minY - pad, w, h, 0, 0, w, h);
  return out.toDataURL("image/png");
}

export function SignaturePad({ onSave, onCancel }: SignaturePadProps) {
  const { t } = useTranslation();
  const pad = t.toolSettings["sign-pdf"].pad;
  const tabLabels: Record<Tab, string> = { draw: pad.draw, type: pad.type, upload: pad.upload };
  const [tab, setTab] = useState<Tab>("draw");
  const [remember, setRemember] = useState(true);
  const [color, setColor] = useState(INK_COLORS[0]);
  const [width, setWidth] = useState<keyof typeof PEN_WIDTHS>("M");
  const [hasInk, setHasInk] = useState(false);
  const [typed, setTyped] = useState("");
  const [font, setFont] = useState(FONTS[0]);
  const [uploaded, setUploaded] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || tab !== "draw") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const point = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (canvas.width / r.width),
        y: (e.clientY - r.top) * (canvas.height / r.height),
      };
    };
    const down = (e: PointerEvent) => {
      drawing.current = true;
      const p = point(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drawing.current) return;
      const p = point(e);
      ctx.strokeStyle = color;
      ctx.lineWidth = PEN_WIDTHS[width];
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      setHasInk(true);
    };
    const up = () => {
      drawing.current = false;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
    };
  }, [tab, color, width]);

  const clearDraw = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };

  const renderTyped = (): string | null => {
    if (!typed.trim()) return null;
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 200;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = color;
    ctx.font = `64px ${font.css}`;
    ctx.textBaseline = "middle";
    ctx.fillText(typed, 20, 100);
    return cropToInk(c);
  };

  const onUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setUploaded(reader.result as string);
    reader.readAsDataURL(file);
  };

  const canSave =
    (tab === "draw" && hasInk) ||
    (tab === "type" && typed.trim() !== "") ||
    (tab === "upload" && uploaded !== null);

  const handleSave = () => {
    let dataUrl: string | null = null;
    if (tab === "draw" && canvasRef.current) dataUrl = cropToInk(canvasRef.current);
    else if (tab === "type") dataUrl = renderTyped();
    else if (tab === "upload") dataUrl = uploaded;
    if (dataUrl) onSave(dataUrl, remember);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={pad.title}
    >
      <div className="w-[460px] max-w-[92vw] rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-3">
          <h2 className="text-sm font-semibold">{pad.title}</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t.common.close}
            className="text-muted-foreground"
          >
            ✕
          </button>
        </div>
        <div className="flex gap-1 px-3 pt-3">
          {(["draw", "type", "upload"] as Tab[]).map((tb) => (
            <button
              key={tb}
              type="button"
              onClick={() => setTab(tb)}
              className={`rounded-t-lg border border-b-0 px-3 py-1.5 text-sm capitalize ${tab === tb ? "border-primary bg-background font-medium" : "border-border bg-muted text-muted-foreground"}`}
            >
              {tabLabels[tb]}
            </button>
          ))}
        </div>
        <div className="border-t border-border p-4">
          {tab === "draw" && (
            <>
              <canvas
                ref={canvasRef}
                width={600}
                height={220}
                className="h-[180px] w-full rounded-lg border border-dashed border-border"
                style={{ touchAction: "none" }}
              />
              <div className="mt-3 flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{pad.color}</span>
                {INK_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`ink ${c}`}
                    onClick={() => setColor(c)}
                    className={`h-5 w-5 rounded-full ${color === c ? "ring-2 ring-primary-ink ring-offset-1" : ""}`}
                    style={{ background: c }}
                  />
                ))}
                <span className="ms-2 text-xs text-muted-foreground">{pad.pen}</span>
                {(Object.keys(PEN_WIDTHS) as Array<keyof typeof PEN_WIDTHS>).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWidth(w)}
                    className={`h-6 w-6 rounded border text-xs ${width === w ? "border-primary bg-primary/10" : "border-border"}`}
                  >
                    {w}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={clearDraw}
                  className="ms-auto rounded border border-border px-2 py-1 text-xs"
                >
                  {t.common.clear}
                </button>
              </div>
            </>
          )}
          {tab === "type" && (
            <>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={pad.namePlaceholder}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              />
              <div className="mt-3 flex flex-col gap-2">
                {FONTS.map((f) => (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() => setFont(f)}
                    className={`rounded-lg border px-3 py-2 text-start ${font.label === f.label ? "border-primary bg-primary/10" : "border-border"}`}
                    style={{ fontFamily: f.css, color }}
                  >
                    {typed || pad.yourName}
                  </button>
                ))}
              </div>
            </>
          )}
          {tab === "upload" && (
            <>
              <label className="flex cursor-pointer flex-col items-center rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                {pad.uploadHint}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
                />
              </label>
              {uploaded && (
                <img
                  src={uploaded}
                  alt="signature preview"
                  className="mt-3 h-12 rounded border border-border object-contain"
                />
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-border bg-muted/40 p-3">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />{" "}
            {pad.remember}
          </label>
          <button
            type="button"
            onClick={onCancel}
            className="ms-auto rounded-lg border border-border px-3 py-1.5 text-sm"
          >
            {t.common.cancel}
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={handleSave}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {pad.save}
          </button>
        </div>
      </div>
    </div>
  );
}
