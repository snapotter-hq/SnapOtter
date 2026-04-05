const API_BASE = "/api";

// ── Auth Headers ───────────────────────────────────────────────

function getToken(): string {
  try {
    return localStorage.getItem("stirling-token") || "";
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
  const res = await fetch(`${API_BASE}${path}`, {
    headers: formatHeaders(),
  });
  if (!res.ok) await throwWithMessage(res);
  return res.json();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: formatHeaders({ "Content-Type": "application/json" }),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) await throwWithMessage(res);
  return res.json();
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: formatHeaders({ "Content-Type": "application/json" }),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) await throwWithMessage(res);
  return res.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: formatHeaders(),
  });
  if (!res.ok) await throwWithMessage(res);
  return res.json();
}

export function setToken(token: string) {
  localStorage.setItem("stirling-token", token);
}

export function clearToken() {
  localStorage.removeItem("stirling-token");
}

// ── File Upload / Download ──────────────────────────────────────

export async function apiUpload(files: File[]): Promise<{
  jobId: string;
  files: Array<{ name: string; size: number; format: string }>;
}> {
  const formData = new FormData();
  for (const f of files) formData.append("files", f);
  const res = await fetch("/api/v1/upload", {
    method: "POST",
    headers: formatHeaders(),
    body: formData,
  });
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
  const res = await fetch("/api/v1/files/upload", {
    method: "POST",
    headers: formatHeaders(),
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

export async function apiDeleteUserFiles(ids: string[]): Promise<{ deleted: number }> {
  const res = await fetch("/api/v1/files", {
    method: "DELETE",
    headers: formatHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ids }),
  });
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
  const res = await fetch(getDownloadUrl(jobId, filename), {
    headers: formatHeaders(),
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.blob();
}
