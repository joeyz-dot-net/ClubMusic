---
applyTo: "routers/**/*.py"
---

# Router Rules

- Access app state through dependency injection from `routers.dependencies`. Do not create new `MusicPlayer`, playlists managers, or WebSocket managers inside routers.
- Keep router contracts exactly aligned with `static/js/api.js`. If you add, rename, or reshape an endpoint or field, update both sides in the same change.
- Follow the repository payload convention: player control endpoints use `await request.form()`, while playlist/search/settings/history CRUD flows generally use `await request.json()`.
- After any playlist mutation, ensure persistence is triggered with `PLAYLISTS_MANAGER.save()` or the corresponding injected manager save path.
- Never allow deletion or renaming of the `default` playlist. Backend autoplay and queue assumptions rely on it always existing.
- Endpoints that can operate on room players must use request-aware dependency helpers such as `get_player_for_request()` or other pipe-aware routing helpers, not the main-player singleton unconditionally.
- Be precise with state broadcasts. Only mark `playlist_updated` true for real queue mutations, and keep status payloads coherent when playback or autoplay fails so the frontend can clear stale current song state.
- Preserve request-source tracing hooks and related logging fields on control routes that diagnose unexpected playback transitions. See `/memories/repo/request-source-tracing.md` when changing `/play`, `/next`, or related control flow.
