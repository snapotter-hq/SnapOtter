import { Link } from "react-router-dom";
import { useTranslation } from "@/contexts/i18n-context";

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="flex h-dvh items-center justify-center bg-background text-foreground">
      <div className="text-center space-y-4 max-w-md px-6">
        <h1 className="text-6xl font-bold text-primary-ink">404</h1>
        <h2 className="text-xl font-semibold">{t.common.pageNotFound}</h2>
        <p className="text-sm text-muted-foreground">{t.common.pageNotFoundDescription}</p>
        <Link
          to="/"
          className="inline-block px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          {t.common.goHome}
        </Link>
      </div>
    </div>
  );
}
