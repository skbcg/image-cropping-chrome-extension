# Effort: Chrome extension in-page image crop

**Status:** Done  
**Created:** 2026-04-13  
**Owner:** Steven Szontagh  
**Agent:** Cursor Agent (implementation)

---

## Goal

Ship a Manifest V3 Chrome extension that toggles image-selection mode on the active tab, shows crop affordances on eligible images, and opens an in-page crop modal (ported from the OEM image scraper `CropEditor`) with download-only output. No Firecrawl and no AI extend in v1.

## Scope

- [x] MV3 scaffold with background service worker, content script bundle, build tooling
- [x] Extension action toggles selection mode on the current tab
- [x] Overlays with crop affordance on visible, reasonably-sized images; observe DOM changes
- [x] Load selected image via extension-privileged fetch (and blob/data fallbacks) to avoid canvas taint where possible
- [x] In-page modal crop UI (square crop, zoom, apply → download PNG 1200×1200)

## Non-Goals

- Firecrawl or URL scraping
- AI extend / outpainting
- Batch ZIP export or multi-image tray
- Persisted history across sessions

## Allowed Agent Actions

- Create and edit files under `src/`, `public/`, project root config
- Install npm dependencies with exact versions (verified from npm registry)
- Run lint and typecheck locally

**The agent MUST NOT:** modify `AGENTS.md`, modify `specs/`, deploy, or hardcode secrets.

## Cost Estimate

| Item | Estimate |
| :--- | :--- |
| Estimated API calls during development | 0 |
| Estimated model | N/A |
| Estimated total cost | $0 |

## Dependencies Added or Updated

| Package | Version | Prod/Dev | Verified From | Date Verified |
| :--- | :--- | :--- | :--- | :--- |
| react | 19.0.0 | Prod | npmjs.com | 2026-04-13 |
| react-dom | 19.0.0 | Prod | npmjs.com | 2026-04-13 |
| @types/react | 19.0.12 | Dev | npmjs.com | 2026-04-13 |
| @types/react-dom | 19.0.4 | Dev | npmjs.com | 2026-04-13 |
| @types/chrome | 0.0.317 | Dev | npmjs.com | 2026-04-13 |
| typescript | 5.8.3 | Dev | npmjs.com | 2026-04-13 |
| vite | 6.2.5 | Dev | npmjs.com | 2026-04-13 |
| @vitejs/plugin-react | 4.3.4 | Dev | npmjs.com | 2026-04-13 |

**npm audit result:** Run `npm audit` after install; address high/critical before release if any appear.

## Technical Decisions

- Vite multi-entry build for `background` and `content` with `inlineDynamicImports` so content script is a single file.
- Image fetch in background service worker with `host_permissions: <all_urls>` to reduce canvas taint issues.
- React UI mounted in a closed Shadow DOM root to isolate styles from host pages.

## Completion Checklist (Definition of Done)

- [x] All scope items checked
- [x] Non-goals respected
- [x] Dependencies table filled; versions exact-pinned
- [x] `npm run lint` and `npm run typecheck` pass
- [x] Extension builds to `dist/`; load unpacked and verify toggle + crop + download flow on a real page

## Notes

- Reference editor: `oem-image-scraper/src/components/CropEditor.tsx`
