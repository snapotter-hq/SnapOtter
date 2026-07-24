import { Clock, Upload } from "lucide-react";
import { useTranslation } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";
import { useFilesPageStore } from "@/stores/files-page-store";

export function FilesNav() {
  const { t } = useTranslation();
  const { activeTab, setActiveTab } = useFilesPageStore();
  const items = [
    { id: "recent" as const, label: t.files.recentTab, icon: Clock },
    { id: "upload" as const, label: t.files.uploadTab, icon: Upload },
  ];

  return (
    <div className="w-48 border-e border-border p-4 shrink-0 hidden md:block">
      <h2 className="text-sm font-semibold text-foreground mb-3">{t.files.myFiles}</h2>
      <div className="space-y-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
              activeTab === item.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
