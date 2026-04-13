# Volt Image Cropper (Chrome extension)

Toggle crop mode on the current page, click **Crop Image** on an image, then edit in an in-page dialog and download a **1200×1200 JPEG**.

## Features

- **Works on (almost) any site** — Runs on normal web pages; finds visible `<img>` elements at least 40×40 px and overlays a **Crop Image** banner on each while crop mode is on.
- **Toolbar toggle** — Click the extension icon to enter or exit crop mode; a short hint explains how to leave without cropping.
- **Lives on the page** — The editor opens as an overlay on the tab you are viewing (no separate extension tab).
- **Square crop** — Drag the crop to move it; use corner handles to resize. The crop snaps near image edges, and the view can auto-zoom out slightly when the crop would leave the visible area.
- **Pan and zoom** — Zoom with **+** / **−** in the editor or with **+**/**=** and **−** on the keyboard (when focus is not in a text field).
- **Export** — **Download** saves a **1200×1200** JPEG (high quality). Chrome’s save dialog is used when the **downloads** permission is active; otherwise the extension falls back to an in-page download.
- **Rename files** — Edit the filename before download; the field is sanitized for safe file names.
- **Source quality hint** — A badge shows how many source pixels fall inside the crop versus the 1200 output, and warns when the result will be upscaled.
- **Robust image loading** — `http(s)` images are fetched in the extension service worker so the canvas stays usable for many cross-origin images. `blob:` URLs are read in the page; `data:` URLs are used as-is. When `srcset` is present, the extension prefers the largest declared width.
- **OEM / CDN-style URLs** — Strips server crop-name query params and can edit **width** / **height** URL parameters with debounced refetch (details under [OEM image URLs](#oem-image-urls-eg-ford)).

## Build

```bash
npm ci
npm run build
```

Load **Developer mode → Load unpacked** and select the `dist` folder.

## Develop

```bash
npm run dev
```

Rebuild the extension in Chrome after changes (`dist/content.js` updates).

## Usage

1. Open any page with images.
2. Click the extension toolbar icon to turn **crop mode** on (click again to exit).
3. Click **Crop Image** on an image.
4. Adjust the square crop and filename, then click **Download** to save a 1200×1200 JPEG (you can download again after tweaks, or **Cancel** to close and return to crop mode).

### OEM image URLs (e.g. Ford)

For `http(s)` image URLs, the extension **drops `crop-names`** (and `crop_names`) before loading so you are not locked to the server’s named crop. If the URL includes **width** and/or **height** query parameters (same names as in the OEM web app, such as `width`, `w`, `height`, `h`, etc.), those values appear in the dialog. Changing **width** reloads the image and scales **height** proportionally when both are present. Use **Reset dimensions** (the × next to the inputs) to restore the values from the page URL when you opened the editor.

## Permissions

- **activeTab** — send toggle messages to the current tab.
- **downloads** — save the cropped JPEG (with the system save dialog when available).
- **storage** — reserved for future settings.
- **host_permissions `<all_urls>`** — fetch image bytes in the service worker so the canvas is not CORS-tainted for most `http(s)` images.

`blob:` and `data:` images are read in the content script instead.
