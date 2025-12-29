# ClubMusic AI Agent Guide

**Full-stack web music player**: FastAPI + ES6 modules + MPV IPC engine.  
**Key distinction**: Bilingual (zh/en), user-isolation via localStorage, multi-singleton architecture, Windows/PyInstaller-optimized.

> **Last Updated**: 2025-12-27 | **Focus**: Production-ready patterns, user-isolation architecture, ES6 module state management, backend event listening

## ⚠️ Critical Rules (Must-Know)

| Rule | Impact & Example |
|------|---------|
| **API Sync** | Backend [app.py](../app.py) + Frontend [static/js/api.js](../static/js/api.js) must match exactly. New route? Update BOTH. Field rename? Check both files. Missing sync = silent failures. |
| **FormData vs JSON** | **Player control** (`/play`, `/seek`, `/volume`, `/playlist_remove`): `await request.form()`. **Data CRUD** (`/playlists`, `/playlist_reorder`, `/search_song`): `await request.json()`. Wrong type = "form required" errors. |
| **POST vs PUT vs DELETE** | **Creating**: POST `/playlists`. **Updating**: PUT `/playlists/{id}`. **Removing**: DELETE `/playlists/{id}`. Follow REST semantics strictly for frontend routing. |
| **Global Singletons** | `PLAYER`, `PLAYLISTS_MANAGER`, `RANK_MANAGER` initialized in [app.py#L70-80](../app.py). Access directly—never create new instances. State corruption if duplicated. |
| **Config Reload** | [settings.ini](../settings.ini) parsed once at startup. Audio device change? Music dir? **Requires restart** `python main.py`. |
| **UTF-8 Windows** | Every `.py` entry point needs UTF-8 wrapper (see [models/__init__.py#L6-11](../models/__init__.py)). Chinese chars garbled = missing wrapper. |
| **i18n Sync** | Always add BOTH `zh` and `en` keys in [static/js/i18n.js](../static/js/i18n.js). Missing lang = undefined UI text. |
| **Persistence** | Call `PLAYLISTS_MANAGER.save()` after ANY playlist modification. Forgetting it = data loss. |
| **User Isolation** | Playlist selection in browser `localStorage` (`selectedPlaylistId`), NOT backend global state. Each browser/tab independent. |
| **PyInstaller Paths** | External tools (`mpv.exe`, `yt-dlp.exe`) live next to exe. Bundled assets (`static/`, `templates/`) in temp `_MEIPASS` dir. |
| **Singleton Pattern** | Use `MusicPlayer.initialize()` classmethod, not `__init__()`. Returns cached instance across app lifetime. |

## Architecture

```
Browser ←poll /status→ FastAPI (app.py) ←→ Singletons ←→ MPV (\\.\pipe\mpv-pipe)
   │                         │                              ↑
   ├── ES6 modules ──────────┴── models/*.py               │
   └── localStorage                  └─ Backend event listener (detects end-file)
       (selectedPlaylistId,                 └─ Auto-deletes current song + plays next
        theme, language)                       (NO frontend intervention needed)
                                    └── playlists.json, playback_history.json
```

### 🎵 Auto-Next Flow (BACKEND-CONTROLLED)

**Critical**: Auto-next is **100% backend-controlled**. Frontend only displays status changes.

1. **Song Ends**: MPV emits `end-file` event to IPC pipe
2. **Backend Listens**: [player.py#L405-530](../models/player.py#L405-L530) `_start_event_listener()` daemon thread detects event
3. **Auto-delete**: `handle_playback_end()` deletes current song from default playlist
4. **Auto-play**: Immediately plays remaining `songs[0]` if queue exists
5. **Frontend**: Next `/status` poll shows new song in `current_meta` → UI updates

**Key Details**:
- Event listener runs in background even with polling paused (never blocked)
- Deletion uses URL matching: `current_meta.url` or `current_meta.rel` or `current_meta.raw_url`
- No race conditions: Only one auto-next per song completion (prevented by event-driven design)
- **Frontend doesn't trigger auto-next**: User sees result via status polling, not manual API calls

### Data Flow: Playback
1. User clicks song → `player.js:play()` → `api.js:play()` → POST `/play`
2. Backend: `app.py` → `PLAYER.play(song)` → MPV IPC `loadfile` command
3. Frontend polls `/status` every 1s → updates UI via `player.js:updateStatus()`
4. **Auto-next (backend)**: MPV emits `end-file` → backend event listener → auto-deletes + plays next
5. Frontend polls `/status` → sees new `current_meta` → displays new song

### Key Files & Responsibilities

| File | Purpose |
|------|---------|
| [main.py](../main.py) | Uvicorn startup, interactive audio device selection (MPV output) |
| [app.py](../app.py) | 60+ routes, global singletons initialization |
| [models/player.py](../models/player.py) | `MusicPlayer` class: MPV IPC via `\\.\pipe\mpv-pipe`, config loading, yt-dlp integration |
| [models/playlists.py](../models/playlists.py) | `Playlists` manager: multi-playlist CRUD, auto-save to `playlists.json` |
| [models/song.py](../models/song.py) | `Song`, `LocalSong`, `StreamSong`; YouTube metadata/search via yt-dlp |
| [static/js/api.js](../static/js/api.js) | `MusicAPI` class—**must mirror backend routes exactly** |
| [static/js/main.js](../static/js/main.js) | `MusicPlayerApp`: init sequence, status polling, auto-next logic |
| [static/js/playlist.js](../static/js/playlist.js) | `PlaylistManager`: frontend playlist state, `localStorage` persistence |
| [static/js/i18n.js](../static/js/i18n.js) | Translations—always add both `zh` and `en` keys |

## Adding a New Feature

### 1. Backend Route ([app.py](../app.py))
```python
@app.post("/my-endpoint")
async def my_endpoint(request: Request):
    # Choose ONE based on frontend call pattern:
    form = await request.form()       # For FormData (simple values)
    # data = await request.json()     # For JSON (complex objects)
    
    result = PLAYER.some_method()     # Use global singleton
    PLAYLISTS_MANAGER.save()          # Persist if modified
    return {"status": "OK", "data": result}
```

### 2. Frontend API ([static/js/api.js](../static/js/api.js))
```javascript
// Add method to MusicAPI class - match backend data format exactly
async myEndpoint(value) {
    const formData = new FormData();
    formData.append('value', value);
    return this.postForm('/my-endpoint', formData);
    // OR: return this.post('/my-endpoint', { value });  // for JSON
}
```

### 3. i18n ([static/js/i18n.js](../static/js/i18n.js))
```javascript
zh: { 'myFeature.label': '我的功能' },
en: { 'myFeature.label': 'My Feature' }
```

## PyInstaller Path Patterns

```python
# External executables (mpv.exe, yt-dlp.exe) → exe directory
if getattr(sys, 'frozen', False):
    app_dir = os.path.dirname(sys.executable)
else:
    app_dir = os.path.dirname(os.path.abspath(__file__))

# Bundled resources (templates/, static/) → _MEIPASS temp dir
if getattr(sys, 'frozen', False):
    base_path = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
else:
    base_path = os.path.dirname(os.path.abspath(__file__))
```

## Data Files

| File | Schema |
|------|--------|
| [settings.ini](../settings.ini) | `[app]` music_dir, mpv_cmd (with WASAPI device GUID), startup_timeout; `[logging]` level |
| `playlists.json` | `{"order": [...], "playlists": [{id, name, songs: [{url, title, type, thumbnail_url?}], created_at, updated_at}]}` |
| `playback_history.json` | `[{url, title, type, timestamps, thumbnail_url}]` for ranking |

## Essential Workflows

### 1. Development Server
```powershell
python main.py              # Starts Uvicorn + interactive audio device selection dialog
                             # Will prompt for MPV output device (defaults to CABLE-A Input)
```

### 2. Building & Deployment
```powershell
.\build_exe.bat             # PyInstaller → dist/ClubMusic.exe (reads app.spec)
                             # Bundles: bin/ (mpv.exe, yt-dlp.exe), static/, templates/
```

### 3. Verification Commands
```powershell
Get-Process mpv             # Confirm MPV process running
Test-Path "\\.\pipe\mpv-pipe"  # Confirm MPV IPC pipe exists
$env:MPV_AUDIO_DEVICE       # Check selected audio device UUID
```

### 4. VS Code Tasks (`Ctrl+Shift+B`)
Available via `run_task` or `Ctrl+Shift+B` in VS Code:
- **Build** (default) → `dist/ClubMusic.exe` (local build only, no network deploy)
- **Deploy Remote** → deploy to `\\B560\code\ClubMusic` (backup before deploy)  
- **Build & Deploy** → sequential execution of both tasks (dependsOrder: sequence)

## Streaming Responses & Safari Optimization

Frontend polling (every 1s `GET /status`) is critical for responsive UI. Safari requires special handling:
- **Keepalive interval**: Every 0.5s heartbeat to prevent timeout
- **Chunk size**: 128KB vs 256KB (Safari uses smaller chunks)
- **Max consecutive empty**: 400 empty packets before timeout (Safari more lenient)
- Implementation: [app.py#L95-125](../app.py#L95-L125) `detect_browser_and_apply_config()`

**Testing browser compatibility**: Check request header `User-Agent` contains "Safari" but NOT "Chrome" to identify Safari.

## Common Pitfalls & Debugging

| Symptom | Root Cause | Fix |
|---------|---------|------|
| Settings changes ignored | Config cached on startup | Restart `python main.py` |
| No audio output | Wrong WASAPI device GUID in `mpv_cmd` | Re-run startup device selection or edit `settings.ini` |
| Playlist changes lost | Code forgot `PLAYLISTS_MANAGER.save()` | Add call after [models/playlists.py](../models/playlists.py) modifications |
| Playlist appears empty in another browser | Each browser has independent `localStorage.selectedPlaylistId` | This is intentional—user isolation feature |
| Duplicate songs in queue | Code didn't check URL before adding | All `/playlist_add` calls must validate via `api.addToPlaylist()` which returns 409 Conflict |
| Current index out of sync | Backend `PLAYER.current_index` ≠ actual position | After deletions, verify [app.py](../app.py) `/playlists/{id}/remove` recalculates index |
- [main.js#L25-30](../static/js/main.js#L25-L30): App initializes with `this.currentPlaylistId = localStorage.getItem('selectedPlaylistId') || 'default'`
- Backend [app.py#L1355-1420](../app.py#L1355-L1420): `/playlist` endpoint receives `playlist_id` from frontend, not global state
- Current playlist selection: **Frontend is source of truth** (via `localStorage.selectedPlaylistId`)
- Theme/Language: Frontend only (via `localStorage`)
- **UI**: `ui.js` (Toast, loading), `themeManager.js`, `navManager.js`, `settingsManager.js`
- **State**: `localStorage` keys: `selectedPlaylistId`, `theme`, `language`
- **Critical**: Always save ORIGINAL URL to `playback_history.json` BEFORE transformation
- Ranking system matches on original URL, not transformed URL
- [models/song.py](../models/song.py): `StreamSong.play()` applies transformation AFTER history save

### Current Index Management
- `PLAYER.current_index` tracks position in current playing playlist
- Frontend updates this when adding songs at specific positions
- Auto-next logic: Deletes current song at index 0, then plays new `songs[0]`
- **Gotcha**: Don't confuse frontend `playlistManager.currentPlaylist` (data) with `PLAYER.current_index` (playback state)

### Duplicate Detection in Playlists
- Every `/playlist_add` call checks `song.url` against existing songs
- Returns 409 Conflict if duplicate found (prevents duplicates in queue)
- Each playlist independently tracks URL set via `playlistManager.urlSet`

### Operation Lock Lifecycle
- Acquired during drag, editing, or critical UI operations
- **Must release** in both `touchend` AND `touchcancel` handlers (not just one)
- Releasing when lock doesn't exist is safe (no-op)
- Timeout cleanup at 30 seconds prevents forever-locked state

## Modal Navigation Stack

[main.js#L1080-1170](../static/js/main.js#L1080-L1170) implements non-modal stack for tab switching:
- Maintains navigation history: `navigationStack = ['playlists']` (default tab)
- Back button pops stack, returns to previous tab
## Touch Drag-Sort Implementation
[playlist.js#L350-500](../static/js/playlist.js#L350-L500):
- Long-press 300ms on drag handle to start reorder
- Move threshold 10px before drag activates (prevents accidental trigger on scroll)
- Real-time placeholder position during drag
- `operationLock.acquire('drag')` pauses status polling while dragging
- Server-side reorder via [app.py#L1684-1702](../app.py#L1684-L1702): `/playlist_reorder` uses `from_index`/`to_index`

**Critical**: Must release lock on `touchcancel` AND `touchend`, else polling freezes forever.

## Backend Model Hierarchy

[models/__init__.py](../models/__init__.py) exports all models:
- `Song`, `LocalSong`, `StreamSong` – song data classes with `play()` methods
- `Playlist`, `Playlists` – playlist management with JSON persistence
- `MusicPlayer` – MPV control singleton (IPC, volume, seek, playback, yt-dlp)
- `HitRank`, `PlayHistory` – play count tracking for ranking feature

## Playback History & Ranking

**Data Format** ([models/rank.py](../models/rank.py)):
- `playback_history.json`: `[{url, title, type, timestamps: "1234567890,1234567891", thumbnail_url}]`
- **timestamps** field stores comma-separated Unix timestamps of every play occurrence
- Ranking API ([app.py](../app.py)) filters by time period: `all|day|week|month|quarter|year`
- Counts only plays within the period cutoff, not total count

**Auto-add pattern**: Every `/play` call with `save_to_history=True` adds to `playback_history.json` immediately. No batching.

**Gotcha**: YouTube URL transforms via yt-dlp occur AFTER history save, so history keeps original URL. Ranking search matches on original URL.

## MPV Audio Device Selection

[main.py](../main.py) orchestrates interactive prompt at startup:

```python
interactive_select_audio_device()  # Prompts for WASAPI output
                                   # Populates mpv_cmd with audio-device GUID
                                   # Auto-selects "CABLE-A Input" if found
                                   # Timeout: settings.ini [app] startup_timeout (default 15s)
                                   # Sets env var: MPV_AUDIO_DEVICE
```

**Key insight**: Device selection dialog appears BEFORE Uvicorn starts. If user doesn't input within timeout, uses defaults.

## Development Commands

**Essential workflows** for immediate development:
```powershell
# 🚀 Start development server (with audio device selection)
python main.py

# 📦 Build executable for distribution
.\build_exe.bat                    # Creates dist/ClubMusic.exe

# 🔧 Development verification commands  
Get-Process mpv                    # Confirm MPV process running
Test-Path "\\.\pipe\mpv-pipe"     # Confirm MPV IPC pipe exists  
taskkill /IM mpv.exe /F           # Force-kill stuck MPV processes

# 🔍 Quick dependency check
pip install -r requirements.txt   # Install/update dependencies
python -c "import fastapi, uvicorn, mutagen" # Verify core imports
```

**VS Code Integration**: Use task runner (`Ctrl+Shift+B`) for build operations. Tasks are defined in workspace-level configuration accessible via `run_task` tool.

## Testing & Verification Patterns

### Backend Testing (Manual)
```powershell
# Test auto-next event listener
1. Start server: python main.py
2. Play a short song (3-5 seconds)
3. Watch server logs for "[事件监听]" events
4. Verify "📂 [MPV 命令] loadfile" appears for next song
5. Check /status endpoint shows new song_url

# Test playlist isolation (multi-browser)
1. Open Browser A → add song to "default" playlist
2. Open Browser B → add different song to "my-playlist"
3. Each browser should show independent queue (localStorage.selectedPlaylistId differ)
4. Verify no "push" from backend changes browser selections

# Test YouTube URL transformation
1. Search YouTube song, play it
2. Check playback_history.json → original youtu.be URL stored
3. Verify /status shows transformed URL (direct stream link)
4. Ranking should match on original URL
```

### Frontend Testing Checklist
- **Polling state**: Open DevTools Console → verify `[播放器] ▶️ 正在播放` logs every 1s
- **Operation lock**: Start drag → Console should show `[操作锁] 获取锁: drag` → polling pauses
- **localStorage sync**: Clear localStorage → F5 refresh → verify reset to defaults (selected Playlist = 'default', theme = 'dark')
- **FormData mismatch**: Try `api.post('/play', {...})` instead of `api.postForm()` → should get 400 error

### Known Blocking Issues to Avoid
1. **Never use `async/await` in `/status` route**: Would block polling, making UI freeze. Keep it synchronous.
2. **Never modify `PLAYER.current_index` outside playback logic**: Breaks auto-next tracking. Only update in `PLAYER.play()` or deletion handlers.
3. **Never re-render entire playlist in `/status` poll response**: Heavy DOM updates cause jank. Only update changed songs via diff logic.
4. **Never call `loadAll()` without `loadCurrent()`**: Stale playlist data. Always refresh both: `loadAll()` → `loadCurrent()`.
5. **Never release operation lock in timeout**: Could block concurrent operations. Use explicit release in event handlers.

## Development Commands
```powershell
# 🚀 Start development server (with audio device selection)
python main.py

# 📦 Build executable for distribution
.\build_exe.bat                    # Creates dist/ClubMusic.exe

# 🔧 Development verification commands  
Get-Process mpv                    # Confirm MPV process running
Test-Path "\\.\pipe\mpv-pipe"     # Confirm MPV IPC pipe exists  
taskkill /IM mpv.exe /F           # Force-kill stuck MPV processes

# 🔍 Quick dependency check
pip install -r requirements.txt   # Install/update dependencies
python -c "import fastapi, uvicorn, mutagen" # Verify core imports
```

**VS Code Integration**: Use task runner (`Ctrl+Shift+B`) for build operations. Tasks are defined in workspace-level configuration accessible via `run_task` tool.