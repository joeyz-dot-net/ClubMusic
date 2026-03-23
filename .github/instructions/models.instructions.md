---
applyTo: "models/**/*.py"
---

# Model Rules

- Treat `models/player.py` as the authoritative home for backend-driven playback progression. Do not shift autoplay or end-of-track queue advancement into frontend code.
- Preserve queue invariants used by the rest of the app: the current queue head semantics, `current_index` consistency, and add-next insertion behavior that avoids interrupting the active song.
- Keep singleton-oriented architecture intact. Model changes must remain compatible with the singleton instances initialized in `routers/state.py` and consumed through dependency injection.
- Maintain Windows and PyInstaller compatibility. Reuse the existing resource path and executable path helpers instead of hardcoding development-only paths.
- When touching MPV lifecycle, event listener, or status payload generation, preserve the frontend synchronization contract and review `/memories/repo/player-status-sync.md` for known regressions.
- If you change playlist mutation semantics, autoplay removal, or queue versioning, review `/memories/repo/ws-playlist-updated.md` so backend broadcasts still drive the correct frontend refresh behavior.
- For request attribution, browser trace correlation, or unexpected playback debugging hooks, keep model-side logging compatible with `/memories/repo/request-source-tracing.md`.
