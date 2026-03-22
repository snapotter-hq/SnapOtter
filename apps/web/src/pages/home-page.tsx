import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/app-layout";
import { useFileStore } from "@/stores/file-store";
import {
  Maximize2,
  Minimize2,
  FileOutput,
  Eraser,
  X,
} from "lucide-react";

const QUICK_ACTIONS = [
  { id: "resize", name: "Resize", icon: Maximize2, route: "/resize" },
  { id: "compress", name: "Compress", icon: Minimize2, route: "/compress" },
  { id: "convert", name: "Convert", icon: FileOutput, route: "/convert" },
  { id: "remove-background", name: "Remove Background", icon: Eraser, route: "/remove-background" },
] as const;

export function HomePage() {
  const { setFiles, files, reset } = useFileStore();
  const navigate = useNavigate();
  const [showActions, setShowActions] = useState(false);

  const handleFiles = useCallback(
    (newFiles: File[]) => {
      reset();
      setFiles(newFiles);
      setShowActions(true);
    },
    [setFiles, reset],
  );

  const handleAction = (route: string) => {
    setShowActions(false);
    navigate(route);
  };

  const handleDismiss = () => {
    setShowActions(false);
    reset();
  };

  return (
    <AppLayout onFiles={handleFiles}>
      {/* Quick-action overlay */}
      {showActions && files.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background rounded-2xl shadow-2xl border border-border p-6 max-w-md w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">
                What would you like to do?
              </h2>
              <button
                onClick={handleDismiss}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              <span className="font-medium text-foreground">{files[0].name}</span>
              {" "}({(files[0].size / 1024).toFixed(1)} KB)
              {files.length > 1 && ` +${files.length - 1} more`}
            </p>

            <div className="grid grid-cols-2 gap-3">
              {QUICK_ACTIONS.map(({ id, name, icon: Icon, route }) => (
                <button
                  key={id}
                  onClick={() => handleAction(route)}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
                >
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
