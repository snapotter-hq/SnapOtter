import { useConnectionStore } from "@/stores/connection-store";

const API_BASE = "/api";

export interface FeatureNotInstalledError {
  type: "feature_not_installed";
  feature: string;
  featureName: string;
  estimatedSize: string;
}

export function parseApiError(
  body: Record<string, unknown>,
  fallbackStatus: number,
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
  const details = body.details;
  if (!details) {
    return error || (body.message as string) || `Processing failed: ${fallbackStatus}`;
  }
  let detailsStr: string;
  if (typeof details === "string") {
    detailsStr = details;
  } else if (Array.isArray(details)) {
    detailsStr = details
      .map((d) =>
        typeof d === "string" ? d : (d as Record<string, unknown>)?.message || JSON.stringify(d),
      )
      .join("; ");
  } else {
    detailsStr = JSON.stringify(details);
  }
  return error ? `${error}: ${detailsStr}` : detailsStr;
}

// ── Auth Headers ───────────────────────────────────────────────

function getToken(): string {
  try {
    return localStorage.getItem("ashim-token") || "";
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
  if (!token) {
    try {
      const consent = localStorage.getItem("ashim-analytics-consent");
      if (consent === "true" || consent === "false") {
        headers.set("X-Analytics-Consent", consent);
      }
    } catch {
      // localStorage unavailable
    }
  }
  return headers;
}

async function throwWithMessage(res: Response): Promise<never> {
  let msg = `API error: ${res.status}`;
  try {
    const body = await res.json();
    if (body.error) msg = body.error;
    else if (body.message) msg = body.message;
  } catch {
    // response wasn't JSON — use the default message
  }
  throw new Error(msg);
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
  localStorage.setItem("ashim-token", token);
}

export function clearToken() {
  localStorage.removeItem("ashim-token");
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
    res = await fetch("/api/v1/upload", {
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
  return `/api/v1/download/${jobId}/${filename}`;
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

export async function apiUploadUserFiles(
  files: File[],
): Promise<{ files: Array<{ id: string; originalName: string; size: number; version: number }> }> {
  const formData = new FormData();
  for (const f of files) formData.append("files", f);
  let res: Response;
  try {
    res = await fetch("/api/v1/files/upload", {
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

export async function apiDeleteUserFiles(ids: string[]): Promise<{ deleted: number }> {
  let res: Response;
  try {
    res = await fetch("/api/v1/files", {
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
  return `/api/v1/files/${id}/thumbnail`;
}

export function getFileDownloadUrl(id: string): string {
  return `/api/v1/files/${id}/download`;
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
