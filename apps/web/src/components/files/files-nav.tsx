import { Clock, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFilesPageStore } from "@/stores/files-page-store";

export function FilesNav() {
  const { activeTab, setActiveTab } = useFilesPageStore();
  const items = [
    { id: "recent" as const, label: "Recent", icon: Clock },
    { id: "upload" as const, label: "Upload Files", icon: Upload },
  ];

  return (
    <div className="w-48 border-r border-border p-4 shrink-0 hidden md:block">
      <h3 className="text-sm font-semibold text-foreground mb-3">My Files</h3>
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
