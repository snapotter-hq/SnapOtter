"use client";

import { Check, Copy, Terminal } from "lucide-react";
import { useState } from "react";

import { FadeIn } from "./fade-in";

const command =
  "docker run -d --name ashim -p 1349:1349 -v ashim-data:/data ghcr.io/ashim-hq/ashim:latest";

export function HowItWorks() {
  const [copied, setCopied] = useState(false);

  function copyCommand() {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section id="how-it-works" className="bg-background-alt px-6 py-14 md:py-20">
      <div className="mx-auto max-w-3xl text-center">
        <FadeIn>
          <p className="text-sm font-medium text-accent">Get started in seconds</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">
            One command. That&apos;s it.
          </h2>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="relative mx-auto mt-8 max-w-2xl">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/10 to-amber-500/20 blur-lg" />
            <button
              type="button"
              onClick={copyCommand}
              className="group relative w-full cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-[#151515] text-left shadow-2xl transition-all hover:border-amber-500/30"
            >
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                  <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
                  <div className="h-3 w-3 rounded-full bg-[#28c840]" />
                </div>
                <div className="flex items-center gap-2 text-white/30">
                  <Terminal size={13} />
                  <span className="text-xs">Quick Start</span>
                </div>
                <div className="w-[52px]" />
              </div>

              <div className="flex items-center gap-3 overflow-x-auto px-6 py-5">
                <span className="shrink-0 text-emerald-400 font-mono text-sm">$</span>
                <code className="whitespace-nowrap font-mono text-[13px] text-white/90">
                  {command}
                </code>
                <span className="ml-auto shrink-0 pl-3">
                  {copied ? (
                    <span className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1 text-emerald-400">
                      <Check size={13} />
                      <span className="text-xs font-medium">Copied!</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-white/25 transition-colors group-hover:bg-white/5 group-hover:text-white/60">
                      <Copy size={13} />
                      <span className="hidden text-xs md:inline">Copy</span>
                    </span>
                  )}
                </span>
              </div>
            </button>
          </div>
        </FadeIn>

        <FadeIn delay={0.15}>
          <p className="mt-8 text-sm text-muted">
            Works on Linux, macOS, and Windows. ARM and x86 supported.{" "}
            <a
              href="https://docs.snapotter.com"
              className="font-medium text-accent hover:underline"
            >
              Read the docs
            </a>
          </p>
        </FadeIn>
      </div>
    </section>
  );
}
