/**
 * OEM/CDN image URL helpers (Ford-style ?crop-names=…&width=…&height=…).
 * Aligns with oem-image-scraper `Index.tsx` / `image-filters` behavior.
 */

export const WIDTH_PARAM_NAMES = ['imwidth', 'w', 'width', 'wid', 'maxwidth'] as const;
export const HEIGHT_PARAM_NAMES = ['hei', 'h', 'height', 'imheight', 'maxheight'] as const;

/** Normalize HTML-escaped query strings (Ford-style `amp%3Bcrop-names=…&amp%3Bwidth=…`). */
export function normalizeUrlString(url: string): string {
  return url
    .replace(/&amp;/gi, '&')
    .replace(/amp%3B/gi, '')
    .replace(/amp;/gi, '');
}

function normalizeSearchParamKey(key: string): string {
  return key.toLowerCase().replace(/^amp;/, '');
}

/** Remove server crop preset so the CDN returns the full asset (or default sizing). */
export function stripCropNamesFromUrl(url: string, baseUrl?: string): string {
  try {
    const base = baseUrl ?? (typeof window !== 'undefined' ? window.location.href : 'https://example.invalid/');
    const u = new URL(normalizeUrlString(url), base);
    for (const key of [...u.searchParams.keys()]) {
      const nk = normalizeSearchParamKey(key);
      if (nk === 'crop-names' || nk === 'crop_names') {
        u.searchParams.delete(key);
      }
    }
    let out = u.toString();
    if (out.endsWith('?')) out = out.slice(0, -1);
    return out;
  } catch {
    return url;
  }
}

export type DetectedDimensions = {
  widthKey: string | null;
  widthValue: number | null;
  heightKey: string | null;
  heightValue: number | null;
};

function parsePositiveInt(s: string): number | null {
  const n = parseInt(s, 10);
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
}

/** Read width/height query params from a URL (first matching key wins per category). */
export function detectDimensionsFromUrl(url: string, baseUrl?: string): DetectedDimensions {
  const empty: DetectedDimensions = {
    widthKey: null,
    widthValue: null,
    heightKey: null,
    heightValue: null,
  };
  try {
    const base = baseUrl ?? (typeof window !== 'undefined' ? window.location.href : 'https://example.invalid/');
    const u = new URL(normalizeUrlString(url), base);
    let widthKey: string | null = null;
    let widthValue: number | null = null;
    let heightKey: string | null = null;
    let heightValue: number | null = null;

    for (const [key, val] of u.searchParams.entries()) {
      const k = normalizeSearchParamKey(key);
      if (!widthKey && WIDTH_PARAM_NAMES.includes(k as (typeof WIDTH_PARAM_NAMES)[number])) {
        const n = parsePositiveInt(val);
        if (n != null) {
          widthKey = key;
          widthValue = n;
        }
      }
    }
    for (const [key, val] of u.searchParams.entries()) {
      const k = normalizeSearchParamKey(key);
      if (!heightKey && HEIGHT_PARAM_NAMES.includes(k as (typeof HEIGHT_PARAM_NAMES)[number])) {
        const n = parsePositiveInt(val);
        if (n != null) {
          heightKey = key;
          heightValue = n;
        }
      }
    }
    return { widthKey, widthValue, heightKey, heightValue };
  } catch {
    return empty;
  }
}

function findExistingKey(u: URL, logicalKey: string): string | null {
  const want = normalizeSearchParamKey(logicalKey);
  for (const k of u.searchParams.keys()) {
    if (normalizeSearchParamKey(k) === want) return k;
  }
  return null;
}

/**
 * Apply width/height on a URL (crop-names should already be stripped for fetch).
 * When only width changes in the UI, scale height proportionally like the web app.
 */
export function buildUrlWithDimensions(
  url: string,
  dims: {
    widthKey: string | null;
    widthValue: number | null;
    heightKey: string | null;
    heightValue: number | null;
  },
  baseUrl?: string,
): string {
  try {
    const base = baseUrl ?? (typeof window !== 'undefined' ? window.location.href : 'https://example.invalid/');
    const u = new URL(normalizeUrlString(url), base);
    stripCropNamesInPlace(u);

    if (dims.widthKey != null && dims.widthValue != null) {
      const k = findExistingKey(u, dims.widthKey) || dims.widthKey;
      u.searchParams.set(k, String(dims.widthValue));
    }
    if (dims.heightKey != null && dims.heightValue != null) {
      const k = findExistingKey(u, dims.heightKey) || dims.heightKey;
      u.searchParams.set(k, String(dims.heightValue));
    }

    let out = u.toString();
    if (out.endsWith('?')) out = out.slice(0, -1);
    return out;
  } catch {
    return url;
  }
}

function stripCropNamesInPlace(u: URL): void {
  for (const key of [...u.searchParams.keys()]) {
    const nk = normalizeSearchParamKey(key);
    if (nk === 'crop-names' || nk === 'crop_names') {
      u.searchParams.delete(key);
    }
  }
}
