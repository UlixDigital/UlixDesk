import { readFile, stat } from "node:fs/promises";
import { DEFAULT_SERVER_FILE, defaultServerDocument } from "../../extension/default-server.mjs";
import { replaceZipEntry } from "../../extension/zip.mjs";
import { extensionZipPath } from "@/lib/extension-artifact";
import { extensionServerOrigin } from "@/lib/extension-server-origin";

type CacheEntry = {
  path: string;
  mtimeMs: number;
  size: number;
  bytes: Buffer;
};

const cache = new Map<string, CacheEntry>();
const MAX_ENTRIES = 8;

export function clearExtensionDownloadCache() {
  cache.clear();
}

function isNotFound(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function injectServerUrl(base: Buffer, origin: string) {
  try {
    return replaceZipEntry(base, DEFAULT_SERVER_FILE, defaultServerDocument(origin));
  } catch {
    return base;
  }
}

/** Serves the built zip with this deployment's public origin written into it. */
export async function extensionZipForDownload(request: Request): Promise<Buffer | null> {
  const path = extensionZipPath();
  let info;
  try {
    info = await stat(path);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  if (!info.isFile() || info.size < 22) return null;

  const origin = extensionServerOrigin(request) ?? "";
  const hit = cache.get(origin);
  if (hit && hit.path === path && hit.mtimeMs === info.mtimeMs && hit.size === info.size) {
    return hit.bytes;
  }

  const base = await readFile(path);
  if (base.length < 22) return null;
  const bytes = origin ? injectServerUrl(base, origin) : base;
  cache.set(origin, { path, mtimeMs: info.mtimeMs, size: info.size, bytes });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return bytes;
}
