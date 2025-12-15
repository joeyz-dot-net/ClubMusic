# Music Player AI Agent Guide

## Architecture snapshot
- **Backend**: FastAPI in [app.py](app.py) (1149 lines, 50+ routes) built around module-level singletons: `PLAYER = MusicPlayer.initialize()`, `PLAYLISTS_MANAGER = Playlists()`, `RANK_MANAGER = HitRank()`, `CURRENT_PLAYLIST_ID`. Business logic lives in [models/](models/) (player.py 1575+ lines, local_playlist.py, playlists.py, rank.py, song.py). No dependency injection.
- **Entry**: `python main.py` boots uvicorn (no reload mode, no PyInstaller reload=True), forces UTF-8 stdout/stderr for Windows compatibility, imports [app.py](app.py) which auto-initializes MPV subprocess and loads playback_history.json, playlist.json, playlists.json on import.
- **Frontend**: [templates/index.html](templates/index.html) (451 lines) + modular ES6 in [static/js/](static/js/): main.js (1048 lines) wires MusicPlayerApp class coordinating PlayerManager/PlaylistManager/SearchManager/RankingManager, polls /status ~500ms, uses FormData POSTs. Drag-drop queue via playlist.js; ranking/search/player modules split out. Bilingual UI (Chinese strings in responses, JS formatting).
- **Audio engine**: External mpv.exe process spawned via subprocess.Popen with named pipe IPC (Windows: `\\.\pipe\mpv-pipe`). All communication through [models/player.py](models/player.py) methods `mpv_command(cmd_list)` and `mpv_get(prop)`. Pipe/command path from settings.ini `[app].mpv_cmd`.

## Start & debug
- **Install/run**: `pip install -r requirements.txt; python main.py` (restart after any settings.ini change). Requires mpv.exe in project root or `C:\mpv\`. Frontend at http://0.0.0.0:80 (default, configurable via settings.ini [app] server_host/server_port).
- **Config**: settings.ini read once on startup in main.py via configparser; fallback to MusicPlayer.DEFAULT_CONFIG. Key fields: `[app]` music_dir (Z:), allowed_extensions (.mp3,.wav,.flac), mpv_cmd, server_host/server_port, debug.
- **State loading**: On import, [app.py](app.py) lines ~55-70 initialize singletons which auto-load playback_history.json, playlist.json, playlists.json and build local file tree from music_dir via MusicPlayer.initialize(data_dir="."). All mutations auto-save to JSON.
- **MPV diagnostics**: GET /debug/mpv for pipe/process status; PowerShell `Test-Path "\\.\pipe\mpv-pipe"` and `Get-Process mpv` for IPC troubleshooting. Check PLAYER.pipe_name vs settings.ini [app].mpv_cmd match. Default MPV path: c:\mpv\mpv.exe.
- **Build**: `build_exe.bat` uses PyInstaller with app.spec; includes mpv.exe, yt-dlp.exe, templates/, static/ in bundle. Entry via [main.py](main.py) (not app.py directly for PyInstaller compat—uvicorn.run(app, ...) avoids reload issues).

## Data contracts & conventions
- **Song dicts** must include url, title, type (local/youtube), duration, thumbnail_url; song objects (LocalSong/StreamSong in [models/song.py](models/song.py)) expose to_dict(), is_local(), is_stream(). StreamSong auto-derives thumbnail via YouTube's img.youtube.com.
- **Playlist IDs**: "default" is system reserved (cannot delete); others are str(int(time.time()*1000)). Current playlist tracked via `PLAYER.current_playlist` (LocalPlaylist instance). Global `CURRENT_PLAYLIST_ID` var syncs frontend selection (app.py line ~62).
- **API responses**: Always `{"status": "OK"|"ERROR", "message": "...", "data": {...}}`; errors often include "error" field. Preserve Chinese UI strings (e.g., "加载中…", "播放失败", "1小时前") for bilingual support.
- **JSON state files**: playback_history.json (array of {url, title, type, timestamp}), playlist.json (current queue songs []), playlists.json (dict {playlist_id → {name, songs:[], created_at, updated_at}}). Auto-saved on mutations via save() methods.

## Adding/using routes
- Define in [app.py](app.py) with FastAPI decorators (@app.post, @app.get, @app.delete); call global singletons (PLAYER, PLAYLISTS_MANAGER, RANK_MANAGER). Example:
  ```python
  @app.post("/playlist_add")
  async def playlist_add(request: Request):
      form = await request.form()
      path = form.get("path", "").strip()
      title = form.get("title", "").strip() or os.path.basename(path)
      result = PLAYER.add_to_playlist(path, title)
      return JSONResponse({"status": "OK", "data": result})
  ```
- Frontend calls via fetch with FormData (see [static/js/api.js](static/js/api.js)); keep field names in sync with backend handlers. /status returns combined MPV/meta snapshot for ~500ms polling (player.js statusInterval).

## Frontend patterns
- [static/js/api.js](static/js/api.js) centralizes fetch helpers with error handling; [static/js/main.js](static/js/main.js) MusicPlayerApp class initializes via ES6 imports: PlayerManager, PlaylistManager, SearchManager, RankingManager, VolumeControl, LocalFiles.
- **Queue dedup**: Frontend tracks playlistUrlSet (playlist.js); backend should guard against duplicates in playlist_add/queue routes to prevent double-adds.
- **Ranking UI** in [static/js/ranking.js](static/js/ranking.js); formats dates as Chinese relative time (e.g., "1小时前", "3天前") and colors top 3 with gradients.
- **Search** uses debounced input (300ms) and localStorage history ([static/js/search.js](static/js/search.js)); drag-drop queue reordering in [static/js/playlist.js](static/js/playlist.js) with mobile touch support.

## Ranking & history specifics
- **Endpoint**: GET /ranking?period=all|week|month returns {status, period, ranking:[{url,title,type,thumbnail_url,play_count,last_played}]}; data from [models/rank.py](models/rank.py) HitRank class.
- **History tracking**: All plays recorded to playback_history.json with timestamp on each play() call. HitRank processes this on startup and filters by time period (7/30 days or all-time).

## Testing & validation
- Manual checks: /debug/mpv for pipe status, /ranking?period=all for ranking data, browser console for _playlistUrlSet (dedup state).
- YouTube tests require yt-dlp.exe available; check test/test_youtube_play.py, test/test_youtube_simple.py for patterns.
- Bilingual: responses mix Chinese (UI) and English (code); ensure str() doesn't break UTF-8 formatting.

## Common pitfalls
- **MPV path/pipe mismatch** causes silent failures—verify settings.ini [app].mpv_cmd and PLAYER.pipe_name match (e.g., both have \\\\.\\\pipe\\\mpv-pipe).
- **Async title arrival**: YouTube titles arrive asynchronously; UI falls back to current_title → media_title → title → name → url. Avoid assuming immediate metadata.
- **Config not hot-reloaded**: Restart after settings.ini edits (main.py reads it once at startup). Keep UTF-8 stdout setup in any new entry scripts.
- **Song dict validation**: Always validate song.get("type") is "local"|"youtube" and thumbnail_url exists before display.

## State mutations & file I/O
- All state changes auto-save: [models/player.py](models/player.py) has save_playlist(), save_history(); [models/playlists.py](models/playlists.py) has save() called after create/update/delete. Never manually edit JSON—use API/model methods only.
- Thread-safe access: MPV commands are sequential (pipe is non-blocking); file I/O wrapped in try-except with fallback to in-memory state if write fails.

## YouTube/stream specifics
- YouTube playback uses yt-dlp for URL extraction; [models/player.py](models/player.py) play() method caches metadata asynchronously. Streams have type="youtube" and no local path.
- Thumbnails: YouTube uses img.youtube.com/vi/{video_id}/default.jpg; backend caches via thumbnail_url field. If load fails, UI shows placeholder.

## Dependencies & external tools
- **Python**: fastapi, uvicorn[standard], python-multipart, yt-dlp, Pillow, psutil, requests, pyinstaller (see [requirements.txt](requirements.txt))
- **External executables**: mpv.exe (audio/video), yt-dlp.exe (YouTube extraction during build). Both bundled in PyInstaller; dev requires them in PATH or project root.
- **Windows-specific**: UTF-8 stdout forced in [main.py](main.py) line ~10 and [models/player.py](models/player.py) line ~4; named pipe IPC via `\\.\pipe\mpv-pipe`.

## More references
- See README.md, doc/FILE_STRUCTURE.md, doc/ROUTES_MAPPING.md for expanded API maps and module organization.
