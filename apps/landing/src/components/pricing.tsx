import { Check } from "lucide-react";

import { FadeIn } from "./fade-in";

const freePlan = {
  name: "Open Source",
  price: "Free",
  subtitle: "For everyone. Forever.",
  features: [
    "All 47 image processing tools",
    "Unlimited usage, no hidden caps",
    "Full REST API with OpenAPI docs",
    "Pipeline automation",
    "Batch processing (unlimited files)",
    "14 local AI models included",
    "Self-host on any infrastructure",
    "Docker, Kubernetes, bare metal",
    "ARM and x86 support",
    "Air-gapped and offline ready",
    "Multi-user with team permissions",
    "Audit logging",
    "Community support via GitHub and Discord",
    "All updates included",
    "AGPL-3.0 licensed",
  ],
  cta: "Get Started Free",
  href: "https://github.com/snapotter-hq/snapotter",
  external: true,
};

const enterprisePlan = {
  name: "Enterprise",
  price: "Custom",
  subtitle: "For organizations that need more.",
  features: [
    "Everything in Open Source",
    "Commercial license (no AGPL obligations)",
    "Proprietary use in closed-source products",
    "Unlimited users and devices",
    "Priority email and video support",
    "Dedicated deployment assistance",
    "Custom integrations and workflows",
    "Early access to new features and updates",
    "Flexible licensing terms for your needs",
    "SLA and uptime guarantees",
    "Security review and compliance documentation",
    "OEM and white-label options",
  ],
  cta: "Contact Sales",
  href: "/contact",
  external: false,
};

export function Pricing() {
  return (
    <section id="pricing" className="bg-background-alt px-6 py-24 md:py-36">
      <div className="mx-auto max-w-5xl">
        <FadeIn>
          <p className="text-center text-sm font-medium text-accent">Pricing</p>
          <h2 className="mt-2 font-[family-name:var(--font-nunito)] text-center text-3xl font-bold tracking-tight md:text-4xl">
            Free for everyone. Enterprise when you need it.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-muted">
            SnapOtter is fully functional and free. No trials, no feature gates, no time limits.
            Enterprise licensing is available for organizations that need commercial terms.
          </p>
        </FadeIn>

        <div className="mt-16 grid gap-8 md:grid-cols-2">
          <FadeIn>
            <div className="flex h-full flex-col rounded-2xl border border-border bg-background p-8">
              <p className="text-sm font-medium text-accent">{freePlan.subtitle}</p>
              <h3 className="mt-1 font-[family-name:var(--font-nunito)] text-2xl font-bold">
                {freePlan.name}
              </h3>
              <p className="mt-4 text-4xl font-bold">{freePlan.price}</p>

              <ul className="mt-8 flex-1 space-y-3">
                {freePlan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <Check size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <a
                href={freePlan.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 block rounded-xl border-2 border-accent px-4 py-3 text-center text-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {freePlan.cta} &rarr;
              </a>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <div className="flex h-full flex-col rounded-2xl border border-border bg-background p-8">
              <p className="text-sm font-medium text-accent">{enterprisePlan.subtitle}</p>
              <h3 className="mt-1 font-[family-name:var(--font-nunito)] text-2xl font-bold">
                {enterprisePlan.name}
              </h3>
              <p className="mt-4 text-4xl font-bold">{enterprisePlan.price}</p>

              <ul className="mt-8 flex-1 space-y-3">
                {enterprisePlan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <Check size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <a
                href={enterprisePlan.href}
                className="mt-8 block rounded-xl bg-accent px-4 py-3 text-center text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
              >
                {enterprisePlan.cta} &rarr;
              </a>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
