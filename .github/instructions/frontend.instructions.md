---
applyTo: "static/js/**/*.js"
---

# Frontend Rules

- Treat the backend as the source of truth for playback and queue progression. Do not implement frontend auto-next or implicit queue mutation logic.
- Import exported singletons from the canonical module paths and keep import paths version-consistent across modules. Do not instantiate duplicate `player`, `playlistManager`, `localFiles`, or similar stateful classes.
- Any backend route or payload change must be mirrored in `static/js/api.js`. Keep request payload shape aligned with router expectations, especially FormData for player control endpoints and JSON for CRUD-style endpoints.
- Keep user-isolated state in `localStorage` where the app already does so, including playlist selection, theme, and language. Do not move those preferences to backend persistence unless the feature explicitly requires it.
- When adding or changing UI text, update all three locales in `static/js/i18n.js`: `zh`, `en`, and `zh-TW`.
- Preserve the existing polling plus WebSocket reconciliation model. For subtle status-sync behavior, playlist refresh dedupe, and local optimistic barriers, consult `/memories/repo/player-status-sync.md` and `/memories/repo/ws-playlist-updated.md` before changing flow control.
- Room-aware pages and controls must preserve `pipe` or room context through the frontend API layer. Check `/memories/repo/ui-room-aware-api.md` when modifying room behavior.
- If you change trusted browser controls, resume-from-pause behavior, queue rendering/removal/reorder, request tracing, or KTV playback coordination, run `py tools/browser_control_regression.py --base-url http://127.0.0.1:9000/ --ensure-server --include-queue-suite --output logs/browser-control-regression.json` and expect `summary.passed = true` with `checks.queueSuite = true`.
- If you change local search results, local directory navigation, or the shared local tree data path (`static/js/local.js` and `static/js/search.js`), run `py tools/browser_control_regression.py --base-url http://127.0.0.1:9000/ --ensure-server --include-local-suite --output logs/browser-control-regression-local.json` and expect `summary.passed = true` with `checks.localSuite = true`.
