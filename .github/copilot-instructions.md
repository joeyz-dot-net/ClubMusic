# Music Player AI Agent Guide

## Architecture snapshot
- Backend: FastAPI in app.py (50+ routes) built around module-level singletons (`PLAYER`, `PLAYLISTS_MANAGER`, `CURRENT_PLAYLIST_ID`). Business logic lives in models/ (player, playlist, playlists, rank, song). No DI.
- Entry: python main.py boots uvicorn, forces UTF-8 stdout/stderr, imports app.py which spins MPV and loads JSON state.
- Frontend: templates/index.html + static/js/*.js; main.js wires managers, polls /status about every 500ms, heavy use of FormData POSTs. Drag-drop queue via playlist.js; ranking/search/player modules split out.
- Audio: external mpv.exe via named pipe \\.\pipe\mpv-pipe. All IPC through PLAYER.mpv_command()/mpv_get(). Pipe/command path comes from settings.ini.

## Start & debug
- Install/run: pip install -r requirements.txt; python main.py (restart after any settings.ini change). Requires mpv.exe in project root or C:\mpv\.
- Config: settings.ini read once; fallback to MusicPlayer.DEFAULT_CONFIG. Key fields: [app] music_dir, allowed_extensions, mpv_cmd, flask_host/flask_port (legacy names), debug.
- State loading: on import app.py loads playback_history.json, playlist.json, playlists.json and builds local file tree. Mutations auto-save.
- MPV checks: hit /debug/mpv for pipe/process info; PowerShell Test-Path "\\.\pipe\mpv-pipe" and Get-Process mpv when diagnosing.

## Data contracts & conventions
- Song dicts must include url, title, type (local/youtube), duration, thumbnail_url; song objects expose to_dict(), is_local(), is_stream().
- Playlist IDs are str(int(time.time()*1000)) except "default". current playlist uses PLAYER.current_playlist alias.
- API responses: always {"status": "OK"|"ERROR", "message": "...", "data": {...}}; errors often include "error" field. Preserve Chinese UI strings (e.g., "加载中…").

## Adding/using routes
- Define in app.py with FastAPI decorators; call global singletons (PLAYER, PLAYLISTS_MANAGER). Example pattern:
  - form = await request.form(); path = form.get("path", "").strip(); result = PLAYER.some_method(...); return JSONResponse({"status": "OK", "data": result})
- Frontend calls via fetch with FormData; keep field names in sync with existing handlers. /status returns combined MPV/meta snapshot for polling UI.

## Frontend patterns
- static/js/api.js centralizes fetch helpers; main.js initializes PlayerManager, PlaylistManager, SearchManager, RankingManager.
- Queue dedup: frontend tracks playlistUrlSet; backend should also guard in playlist_add/related routes.
- Ranking UI in static/js/ranking.js; formats dates to Chinese strings and styles top 3 with gradients.
- Search uses debounced input and history (static/js/search.js); drag-drop queue ordering in static/js/playlist.js.

## Ranking & history specifics
- Endpoint: GET /ranking?period=all|week|month returns {status, period, ranking:[{url,title,type,thumbnail_url,play_count,last_played}]}; data produced by models/rank.HitRank.

## Testing & validation
- Pytest targets: test/test_youtube_play.py, test/test_youtube_simple.py, test/test_ranking.py. Ensure mpv/yt-dlp availability when running playback tests.
- Manual checks: /debug/mpv for IPC; /ranking?period=all for data; browser console window._playlistUrlSet for dedup state.

## Common pitfalls
- MPV path/pipe mismatches cause silent failures—verify settings.ini mpv_cmd and PLAYER.pipe_name.
- Titles for YouTube arrive asynchronously; UI falls back current_title > media_title > title > name > URL—avoid assuming immediate metadata.
- Config is not hot-reloaded; restart after edits. Keep UTF-8 stdout setup when adding new entry scripts.

## More references
- See README.md, RANKING_IMPLEMENTATION.md, doc/FILE_STRUCTURE.md, doc/ROUTES_MAPPING.md for expanded maps of routes and modules.
