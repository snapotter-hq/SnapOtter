import { safeRandomUUID } from "@/lib/uuid";

export interface SavedSignature {
  id: string;
  dataUrl: string;
  createdAt: number;
}

export const MAX_SIGNATURES = 10;
const KEY = "snapotter.signatures.v1";

function read(): SavedSignature[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedSignature[]) : [];
  } catch {
    return [];
  }
}

function write(list: SavedSignature[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false; // QuotaExceededError -> caller falls back to session-only
  }
}

export function listSignatures(): SavedSignature[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

export function addSignature(dataUrl: string): SavedSignature {
  const sig: SavedSignature = {
    id: safeRandomUUID(),
    dataUrl,
    createdAt: Date.now(),
  };
  const list = [...read(), sig].slice(-MAX_SIGNATURES); // keep newest MAX
  write(list);
  return sig;
}

export function deleteSignature(id: string): void {
  write(read().filter((s) => s.id !== id));
}
