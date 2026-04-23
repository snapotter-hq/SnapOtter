import { Github, Star } from "lucide-react";
import { FadeIn } from "./fade-in";

export function OpenSource() {
  return (
    <section className="bg-background-alt px-6 py-24 md:py-36">
      <div className="mx-auto max-w-3xl text-center">
        <FadeIn>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Open source. Always.</h2>
          <p className="mt-6 text-lg leading-relaxed text-muted">
            SnapOtter is AGPL-3.0 licensed. Inspect every line of code. Contribute back. Self-host
            forever. No vendor lock-in, no surprise pricing changes, no rug pulls.
          </p>
          <div className="mt-10">
            <a
              href="https://github.com/ashim-hq/ashim"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-6 py-3 text-base font-semibold transition-colors hover:bg-background-alt"
            >
              <Github size={20} />
              Star on GitHub
              <Star size={16} className="text-accent" />
            </a>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
