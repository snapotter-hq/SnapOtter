import type { Metadata } from "next";

import { FadeIn } from "@/components/fade-in";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
  title: "Privacy Policy | SnapOtter",
  description:
    "SnapOtter is self-hosted software. We do not process, store, or have access to your images or data. Learn about our privacy practices.",
};

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main className="pt-16">
        <section className="px-6 py-24 md:py-32">
          <div className="mx-auto max-w-3xl">
            <FadeIn>
              <div className="text-center">
                <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Privacy Policy</h1>
                <p className="mt-6 text-lg text-muted">Last updated: April 24, 2026</p>
              </div>
            </FadeIn>

            <div className="mt-16 space-y-12 text-sm leading-relaxed text-muted">
              <section>
                <h2 className="text-lg font-semibold text-foreground">Overview</h2>
                <p className="mt-3">
                  SnapOtter is self-hosted software. We do not process, store, or have access to
                  your images or data. This privacy policy covers the snapotter.com website and
                  optional analytics within the software.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground">Website (snapotter.com)</h2>
                <ul className="mt-3 list-disc space-y-2 pl-5">
                  <li>We do not use tracking cookies.</li>
                  <li>We do not use third-party analytics on the website.</li>
                  <li>
                    Contact form submissions are processed via Formspree. Their privacy policy
                    applies to that data.
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground">Self-Hosted Software</h2>
                <ul className="mt-3 list-disc space-y-2 pl-5">
                  <li>All image processing happens entirely on your server.</li>
                  <li>No data is sent to SnapOtter or any third party.</li>
                  <li>There is no telemetry by default.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground">Optional Analytics</h2>
                <ul className="mt-3 list-disc space-y-2 pl-5">
                  <li>Analytics is disabled by default.</li>
                  <li>
                    When enabled, it collects anonymous usage data (feature usage, error logs) to
                    help improve the software.
                  </li>
                  <li>No personal data, image content, or file names are collected.</li>
                  <li>You can disable analytics at any time in settings.</li>
                  <li>Analytics data is processed by PostHog.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground">Contact Form</h2>
                <ul className="mt-3 list-disc space-y-2 pl-5">
                  <li>
                    When you submit the contact form, your name, email, company, and message are
                    sent to us via Formspree.
                  </li>
                  <li>We use this information only to respond to your inquiry.</li>
                  <li>We do not sell or share your contact information.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground">Open Source</h2>
                <p className="mt-3">
                  SnapOtter is open source. You can inspect the entire codebase to verify our
                  privacy practices.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground">Changes</h2>
                <p className="mt-3">
                  We may update this policy. Changes will be posted on this page.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-foreground">Contact</h2>
                <p className="mt-3">
                  If you have questions about this privacy policy, contact us at{" "}
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
