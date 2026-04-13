import type { FetchImageResponse } from '../shared/messages';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Unexpected FileReader result'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

function mimeFromDataUrl(dataUrl: string): string {
  const m = /^data:([^;]+);/.exec(dataUrl);
  return m?.[1] ?? 'application/octet-stream';
}

/** Load image bytes in the extension background (bypasses many CORS canvas taint issues). */
async function fetchHttpInBackground(url: string): Promise<{ dataUrl: string; mimeType: string }> {
  const res = (await chrome.runtime.sendMessage({
    type: 'FETCH_IMAGE',
    url,
  })) as FetchImageResponse;

  if (!res.success) {
    throw new Error(res.error || 'Failed to load image');
  }

  return { dataUrl: res.dataUrl, mimeType: res.mimeType };
}

/** Page-scoped blob: URLs must be read in the content script. */
async function fetchBlobUrlInPage(url: string): Promise<{ dataUrl: string; mimeType: string }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const blob = await r.blob();
  const mimeType = blob.type || 'application/octet-stream';
  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, mimeType };
}

export async function fetchImageAsDataUrl(url: string): Promise<{ dataUrl: string; mimeType: string }> {
  if (!url) throw new Error('Empty image URL');

  if (url.startsWith('data:')) {
    return { dataUrl: url, mimeType: mimeFromDataUrl(url) };
  }

  if (url.startsWith('blob:')) {
    return fetchBlobUrlInPage(url);
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return fetchHttpInBackground(url);
  }

  throw new Error('Unsupported image URL scheme');
}

/** Prefer largest candidate URL for raster images. */
export function resolveImageUrl(img: HTMLImageElement): string {
  if (img.currentSrc) return img.currentSrc;
  if (img.src) return img.src;
  const srcset = img.getAttribute('srcset');
  if (srcset) {
    const parts = srcset.split(',').map((s) => s.trim().split(/\s+/));
    let bestUrl = '';
    let bestW = 0;
    for (const [u, w] of parts) {
      if (!u) continue;
      const num = w ? parseInt(w.replace('w', ''), 10) : 0;
      if (num >= bestW) {
        bestW = num;
        bestUrl = u;
      }
    }
    if (bestUrl) return bestUrl;
  }
  return img.src || '';
}
