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
 * Copy an image blob (or a promise of one) to the clipboard. Unlike text,
 * images have no execCommand fallback, so on insecure (plain-http) contexts,
 * where navigator.clipboard and ClipboardItem do not exist, this reports
 * failure instead of throwing (Sentry WEB-G).
 *
 * WebKit drops the user gesture across any await before navigator.clipboard.write,
 * so callers whose export is asynchronous pass a Promise<Blob> directly and let
 * ClipboardItem receive the promise inside the gesture (#1979).
 */
export async function copyImageToClipboard(
  blob: Blob | Promise<Blob>,
  type = "image/png",
): Promise<boolean> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    Promise.resolve(blob).catch(() => {});
    return false;
  }
  const mimeType = blob instanceof Blob && blob.type ? blob.type : type;
  const itemBlob = Promise.resolve(blob).then((resolved) => {
    if (!(resolved instanceof Blob) || resolved.size === 0) {
      throw new Error("Image clipboard payload is empty");
    }
    return resolved;
  });
  itemBlob.catch(() => {});
  try {
    const writePromise = navigator.clipboard.write([new ClipboardItem({ [mimeType]: itemBlob })]);
    Promise.resolve(writePromise).catch(() => {});
    await Promise.all([itemBlob, writePromise]);
    return true;
  } catch (err) {
    console.error("Failed to copy image to clipboard:", err);
    return false;
  }
}
