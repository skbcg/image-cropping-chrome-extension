# OEM Image Crop (Chrome extension)

Toggle crop mode on the current page, click **Crop** on an image, then edit in the in-page modal and download a 1200×1200 PNG.

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
2. Click the extension toolbar icon to turn **selection mode** on (click again to exit).
3. Click **Crop** on an image.
4. Adjust the square crop and filename, then click **Download** to save a 1200×1200 PNG (you can download again after tweaks, or **Cancel** to close).

### OEM image URLs (e.g. Ford)

For `http(s)` image URLs, the extension **drops `crop-names`** (and `crop_names`) before loading so you are not locked to the server’s named crop. If the URL includes **width** and/or **height** query parameters (same names as in the OEM web app, such as `width`, `w`, `height`, `h`, etc.), those values appear in the dialog. Changing **width** reloads the image and scales **height** proportionally when both are present. Use **Reset sizes** to restore the values from the page URL when you opened the editor.

## Permissions

- **activeTab** — send toggle messages to the current tab.
- **downloads** — save the cropped PNG.
- **storage** — reserved for future settings.
- **host_permissions `<all_urls>`** — fetch image bytes in the service worker so the canvas is not CORS-tainted for most `http(s)` images.

`blob:` and `data:` images are read in the content script instead.
