import { useCallback, useEffect, useRef, useState } from 'react';
import { CropEditor } from '../editor/CropEditor';
import { fetchImageAsDataUrl, resolveImageUrl } from '../editor/imageLoader';
import {
  buildUrlWithDimensions,
  detectDimensionsFromUrl,
  stripCropNamesFromUrl,
} from '../editor/urlParams';
import type { DownloadImageMessage, DownloadImageResponse } from '../shared/messages';

function isVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  return true;
}

function collectImages(): HTMLImageElement[] {
  return Array.from(document.querySelectorAll('img')).filter((img) => {
    if (!(img instanceof HTMLImageElement)) return false;
    if (!isVisible(img)) return false;
    const r = img.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return false;
    return true;
  });
}

function defaultFilenameFromUrl(url: string): string {
  try {
    const u = new URL(url, window.location.href);
    const last = u.pathname.split('/').filter(Boolean).pop() || 'image';
    const base = last.replace(/\.[^.]+$/, '') || 'image';
    return base.slice(0, 80);
  } catch {
    return 'image';
  }
}

async function downloadJpeg(filename: string, dataUrl: string) {
  const safe = filename.replace(/[/\\?%*:|"<>]/g, '-').replace(/\.+/g, '.') || 'image';
  const base = safe.replace(/\.(jpe?g|png)$/i, '') || 'image';
  const name = /\.jpe?g$/i.test(safe) ? safe : `${base}.jpg`;
  const msg: DownloadImageMessage = { type: 'DOWNLOAD_IMAGE', filename: name, dataUrl };
  try {
    const r = (await chrome.runtime.sendMessage(msg)) as DownloadImageResponse;
    if (!r.success) {
      console.error('Download failed:', r.error);
    }
  } catch (e) {
    console.error('Download failed:', e);
  }
}

export type EditorOpenState = {
  sourceUrl: string;
  localDataUrl: string;
  alt: string;
  customName: string;
  widthKey: string | null;
  heightKey: string | null;
  widthValue: number | null;
  heightValue: number | null;
  /** Original width from URL when the dialog opened (for quality scale factor). */
  originalWidth: number | null;
  /** Original height from URL when the dialog opened. */
  originalHeight: number | null;
  refetching: boolean;
};

export function App() {
  const [selectionMode, setSelectionMode] = useState(false);
  const [rects, setRects] = useState<
    { img: HTMLImageElement; top: number; left: number; width: number; height: number }[]
  >([]);
  const [editor, setEditor] = useState<EditorOpenState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const editorRef = useRef<EditorOpenState | null>(null);
  const refetchGenRef = useRef(0);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const updateRects = useCallback(() => {
    if (!selectionMode) {
      setRects([]);
      return;
    }
    const imgs = collectImages();
    const next = imgs.map((img) => {
      const r = img.getBoundingClientRect();
      return {
        img,
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      };
    });
    setRects(next);
  }, [selectionMode]);

  useEffect(() => {
    if (!selectionMode) return;
    updateRects();
    const onScroll = () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => updateRects());
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    const mo = new MutationObserver(() => onScroll());
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      mo.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [selectionMode, updateRects]);

  useEffect(() => {
    const listener = (msg: { type?: string }) => {
      if (msg.type === 'TOGGLE_SELECTION_MODE') {
        setSelectionMode((v) => !v);
        setLoadError(null);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  /** Debounced reload when width/height inputs change (HTTP URLs only). Skips if URL unchanged. */
  useEffect(() => {
    if (!editor) return;
    if (!/^https?:/i.test(editor.sourceUrl)) return;
    if (editor.widthKey == null && editor.heightKey == null) return;

    const gen = ++refetchGenRef.current;
    const t = setTimeout(async () => {
      const cur = editorRef.current;
      if (!cur || gen !== refetchGenRef.current) return;
      const built = buildUrlWithDimensions(cur.sourceUrl, {
        widthKey: cur.widthKey,
        widthValue: cur.widthValue,
        heightKey: cur.heightKey,
        heightValue: cur.heightValue,
      });
      if (built === cur.sourceUrl) return;

      setEditor((e) => (e ? { ...e, refetching: true } : null));
      setLoadError(null);
      try {
        const { dataUrl } = await fetchImageAsDataUrl(built);
        if (gen !== refetchGenRef.current) return;
        setEditor((e) =>
          e ? { ...e, localDataUrl: dataUrl, sourceUrl: built, refetching: false } : null,
        );
      } catch (err) {
        if (gen !== refetchGenRef.current) return;
        setEditor((e) => (e ? { ...e, refetching: false } : null));
        setLoadError(err instanceof Error ? err.message : 'Failed to reload image.');
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only width/height should refetch, not localDataUrl/sourceUrl
  }, [editor?.widthValue, editor?.heightValue]);

  const handleWidthChange = (nextW: number) => {
    if (!Number.isFinite(nextW) || nextW < 1) return;
    setEditor((e) => {
      if (!e || e.widthKey == null) return e;
      const prevW = e.widthValue;
      if (prevW == null || prevW <= 0) return { ...e, widthValue: Math.round(nextW) };
      let nextH = e.heightValue;
      if (e.heightKey != null && e.heightValue != null) {
        nextH = Math.round(e.heightValue * (nextW / prevW));
      }
      return { ...e, widthValue: Math.round(nextW), heightValue: nextH };
    });
  };

  const handleHeightChange = (nextH: number) => {
    if (!Number.isFinite(nextH) || nextH < 1) return;
    setEditor((e) => (e && e.heightKey != null ? { ...e, heightValue: Math.round(nextH) } : e));
  };

  const handleResetDimensions = () => {
    setEditor((e) =>
      e
        ? {
            ...e,
            widthValue: e.originalWidth,
            heightValue: e.originalHeight,
          }
        : e,
    );
  };

  const openEditor = async (img: HTMLImageElement) => {
    setLoadError(null);
    const raw = resolveImageUrl(img);
    if (!raw) {
      setLoadError('Could not resolve image URL.');
      return;
    }

    const isHttp = /^https?:/i.test(raw);
    if (!isHttp) {
      setEditor({
        sourceUrl: raw,
        localDataUrl: '',
        alt: img.alt || 'image',
        customName: defaultFilenameFromUrl(raw),
        widthKey: null,
        heightKey: null,
        widthValue: null,
        heightValue: null,
        originalWidth: null,
        originalHeight: null,
        refetching: false,
      });
      setSelectionMode(false);
      try {
        const { dataUrl } = await fetchImageAsDataUrl(raw);
        setEditor((e) => (e ? { ...e, localDataUrl: dataUrl } : null));
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'Failed to load image.');
        setEditor(null);
        setSelectionMode(true);
      }
      return;
    }

    const sourceUrl = stripCropNamesFromUrl(raw);
    const det = detectDimensionsFromUrl(sourceUrl);

    setEditor({
      sourceUrl,
      localDataUrl: '',
      alt: img.alt || 'image',
      customName: defaultFilenameFromUrl(raw),
      widthKey: det.widthKey,
      heightKey: det.heightKey,
      widthValue: det.widthValue,
      heightValue: det.heightValue,
      originalWidth: det.widthValue,
      originalHeight: det.heightValue,
      refetching: false,
    });
    setSelectionMode(false);

    try {
      const { dataUrl } = await fetchImageAsDataUrl(sourceUrl);
      setEditor((e) => (e ? { ...e, localDataUrl: dataUrl } : null));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load image.');
      setEditor(null);
      setSelectionMode(true);
    }
  };

  const closeEditor = () => {
    setEditor(null);
    setLoadError(null);
    setSelectionMode(true);
  };

  const widthScaleFactor =
    editor?.originalWidth != null && editor.originalWidth > 0 && editor.widthValue != null
      ? editor.widthValue / editor.originalWidth
      : 1;

  const urlDimensions =
    editor && (editor.widthKey != null || editor.heightKey != null)
      ? {
          widthKey: editor.widthKey,
          heightKey: editor.heightKey,
          widthValue: editor.widthValue,
          heightValue: editor.heightValue,
          originalWidth: editor.originalWidth,
          originalHeight: editor.originalHeight,
          onWidthChange: handleWidthChange,
          onHeightChange: handleHeightChange,
          onResetDimensions: handleResetDimensions,
        }
      : undefined;

  return (
    <>
      {selectionMode && (
        <>
          <div className="oem-overlay-root oem-overlay-root--active" aria-hidden={false}>
            {rects.map(({ img, top, left, width, height }, index) => {
              return (
                <div
                  key={`${img.src}-${index}-${left}-${top}`}
                  className="oem-image-target"
                  style={{ top, left, width, height }}
                  role="button"
                  tabIndex={0}
                  title="Crop this image"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void openEditor(img);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void openEditor(img);
                    }
                  }}
                >
                  <div className="oem-image-banner">
                    <span className="oem-image-banner__main">
                      <svg className="oem-image-banner__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 2v14a2 2 0 0 0 2 2h14"></path>
                        <path d="M18 22V8a2 2 0 0 0-2-2H2"></path>
                      </svg>
                      <span className="oem-image-banner__text">Crop Image</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="oem-hint">
            <span className="oem-hint__mode">Crop mode</span>
            <span className="oem-hint__body">
              Click a crop banner on an image. Press the extension icon again to exit.
            </span>
          </div>
        </>
      )}

      {loadError && (
        <div className="oem-error" role="alert">
          {loadError}
        </div>
      )}

      {editor && (
        <CropEditor
          localDataUrl={editor.localDataUrl}
          alt={editor.alt}
          customName={editor.customName}
          cropRegion={null}
          widthScaleFactor={widthScaleFactor}
          urlDimensions={urlDimensions}
          isRefetching={editor.refetching}
          onDownload={(name, _crop, jpegDataUrl, _preview) => {
            void downloadJpeg(name, jpegDataUrl);
          }}
          onClose={closeEditor}
        />
      )}
    </>
  );
}

export const HOST_ID = 'oem-image-crop-extension-host';
