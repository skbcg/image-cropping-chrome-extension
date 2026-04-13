export type FetchImageMessage = {
  type: 'FETCH_IMAGE';
  url: string;
};

export type FetchImageResponse =
  | { success: true; dataUrl: string; mimeType: string }
  | { success: false; error: string };

export type DownloadImageMessage = {
  type: 'DOWNLOAD_IMAGE';
  filename: string;
  dataUrl: string;
};

export type DownloadImageResponse = { success: true; downloadId?: number } | { success: false; error: string };

export type ToggleSelectionMessage = { type: 'TOGGLE_SELECTION_MODE' };

export type BackgroundMessage = FetchImageMessage | DownloadImageMessage | ToggleSelectionMessage;
