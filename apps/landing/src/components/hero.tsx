"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TypingCursor } from "./typing-cursor";

const wordCloud = [
  { text: "Resize", x: 5, y: 14, size: 16, opacity: 0.15 },
  { text: "Crop", x: 28, y: 11, size: 14, opacity: 0.12 },
  { text: "Optimize", x: 48, y: 12, size: 13, opacity: 0.1 },
  { text: "Flip", x: 62, y: 10, size: 12, opacity: 0.08 },
  { text: "Rotate", x: 75, y: 14, size: 15, opacity: 0.14 },
  { text: "Sharpen", x: 88, y: 11, size: 13, opacity: 0.11 },
  { text: "Compress", x: 8, y: 22, size: 15, opacity: 0.13 },
  { text: "OCR", x: 25, y: 20, size: 18, opacity: 0.16 },
  { text: "Convert", x: 42, y: 18, size: 13, opacity: 0.1 },
  { text: "Enhance", x: 82, y: 19, size: 14, opacity: 0.12 },
  { text: "Upscale", x: 68, y: 22, size: 16, opacity: 0.15 },
  { text: "Watermark", x: 85, y: 26, size: 14, opacity: 0.11 },
  { text: "Remove BG", x: 3, y: 32, size: 14, opacity: 0.12 },
  { text: "Denoise", x: 18, y: 29, size: 12, opacity: 0.08 },
  { text: "Passport", x: 8, y: 38, size: 13, opacity: 0.1 },
  { text: "Face Blur", x: 2, y: 48, size: 13, opacity: 0.1 },
  { text: "Colorize", x: 85, y: 32, size: 14, opacity: 0.12 },
  { text: "Red Eye", x: 78, y: 28, size: 12, opacity: 0.08 },
  { text: "Restore", x: 90, y: 42, size: 14, opacity: 0.13 },
  { text: "Smart Crop", x: 82, y: 50, size: 13, opacity: 0.1 },
  { text: "Collage", x: 3, y: 58, size: 14, opacity: 0.12 },
  { text: "QR Code", x: 85, y: 58, size: 14, opacity: 0.11 },
  { text: "Stitch", x: 88, y: 68, size: 13, opacity: 0.1 },
  { text: "Border", x: 5, y: 68, size: 13, opacity: 0.1 },
  { text: "SVG", x: 3, y: 78, size: 16, opacity: 0.14 },
  { text: "Compare", x: 15, y: 73, size: 12, opacity: 0.08 },
  { text: "Palette", x: 78, y: 75, size: 13, opacity: 0.1 },
  { text: "GIF", x: 90, y: 78, size: 17, opacity: 0.15 },
  { text: "Batch", x: 6, y: 88, size: 14, opacity: 0.12 },
  { text: "Pipeline", x: 20, y: 90, size: 13, opacity: 0.09 },
  { text: "Favicon", x: 35, y: 92, size: 12, opacity: 0.08 },
  { text: "PDF", x: 22, y: 82, size: 16, opacity: 0.14 },
  { text: "Info", x: 45, y: 88, size: 12, opacity: 0.07 },
  { text: "Base64", x: 82, y: 88, size: 13, opacity: 0.09 },
  { text: "Barcode", x: 72, y: 85, size: 12, opacity: 0.08 },
  { text: "Metadata", x: 10, y: 95, size: 12, opacity: 0.07 },
  { text: "Open Source", x: 48, y: 95, size: 13, opacity: 0.1 },
  { text: "Duplicates", x: 88, y: 95, size: 12, opacity: 0.07 },
  { text: "Vectorize", x: 65, y: 92, size: 12, opacity: 0.08 },
];

function useMouseParallax(strength = 30) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const rafRef = useRef(0);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        setOffset({
          x: ((e.clientX - cx) / cx) * strength,
          y: ((e.clientY - cy) / cy) * strength,
        });
      });
    },
    [strength],
  );

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [handleMouseMove]);

  return offset;
}

export function Hero() {
  const mouse = useMouseParallax(25);

  return (
    <section className="relative overflow-hidden px-6 pt-32 pb-24 md:pt-44 md:pb-36">
      {/* Gradient mesh background - follows mouse */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 transition-transform duration-700 ease-out"
        style={{ transform: `translate(${mouse.x}px, ${mouse.y}px)` }}
      >
        <div className="absolute -top-[40%] -left-[20%] h-[80%] w-[60%] rounded-full bg-amber-400/20 blur-[120px]" />
        <div className="absolute -top-[20%] -right-[10%] h-[70%] w-[50%] rounded-full bg-orange-300/15 blur-[100px]" />
        <div className="absolute top-[20%] left-[30%] h-[60%] w-[40%] rounded-full bg-yellow-200/10 blur-[140px]" />
        <div className="absolute -bottom-[30%] -right-[20%] h-[60%] w-[50%] rounded-full bg-orange-500/10 blur-[120px]" />
      </div>
      <div className="pointer-events-none absolute bottom-0 left-0 -z-10 h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />

      {/* Word cloud background - follows mouse in opposite direction */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 hidden transition-transform duration-1000 ease-out md:block"
        style={{ transform: `translate(${mouse.x * -0.4}px, ${mouse.y * -0.4}px)` }}
      >
        {wordCloud.map((word) => (
          <span
            key={word.text}
            className="absolute font-semibold text-foreground select-none"
            style={{
              left: `${word.x}%`,
              top: `${word.y}%`,
              fontSize: `${word.size}px`,
              opacity: word.opacity,
            }}
          >
            {word.text}
          </span>
        ))}
      </div>

      <div className="relative mx-auto max-w-4xl text-center">
        <h1 className="animate-[fadeUp_0.6s_ease-out_both] font-[family-name:var(--font-nunito)] text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          Your images. Stay yours.
        </h1>

        <p className="mt-4 animate-[fadeUp_0.6s_ease-out_0.1s_both] text-lg text-muted md:text-xl">
          The open-source, self-hosted image processing platform.
        </p>

        <p className="mt-4 animate-[fadeUp_0.6s_ease-out_0.2s_both] text-xl font-medium md:text-2xl">
          <TypingCursor />
        </p>

        <div className="mt-10 animate-[fadeUp_0.6s_ease-out_0.3s_both]">
          <a
            href="https://github.com/ashim-hq/ashim"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 bg-[length:200%_100%] px-10 py-4 text-base font-semibold text-white shadow-[0_0_32px_-8px] shadow-amber-500/40 transition-all duration-500 hover:bg-[position:100%_0] hover:shadow-[0_0_40px_-4px] hover:shadow-amber-500/50"
          >
            Get it for free
            <span className="transition-transform duration-300 group-hover:translate-x-1">
              &rarr;
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
