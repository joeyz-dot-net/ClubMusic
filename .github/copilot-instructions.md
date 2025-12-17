# Music Player AI Agent Guide

## Architecture snapshot
- **Backend**: FastAPI in [app.py](app.py) (1348+ lines, 50+ routes) built around module-level singletons: `PLAYER = MusicPlayer.initialize()`, `PLAYLISTS_MANAGER = Playlists()`, `RANK_MANAGER = HitRank()`, `CURRENT_PLAYLIST_ID`. Business logic lives in [models/](models/) (player.py 1575+ lines, song.py, stream.py). No dependency injection.
- **Entry**: `python main.py` boots uvicorn (reload=False), forces UTF-8 stdout/stderr for Windows compatibility, imports [app.py](app.py) which auto-initializes MPV subprocess + FFmpeg streaming process, loads playback_history.json, playlist.json, playlists.json on import.
- **Frontend**: [templates/index.html](templates/index.html) (451 lines) + modular ES6 in [static/js/](static/js/): main.js (1041 lines) wires MusicPlayerApp class coordinating player/playlist/search/ranking modules, polls /status ~500ms, uses FormData POSTs. Bilingual UI (Chinese strings in responses, English code).
- **Audio playback (MPV)**: External mpv.exe process spawned via subprocess.Popen with named pipe IPC (Windows: `\\.\pipe\mpv-pipe`). All communication through [models/player.py](models/player.py) methods `mpv_command(cmd_list)` and `mpv_get(prop)`. Pipe/command path from settings.ini `[app].mpv_cmd`.
- **Audio streaming (FFmpeg)**: New [models/stream.py](models/stream.py) (253 lines) provides browser audio stream via /stream/play endpoint. FFmpeg process captures system audio and transcodes to AAC/MP3/FLAC/PCM in real-time. Supports multiple concurrent clients via client registration queue system in ACTIVE_CLIENTS dict and per-client queue.Queue instances.

## Start & debug
- **Install/run**: `pip install -r requirements.txt; python main.py` (restart after any settings.ini change). Requires mpv.exe in project root or `C:\mpv\` + FFmpeg in PATH. Frontend at http://0.0.0.0:80 (default, configurable via settings.ini [app] server_host/server_port).
- **Config**: settings.ini read once at startup in main.py via configparser; fallback to MusicPlayer.DEFAULT_CONFIG. Key fields: `[app]` music_dir (Z:), allowed_extensions (.mp3,.wav,.flac,.aac,.m4a), mpv_cmd, server_host/server_port, debug.
- **State loading**: On import, [app.py](app.py) initializes singletons which auto-load playback_history.json, playlist.json, playlists.json and build local file tree from music_dir. All mutations auto-save to JSON.
- **MPV diagnostics**: PowerShell `Test-Path "\\.\pipe\mpv-pipe"` and `Get-Process mpv` for IPC troubleshooting. Check PLAYER.pipe_name vs settings.ini [app].mpv_cmd match. Default path: c:\mpv\mpv.exe.
- **FFmpeg/Stream diagnostics**: GET /stream/status returns running status, format, active_client count, total bytes transferred, duration, avg speed. See [models/stream.py](models/stream.py) find_ffmpeg() for path resolution (checks PATH, C:\ffmpeg\*, Program Files).
- **Build**: `build_exe.bat` uses PyInstaller with app.spec; includes mpv.exe, templates/, static/ in bundle. yt-dlp.exe, ffmpeg.exe not included—download separately. Entry via [main.py](main.py) (not app.py for PyInstaller compat).

## Data contracts & conventions
- **Song dicts** must include url, title, type (local/youtube), duration, thumbnail_url; song objects (LocalSong/StreamSong in [models/song.py](models/song.py)) expose to_dict(), is_local(), is_stream(). StreamSong auto-derives thumbnail via YouTube's img.youtube.com/vi/{video_id}/default.jpg.
- **Playlist IDs**: "default" is system reserved (cannot delete); others are str(int(time.time()*1000)). Current playlist tracked via `CURRENT_PLAYLIST_ID` global var syncing frontend selection.
- **API responses**: Always `{"status": "OK"|"ERROR", "message": "...", "data": {...}}`; errors often include "error" field. Preserve Chinese UI strings (e.g., "加载中…", "播放失败", "1小时前") for bilingual support.
- **JSON state files**: playback_history.json (array of {url, title, type, ts/timestamp}), playlists.json (dict {playlist_id → {id, name, songs:[], created_at, updated_at}}). Auto-saved on mutations via PLAYLISTS_MANAGER.save().

## Adding/using routes
- Define in [app.py](app.py) with FastAPI decorators (@app.post, @app.get, @app.delete); call global singletons (PLAYER, PLAYLISTS_MANAGER, RANK_MANAGER). Keep field names sync'd with frontend FormData calls in [static/js/api.js](static/js/api.js).
- **Streaming routes**: /stream/play (audio to browser), /stream/aac (AAC-specific), /stream/control (start/stop), /stream/status (diagnostics). All support async generators with queue-per-client architecture.
- /status endpoint returns combined MPV properties (paused, time_pos, duration, volume) + current_meta snapshot for ~500ms polling.

## Frontend patterns
- [static/js/api.js](static/js/api.js) centralizes fetch helpers with error handling; [static/js/main.js](static/js/main.js) MusicPlayerApp initializes via ES6 imports (PlayerManager, PlaylistManager, SearchManager, RankingManager, VolumeControl).
- **Queue dedup**: Frontend tracks playlistUrlSet to prevent duplicate entries.
- **Ranking UI** in [static/js/ranking.js](static/js/ranking.js); formats dates as Chinese relative time (e.g., "1小时前", "3天前").
- **Search** uses debounced input (300ms) with localStorage history; drag-drop reordering in [static/js/playlist.js](static/js/playlist.js) supports mobile touch.

## Ranking & history specifics
- **Endpoint**: GET /ranking?period=all|week|month returns {status, period, ranking:[{url,title,type,thumbnail_url,play_count,last_played}]}.
- **History tracking**: All plays recorded to playback_history.json with timestamp on each play() call. HitRank filters by time period (7/30 days or all-time).

## Testing & validation
- Manual checks: /stream/status for streaming health, /ranking?period=all for history data, browser Network tab for audio chunks.
- YouTube tests require yt-dlp.exe available; see test/test_youtube_*.py. Bilingual: ensure str() doesn't break UTF-8 formatting.

## Common pitfalls
- **MPV path/pipe mismatch** causes silent failures—verify settings.ini [app].mpv_cmd and PLAYER.pipe_name match.
- **FFmpeg not in PATH**: /stream endpoints silently fail if FFmpeg unavailable. Use GET /stream/status to diagnose.
- **Async title arrival**: YouTube titles arrive asynchronously; UI falls back to current_title → media_title → title → name → url.
- **Config not hot-reloaded**: Restart after settings.ini edits (main.py reads it once at startup).
- **Song dict validation**: Always validate song.get("type") is "local"|"youtube" and thumbnail_url exists before display.

## State mutations & file I/O
- All state changes auto-save: PLAYLISTS_MANAGER.save() called after create/update/delete. Never manually edit JSON—use API/model methods only.
- Thread-safe access: MPV commands are sequential (pipe is non-blocking); file I/O wrapped in try-except with fallback to in-memory state if write fails.

## YouTube/stream specifics
- YouTube playback uses yt-dlp for URL extraction; [models/player.py](models/player.py) play() method caches metadata asynchronously. Streams have type="youtube" and no local path.
- FFmpeg streaming: start_ffmpeg_stream(device_name, audio_format) spawns FFmpeg subprocess with queue.Queue per client. Clients registered via register_client(client_id); data flows client_queue → async generator → browser.

## Dependencies & external tools
- **Python**: fastapi, uvicorn[standard], python-multipart, yt-dlp, Pillow, psutil, requests, pyinstaller (see [requirements.txt](requirements.txt))
- **External executables**: mpv.exe (required, audio/video playback), yt-dlp.exe (optional, YouTube), ffmpeg.exe (optional, browser streaming). Only mpv.exe bundled in PyInstaller; others must be downloaded/installed separately.
- **Windows-specific**: UTF-8 stdout forced in [main.py](main.py) and [models/player.py](models/player.py); named pipe IPC via `\\.\pipe\mpv-pipe`; FFmpeg audio capture via dshow (-f dshow -i audio="...").

## More references
- README.md, doc/FILE_STRUCTURE.md, doc/ROUTES_MAPPING.md for expanded API maps and module organization.
