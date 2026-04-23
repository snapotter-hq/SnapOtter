import { Code, Monitor, Workflow } from "lucide-react";

import { FadeIn } from "./fade-in";

const ways = [
  {
    title: "Browser UI",
    description:
      "Upload, edit, and download. No installation needed for your team. Just open the browser and start processing.",
    icon: Monitor,
  },
  {
    title: "REST API",
    description:
      "Integrate image processing into your apps and workflows. Every tool available via HTTP with OpenAPI docs.",
    icon: Code,
  },
  {
    title: "Pipelines",
    description:
      "Chain up to 20 tools in sequence. Batch process up to 200 images at once. Automate your image workflows.",
    icon: Workflow,
  },
];

export function ThreeWays() {
  return (
    <section className="px-6 py-24 md:py-36">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            Three ways to use SnapOtter
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-lg text-muted">
            One platform. Browser, API, or automation.
          </p>
        </FadeIn>

        <div className="mt-16 grid gap-8 md:grid-cols-3 md:gap-12">
          {ways.map((way, i) => (
            <FadeIn key={way.title} delay={i * 0.1}>
              <div className="flex flex-col items-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
                  <way.icon size={32} className="text-accent" />
                </div>
                <h3 className="mt-5 text-xl font-bold">{way.title}</h3>
                <p className="mt-3 leading-relaxed text-muted">{way.description}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
