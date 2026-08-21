export type VisualReference = {
  title: string;
  creator: string | null;
  sourceUrl: string;
  thumbnailUrl: string | null;
  license: string;
  licenseUrl: string | null;
  provider: string | null;
  usage: "research-only";
};

const PUBLIC_DOMAIN_LICENSES = "cc0,pdm";

export async function findOpenVisualReferences(query: string, limit = 3): Promise<VisualReference[]> {
  const cleanQuery = String(query || "").trim().slice(0, 160);
  if (!cleanQuery) return [];

  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", cleanQuery);
  url.searchParams.set("license", PUBLIC_DOMAIN_LICENSES);
  url.searchParams.set("page_size", String(Math.max(1, Math.min(limit, 5))));
  url.searchParams.set("mature", "false");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "OpportunityRadar/1.0 (https://missedrevenue.org)" }
    });
    if (!response.ok) return [];
    const payload: any = await response.json();
    return (Array.isArray(payload?.results) ? payload.results : [])
      .filter((item: any) => item?.foreign_landing_url || item?.detail_url)
      .slice(0, limit)
      .map((item: any) => ({
        title: String(item.title || "Untitled reference"),
        creator: item.creator ? String(item.creator) : null,
        sourceUrl: String(item.foreign_landing_url || item.detail_url),
        thumbnailUrl: item.thumbnail ? String(item.thumbnail) : null,
        license: String(item.license || "unknown").toUpperCase(),
        licenseUrl: item.license_url ? String(item.license_url) : null,
        provider: item.provider ? String(item.provider) : null,
        usage: "research-only" as const
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
