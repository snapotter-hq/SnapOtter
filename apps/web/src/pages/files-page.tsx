import { AppLayout } from "@/components/layout/app-layout";
import { FilesNav } from "@/components/files/files-nav";
import { FileList } from "@/components/files/file-list";
import { FileDetails } from "@/components/files/file-details";
import { FileUploadArea } from "@/components/files/file-upload-area";
import { useFilesPageStore } from "@/stores/files-page-store";

export function FilesPage() {
  const { activeTab } = useFilesPageStore();
  return (
    <AppLayout showToolPanel={false}>
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
