# ClubMusic AI Agent Guide

**Full-stack web music player**: FastAPI + ES6 modules + MPV IPC engine.  
**Key distinction**: Bilingual (zh/en), user-isolation via localStorage, multi-singleton architecture, Windows/PyInstaller-optimized.

> **Last Updated**: 2025-12-27 | **Focus**: Production-ready patterns, user-isolation architecture, ES6 module state management

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
   │                         │
   ├── ES6 modules ──────────┴── models/*.py (Song, Playlist, Player, Rank)
   └── localStorage (selectedPlaylistId, theme, language)
                                    └── playlists.json, playback_history.json
```

### Data Flow: Playback
1. User clicks song → `player.js:play()` → `api.js:play()` → POST `/play`
2. Backend: `app.py` → `PLAYER.play(song)` → MPV IPC `loadfile` command
3. Frontend polls `/status` every 2s → updates UI via `player.js:updateStatus()`
4. Auto-next: When `timeRemaining < 2.5s`, `main.js` triggers next song

### Key Files & Responsibilities

| File | Purpose |
|------|---------|
| [main.py](../main.py) | Uvicorn startup, interactive audio device selection (MPV output) |
| [app.py](../app.py) | 60+ routes, global singletons |
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
- **Build Only** → `dist/ClubMusic.exe` (no network deploy)
- **Build & Deploy to All** → build + copy to B560 + copy to local
- **Clean Build** → remove `build/`, `dist/`, `__pycache__/` then rebuild
- **启动音乐播放器** → `python main.py` (dev server)
- **安装依赖** → `pip install -r requirements.txt`

## Streaming Responses & Safari Optimization

Frontend polling (every 2s `GET /status`) is critical for responsive UI. Safari requires special handling:
- **Keepalive interval**: Every 0.5s heartbeat to prevent timeout
- **Chunk size**: 128KB vs 256KB (Safari uses smaller chunks)
- **Max consecutive empty**: 400 empty packets before timeout (Safari more lenient)
- Implementation: [app.py#L95-125](../app.py#L95-L125) `detect_browser_and_apply_config()`

**Testing browser compatibility**: Check request header `User-Agent` contains "Safari" but NOT "Chrome" to identify Safari.

## Debugging & Testing Patterns

**Development server**:
```powershell
python main.py              # Starts Uvicorn + interactive audio device selection dialog
                             # Will prompt for MPV output device (defaults to CABLE-A Input)
```

**Building & Deployment**:
```powershell
.\build_exe.bat             # PyInstaller → dist/ClubMusic.exe (reads app.spec)
                             # Bundles: bin/ (mpv.exe, yt-dlp.exe), static/, templates/
```

**Verification Commands**:
```powershell
Get-Process mpv             # Confirm MPV process running
Test-Path "\\.\pipe\mpv-pipe"  # Confirm MPV IPC pipe exists
$env:MPV_AUDIO_DEVICE       # Check selected audio device UUID
```

## Common Pitfalls & Debugging

| Symptom | Root Cause | Fix |
|---------|---------|------|
| Settings changes ignored | Config cached on startup | Restart `python main.py` |
| No audio output | Wrong WASAPI device GUID in `mpv_cmd` | Re-run startup device selection or edit `settings.ini` |
| Chinese text garbled | Missing UTF-8 wrapper in entry point | Add wrapper in [models/__init__.py#L6](../models/__init__.py) |
| YouTube videos 403 | yt-dlp outdated | `pip install --upgrade yt-dlp` or replace `bin/yt-dlp.exe` |
| Frontend API 400 errors | FormData/JSON mismatch (POST `/play` expects form, not JSON) | Check [api.js](../static/js/api.js) calls vs [app.py](../app.py) route handler |
| Playlist changes lost | Code forgot `PLAYLISTS_MANAGER.save()` | Add call after [models/playlists.py](../models/playlists.py) modifications |
| Playlist appears empty in another browser | Each browser has independent `localStorage.selectedPlaylistId` | This is intentional—user isolation feature |
| MPV won't start | IPC pipe busy OR mpv.exe path wrong | Kill lingering processes: `taskkill /IM mpv.exe /F`, check [settings.ini](../settings.ini) |
| Drag-sort freezes UI | `operationLock` not released on `touchcancel` | Verify both listeners exist in [playlist.js#L450-500](../static/js/playlist.js#L450-L500) |
| Auto-next not triggering | `_autoNextTriggered` flag stuck true | Check timeout in [main.js#L540](../static/js/main.js#L540) clears flag |

## User-Isolation & State Management (Critical Pattern)

⚠️ **Each browser tab/device maintains independent playlist selection**:
- Frontend reads/writes `localStorage.selectedPlaylistId` (per-tab isolated)
- Backend `/playlists/{id}/switch` only validates playlist exists, doesn't modify server state
- Result: Multiple users/browsers can work with different playlists simultaneously without server-side global state conflicts

**Key Implementation**:
- [playlist.js#L10-25](../static/js/playlist.js#L10-L25): `PlaylistManager.selectedPlaylistId` is restored from localStorage
- [main.js#L385-410](../static/js/main.js#L385-L410): App initializes with `this.currentPlaylistId = localStorage.getItem('selectedPlaylistId') || 'default'`
- Backend [app.py#L440-480](../app.py#L440-L480): `/playlist` endpoint receives `playlist_id` from frontend, not global state
- **Pattern**: Never sync playlist selection from server to frontend—trust frontend's localStorage as source of truth

## Frontend Module System

ES6 modules in [static/js/](../static/js/):
- **Entry**: [main.js](../static/js/main.js) → imports all modules, `MusicPlayerApp` class
- **Core**: `api.js` (HTTP), `player.js` (playback control), `playlist.js` (queue state)
- **Features**: `search.js`, `ranking.js`, `local.js`, `playlists-management.js`
- **UI**: `ui.js` (Toast, loading), `themeManager.js`, `navManager.js`, `settingsManager.js`
- **State**: `localStorage` keys: `selectedPlaylistId`, `theme`, `language`
- **Operation Lock**: [operationLock.js](../static/js/operationLock.js) prevents concurrent API calls during drag/reorder

## Auto-Next & Track End Detection

**When current song ends** ([main.js#L410-530](../main.js)):
1. `updatePlayerUI()` detects `timeRemaining < 2.5s` + `isPlaying === true`
2. Calls `removeCurrentSongFromPlaylist()` → removes first song from "default" playlist
3. Immediately plays first song of remaining list
4. Uses `operationLock` to prevent concurrent deletions during user gestures
5. **Fallback strategy**: Tries frontend removal → backend `/next` endpoint → manual user selection

**Key detail**: Playlist deletion is intentional—tracks are auto-removed after completion to prevent replay. This differs from typical players that keep history.

## Modal Navigation Stack

[main.js#L1080-1170](../main.js) implements non-modal stack for tab switching:
- Maintains navigation history: `navigationStack = ['playlists']` (default tab)
- Back button pops stack, returns to previous tab
- Settings button is intercepted: closing settings calls `navigateBack()`
- Pattern: Modals (ranking, search, settings) overlay tab content, not replace it

**Closure issue**: Each modal cleanup must call `operationLock.release('drag')` to restore polling

## Touch Drag-Sort Implementation

[playlist.js#L350-500](../static/js/playlist.js#L350-L500):
- Long-press 300ms on drag handle to start reorder
- Move threshold 10px before drag activates (prevents accidental trigger on scroll)
- Real-time placeholder position during drag
- `operationLock.acquire('drag')` pauses status polling while dragging
- Server-side reorder via [app.py#L742-760](../app.py#L742-L760): `/playlist_reorder` uses `from_index`/`to_index`

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
- Ranking API ([app.py#L680-720](../app.py#L680-L720)) filters by time period: `all|day|week|month|quarter|year`
- Counts only plays within the period cutoff, not total count

**Auto-add pattern**: Every `/play` call with `save_to_history=True` adds to `playback_history.json` immediately. No batching.

**Gotcha**: YouTube URL transforms via yt-dlp occur AFTER history save, so history keeps original URL. Ranking search matches on original URL.

[main.py](../main.py) orchestrates interactive prompt at startup:

### MPV Output Device
```python
interactive_select_audio_device()  # Prompts for WASAPI output
                                   # Populates mpv_cmd with audio-device GUID
                                   # Auto-selects "CABLE-A Input" if found
                                   # Timeout: settings.ini [app] startup_timeout (default 15s)
                                   # Sets env var: MPV_AUDIO_DEVICE
```

**Key insight**: Device selection dialog appears BEFORE Uvicorn starts. If user doesn't input within timeout, uses defaults.