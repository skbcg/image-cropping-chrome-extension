import type { CropRegion } from './cropTypes';

export const TARGET_SIZE = 1200;

/** Rasterize crop to 1200×1200 PNG data URL. */
export function cropToPngDataUrl(img: HTMLImageElement, crop: CropRegion): string {
  const canvas = document.createElement('canvas');
  canvas.width = TARGET_SIZE;
  canvas.height = TARGET_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  ctx.drawImage(img, crop.x, crop.y, crop.size, crop.size, 0, 0, TARGET_SIZE, TARGET_SIZE);
  return canvas.toDataURL('image/png');
}

/** Rasterize crop to 1200×1200 JPEG data URL. */
export function cropToJpegDataUrl(img: HTMLImageElement, crop: CropRegion, quality = 0.92): string {
  const canvas = document.createElement('canvas');
  canvas.width = TARGET_SIZE;
  canvas.height = TARGET_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  ctx.drawImage(img, crop.x, crop.y, crop.size, crop.size, 0, 0, TARGET_SIZE, TARGET_SIZE);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Small JPEG preview for UI. */
export function cropToJpegPreviewDataUrl(img: HTMLImageElement, crop: CropRegion, previewSize = 400): string {
  const canvas = document.createElement('canvas');
  canvas.width = previewSize;
  canvas.height = previewSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  ctx.drawImage(img, crop.x, crop.y, crop.size, crop.size, 0, 0, previewSize, previewSize);
  return canvas.toDataURL('image/jpeg', 0.85);
}
