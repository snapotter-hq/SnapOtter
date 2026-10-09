import { toast } from "sonner";

/**
 * Tells the user why the files they just dropped or pasted were not taken. The
 * fixed id keeps a burst of drops from queuing the same toast ten times.
 */
export function showIntakeIgnored(message: string): void {
  toast.info(message, { id: "intake-ignored-while-running" });
}
