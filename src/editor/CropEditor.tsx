import { useCallback, useEffect, useRef, useState } from 'react';
import type { CropRegion } from './cropTypes';
import { cropToJpegDataUrl, cropToJpegPreviewDataUrl, TARGET_SIZE } from './cropMath';

const SAFE_ZONE = { width: 960, height: 570 };
const HANDLE_SIZE = 10;
const HANDLE_HIT = 14;
const SNAP_THRESHOLD = 8;
const ZOOM_STEP = 0.15;
const AUTO_ZOOM_STEP = 0.045;
const AUTO_ZOOM_MIN_INTERVAL_MS = 320;
const VIEW_MARGIN = 8;

type ResizeCorner = 'tl' | 'tr' | 'bl' | 'br' | null;

export type UrlDimensionControls = {
  widthKey: string | null;
  heightKey: string | null;
  widthValue: number | null;
  heightValue: number | null;
  originalWidth: number | null;
  originalHeight: number | null;
  onWidthChange: (value: number) => void;
  onHeightChange: (value: number) => void;
  onResetDimensions: () => void;
};

export interface CropEditorProps {
  localDataUrl: string;
  alt: string;
  customName: string;
  cropRegion: CropRegion | null;
  widthScaleFactor?: number;
  /** When set, show width/height inputs and reload behavior from App (HTTP CDN URLs). */
  urlDimensions?: UrlDimensionControls;
  isRefetching?: boolean;
  onDownload: (name: string, crop: CropRegion, jpegDataUrl: string, previewDataUrl: string | null) => void;
  onClose: () => void;
}

export function CropEditor({
  localDataUrl,
  alt: _alt,
  customName,
  cropRegion,
  widthScaleFactor = 1,
  urlDimensions,
  isRefetching = false,
  onDownload,
  onClose,
}: CropEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(customName);

  const [zoom, setZoom] = useState(1);
  const [baseScale, setBaseScale] = useState(1);
  const scale = baseScale * zoom;

  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropDisplaySize, setCropDisplaySize] = useState(0);
  const [maxCropDisplay, setMaxCropDisplay] = useState(0);
  const [minCropDisplay, setMinCropDisplay] = useState(50);

  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, cx: 0, cy: 0 });
  const [resizing, setResizing] = useState<ResizeCorner>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, cx: 0, cy: 0, size: 0 });
  const resizingRef = useRef<ResizeCorner>(null);
  const draggingRef = useRef(false);
  const lastPointerLocalRef = useRef({ mx: 0, my: 0 });
  const autoViewportZoomPendingRef = useRef(false);

  const sourceCropSize = scale > 0 ? Math.round(cropDisplaySize / scale) : 0;
  const effectiveCropSize = Math.round(sourceCropSize * widthScaleFactor);
  const isBlurry = effectiveCropSize > 0 && effectiveCropSize < TARGET_SIZE;
  const blurSeverity = effectiveCropSize < TARGET_SIZE * 0.5 ? 'critical' : 'warning';
  const qualityPercent = effectiveCropSize > 0 ? Math.min(100, Math.round((effectiveCropSize / TARGET_SIZE) * 100)) : 0;
  const zoomPercent = Math.round(zoom * 100);

  const lastContainerSizeRef = useRef({ w: 0, h: 0 });
  const layoutStateRef = useRef({
    baseScale: 1,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    cropX: 0,
    cropY: 0,
    cropDisplaySize: 0,
  });
  layoutStateRef.current = {
    baseScale,
    zoom,
    offsetX,
    offsetY,
    cropX,
    cropY,
    cropDisplaySize,
  };

  resizingRef.current = resizing;
  draggingRef.current = dragging;

  const lastAutoZoomFitAt = useRef(0);

  const recenter = useCallback(
    (newZoom: number, prevZoom: number) => {
      if (!img || !containerRef.current) return;
      const container = containerRef.current;
      const maxW = container.clientWidth;
      const maxH = container.clientHeight;
      const newScale = baseScale * newZoom;
      const prevScale = baseScale * prevZoom;
      const displayW = img.width * newScale;
      const displayH = img.height * newScale;
      const centerX = maxW / 2;
      const centerY = maxH / 2;
      const prevDisplayW = img.width * prevScale;
      const prevDisplayH = img.height * prevScale;
      const imgCenterXPrev = (centerX - offsetX) / prevDisplayW;
      const imgCenterYPrev = (centerY - offsetY) / prevDisplayH;
      const newOx = centerX - imgCenterXPrev * displayW;
      const newOy = centerY - imgCenterYPrev * displayH;
      setOffsetX(newOx);
      setOffsetY(newOy);
    },
    [img, baseScale, offsetX, offsetY],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const image = new Image();
    image.onload = () => {
      if (!cancelled) {
        setImg(image);
        setLoading(false);
      }
    };
    image.onerror = () => {
      if (!cancelled) setLoading(false);
    };
    image.src = localDataUrl;
    return () => {
      cancelled = true;
    };
  }, [localDataUrl]);

  useEffect(() => {
    if (!img || !containerRef.current) return;
    const container = containerRef.current;
    const maxW = container.clientWidth;
    const maxH = container.clientHeight;
    const fitScale = Math.min(maxW / img.width, maxH / img.height);
    setBaseScale(fitScale);
    setZoom(1);

    const s = fitScale;
    const displayW = img.width * s;
    const displayH = img.height * s;
    const ox = (maxW - displayW) / 2;
    const oy = (maxH - displayH) / 2;
    setOffsetX(ox);
    setOffsetY(oy);

    const maxSquare = Math.min(displayW, displayH);
    setMaxCropDisplay(maxSquare);
    setMinCropDisplay(Math.max(50, Math.min(displayW, displayH) * 0.05));

    if (cropRegion) {
      setCropDisplaySize(cropRegion.size * s);
      setCropX(cropRegion.x * s + ox);
      setCropY(cropRegion.y * s + oy);
    } else {
      const initialSize = maxSquare;
      setCropDisplaySize(initialSize);
      setCropX(ox + (displayW - initialSize) / 2);
      setCropY(oy + (displayH - initialSize) / 2);
    }

    lastContainerSizeRef.current = { w: container.clientWidth, h: container.clientHeight };
  }, [img, cropRegion]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !img) return;

    const handleResize = () => {
      const newW = el.clientWidth;
      const newH = el.clientHeight;
      if (newW <= 0 || newH <= 0) return;

      const { w: prevW, h: prevH } = lastContainerSizeRef.current;
      if (prevW === 0 && prevH === 0) {
        lastContainerSizeRef.current = { w: newW, h: newH };
        return;
      }
      if (newW === prevW && newH === prevH) return;

      const {
        baseScale: prevBaseScale,
        zoom: z,
        offsetX: ox,
        offsetY: oy,
        cropX: cx,
        cropY: cy,
        cropDisplaySize: cropDisp,
      } = layoutStateRef.current;

      const oldScale = prevBaseScale * z;
      if (oldScale <= 0) {
        lastContainerSizeRef.current = { w: newW, h: newH };
        return;
      }

      const newBaseScale = Math.min(newW / img.width, newH / img.height);
      const newScale = newBaseScale * z;

      const fracX = (prevW / 2 - ox) / (img.width * oldScale);
      const fracY = (prevH / 2 - oy) / (img.height * oldScale);
      const newOffsetX = newW / 2 - fracX * (img.width * newScale);
      const newOffsetY = newH / 2 - fracY * (img.height * newScale);

      const srcCropX = (cx - ox) / oldScale;
      const srcCropY = (cy - oy) / oldScale;
      const srcCropSize = cropDisp / oldScale;

      const newCropXRaw = srcCropX * newScale + newOffsetX;
      const newCropYRaw = srcCropY * newScale + newOffsetY;
      const newCropDisplay = srcCropSize * newScale;

      const displayW = img.width * newScale;
      const displayH = img.height * newScale;
      const maxSquare = Math.min(displayW, displayH);
      const minCrop = Math.max(50, Math.min(displayW, displayH) * 0.05);

      const clampedSize = Math.max(minCrop, Math.min(maxSquare, newCropDisplay));
      const newCropX = Math.max(0, Math.min(newCropXRaw, newW - clampedSize));
      const newCropY = Math.max(0, Math.min(newCropYRaw, newH - clampedSize));

      setBaseScale(newBaseScale);
      setOffsetX(newOffsetX);
      setOffsetY(newOffsetY);
      setCropX(newCropX);
      setCropY(newCropY);
      setCropDisplaySize(clampedSize);
      setMaxCropDisplay(maxSquare);
      setMinCropDisplay(minCrop);

      lastContainerSizeRef.current = { w: newW, h: newH };
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [img]);

  const applyZoomPreservingSourceCrop = useCallback(
    (delta: number, preserve?: { sx: number; sy: number; ss: number }) => {
      if (!img) return;
      autoViewportZoomPendingRef.current = true;
      const { offsetX: ox, offsetY: oy, baseScale: bs, zoom: z, cropX: cx, cropY: cy, cropDisplaySize: cds } =
        layoutStateRef.current;
      const scaleNow = bs * z;
      const sx = preserve ? preserve.sx : (cx - ox) / scaleNow;
      const sy = preserve ? preserve.sy : (cy - oy) / scaleNow;
      const ss = preserve ? preserve.ss : cds / scaleNow;

      setZoom((prev) => {
        const maxZoom = Math.max(3, Math.max(img.width, img.height) / 400);
        const next = Math.max(0.25, Math.min(maxZoom, prev + delta));
        requestAnimationFrame(() => {
          recenter(next, prev);
          setTimeout(() => {
            const { offsetX: ox2, offsetY: oy2, baseScale: bs2, zoom: z2 } = layoutStateRef.current;
            const s2 = bs2 * z2;
            const newCx = sx * s2 + ox2;
            const newCy = sy * s2 + oy2;
            const newSize = ss * s2;
            setCropX(newCx);
            setCropY(newCy);
            setCropDisplaySize(newSize);
            const { mx, my } = lastPointerLocalRef.current;
            if (resizingRef.current) {
              setResizeStart({ x: mx, y: my, cx: newCx, cy: newCy, size: newSize });
            }
            if (draggingRef.current) {
              setDragStart({ x: mx, y: my, cx: newCx, cy: newCy });
            }
            autoViewportZoomPendingRef.current = false;
          }, 0);
        });
        return next;
      });
    },
    [img, recenter],
  );

  const handleZoom = useCallback(
    (delta: number) => {
      setZoom((prev) => {
        const maxZoom = Math.max(3, img ? Math.max(img.width, img.height) / 400 : 3);
        const next = Math.max(0.25, Math.min(maxZoom, prev + delta));
        requestAnimationFrame(() => recenter(next, prev));
        return next;
      });
    },
    [img, recenter],
  );

  const maybeZoomToFitCropInViewport = useCallback(
    (x: number, y: number, size: number) => {
      if (autoViewportZoomPendingRef.current) return;
      const el = containerRef.current;
      if (!el || !img) return;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      const m = VIEW_MARGIN;
      const eps = 1.5;
      const fits =
        x >= m - eps && y >= m - eps && x + size <= cw - m + eps && y + size <= ch - m + eps;
      if (fits) return;
      const { offsetX: ox, offsetY: oy, baseScale: bs, zoom: z } = layoutStateRef.current;
      if (z <= 0.26) return;
      const now = performance.now();
      if (now - lastAutoZoomFitAt.current < AUTO_ZOOM_MIN_INTERVAL_MS) return;
      lastAutoZoomFitAt.current = now;
      const scaleNow = bs * z;
      applyZoomPreservingSourceCrop(-AUTO_ZOOM_STEP, {
        sx: (x - ox) / scaleNow,
        sy: (y - oy) / scaleNow,
        ss: size / scaleNow,
      });
    },
    [img, applyZoomPreservingSourceCrop],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoom(ZOOM_STEP);
      }
      if (e.key === '-') {
        e.preventDefault();
        handleZoom(-ZOOM_STEP);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleZoom]);

  const snapValue = useCallback((val: number, imageEdge: number): number => {
    if (Math.abs(val - imageEdge) <= SNAP_THRESHOLD) return imageEdge;
    return val;
  }, []);

  const snapCrop = useCallback(
    (cx: number, cy: number, size: number): { x: number; y: number } => {
      if (!img) return { x: cx, y: cy };
      const displayW = img.width * scale;
      const displayH = img.height * scale;
      const imgLeft = offsetX;
      const imgTop = offsetY;
      const imgRight = offsetX + displayW;
      const imgBottom = offsetY + displayH;

      let sx = cx;
      let sy = cy;

      sx = snapValue(sx, imgLeft);
      const rightEdge = sx + size;
      const snappedRight = snapValue(rightEdge, imgRight);
      if (snappedRight !== rightEdge) sx = snappedRight - size;

      sy = snapValue(sy, imgTop);
      const bottomEdge = sy + size;
      const snappedBottom = snapValue(bottomEdge, imgBottom);
      if (snappedBottom !== bottomEdge) sy = snappedBottom - size;

      return { x: sx, y: sy };
    },
    [img, scale, offsetX, offsetY, snapValue],
  );

  const applyCropConstraints = useCallback(
    (cx: number, cy: number, size: number) => {
      if (!img) return { x: cx, y: cy };
      const displayW = img.width * scale;
      const displayH = img.height * scale;
      const imgLeft = offsetX;
      const imgTop = offsetY;
      const imgRight = offsetX + displayW;
      const imgBottom = offsetY + displayH;
      const snapped = snapCrop(cx, cy, size);
      const maxX = imgRight - size;
      const maxY = imgBottom - size;
      const x = Math.max(imgLeft, Math.min(snapped.x, maxX));
      const y = Math.max(imgTop, Math.min(snapped.y, maxY));
      return { x, y };
    },
    [img, scale, offsetX, offsetY, snapCrop],
  );

  const getCornerAt = (mx: number, my: number): ResizeCorner => {
    const corners: { key: ResizeCorner; x: number; y: number }[] = [
      { key: 'tl', x: cropX, y: cropY },
      { key: 'tr', x: cropX + cropDisplaySize, y: cropY },
      { key: 'bl', x: cropX, y: cropY + cropDisplaySize },
      { key: 'br', x: cropX + cropDisplaySize, y: cropY + cropDisplaySize },
    ];
    for (const c of corners) {
      if (Math.abs(mx - c.x) <= HANDLE_HIT && Math.abs(my - c.y) <= HANDLE_HIT) return c.key;
    }
    return null;
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const container = containerRef.current;
    if (!container) return;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const displayW = img.width * scale;
    const displayH = img.height * scale;

    ctx.globalAlpha = 0.4;
    ctx.drawImage(img, offsetX, offsetY, displayW, displayH);
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.beginPath();
    ctx.rect(cropX, cropY, cropDisplaySize, cropDisplaySize);
    ctx.clip();
    ctx.drawImage(img, offsetX, offsetY, displayW, displayH);
    ctx.restore();

    const borderColor = isBlurry ? (blurSeverity === 'critical' ? '#ef4444' : '#eab308') : '#fff';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(cropX, cropY, cropDisplaySize, cropDisplaySize);

    const hs = HANDLE_SIZE;
    const corners: [number, number][] = [
      [cropX, cropY],
      [cropX + cropDisplaySize, cropY],
      [cropX, cropY + cropDisplaySize],
      [cropX + cropDisplaySize, cropY + cropDisplaySize],
    ];
    for (const [cx, cy] of corners) {
      ctx.fillStyle = borderColor;
      ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - hs / 2, cy - hs / 2, hs, hs);
    }

    const midpoints: [number, number][] = [
      [cropX + cropDisplaySize / 2, cropY],
      [cropX + cropDisplaySize / 2, cropY + cropDisplaySize],
      [cropX, cropY + cropDisplaySize / 2],
      [cropX + cropDisplaySize, cropY + cropDisplaySize / 2],
    ];
    const mhs = hs * 0.7;
    for (const [mx, my] of midpoints) {
      ctx.fillStyle = borderColor;
      ctx.fillRect(mx - mhs / 2, my - mhs / 2, mhs, mhs);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(mx - mhs / 2, my - mhs / 2, mhs, mhs);
    }

    const safeRatio = SAFE_ZONE.width / SAFE_ZONE.height;
    const safeDisplayH = cropDisplaySize * (SAFE_ZONE.height / TARGET_SIZE);
    const safeDisplayW = safeDisplayH * safeRatio;
    const safeX = cropX + (cropDisplaySize - safeDisplayW) / 2;
    const safeY = cropY + (cropDisplaySize - safeDisplayH) / 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(safeX, safeY, safeDisplayW, safeDisplayH);
    ctx.setLineDash([]);
    ctx.font = '11px system-ui';
    ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
    ctx.fillText('960×570 safe zone', safeX + 4, safeY - 4);

    ctx.font = '12px system-ui';
    ctx.fillStyle = isBlurry ? borderColor : 'rgba(255,255,255,0.7)';
    ctx.fillText(`${effectiveCropSize}×${effectiveCropSize}px → 1200×1200`, cropX + 4, cropY + cropDisplaySize - 6);
  }, [
    img,
    scale,
    offsetX,
    offsetY,
    cropX,
    cropY,
    cropDisplaySize,
    isBlurry,
    blurSeverity,
    effectiveCropSize,
  ]);

  useEffect(() => {
    const id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [draw]);

  const updateCursor = (mx: number, my: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const corner = getCornerAt(mx, my);
    if (corner === 'tl' || corner === 'br') canvas.style.cursor = 'nwse-resize';
    else if (corner === 'tr' || corner === 'bl') canvas.style.cursor = 'nesw-resize';
    else if (mx >= cropX && mx <= cropX + cropDisplaySize && my >= cropY && my <= cropY + cropDisplaySize)
      canvas.style.cursor = 'move';
    else canvas.style.cursor = 'default';
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const corner = getCornerAt(mx, my);
    if (corner) {
      setResizing(corner);
      setResizeStart({ x: mx, y: my, cx: cropX, cy: cropY, size: cropDisplaySize });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (mx >= cropX && mx <= cropX + cropDisplaySize && my >= cropY && my <= cropY + cropDisplaySize) {
      setDragging(true);
      setDragStart({ x: mx, y: my, cx: cropX, cy: cropY });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    lastPointerLocalRef.current = { mx, my };

    if (resizing && img) {
      const dx = mx - resizeStart.x;
      const dy = my - resizeStart.y;
      let newSize = resizeStart.size;
      let newX = resizeStart.cx;
      let newY = resizeStart.cy;

      const primaryDelta =
        resizing === 'br'
          ? Math.max(dx, dy)
          : resizing === 'tl'
            ? Math.max(-dx, -dy)
            : resizing === 'tr'
              ? Math.max(dx, -dy)
              : Math.max(-dx, dy);

      newSize = Math.max(minCropDisplay, Math.min(maxCropDisplay, resizeStart.size + primaryDelta));

      const sizeDiff = newSize - resizeStart.size;
      if (resizing === 'tl') {
        newX = resizeStart.cx - sizeDiff;
        newY = resizeStart.cy - sizeDiff;
      } else if (resizing === 'tr') {
        newY = resizeStart.cy - sizeDiff;
      } else if (resizing === 'bl') {
        newX = resizeStart.cx - sizeDiff;
      }

      const snapped = applyCropConstraints(newX, newY, newSize);
      setCropDisplaySize(newSize);
      setCropX(snapped.x);
      setCropY(snapped.y);
      maybeZoomToFitCropInViewport(snapped.x, snapped.y, newSize);
      return;
    }

    if (dragging && img) {
      const nx = dragStart.cx + (mx - dragStart.x);
      const ny = dragStart.cy + (my - dragStart.y);
      const snapped = applyCropConstraints(nx, ny, cropDisplaySize);
      setCropX(snapped.x);
      setCropY(snapped.y);
      maybeZoomToFitCropInViewport(snapped.x, snapped.y, cropDisplaySize);
      return;
    }

    updateCursor(mx, my);
  };

  const handlePointerUp = () => {
    setDragging(false);
    setResizing(null);
  };

  const handleDownload = () => {
    if (!img) return;

    const srcX = Math.round((cropX - offsetX) / scale);
    const srcY = Math.round((cropY - offsetY) / scale);
    const srcSize = Math.round(cropDisplaySize / scale);

    const crop: CropRegion = { x: srcX, y: srcY, size: srcSize };

    let previewDataUrl: string | null = null;
    try {
      previewDataUrl = cropToJpegPreviewDataUrl(img, crop);
    } catch {
      previewDataUrl = null;
    }

    const jpegDataUrl = cropToJpegDataUrl(img, crop);
    onDownload(name || 'image', crop, jpegDataUrl, previewDataUrl);
  };

  return (
    <div className="oem-crop-editor" role="dialog" aria-label="Crop and rename image">
      <div className="oem-crop-editor__header">
        <div className="oem-crop-editor__badges">
          <h2 className="oem-crop-editor__title">Crop & Rename</h2>
          {!loading && img && isBlurry && (
            <span
              className={`oem-crop-editor__badge ${blurSeverity === 'critical' ? 'oem-crop-editor__badge--critical' : 'oem-crop-editor__badge--warn'}`}
            >
              {effectiveCropSize}×{effectiveCropSize}px — will upscale ({qualityPercent}% quality)
            </span>
          )}
          {!loading && img && !isBlurry && effectiveCropSize > 0 && (
            <span className="oem-crop-editor__badge oem-crop-editor__badge--ok">
              {effectiveCropSize}×{effectiveCropSize}px → 1200×1200
            </span>
          )}
        </div>
        <button type="button" className="oem-crop-editor__close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div ref={containerRef} className="oem-crop-editor__canvas-wrap">
        {(loading || isRefetching) && (
          <div className="oem-crop-editor__loading">
            <div className="oem-crop-editor__spinner" aria-hidden />
            <p className="oem-crop-editor__title" style={{ fontSize: 13, fontWeight: 400 }}>
              {isRefetching && !loading ? 'Applying URL size…' : 'Loading image for editing…'}
            </p>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="oem-crop-editor__canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
        {!loading && img && (
          <div className="oem-crop-editor__zoom">
            <button type="button" onClick={() => handleZoom(-ZOOM_STEP)} title="Zoom out">
              −
            </button>
            <span>{zoomPercent}%</span>
            <button type="button" onClick={() => handleZoom(ZOOM_STEP)} title="Zoom in">
              +
            </button>
          </div>
        )}
      </div>

      {urlDimensions &&
        ((urlDimensions.heightKey != null && urlDimensions.heightValue != null) ||
          urlDimensions.originalWidth != null ||
          urlDimensions.originalHeight != null) && (
        <div className="oem-crop-editor__source-params" aria-label="Image URL size parameters">
          <div className="oem-crop-editor__dimension-grid">
            {urlDimensions.heightKey != null && urlDimensions.heightValue != null && (
              <div className="oem-crop-editor__field oem-crop-editor__field--compact">
                <label htmlFor="oem-crop-height">Height ({urlDimensions.heightKey})</label>
                <input
                  id="oem-crop-height"
                  type="number"
                  min={1}
                  step={1}
                  value={urlDimensions.heightValue}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!Number.isNaN(v)) urlDimensions.onHeightChange(v);
                  }}
                />
              </div>
            )}
            {(urlDimensions.originalWidth != null || urlDimensions.originalHeight != null) && (
              <button
                type="button"
                className="oem-crop-editor__btn oem-crop-editor__btn--ghost"
                onClick={urlDimensions.onResetDimensions}
              >
                Reset sizes
              </button>
            )}
          </div>
        </div>
      )}

      <div className="oem-crop-editor__footer">
        <div className="oem-crop-editor__footer-fields">
          <div className="oem-crop-editor__field oem-crop-editor__field--filename">
            <label htmlFor="oem-crop-filename">Filename</label>
            <input
              id="oem-crop-filename"
              value={name}
              onChange={(e) => setName(e.target.value.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_.]/g, ''))}
              autoComplete="off"
            />
          </div>
          {urlDimensions && urlDimensions.widthKey != null && urlDimensions.widthValue != null && (
            <div className="oem-crop-editor__field oem-crop-editor__field--compact oem-crop-editor__field--url-width">
              <label htmlFor="oem-crop-width">Width ({urlDimensions.widthKey})</label>
              <input
                id="oem-crop-width"
                type="number"
                min={1}
                step={1}
                value={urlDimensions.widthValue}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v)) urlDimensions.onWidthChange(v);
                }}
              />
            </div>
          )}
        </div>
        <div className="oem-crop-editor__actions">
          <button type="button" className="oem-crop-editor__btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="oem-crop-editor__btn oem-crop-editor__btn--primary"
            onClick={handleDownload}
            disabled={loading || isRefetching || !img}
            title="Download 1200×1200 JPEG with the current crop"
            aria-label="Download cropped image as JPEG"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
