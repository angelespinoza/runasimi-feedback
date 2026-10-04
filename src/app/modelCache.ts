// Mide lo que realmente ocupan los modelos en Cache Storage, agrupado por repo.
export async function cachedBytesByModel(): Promise<Record<string, number>> {
  const totals: Record<string, number> = {};
  if (!('caches' in self)) return totals;
  for (const name of await caches.keys()) {
    const cache = await caches.open(name);
    for (const req of await cache.keys()) {
      const match = new URL(req.url).pathname.match(/^\/([^/]+\/[^/]+)\/resolve\//);
      if (!match) continue;
      const res = await cache.match(req);
      if (!res) continue;
      const header = res.headers.get('content-length');
      const size = header ? Number(header) : (await res.blob()).size;
      totals[match[1]] = (totals[match[1]] ?? 0) + size;
    }
  }
  return totals;
}

export async function clearModelCache() {
  for (const name of await caches.keys()) await caches.delete(name);
}

export const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;
