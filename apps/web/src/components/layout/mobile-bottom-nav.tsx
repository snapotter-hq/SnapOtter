import { FolderOpen, LayoutGrid, Settings as SettingsIcon, Workflow } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "@/contexts/i18n-context";
import { ImageEditIcon } from "../common/image-edit-icon";

interface MobileBottomNavProps {
  onSettingsClick?: () => void;
}

export function MobileBottomNav({ onSettingsClick }: MobileBottomNavProps) {
  const { t } = useTranslation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur-sm border-t border-border flex items-center justify-around px-2 py-2"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <MobileNavItem icon={LayoutGrid} label={t.appLayout.mobileNavTools} href="/" />
      <MobileNavItem icon={Workflow} label={t.appLayout.mobileNavAutomate} href="/automate" />
      <MobileNavItem icon={ImageEditIcon} label={t.appLayout.mobileNavEditor} href="/editor" />
      <MobileNavItem icon={FolderOpen} label={t.appLayout.mobileNavFiles} href="/files" />
      {onSettingsClick && (
        <button
          type="button"
          onClick={onSettingsClick}
          data-testid="open-settings"
          className="flex flex-col items-center gap-0.5 px-3 py-2 text-muted-foreground"
        >
          <SettingsIcon className="h-6 w-6" />
          <span className="text-[10px]">{t.appLayout.mobileNavSettings}</span>
        </button>
      )}
    </nav>
  );
}

function MobileNavItem({
  icon: Icon,
  label,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
}) {
  return (
    <Link
      to={href}
      className="flex flex-col items-center gap-0.5 px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
    >
      <Icon className="h-6 w-6" />
      <span className="text-[10px]">{label}</span>
    </Link>
  );
}
