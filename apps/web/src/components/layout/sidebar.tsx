import { FolderOpen, Grid3x3, HelpCircle, LayoutGrid, Settings, Workflow } from "lucide-react";
import type { ComponentType } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";
import { ImageEditIcon } from "../common/image-edit-icon";
import { OtterLogo } from "../common/otter-logo";

interface SidebarItem {
  icon: ComponentType<{ className?: string }>;
  label: string;
  href?: string;
}

function useNavItems() {
  const { t } = useTranslation();
  const topItems: SidebarItem[] = [
    { icon: LayoutGrid, label: t.sidebar.tools, href: "/" },
    { icon: Grid3x3, label: t.sidebar.grid, href: "/fullscreen" },
    { icon: Workflow, label: t.sidebar.automate, href: "/automate" },
    { icon: ImageEditIcon, label: t.sidebar.editor, href: "/editor" },
    { icon: FolderOpen, label: t.sidebar.files, href: "/files" },
  ];
  const bottomItems: SidebarItem[] = [
    { icon: HelpCircle, label: t.sidebar.help },
    { icon: Settings, label: t.sidebar.settings },
  ];
  return { topItems, bottomItems };
}

interface SidebarProps {
  onSettingsClick: () => void;
  onHelpClick: () => void;
  /** Called when a nav link is clicked (e.g., to close mobile sidebar). */
  onNavClick?: () => void;
  /** When true, renders in expanded mode (for mobile overlay). */
  expanded?: boolean;
}

export function Sidebar({
  onSettingsClick,
  onHelpClick,
  onNavClick,
  expanded = false,
}: SidebarProps) {
  const location = useLocation();
  const { t } = useTranslation();
  const { topItems, bottomItems } = useNavItems();

  const renderItem = (item: SidebarItem, isActive: boolean) => {
    const content = expanded ? (
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-2.5 rounded-lg cursor-pointer transition-colors",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <item.icon className="h-5 w-5" />
        <span className="text-sm font-medium">{item.label}</span>
      </div>
    ) : (
      <div
        className={cn(
          "flex flex-col items-center gap-1 p-2 rounded-lg cursor-pointer transition-colors",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <item.icon className="h-6 w-6" />
        <span className="text-[10px] font-medium">{item.label}</span>
      </div>
    );

    if (item === bottomItems[1]) {
      return (
        <button key={item.label} type="button" onClick={onSettingsClick} className="w-full">
          {content}
        </button>
      );
    }
    if (item === bottomItems[0]) {
      return (
        <button
          key={item.label}
          type="button"
          onClick={onHelpClick}
          className="w-full text-sidebar-foreground"
        >
          {content}
        </button>
      );
    }
    return (
      <Link key={item.label} to={item.href || "/"} onClick={onNavClick}>
        {content}
      </Link>
    );
  };

  if (expanded) {
    return (
      <nav aria-label={t.a11y.navigationMenu} className="flex flex-col p-3 gap-1">
        {topItems.map((item) => renderItem(item, location.pathname === item.href))}
        <div className="border-t border-border my-2" />
        {bottomItems.map((item) => renderItem(item, false))}
      </nav>
    );
  }

  return (
    <aside className="flex flex-col items-center w-16 bg-sidebar border-e border-border py-3 gap-1 shrink-0">
      <div className="mb-2 flex items-center justify-center">
        <OtterLogo className="h-7 w-7 text-primary" />
      </div>
      <div className="border-t border-border w-10 mb-2" />
      <nav aria-label={t.a11y.navigationMenu} className="flex flex-col gap-1 flex-1">
        {topItems.map((item) => renderItem(item, location.pathname === item.href))}
      </nav>
      <div className="border-t border-border w-10 my-2" />
      <div className="flex flex-col gap-1">
        {bottomItems.map((item) => renderItem(item, false))}
      </div>
    </aside>
  );
}
