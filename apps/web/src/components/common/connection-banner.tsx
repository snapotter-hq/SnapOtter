import { CheckCircle2, Loader2, WifiOff } from "lucide-react";
import { useConnectionStore } from "@/stores/connection-store";

export function ConnectionBanner() {
  const status = useConnectionStore((s) => s.status);

  if (status === "connected") return null;

  const config = {
    disconnected: {
      bg: "bg-amber-500 dark:bg-amber-600",
      text: "text-amber-950 dark:text-amber-50",
      icon: <Loader2 className="h-4 w-4 animate-spin" />,
      message: "Reconnecting to server\u2026",
    },
    offline: {
      bg: "bg-amber-500 dark:bg-amber-600",
      text: "text-amber-950 dark:text-amber-50",
      icon: <WifiOff className="h-4 w-4" />,
      message: "You\u2019re offline",
    },
    reconnected: {
      bg: "bg-emerald-500 dark:bg-emerald-600",
      text: "text-emerald-950 dark:text-emerald-50",
      icon: <CheckCircle2 className="h-4 w-4" />,
      message: "Connected",
    },
  }[status];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-transform duration-300 ${config.bg} ${config.text}`}
    >
      {config.icon}
      {config.message}
    </div>
  );
}
