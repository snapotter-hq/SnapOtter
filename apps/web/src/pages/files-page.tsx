import { X } from "lucide-react";
import { useState } from "react";
import { FileDetails } from "@/components/files/file-details";
import { FileList } from "@/components/files/file-list";
import { FileUploadArea } from "@/components/files/file-upload-area";
import { FilesNav } from "@/components/files/files-nav";
import { AppLayout } from "@/components/layout/app-layout";
import { useTranslation } from "@/contexts/i18n-context";
import { useMobile } from "@/hooks/use-mobile";
import { useFilesPageStore } from "@/stores/files-page-store";

export function FilesPage() {
  const { t } = useTranslation();
  const { activeTab, setActiveTab, selectedFileId } = useFilesPageStore();
  const isMobile = useMobile();
  const [showDetails, setShowDetails] = useState(false);

  if (isMobile) {
    return (
      <AppLayout showToolPanel={false}>
        <h1 className="sr-only">{t.files.myFiles}</h1>
        <div className="flex flex-col h-full w-full overflow-hidden">
          {/* Mobile tabs */}
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => setActiveTab("recent")}
              className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
                activeTab === "recent"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground"
              }`}
            >
              {t.files.recentTab}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("upload")}
              className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
                activeTab === "upload"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground"
              }`}
            >
              {t.files.uploadTab}
            </button>
          </div>

          {activeTab === "recent" ? (
            <div
              role="listbox"
              tabIndex={0}
              className="flex-1 overflow-hidden"
              onClick={() => {
                if (selectedFileId) setShowDetails(true);
              }}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && selectedFileId) setShowDetails(true);
              }}
            >
              <FileList />
            </div>
          ) : (
            <FileUploadArea />
          )}

          {/* Mobile detail bottom sheet */}
          {showDetails && selectedFileId && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t.a11y.fileDetails}
              className="fixed inset-0 z-50 bg-black/50"
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowDetails(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setShowDetails(false);
              }}
            >
              <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-xl p-4 max-h-[70dvh] overflow-y-auto">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-semibold">{t.files.fileDetailsHeading}</span>
                  <button type="button" onClick={() => setShowDetails(false)}>
                    <X className="h-5 w-5 text-muted-foreground" />
                  </button>
                </div>
                <FileDetails mobile />
              </div>
            </div>
          )}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout showToolPanel={false}>
      <h1 className="sr-only">{t.files.myFiles}</h1>
      <div className="flex h-full w-full overflow-hidden">
        <FilesNav />
        {activeTab === "recent" ? (
          <>
            <FileList />
            <FileDetails />
          </>
        ) : (
          <FileUploadArea />
        )}
      </div>
    </AppLayout>
  );
}
