import QRCodeStyling from "qr-code-styling";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useAuth } from "@/hooks/use-auth";
import { apiPost } from "@/lib/api";
import { cn, copyToClipboard } from "@/lib/utils";

type Step = "idle" | "enrolling" | "disabling";

interface EnrollResponse {
  uri: string;
  recoveryCodes: string[];
}

function parseManualSecret(uri: string): string {
  try {
    const params = new URL(uri).searchParams;
    return params.get("secret") ?? "";
  } catch {
    return "";
  }
}

function QrCode({ uri }: { uri: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const qr = new QRCodeStyling({
      width: 200,
      height: 200,
      data: uri,
      margin: 8,
      dotsOptions: { type: "square", color: "#000000" },
      backgroundOptions: { color: "#ffffff" },
    } as never);
    const el = containerRef.current;
    if (el) {
      while (el.firstChild) el.removeChild(el.firstChild);
      qr.append(el);
    }
  }, [uri]);

  return (
    <div
      ref={containerRef}
      className="flex items-center justify-center rounded-xl border border-border p-4 bg-white w-fit"
    />
  );
}

export function TwoFactorSettings() {
  const { t } = useTranslation();
  const { totpEnabled: initialEnabled } = useAuth();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [step, setStep] = useState<Step>("idle");
  const [enrollment, setEnrollment] = useState<EnrollResponse | null>(null);
  const [code, setCode] = useState("");
  const [codesCopied, setCodesCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setEnabled(initialEnabled);
  }, [initialEnabled]);

  const resetToIdle = () => {
    setStep("idle");
    setEnrollment(null);
    setCode("");
    setCodesCopied(false);
    setMessage(null);
  };

  const handleEnrollStart = async () => {
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await apiPost<EnrollResponse>("/auth/mfa/enroll");
      setEnrollment(res);
      setStep("enrolling");
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : t.settings.security.securitySettingsFailed,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async () => {
    setSubmitting(true);
    setMessage(null);
    try {
      await apiPost("/auth/mfa/verify", { code });
      setEnabled(true);
      setMessage({ type: "success", text: t.settings.security.twoFactorEnableSuccess });
      setStep("idle");
      setEnrollment(null);
      setCode("");
      setCodesCopied(false);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : t.auth.mfaInvalidCode,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisable = async () => {
    setSubmitting(true);
    setMessage(null);
    try {
      await apiPost("/auth/mfa/disable", { code });
      setEnabled(false);
      setMessage({ type: "success", text: t.settings.security.twoFactorDisableSuccess });
      setStep("idle");
      setCode("");
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : t.auth.mfaInvalidCode,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyCodes = async () => {
    if (!enrollment) return;
    const ok = await copyToClipboard(enrollment.recoveryCodes.join("\n"));
    if (ok) {
      setCodesCopied(true);
      setTimeout(() => setCodesCopied(false), 2000);
    } else {
      setMessage({ type: "error", text: t.settings.security.twoFactorCopyFailed });
    }
  };

  return (
    <div className="border-t border-border pt-6 space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-foreground">
          {t.settings.security.twoFactorHeading}
        </h4>
        <p className="text-xs text-muted-foreground mt-1">
          {t.settings.security.twoFactorDescription}
        </p>
      </div>

      {step === "idle" && (
        <div className="space-y-3">
          <p className="text-sm text-foreground">
            {enabled
              ? t.settings.security.twoFactorEnabledStatus
              : t.settings.security.twoFactorDisabledStatus}
          </p>
          <button
            type="button"
            onClick={() => (enabled ? setStep("disabling") : handleEnrollStart())}
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {enabled
              ? t.settings.security.disableTwoFactorButton
              : t.settings.security.enableTwoFactorButton}
          </button>
        </div>
      )}

      {step === "enrolling" && enrollment && (
        <div className="space-y-4">
          <p className="text-sm text-foreground">{t.settings.security.twoFactorScanQr}</p>
          <QrCode uri={enrollment.uri} />
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              {t.settings.security.twoFactorManualEntry}
            </p>
            <code className="block text-xs bg-muted rounded-md px-3 py-2 break-all">
              {parseManualSecret(enrollment.uri)}
            </code>
          </div>

          <div>
            <p className="text-sm font-medium text-foreground">
              {t.settings.security.twoFactorRecoveryCodesHeading}
            </p>
            <p className="text-xs text-muted-foreground mt-1 mb-2">
              {t.settings.security.twoFactorRecoveryCodesDescription}
            </p>
            <div className="grid grid-cols-2 gap-1 rounded-md border border-border p-3 font-mono text-xs">
              {enrollment.recoveryCodes.map((rc) => (
                <span key={rc}>{rc}</span>
              ))}
            </div>
            <button
              type="button"
              onClick={handleCopyCodes}
              className="mt-2 text-xs text-primary hover:underline"
            >
              {codesCopied
                ? t.settings.security.twoFactorCodesCopied
                : t.settings.security.twoFactorCopyRecoveryCodes}
            </button>
          </div>

          <div>
            <label
              htmlFor="totp-verify-code"
              className="block text-sm font-medium mb-1 text-foreground"
            >
              {t.settings.security.twoFactorEnterCode}
            </label>
            <input
              id="totp-verify-code"
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder={t.settings.security.twoFactorCodePlaceholder}
              maxLength={6}
              className="w-40 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground tracking-widest"
            />
          </div>

          {message && (
            <p
              className={cn(
                "text-sm",
                message.type === "error"
                  ? "text-destructive"
                  : "text-green-600 dark:text-green-400",
              )}
            >
              {message.text}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleVerify}
              disabled={submitting || code.length < 6}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {t.settings.security.twoFactorConfirmButton}
            </button>
            <button
              type="button"
              onClick={resetToIdle}
              disabled={submitting}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              {t.settings.security.twoFactorCancelButton}
            </button>
          </div>
        </div>
      )}

      {step === "disabling" && (
        <div className="space-y-3">
          <p className="text-sm text-foreground">{t.settings.security.twoFactorDisablePrompt}</p>
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder={t.settings.security.twoFactorCodePlaceholder}
            maxLength={6}
            aria-label={t.settings.security.twoFactorEnterCode}
            className="w-40 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground tracking-widest"
          />

          {message && (
            <p
              className={cn(
                "text-sm",
                message.type === "error"
                  ? "text-destructive"
                  : "text-green-600 dark:text-green-400",
              )}
            >
              {message.text}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDisable}
              disabled={submitting || code.length < 6}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
            >
              {t.settings.security.disableTwoFactorButton}
            </button>
            <button
              type="button"
              onClick={resetToIdle}
              disabled={submitting}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              {t.settings.security.twoFactorCancelButton}
            </button>
          </div>
        </div>
      )}

      {step === "idle" && message && (
        <p
          className={cn(
            "text-sm",
            message.type === "error" ? "text-destructive" : "text-green-600 dark:text-green-400",
          )}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
