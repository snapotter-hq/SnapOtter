"use client";

import { CheckCircle, FileText, Loader2, Monitor, Shield } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

import { FadeIn } from "@/components/fade-in";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";

const benefits = [
  {
    icon: Monitor,
    title: "Live Demo",
    description: "See SnapOtter in action with a personalized walkthrough of all features.",
  },
  {
    icon: Shield,
    title: "Deployment Support",
    description: "Get expert help setting up SnapOtter on your infrastructure.",
  },
  {
    icon: FileText,
    title: "Enterprise Licensing",
    description: "Custom agreements for proprietary use, OEM, and commercial distribution.",
  },
];

const subjects = ["Book a Demo", "Enterprise Licensing", "Deployment Help", "General Inquiry"];

const FORMSPREE_URL = "https://formspree.io/f/mykllwek";

export default function ContactPage() {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const formData = new FormData(e.currentTarget);

    try {
      const res = await fetch(FORMSPREE_URL, {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        setError("Something went wrong. Please try again or email us directly.");
      }
    } catch {
      setError("Network error. Please try again or email us directly.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Navbar />
      <main className="pt-16">
        <section className="px-6 py-24 md:py-32">
          <div className="mx-auto grid max-w-5xl gap-16 md:grid-cols-2">
            {/* Left column */}
            <FadeIn>
              <div>
                <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Get in touch</h1>
                <p className="mt-6 text-lg leading-relaxed text-muted">
                  Whether you need a demo, have questions about deployment, or want to discuss
                  enterprise licensing, we are here to help.
                </p>

                <div className="mt-12 space-y-6">
                  {benefits.map((item) => (
                    <div
                      key={item.title}
                      className="flex gap-4 rounded-xl border border-border p-5"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                        <item.icon size={20} className="text-accent" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{item.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-muted">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="mt-10 text-sm text-muted">
                  Open source under AGPL-3.0. Commercial licenses available.
                </p>
              </div>
            </FadeIn>

            {/* Right column */}
            <FadeIn delay={0.1}>
              {submitted ? (
                <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-border bg-background-alt p-12 text-center">
                  <CheckCircle size={48} className="text-emerald-500" />
                  <h2 className="mt-6 text-2xl font-bold">Message sent!</h2>
                  <p className="mt-3 text-muted">
                    Thanks for reaching out. We will get back to you within 24 hours.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSubmitted(false)}
                    className="mt-8 rounded-lg border border-border px-6 py-2.5 text-sm font-medium transition-colors hover:bg-background"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="rounded-2xl border border-border bg-background-alt p-8"
                >
                  <div className="space-y-5">
                    <div>
                      <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
                        Name <span className="text-accent">*</span>
                      </label>
                      <input
                        id="name"
                        type="text"
                        name="name"
                        required
                        className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
                      />
                    </div>

                    <div>
                      <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                        Email <span className="text-accent">*</span>
                      </label>
                      <input
                        id="email"
                        type="email"
                        name="email"
                        required
                        className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
                      />
                    </div>

                    <div>
                      <label htmlFor="company" className="mb-1.5 block text-sm font-medium">
                        Company <span className="text-accent">*</span>
                      </label>
                      <input
                        id="company"
                        type="text"
                        name="company"
                        required
                        className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
                      />
                    </div>

                    <div>
                      <label htmlFor="subject" className="mb-1.5 block text-sm font-medium">
                        Subject
                      </label>
                      <select
                        id="subject"
                        name="subject"
                        defaultValue={subjects[0]}
                        className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
                      >
                        {subjects.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="message" className="mb-1.5 block text-sm font-medium">
                        Message <span className="text-accent">*</span>
                      </label>
                      <textarea
                        id="message"
                        name="message"
                        required
                        rows={5}
                        className="w-full resize-none rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
                      />
                    </div>

                    {error && (
                      <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
                        {error}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 text-sm font-bold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
                    >
                      {submitting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Sending...
                        </>
                      ) : (
                        "Send Message"
                      )}
                    </button>
                  </div>

                  <p className="mt-5 text-center text-sm text-muted">
                    Or email us directly at{" "}
                    <a
                      href="mailto:contact@snapotter.com"
                      className="text-accent underline underline-offset-4 hover:text-accent-hover"
                    >
                      contact@snapotter.com
                    </a>
                  </p>
                </form>
              )}
            </FadeIn>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
