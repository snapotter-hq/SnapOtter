import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { safeRandomUUID } from "@/lib/uuid";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return safeRandomUUID();
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      // The textarea holds the copied text (often an API key or recovery
      // codes), so it has to leave the DOM even when select() or execCommand
      // throws (#1937).
      try {
        textarea.select();
        return document.execCommand("copy");
      } finally {
        textarea.remove();
      }
    } catch {
      return false;
    }
  }
}

/**
 * Copy an image blob to the clipboard. Unlike text, images have no
 * execCommand fallback, so on insecure (plain-http) contexts, where
 * navigator.clipboard and ClipboardItem do not exist, this reports failure
 * instead of throwing (Sentry WEB-G).
 */
export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    return true;
  } catch {
    return false;
  }
}
