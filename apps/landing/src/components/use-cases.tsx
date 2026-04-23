import { Building2, Factory, GraduationCap, Heart, Scale, Shield } from "lucide-react";

import { FadeIn } from "./fade-in";

const industries = [
  {
    title: "Healthcare",
    description:
      "Process patient photos, medical scans, and clinical images without sending data to third-party servers. HIPAA compliant by architecture.",
    icon: Heart,
  },
  {
    title: "Legal",
    description:
      "Handle sensitive document scans, evidence photos, and case files entirely on-premise. Full audit trail included.",
    icon: Scale,
  },
  {
    title: "Financial Services",
    description:
      "Process check images, ID verification photos, and financial documents behind your firewall.",
    icon: Building2,
  },
  {
    title: "Government & Defense",
    description:
      "Air-gapped deployment for classified environments. No internet connection required.",
    icon: Shield,
  },
  {
    title: "Education",
    description:
      "Process student records, research images, and campus photos with zero cloud dependency.",
    icon: GraduationCap,
  },
  {
    title: "Manufacturing",
    description:
      "Quality control imaging, product photography, and documentation processing on your factory network.",
    icon: Factory,
  },
];

export function UseCases() {
  return (
    <section className="bg-background-alt px-6 py-24 md:py-36">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            Trusted across industries
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-lg text-muted">
            Organizations choose SnapOtter when data privacy is non-negotiable.
          </p>
        </FadeIn>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {industries.map((industry, i) => (
            <FadeIn key={industry.title} delay={i * 0.08}>
              <div className="rounded-xl border border-border bg-background p-6">
                <industry.icon size={24} className="text-accent" />
                <h3 className="mt-4 text-lg font-bold">{industry.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{industry.description}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
