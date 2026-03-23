---
applyTo: "test/**/*.py"
---

# Test Rules

- Prefer focused validation for the behavior being changed. Do not broaden scripts into unrelated coverage or rewrite older ad hoc test files unless the task requires it.
- Keep tests and support scripts Windows-compatible and runnable from the repository root.
- If a change touches browser control flows, pause/resume synchronization, queue refresh dedupe, or KTV fallback behavior, use the browser regression workflow from `tools/browser_control_regression.py` as the primary end-to-end check.
- When a failing behavior involves playlist refreshes, stale playback state, or room-aware routing, consult `/memories/repo/player-status-sync.md`, `/memories/repo/ws-playlist-updated.md`, and `/memories/repo/ui-room-aware-api.md` before adjusting assertions or fixtures.
- Avoid encoding frontend-autoplay assumptions in tests. The backend owns autoplay and end-of-track progression.
- Keep expected API payload formats aligned with the application contract: FormData-style control routes versus JSON CRUD routes.
