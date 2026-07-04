import {
  FEEDBACK_FRICTION_AREA_VALUES,
  FEEDBACK_IMPORTANT_AREA_VALUES,
  FEEDBACK_INSTALL_METHOD_VALUES,
  FEEDBACK_TYPE_VALUES,
} from "@snapotter/shared";
import { CheckCircle2, MessageSquare, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import {
  buildFeedbackGithubUrl,
  buildFeedbackMailtoUrl,
  type FeedbackErrorCategory,
  type FeedbackFrictionArea,
  type FeedbackImportantArea,
  type FeedbackInstallMethod,
  type FeedbackPayload,
  type FeedbackPromptVariant,
  type FeedbackSentiment,
  type FeedbackSource,
  type FeedbackType,
  promptVariantForSource,
  submitFeedback,
  surveyIdForSource,
} from "@/lib/feedback";
import { format } from "@/lib/format";
import { buildToolRequestDiscussionUrl } from "@/lib/tool-request";
import { cn } from "@/lib/utils";

interface FeedbackDialogProps {
  open: boolean;
  source: FeedbackSource;
  toolId?: string;
  jobStatus?: "completed" | "failed";
  errorCategory?: FeedbackErrorCategory;
  initialSentiment?: FeedbackSentiment;
  searchQuery?: string;
  promptVariant?: FeedbackPromptVariant;
  onClose: () => void;
  onSubmitted?: () => void;
}

// The dialog's option lists derive from the shared enum arrays so a value added
// in @snapotter/shared propagates here automatically. SENTIMENTS is the
// deliberate exception: it offers only the 4 conversational ratings, a curated
// subset of the 7-value FEEDBACK_SENTIMENT_VALUES, so it stays a local list.
const SENTIMENTS: FeedbackSentiment[] = ["great", "okay", "issue", "missing"];

export function FeedbackDialog({
  open,
  source,
  toolId,
  jobStatus,
  errorCategory,
  initialSentiment,
  searchQuery,
  promptVariant: promptVariantProp,
  onClose,
  onSubmitted,
}: FeedbackDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [sentiment, setSentiment] = useState<FeedbackSentiment | "">(initialSentiment ?? "");
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("other");
  const [message, setMessage] = useState("");
  const [contactOk, setContactOk] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [company, setCompany] = useState("");
  const [installMethod, setInstallMethod] = useState<FeedbackInstallMethod>("docker_compose");
  const [frictionArea, setFrictionArea] = useState<FeedbackFrictionArea>("smooth");
  const [importantAreas, setImportantAreas] = useState<FeedbackImportantArea[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [accepted, setAccepted] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) return;
    setSentiment(initialSentiment ?? "");
    setFeedbackType(
      source === "failed_job" ? "bug" : source === "search_miss" ? "feature_request" : "other",
    );
    setMessage("");
    setContactOk(false);
    setContactEmail("");
    setContactName("");
    setCompany("");
    setInstallMethod("docker_compose");
    setFrictionArea("smooth");
    setImportantAreas([]);
    setSubmitting(false);
    setSubmitted(false);
    setAccepted(true);
    setError(null);
  }, [open, initialSentiment, source]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const title = useMemo(() => {
    if (source === "tool_result") return t.feedback.toolDialogTitle;
    if (source === "failed_job") return t.feedback.failedDialogTitle;
    if (source === "admin_installer") return t.feedback.adminDialogTitle;
    if (source === "search_miss") return t.feedback.searchMissTitle;
    return t.feedback.dialogTitle;
  }, [source, t.feedback]);

  const isAdminInstall = source === "admin_installer";
  const isSearchMiss = source === "search_miss";
  const isGlobal = source === "global";
  const isFailedJob = source === "failed_job";
  // For a failed run, thread the tool and error into the offline handoff so the
  // GitHub issue is actionable even if the message box is left empty.
  const handoffMessage = isFailedJob
    ? [`Tool: ${toolId ?? "unknown"}`, `Error category: ${errorCategory ?? "unknown"}`, "", message]
        .join("\n")
        .trim()
    : message;
  const canSubmit = Boolean(
    message.trim() || sentiment || feedbackType !== "other" || isAdminInstall,
  );

  function toggleImportantArea(area: FeedbackImportantArea) {
    setImportantAreas((current) =>
      current.includes(area) ? current.filter((value) => value !== area) : [...current, area],
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError(null);
    const payload: FeedbackPayload = {
      source,
      surveyId: surveyIdForSource(source),
      promptVariant: promptVariantProp ?? promptVariantForSource(source),
      searchQuery: isSearchMiss ? searchQuery?.slice(0, 200) : undefined,
      ...(sentiment ? { sentiment } : {}),
      feedbackType,
      message: message.trim() || undefined,
      contactOk,
      contactEmail: contactOk ? contactEmail.trim() || undefined : undefined,
      contactName: contactOk ? contactName.trim() || undefined : undefined,
      company: contactOk ? company.trim() || undefined : undefined,
      toolId,
      jobStatus,
      errorCategory,
      ...(isAdminInstall
        ? {
            installMethod,
            frictionArea,
            importantAreas,
          }
        : {}),
    };

    try {
      const response = await submitFeedback(payload);
      setAccepted(response.accepted);
      setSubmitted(true);
      onSubmitted?.();
    } catch {
      setError(t.feedback.submitFailed);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
        onClick={onClose}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-dialog-title"
        className="relative bg-background border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[85dvh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="h-4 w-4 text-primary shrink-0" />
            <h2 id="feedback-dialog-title" className="text-lg font-semibold text-foreground">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label={t.feedback.closeLabel}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {submitted ? (
          <div className="p-6 space-y-4">
            {(isGlobal || isFailedJob) && !accepted ? (
              <div className="space-y-3">
                <p className="text-sm text-foreground">{t.feedback.offlineDescription}</p>
                <p className="text-xs text-muted-foreground">{t.feedback.offlinePublicNote}</p>
                <div className="flex flex-col gap-2">
                  <a
                    href={buildFeedbackGithubUrl(handoffMessage)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full text-center py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                  >
                    {t.feedback.offlineGithubButton}
                  </a>
                  <a
                    href={buildFeedbackMailtoUrl(handoffMessage)}
                    className="w-full text-center py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {t.feedback.offlineEmailButton}
                  </a>
                </div>
              </div>
            ) : isSearchMiss && !accepted ? (
              <p className="text-sm text-foreground">
                <a
                  href={buildToolRequestDiscussionUrl(searchQuery ?? "")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {t.feedback.searchMissDiscussionsFallback}
                </a>
              </p>
            ) : (
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{t.feedback.thanksTitle}</p>
                  <p className="text-sm text-muted-foreground">{t.feedback.thanksDescription}</p>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
            >
              {t.common.close}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
            <p className="text-sm text-muted-foreground">{t.feedback.privacyNote}</p>

            {isSearchMiss ? (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {format(t.feedback.searchMissContext, { query: searchQuery ?? "" })}
              </div>
            ) : isAdminInstall ? (
              <AdminInstallFields
                installMethod={installMethod}
                setInstallMethod={setInstallMethod}
                frictionArea={frictionArea}
                setFrictionArea={setFrictionArea}
                importantAreas={importantAreas}
                toggleImportantArea={toggleImportantArea}
              />
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="feedback-type">
                    {t.feedback.typeLabel}
                  </label>
                  <select
                    id="feedback-type"
                    value={feedbackType}
                    onChange={(event) => setFeedbackType(event.target.value as FeedbackType)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    {FEEDBACK_TYPE_VALUES.map((type) => (
                      <option key={type} value={type}>
                        {t.feedback.types[type]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <span className="text-sm font-medium text-foreground">
                    {t.feedback.sentimentLabel}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {SENTIMENTS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSentiment(value)}
                        className={cn(
                          "py-2 rounded-lg border text-sm font-medium transition-colors",
                          sentiment === value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        {t.feedback.sentiments[value]}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="feedback-message">
                {isAdminInstall ? t.feedback.improveFirstLabel : t.feedback.messageLabel}
              </label>
              <textarea
                id="feedback-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={2000}
                rows={5}
                placeholder={
                  isAdminInstall
                    ? t.feedback.improveFirstPlaceholder
                    : t.feedback.messagePlaceholder
                }
                className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <ContactFields
              contactOk={contactOk}
              setContactOk={setContactOk}
              contactEmail={contactEmail}
              setContactEmail={setContactEmail}
              contactName={contactName}
              setContactName={setContactName}
              company={company}
              setCompany={setCompany}
            />

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                disabled={!canSubmit || submitting}
                className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                <Send className="h-4 w-4" />
                {submitting ? t.feedback.submitting : t.feedback.submit}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

interface AdminInstallFieldsProps {
  installMethod: FeedbackInstallMethod;
  setInstallMethod: (value: FeedbackInstallMethod) => void;
  frictionArea: FeedbackFrictionArea;
  setFrictionArea: (value: FeedbackFrictionArea) => void;
  importantAreas: FeedbackImportantArea[];
  toggleImportantArea: (value: FeedbackImportantArea) => void;
}

function AdminInstallFields({
  installMethod,
  setInstallMethod,
  frictionArea,
  setFrictionArea,
  importantAreas,
  toggleImportantArea,
}: AdminInstallFieldsProps) {
  const { t } = useTranslation();
  return (
    <>
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="feedback-install-method">
          {t.feedback.installMethodLabel}
        </label>
        <select
          id="feedback-install-method"
          value={installMethod}
          onChange={(event) => setInstallMethod(event.target.value as FeedbackInstallMethod)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          {FEEDBACK_INSTALL_METHOD_VALUES.map((method) => (
            <option key={method} value={method}>
              {t.feedback.installMethods[method]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="feedback-friction-area">
          {t.feedback.frictionAreaLabel}
        </label>
        <select
          id="feedback-friction-area"
          value={frictionArea}
          onChange={(event) => setFrictionArea(event.target.value as FeedbackFrictionArea)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          {FEEDBACK_FRICTION_AREA_VALUES.map((area) => (
            <option key={area} value={area}>
              {t.feedback.frictionAreas[area]}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">
          {t.feedback.importantAreasLabel}
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {FEEDBACK_IMPORTANT_AREA_VALUES.map((area) => (
            <label key={area} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={importantAreas.includes(area)}
                onChange={() => toggleImportantArea(area)}
                className="h-4 w-4 rounded border-border"
              />
              <span>{t.feedback.importantAreas[area]}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

interface ContactFieldsProps {
  contactOk: boolean;
  setContactOk: (value: boolean) => void;
  contactEmail: string;
  setContactEmail: (value: string) => void;
  contactName: string;
  setContactName: (value: string) => void;
  company: string;
  setCompany: (value: string) => void;
}

function ContactFields({
  contactOk,
  setContactOk,
  contactEmail,
  setContactEmail,
  contactName,
  setContactName,
  company,
  setCompany,
}: ContactFieldsProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={contactOk}
          onChange={(event) => setContactOk(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border"
        />
        <span>{t.feedback.contactOkLabel}</span>
      </label>

      {contactOk && (
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            type="email"
            maxLength={320}
            placeholder={t.feedback.emailPlaceholder}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <input
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
            maxLength={120}
            placeholder={t.feedback.namePlaceholder}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <input
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            maxLength={160}
            placeholder={t.feedback.companyPlaceholder}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground sm:col-span-2"
          />
        </div>
      )}
    </div>
  );
}
