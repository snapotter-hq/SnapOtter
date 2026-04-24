import type { Metadata } from "next";

import { FadeIn } from "@/components/fade-in";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
  title: "Terms and Conditions | SnapOtter",
  description:
    "Terms governing your use of the SnapOtter website and self-hosted image processing software.",
};

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main className="pt-16">
        <section className="px-6 py-24 md:py-32">
          <div className="mx-auto max-w-3xl">
            <FadeIn>
              <div className="text-center">
                <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
                  Terms and Conditions
                </h1>
                <p className="mt-6 text-lg text-muted">Last updated: April 24, 2026</p>
              </div>
            </FadeIn>

            <div className="mt-16 space-y-12 text-sm leading-relaxed text-muted">
              <section>
                <h2 className="text-lg font-semibold text-foreground">Overview</h2>
                <p className="mt-3">
                  These terms govern your use of the SnapOtter website and software.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground">Software License</h2>
                <ul className="mt-3 list-disc space-y-2 pl-5">
                  <li>SnapOtter is licensed under AGPL-3.0.</li>
                  <li>
                    You may use, modify, and distribute the software under the terms of this
                    license.
                  </li>
                  <li>
                    For proprietary or commercial use without AGPL obligations, a commercial license
                    is available.
                  </li>
                  <li>
                    Contact us at{" "}
                    <a
                      href="mailto:contact@snapotter.com"
                      className="text-accent underline underline-offset-4 hover:text-accent-hover"
                    >
                      contact@snapotter.com
                    </a>{" "}
                    for commercial licensing terms.
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground">Website Use</h2>
                <ul className="mt-3 list-disc space-y-2 pl-5">
                  <li>The snapotter.com website is provided for informational purposes.</li>
                  <li>You may not use the website for any unlawful purpose.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground">Self-Hosted Software</h2>
                <ul className="mt-3 list-disc space-y-2 pl-5">
                  <li>You are responsible for your own deployment, data, and security.</li>
                  <li>SnapOtter is provided &quot;as is&quot; without warranty of any kind.</li>
                  <li>We are not liable for any damages arising from your use of the software.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground">Intellectual Property</h2>
                <ul className="mt-3 list-disc space-y-2 pl-5">
                  <li>SnapOtter, the SnapOtter logo, and related marks are our property.</li>
                  <li>The software source code is available under AGPL-3.0.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground">Limitation of Liability</h2>
                <p className="mt-3">
                  To the maximum extent permitted by law, we are not liable for any indirect,
                  incidental, or consequential damages.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground">Changes</h2>
                <p className="mt-3">
                  We may update these terms. Continued use constitutes acceptance.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground">Contact</h2>
                <p className="mt-3">
                  If you have questions about these terms, contact us at{" "}
                  <a
                    href="mailto:contact@snapotter.com"
                    className="text-accent underline underline-offset-4 hover:text-accent-hover"
                  >
                    contact@snapotter.com
                  </a>
                  .
                </p>
              </section>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
