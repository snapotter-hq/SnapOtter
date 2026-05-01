import { Github, MessageCircle, Star } from "lucide-react";
import { FadeIn } from "./fade-in";

export function OpenSource() {
  return (
    <section id="open-source" className="px-6 py-24 md:py-36">
      <div className="mx-auto max-w-3xl text-center">
        <FadeIn>
          <h2 className="font-[family-name:var(--font-nunito)] text-3xl font-bold tracking-tight md:text-4xl">
            Open source. Always.
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-muted">
            SnapOtter is AGPL-3.0 licensed. Inspect every line of code. Contribute back. Self-host
            forever. No vendor lock-in, no surprise pricing changes, no rug pulls.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <a
              href="https://github.com/snapotter-hq/snapotter"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-teal px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-teal-hover"
            >
              <Github size={20} />
              Star on GitHub
              <Star size={16} className="text-accent" />
            </a>
            <a
              href="https://discord.gg/hr3s7HPUsr"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3 text-base font-semibold transition-colors hover:bg-background-alt"
            >
              <MessageCircle size={20} />
              Join Discord
            </a>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
