import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "@/contexts/i18n-context";
import { format } from "@/lib/format";

/**
 * Renders a sentence that carries a single inline <code> token. The sentence
 * stays in one translation key with a {code} placeholder, so a translator can
 * move the token wherever their grammar wants it instead of being handed two
 * half-sentences.
 *
 * Splits on the first {code} only and keeps the rest of the sentence, so a
 * locale that drops the placeholder or repeats it loses no text.
 */
function SentenceWithCode({
  template,
  code,
  values = {},
}: {
  template: string;
  code: string;
  values?: Record<string, string>;
}) {
  const at = template.indexOf("{code}");
  const before = at === -1 ? template : template.slice(0, at);
  const after = at === -1 ? "" : template.slice(at + "{code}".length);
  return (
    <>
      {format(before, values)}
      <code className="text-xs bg-muted px-1 py-0.5 rounded">{code}</code>
      {format(after, values)}
    </>
  );
}

export function PrivacyPolicyPage() {
  const { t } = useTranslation();
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          {t.common.back}
        </Link>

        <h1 className="text-3xl font-bold mb-2">{t.common.privacyPolicy}</h1>
        <p className="text-sm text-muted-foreground mb-8">{t.privacyPolicy.lastUpdated}</p>

        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {t.privacyPolicy.overview.heading}
            </h2>
            <p>{t.privacyPolicy.overview.body}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {t.privacyPolicy.localProcessing.heading}
            </h2>
            <p>{t.privacyPolicy.localProcessing.body}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {t.privacyPolicy.analytics.heading}
            </h2>
            <p>
              <SentenceWithCode
                template={t.privacyPolicy.analytics.body}
                code="SNAPOTTER_ANALYTICS=off"
                values={{ privacy: t.settings.privacy.title }}
              />
            </p>
            <p className="mt-3">
              <SentenceWithCode
                template={t.privacyPolicy.analytics.feedbackBody}
                code="feedback_submitted"
              />
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {t.privacyPolicy.dataStorage.heading}
            </h2>
            <p>{t.privacyPolicy.dataStorage.body}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {t.privacyPolicy.thirdParty.heading}
            </h2>
            <p>{t.privacyPolicy.thirdParty.body}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {t.privacyPolicy.openSource.heading}
            </h2>
            <p>{t.privacyPolicy.openSource.body}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {t.privacyPolicy.yourControl.heading}
            </h2>
            <p>{t.privacyPolicy.yourControl.body}</p>
          </section>
        </div>
      </div>
    </main>
  );
}
