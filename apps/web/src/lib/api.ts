import type { TranslationKeys } from "@snapotter/shared";
import { getDistinctId } from "@/lib/analytics";
import { appUrl } from "@/lib/app-url";
import { featureNotInstalledMessage } from "@/lib/bundle-i18n";
import { useConnectionStore } from "@/stores/connection-store";

const API_BASE = appUrl("/api");

export interface FeatureNotInstalledError {
  type: "feature_not_installed";
  feature: string;
  featureName: string;
  estimatedSize: string;
}

/**
 * Reads a failed answer's JSON body: `error`, then `details`, then `message`.
 * Only string `error` and `message` count, so an object-valued one can never
 * reach the screen as "[object Object]" (#1858). `fallback` is what a body
 * that names no reason reads as.
 */
export function parseApiError(
  body: Record<string, unknown>,
  fallbackStatus: number,
  fallback = `Processing failed: ${fallbackStatus}`,
): string | FeatureNotInstalledError {
  if (body.code === "FEATURE_NOT_INSTALLED") {
    return {
      type: "feature_not_installed",
      feature: body.feature as string,
      featureName: body.featureName as string,
      estimatedSize: body.estimatedSize as string,
    };
  }

  const error = typeof body.error === "string" ? body.error : "";
  const message = typeof body.message === "string" ? body.message : "";
  const details = body.details;
  let detailsStr = "";
  if (typeof details === "string") {
    detailsStr = details;
  } else if (Array.isArray(details)) {
    detailsStr = details
      .map((d) => {
        if (typeof d === "string") return d;
        const itemMessage = (d as Record<string, unknown> | null)?.message;
        return typeof itemMessage === "string" && itemMessage ? itemMessage : JSON.stringify(d);
      })
      .join("; ");
  } else if (details) {
    detailsStr = JSON.stringify(details);
  }
  // The API's error handler sends a 4xx's message as both fields.
  if (!detailsStr || detailsStr === error) return error || message || fallback;
  return error ? `${error}: ${detailsStr}` : detailsStr;
}

/**
 * The text a tool panel shows for a non-2xx answer it posted for itself
 * (#1858): parseApiError's reading of the body, the translated install
 * message for FEATURE_NOT_INSTALLED, or the panel's own `fallback` when the
 * body is not a JSON object or names no reason. Takes `unknown` because the
 * body comes straight from JSON.parse or res.json().
 */
export function failedAnswerMessage(
  t: TranslationKeys,
  body: unknown,
  status: number,
  fallback: string,
  toolName?: string,
): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fallback;
  const parsed = parseApiError(body as Record<string, unknown>, status, fallback);
  return typeof parsed === "string" ? parsed : featureNotInstalledMessage(t, parsed, toolName);
}

// ── Auth Headers ───────────────────────────────────────────────

function getBrowserStorage(): Storage | null {
  return typeof window !== "undefined" ? window.localStorage : null;
}

function getToken(): string {
  try {
    return getBrowserStorage()?.getItem("snapotter-token") || "";
  } catch {
    return "";
  }
}

// Skip Authorization header when no token exists.
// An empty Bearer token breaks forward-auth proxies (e.g. Authelia).
export function formatHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const distinctId = getDistinctId();
  if (distinctId) {
    headers.set("X-PostHog-Distinct-Id", distinctId);
  }
  return headers;
}

/**
 * A request the API answered with a non-2xx status. `message` is still the
 * server's `error` text, for logs and for callers that haven't moved over,
 * but that text is always English: UI copy should be chosen from `status`
 * and `code` instead (#1445). `body` is the parsed JSON, or `{}`.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | undefined,
    readonly body: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Translated copy for a failed request: the message `byCode` gives the
 * error's code, then the refusals any request can meet (an ended session,
 * a missing permission, a rate limit), else `fallback`. Never the server's
 * English text (#1445).
 */
export function apiErrorMessage(
  t: TranslationKeys,
  err: unknown,
  byCode: Partial<Record<string, string>>,
  fallback: string,
): string {
  if (err instanceof ApiError) {
    const byAnyCode: Partial<Record<string, string>> = {
      AUTH_REQUIRED: t.errors.sessionEnded,
      FORBIDDEN: t.errors.forbidden,
      ...byCode,
    };
    const mapped = err.code !== undefined ? byAnyCode[err.code] : undefined;
    if (mapped) return mapped;
    // A rate limiter's 429 carries no code.
    if (err.status === 429) return t.errors.tooManyRequests;
  }
  // The screen shows only the translated fallback, so keep the server's
  // reason where someone debugging can find it.
  console.warn("Request failed:", err);
  return fallback;
}

async function throwWithMessage(res: Response): Promise<never> {
  let msg = `API error: ${res.status}`;
  let body: Record<string, unknown> = {};
  try {
    const parsed = await res.json();
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
    if (typeof body.error === "string" && body.error) msg = body.error;
    else if (typeof body.message === "string" && body.message) msg = body.message;
  } catch {
    // response wasn't JSON — use the default message
  }
  throw new ApiError(msg, res.status, typeof body.code === "string" ? body.code : undefined, body);
}

export async function apiGet<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: formatHeaders(),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      useConnectionStore.getState().setDisconnected();
    }
    throw error;
  }
  if (!res.ok) await throwWithMessage(res);
  return res.json();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const headers =
    body !== undefined ? formatHeaders({ "Content-Type": "application/json" }) : formatHeaders();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      useConnectionStore.getState().setDisconnected();
    }
    throw error;
  }
  if (!res.ok) await throwWithMessage(res);
  return res.json();
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "PUT",
      headers: formatHeaders({ "Content-Type": "application/json" }),
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      useConnectionStore.getState().setDisconnected();
    }
    throw error;
  }
  if (!res.ok) await throwWithMessage(res);
  return res.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "DELETE",
      headers: formatHeaders(),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      useConnectionStore.getState().setDisconnected();
    }
    throw error;
  }
  if (!res.ok) await throwWithMessage(res);
  return res.json();
}

export function setToken(token: string) {
  getBrowserStorage()?.setItem("snapotter-token", token);
}

export function clearToken() {
  getBrowserStorage()?.removeItem("snapotter-token");
}

// ── File Upload / Download ──────────────────────────────────────

export async function apiUpload(files: File[]): Promise<{
  jobId: string;
  files: Array<{ name: string; size: number; format: string }>;
}> {
  const formData = new FormData();
  for (const f of files) formData.append("files", f);
  let res: Response;
  try {
    res = await fetch(appUrl("/api/v1/upload"), {
      method: "POST",
      headers: formatHeaders(),
      body: formData,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      useConnectionStore.getState().setDisconnected();
    }
    throw error;
  }
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

export function getDownloadUrl(jobId: string, filename: string): string {
  return appUrl(`/api/v1/download/${jobId}/${filename}`);
}

// ── Persistent File Management ──────────────────────────────────

export interface UserFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  version: number;
  toolChain: string[];
  createdAt: string;
}

export interface UserFileDetail extends UserFile {
  versions: Array<{
    id: string;
    version: number;
    size: number;
    toolChain: string[];
    createdAt: string;
  }>;
}

export async function apiListFiles(params?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ files: UserFile[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", params.search);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  const qs = searchParams.toString();
  return apiGet(`/v1/files${qs ? `?${qs}` : ""}`);
}

export async function apiGetFileDetails(id: string): Promise<UserFileDetail> {
  const res = await apiGet<{ file: UserFile; versions: UserFileDetail["versions"] }>(
    `/v1/files/${id}`,
  );
  return { ...res.file, versions: res.versions };
}

export function apiUploadUserFiles(
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<{ files: Array<{ id: string; originalName: string; size: number; version: number }> }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    for (const f of files) formData.append("files", f);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", appUrl("/api/v1/files/upload"));
    xhr.timeout = 120_000;

    const headers = formatHeaders();
    headers.forEach((value, key) => {
      if (key.toLowerCase() !== "content-type") {
        xhr.setRequestHeader(key, value);
      }
    });

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid server response"));
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      useConnectionStore.getState().setDisconnected();
      reject(new TypeError("Network error"));
    };

    xhr.ontimeout = () => {
      reject(new Error("Upload timed out"));
    };

    xhr.send(formData);
  });
}

export async function apiDeleteUserFiles(ids: string[]): Promise<{ deleted: number }> {
  let res: Response;
  try {
    res = await fetch(appUrl("/api/v1/files"), {
      method: "DELETE",
      headers: formatHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ ids }),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      useConnectionStore.getState().setDisconnected();
    }
    throw error;
  }
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
  return res.json();
}

export function getFileThumbnailUrl(id: string): string {
  return appUrl(`/api/v1/files/${id}/thumbnail`);
}

export function getFileDownloadUrl(id: string): string {
  return appUrl(`/api/v1/files/${id}/download`);
}

export function getFilePreviewUrl(id: string): string {
  return appUrl(`/api/v1/files/${id}/preview`);
}

export async function apiDownloadBlob(jobId: string, filename: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(getDownloadUrl(jobId, filename), {
      headers: formatHeaders(),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      useConnectionStore.getState().setDisconnected();
    }
    throw error;
  }
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.blob();
}
