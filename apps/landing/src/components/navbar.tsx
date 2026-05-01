"use client";

import { Github, Menu, Star, X } from "lucide-react";
import { useEffect, useState } from "react";

function formatStarCount(count: number): string {
  if (count >= 1000) {
    const k = count / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return count.toString();
}

const links = [
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "Docs", href: "https://docs.snapotter.com" },
  { label: "Discord", href: "https://discord.gg/hr3s7HPUsr" },
  { label: "Contact", href: "/contact" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [stars, setStars] = useState<string>("Star");

  useEffect(() => {
    let cancelled = false;
    fetch("https://api.github.com/repos/snapotter-hq/snapotter")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && typeof data.stargazers_count === "number") {
          setStars(formatStarCount(data.stargazers_count));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/60 backdrop-blur-xl after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:bg-gradient-to-r after:from-transparent after:via-accent/30 after:to-transparent">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="SnapOtter"
            className="h-8 w-8"
            style={{ imageRendering: "auto" }}
          />
          <span className="font-[family-name:var(--font-nunito)] text-lg font-bold tracking-tight">
            SnapOtter
          </span>
        </a>

        <div className="hidden items-center gap-6 lg:flex">
          {links.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="text-sm text-muted transition-colors hover:text-foreground"
              {...(item.href.startsWith("http") || item.href.startsWith("mailto")
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {item.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <a
            href="https://github.com/snapotter-hq/snapotter"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-background-alt"
          >
            <Github size={16} />
            <Star size={12} className="text-accent" />
            <span>Star on GitHub</span>
            {stars !== "Star" && (
              <span className="rounded-full bg-background-alt px-1.5 py-0.5 text-xs">{stars}</span>
            )}
          </a>
          <a
            href="/contact"
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            Book a Demo
          </a>
        </div>

        <button
          className="text-muted lg:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
          type="button"
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-background px-6 py-4 lg:hidden">
          {links.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="block py-2 text-sm text-muted"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </a>
          ))}
          <div className="mt-3 flex flex-col gap-2">
            <a
              href="https://github.com/snapotter-hq/snapotter"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium"
            >
              <Github size={16} />
              <Star size={12} className="text-accent" />
              Star on GitHub
            </a>
            <a
              href="/contact"
              className="block rounded-lg bg-accent px-4 py-2 text-center text-sm font-medium text-accent-foreground"
            >
              Book a Demo
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
