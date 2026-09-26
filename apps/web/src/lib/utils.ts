import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { appUrl, BASE_PATH } from "@/lib/app-url";
import { safeRandomUUID } from "@/lib/uuid";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Resolve a server-returned result URL (downloadUrl / previewUrl / zipUrl /
 * maskUrl) for fetches, <a href>, and <img src>. The API emits root-relative
 * paths (`/api/v1/download/...`), so under a BASE_PATH deployment the client
 * must add the prefix. Absolute URLs (blob:, https:) pass through untouched,
 * and a path that already carries the deployment prefix (older stored rows
 * replayed after a re-run) is left alone so it never gets doubled.
 */
export function resolveServerUrl(url: string): string {
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url) || url.startsWith("//")) return url;
  if (BASE_PATH && url.startsWith(`${BASE_PATH}/`)) return url;
  return appUrl(url);
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
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
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
