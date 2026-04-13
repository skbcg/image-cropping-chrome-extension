import type {
  DownloadImageMessage,
  DownloadImageResponse,
  FetchImageMessage,
  FetchImageResponse,
} from '../shared/messages';

function isFetchImageMessage(m: unknown): m is FetchImageMessage {
  return (
    typeof m === 'object' &&
    m !== null &&
    (m as FetchImageMessage).type === 'FETCH_IMAGE' &&
    typeof (m as FetchImageMessage).url === 'string'
  );
}

function isDownloadImageMessage(m: unknown): m is DownloadImageMessage {
  return (
    typeof m === 'object' &&
    m !== null &&
    (m as DownloadImageMessage).type === 'DOWNLOAD_IMAGE' &&
    typeof (m as DownloadImageMessage).filename === 'string' &&
    typeof (m as DownloadImageMessage).dataUrl === 'string'
  );
}

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

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender,
    sendResponse: (r: FetchImageResponse | DownloadImageResponse) => void,
  ) => {
    if (isDownloadImageMessage(message)) {
      chrome.downloads.download(
        { url: message.dataUrl, filename: message.filename, saveAs: true },
        (downloadId) => {
          const err = chrome.runtime.lastError;
          if (err) {
            sendResponse({ success: false, error: err.message ?? 'Download failed' });
            return;
          }
          sendResponse({ success: true, downloadId });
        },
      );
      return true;
    }

    if (!isFetchImageMessage(message)) return false;

    const url = message.url;
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('blob:'))) {
      sendResponse({ success: false, error: 'Unsupported URL scheme' });
      return false;
    }

    (async () => {
      try {
        const res = await fetch(url, { credentials: 'omit', mode: 'cors', cache: 'no-store' });
        if (!res.ok) {
          sendResponse({ success: false, error: `HTTP ${res.status}` });
          return;
        }
        const blob = await res.blob();
        const mimeType = blob.type || 'application/octet-stream';
        const dataUrl = await blobToDataUrl(blob);
        sendResponse({ success: true, dataUrl, mimeType });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Fetch failed';
        sendResponse({ success: false, error: msg });
      }
    })();

    return true;
  },
);

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SELECTION_MODE' }).catch(() => {
    /* tab may not have content script yet */
  });
});
