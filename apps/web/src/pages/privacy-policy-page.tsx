import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/contexts/i18n-context";

export function PrivacyPolicyPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          {t.common.back}
        </Link>

        <h1 className="text-3xl font-bold mb-2">{t.common.privacyPolicy}</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: June 24, 2026</p>

        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">Overview</h2>
            <p>
              SnapOtter is a self-hosted, open-source file processing application. Your instance is
              operated and controlled entirely by whoever deployed it. This policy describes how the
              software itself handles your data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">Local Processing</h2>
            <p>
              All file processing happens entirely on the server where SnapOtter is deployed. Your
              files are never sent to external services or third-party APIs. When you upload a file
              for processing, it is handled in memory or in temporary storage on the host machine
              and is not retained after the operation completes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">Product Analytics</h2>
            <p>
              SnapOtter uses anonymous analytics to improve reliability and prioritize features.
            </p>
            <p className="mt-2 font-medium">What is never sent:</p>
            <ul className="list-disc ps-5 mt-2 space-y-1">
              <li>Your images, PDFs, videos, or any file contents</li>
              <li>File names or file paths</li>
              <li>Personal information or IP addresses</li>
            </ul>
            <p className="mt-2">
              Analytics is powered by{" "}
              <a
                href="https://posthog.com"
                className="text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                PostHog
              </a>{" "}
              and{" "}
              <a
                href="https://sentry.io"
                className="text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Sentry
              </a>
              . You can disable analytics at any time by rebuilding with the flag{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">SNAPOTTER_ANALYTICS=off</code>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">Data Storage</h2>
            <p>
              If authentication is enabled, the application stores user accounts (usernames and
              hashed passwords) in a PostgreSQL database on the host machine. If you use the Files
              feature, uploaded files are stored on the server's filesystem. All stored data remains
              entirely under the control of the instance operator.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">Third-Party Services</h2>
            <p>
              All processing happens locally; your files are never sent anywhere. Anonymous usage
              analytics are powered by PostHog and Sentry as described above. AI-powered features
              run locally using bundled models. No other external services are contacted.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">Open Source</h2>
            <p>
              SnapOtter is fully open source. You can audit the source code to verify these claims
              at any time. Transparency is a core principle of this project.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">Your Control</h2>
            <p>
              Because SnapOtter is self-hosted, the instance operator has full control over all
              data. You can delete your data at any time by removing files from the server or
              deleting the database. No data exists outside of your infrastructure.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
