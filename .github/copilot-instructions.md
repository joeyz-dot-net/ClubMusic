# ClubMusic — AI Agent Guide

**Full-stack web music player**: FastAPI backend + ES6 frontend + MPV IPC engine.  
**Key distinction**: Trilingual (zh/en/zh-TW), user-isolation via localStorage, event-driven auto-play, Windows/PyInstaller-optimized.

> **Last Updated**: 2026-02-28 | **Focus**: Modular routers, dependency injection, WebSocket push, RoomPlayer, backend-controlled auto-play, API parity patterns, singleton architecture

## ⚠️ Critical Rules (Must Follow)

| Rule | Why & Example |
|------|---------------|
| **API Sync** | Backend routers (`routers/*.py`) + Frontend [static/js/api.js](../static/js/api.js) must match exactly. New route? Update BOTH. Field rename? Check both. Missing sync = silent failures. |
| **FormData vs JSON** | **Player control** (`/play`, `/seek`, `/volume`, `/playlist_remove`): use `await request.form()`. **Data CRUD** (`/playlists`, `/playlist_reorder`, `/search_song`): use `await request.json()`. Wrong type = 400 errors. |
| **Global Singletons** | `PLAYER` and `PLAYLISTS_MANAGER` are initialized in [routers/state.py](../routers/state.py). Access via dependency injection (`routers/dependencies.py`) in routers—never create new instances. Duplication = state corruption. |
| **Persistence** | Call `PLAYLISTS_MANAGER.save()` after ANY playlist mutation. Forgetting = data loss on restart. |
| **User Isolation** | Playlist selection stored in browser `localStorage.selectedPlaylistId`, NOT backend. Each tab/browser independent. Backend only validates existence via `/playlists/{id}/switch`. |
| **UTF-8 Windows** | Every `.py` entry point needs UTF-8 wrapper (see [models/__init__.py#L6-11](../models/__init__.py)). Missing = Chinese chars garbled in logs. |
| **i18n Completeness** | Always add `zh`, `en`, and `zh-TW` keys in [static/js/i18n.js](../static/js/i18n.js) when adding UI text. Missing lang = undefined strings. |
| **Default Playlist** | Never delete or rename the `default` playlist (ID: `"default"`). Backend assumes it always exists for auto-play logic. |

## Architecture & Data Flow

```
Browser ←WebSocket /ws→ FastAPI (app.py → routers/*.py) ←DI→ Singletons ←→ MPV (\\.\pipe\mpv-pipe)
   │                           │                                              ↑
   ├── ES6 modules ────────────┤── routers/state.py (global singletons)       │
   │   (WebSocket + polling)   │── routers/dependencies.py (DI providers)     │
   └── localStorage            │── routers/player.py, playlist.py, ...        │
       (selectedPlaylistId,    │                                              │
        theme, language)       └── models/*.py                                │
                                    ├── player.py (event listener thread)     │
                                    │   └─ handle_playback_end()              │
                                    ├── backup.py (timed backup thread)       │
                                    ├── url_cache.py (YouTube URL prefetch)   │
                                    ├── pcm_pipe.py (PCM relay for rooms)     │
                                    └── playlists.json, playback_history.json
```

**Key Insight**: Auto-next is 100% backend-driven via MPV event listener thread in [models/player.py](../models/player.py). Frontend reflects state via WebSocket push (`/ws`) and `/status` polling fallback.

## Critical Patterns & Gotchas

### Auto-Play Mechanism (Backend-Controlled)
**Location**: [models/player.py](../models/player.py) — `handle_playback_end()`

1. MPV event listener thread detects `end-file` event
2. Backend automatically:
   - Deletes current song from default playlist (by URL match)
   - Plays next song in queue (index 0 after deletion)
   - Updates `PLAYER.current_index` and `PLAYER.current_meta`
3. Frontend reads state changes via WebSocket push and `/status` polling fallback

**Rule**: Never implement auto-next logic in frontend. Backend owns this completely.

### Song Insertion Pattern ("Add Next" feature)
**Location**: [routers/playlist.py](../routers/playlist.py) — `/playlist_add` endpoint

```python
# Calculate insert position: don't interrupt current song, add to "next" position
current_index = PLAYER.current_index  # Maintained by /play endpoint
insert_index = current_index + 1 if current_index >= 0 else 1
playlist.songs.insert(insert_index, song_dict)
```

**Invariants**:
- Position 0 = currently playing (never modify unless stopping playback)
- `current_index` updated by `/play` endpoint, NOT by add/remove operations
- After deletion: if `current_index >= len(songs)`, reset to `max(-1, len(songs) - 1)`

### PyInstaller Resource Access
**Pattern**: Use `_get_resource_path()` wrapper in [routers/state.py](../routers/state.py)

```python
# Development: uses source directory
# Packaged: uses sys._MEIPASS temp directory
static_dir = _get_resource_path("static")
app.mount("/static", StaticFiles(directory=static_dir))
```

**External tools** (`mpv.exe`, `yt-dlp.exe`) live next to exe, NOT in `_MEIPASS`.

### Cover Art Retrieval
**Endpoint**: `/cover/{file_path:path}` in [routers/media.py](../routers/media.py)

Priority order:
1. Embedded cover (extracted via `mutagen`, returned as bytes)
2. Directory cover files (`cover.jpg`, `folder.jpg`, `albumart.jpg`)
3. Placeholder (`static/images/preview.png`)

**Note**: Never saves extracted covers to disk—streams bytes directly to avoid temp file clutter.

### YouTube Thumbnail Generation
**Pattern**: Auto-generate from video ID when missing

```python
if song_type == "youtube" and not thumbnail_url:
    # Extract video ID from URL
    video_id = extract_video_id(url)  # Regex match
    thumbnail_url = f"https://img.youtube.com/vi/{video_id}/default.jpg"
```

Applies to: `/playlist_add`, `/playlists/{id}/add_next`, YouTube search results.

### Frontend State Management
**Location**: [static/js/main.js](../static/js/main.js)

```javascript
class MusicPlayerApp {
    constructor() {
        // User-isolated: each browser/tab maintains own playlist selection
        this.currentPlaylistId = localStorage.getItem('selectedPlaylistId') || 'default';
        
        // State tracking: only log when values change (reduce log spam)
        this.lastLoopMode = null;
        this.lastVolume = null;
        this.lastPlaybackStatus = null;
    }
}
```

**Rule**: All user preferences (theme, language, volume) stored in `localStorage`, NOT backend.

### Router Architecture (v1.3.0 Refactoring)
**Location**: [routers/](../routers/)

`app.py` is now a thin shell that:
1. Imports `routers.state` (triggers singleton initialization)
2. Creates FastAPI app with middleware
3. Mounts 8 routers via `app.include_router()`
4. Handles lifecycle (startup: backup thread, auto-fill; shutdown: MPV cleanup)

**Singleton access in routers**: Via dependency injection (`Depends(get_player)` etc.)
- [routers/dependencies.py](../routers/dependencies.py): DI provider functions
- [routers/state.py](../routers/state.py): Global singleton instances + WebSocket manager + RoomPlayer pool

**Router modules**:

| Router | File | Endpoints |
|--------|------|-----------|
| player | [routers/player.py](../routers/player.py) | /play, /next, /prev, /status, /pause, /seek, /loop, /pitch |
| playlist | [routers/playlist.py](../routers/playlist.py) | /, /playlist_*, /playlists/*, /tree |
| search | [routers/search.py](../routers/search.py) | /search_song, /search_youtube, /get_directory_songs |
| history | [routers/history.py](../routers/history.py) | /playback_history*, /song_add_to_history |
| media | [routers/media.py](../routers/media.py) | /cover/*, /video_proxy, /volume |
| settings | [routers/settings.py](../routers/settings.py) | /settings*, /ui-config, /diagnostic/* |
| websocket | [routers/websocket.py](../routers/websocket.py) | /ws |
| room | [routers/room.py](../routers/room.py) | /room/init, /room/{id}, /room/{id}/status |

### WebSocket Real-Time Push
**Location**: [routers/websocket.py](../routers/websocket.py) + [routers/state.py](../routers/state.py)

- Client connects to `/ws`, receives immediate state snapshot
- Server broadcasts state on playback events via `_broadcast_from_thread()` (thread-safe, uses `asyncio.run_coroutine_threadsafe`)
- Client sends "ping" heartbeat every 20s to keep connection alive
- Frontend uses WebSocket as primary channel, falls back to `/status` polling

**ConnectionManager**: [routers/state.py](../routers/state.py) — manages active WebSocket connections, auto-cleans dead connections on broadcast.

### Multi-Room RoomPlayer
**Location**: [routers/room.py](../routers/room.py) + [routers/state.py](../routers/state.py) + [models/pcm_pipe.py](../models/pcm_pipe.py)

- POST `/room/init` creates a separate MusicPlayer + MPV process per room
- Each room has its own Named Pipe (`\\.\pipe\mpv-{room_id}`) and PCM relay pipe
- Room pool managed in `ROOM_PLAYERS` dict with thread lock
- `get_player_for_pipe()` routes requests to correct player based on `?pipe=` query param

### Automated Backup
**Location**: [models/backup.py](../models/backup.py)

- `BackupManager` reads config from `settings.ini [backup]`
- Daemon thread copies `playlists.json` and `playback_history.json` at configured interval
- Auto-deletes backups older than `keep_days`
- Started in `app.py` lifespan handler

## ES6 Module System & Frontend Architecture

### Module Structure
**Location**: [static/js/](../static/js/) — All frontend code uses ES6 modules with explicit exports

**Pattern**: Each module exports singleton instances or utility functions:

```javascript
// api.js - API client
export class MusicAPI { /* ... */ }
export const api = new MusicAPI();

// player.js - Player state & controls
export class Player { /* ... */ }
export const player = new Player();

// playlist.js - Playlist management
export class PlaylistManager { /* ... */ }
export const playlistManager = new PlaylistManager();
export function renderPlaylistUI({ container, onPlay, currentMeta }) { /* ... */ }
```

**Key Modules** (always import from these):

| Module | Export | Purpose |
|--------|--------|---------|
| [api.js](../static/js/api.js) | `api` | All backend API calls—**must mirror routers/*.py** |
| [player.js](../static/js/player.js) | `player` | Playback state, controls, event emitter |
| [playlist.js](../static/js/playlist.js) | `playlistManager`, `renderPlaylistUI` | Current playlist CRUD |
| [playlists-management.js](../static/js/playlists-management.js) | `playlistsManagement` | Multi-playlist UI modal |
| [i18n.js](../static/js/i18n.js) | `i18n` | Translation system—auto-detects browser language |
| [themeManager.js](../static/js/themeManager.js) | `themeManager` | Theme switching (dark/light) |
| [settingsManager.js](../static/js/settingsManager.js) | `settingsManager` | Settings panel & localStorage persistence |
| [volume.js](../static/js/volume.js) | `volumeControl` | Volume slider with backend sync |
| [search.js](../static/js/search.js) | `searchManager` | Search UI (local + YouTube) |
| [local.js](../static/js/local.js) | `localFiles` | Local file tree browser |
| [ui.js](../static/js/ui.js) | `Toast`, `loading`, `formatTime` | UI utilities |
| [ktv.js](../static/js/ktv.js) | `ktv` | KTV video sync (YouTube IFrame + MPV audio) |
| [playLock.js](../static/js/playLock.js) | `playPreparationLock` | Play preparation lock — prevents duplicate YouTube loads |
| [unavailable.js](../static/js/unavailable.js) | `unavailableSongs` | Unavailable song URL tracking (session-only) |
| [userSession.js](../static/js/userSession.js) | `userSession` | Cookie-based anonymous user identification |
| [operationLock.js](../static/js/operationLock.js) | `operationLock` | Operation lock (pauses polling during drag/edit) |
| [templates.js](../static/js/templates.js) | `buildTrackItemHTML` | Track list item HTML template builder |
| [utils.js](../static/js/utils.js) | `escapeHTML`, `thumbnailManager` | Utility functions (XSS protection, thumbnails) |
| [navManager.js](../static/js/navManager.js) | `navManager` | Navigation bar i18n management |

**Import Pattern**:
```javascript
// main.js - Entry point
import { api } from './api.js';
import { player } from './player.js';
import { playlistManager, renderPlaylistUI } from './playlist.js';
import { i18n } from './i18n.js';
// ... use singleton instances directly
```

**Critical Rule**: Never instantiate classes directly—always use exported singletons. Multiple instances = state desync.

## Developer Workflows

### Development Server
```powershell
# Interactive audio device selection + starts FastAPI
python run.py

# Direct start (uses device from settings.ini)
python app.py
```

**Port**: 9000 (default, configurable in [settings.ini](../settings.ini)).

**What happens**:
- `main.py`: Enumerates audio devices → updates `settings.ini` → launches `app.py` (unified entry point for dev and PyInstaller)
- `run.py`: Thin wrapper that imports and calls `main.main()` (kept for backward compatibility)
- `app.py`: Mounts routers → starts MPV event listener → starts backup thread → runs Uvicorn on configured port
- Frontend: Connects via WebSocket for real-time updates, falls back to `/status` polling

### VS Code Tasks (Available)

| Task | Command | Purpose |
|------|---------|---------|
| **Build** | `.\build_exe.bat` | 📦 Creates `dist/ClubMusic.exe` (local build only) |
| **Deploy Remote** | `.\.vscode\deploy.ps1` | 🚀 Deploys exe to `\\B560\code\ClubMusic` (with backup) |
| **Build & Deploy** | Sequential combo | 🔨➡️🚀 Builds then deploys (default task: `Ctrl+Shift+B`) |

**Access**: `Ctrl+Shift+P` → "Run Task" → Select task name

### Build Windows Executable
```powershell
# Via VS Code task (recommended)
# Ctrl+Shift+P → "Run Task" → "Build"

# Or manual
.\build_exe.bat
```

**Output**: `dist/ClubMusic.exe` (single-file bundle, ~150MB).  
**Spec file**: [app.spec](../app.spec) — controls PyInstaller bundling.

**Build process** ([build_exe.bat](../build_exe.bat)):
1. Validates PyInstaller installation (`pip install pyinstaller` if missing)
2. Cleans `build/` and `dist/` directories
3. Installs/verifies `requirements.txt` dependencies
4. Runs `python -m PyInstaller app.spec --clean --noconfirm`
5. Bundles all Python code, dependencies, and static assets into `_MEIPASS` temp dir

**Critical**: External tools (`bin/mpv.exe`, `bin/yt-dlp.exe`) must exist alongside the exe—they're NOT bundled into `_MEIPASS`. These are resolved via `_get_app_dir()` in [models/player.py](../models/player.py).

**Entry Point**: [main.py](../main.py) (not app.py) — unified entry point for both development (`python main.py`) and PyInstaller packaging. `run.py` is a thin wrapper for backward compatibility.

### Deploy to Remote Server
```powershell
# Via VS Code task
# Ctrl+Shift+P → "Run Task" → "Deploy Remote"

# Or manual
.\.vscode\deploy.ps1
```

**Target**: `\\B560\code\ClubMusic` (network share)  
**Backup**: Auto-creates timestamped backups in `\\B560\code\ClubMusic_backup` before deployment

**Process** ([.vscode/deploy.ps1](../.vscode/deploy.ps1)):
1. Verifies `dist/ClubMusic.exe` exists (fails if not built)
2. Creates backup directory if missing: `\\B560\code\ClubMusic_backup`
3. Backs up existing exe with timestamp: `ClubMusic_20260103_143022.exe`
4. Copies new exe to remote: `\\B560\code\ClubMusic\ClubMusic.exe`
5. Prints deployment summary with paths and status

**Error Handling**: Uses PowerShell `$ErrorActionPreference = 'Stop'` — fails fast on any error.

**Build & Deploy (Sequential)**:
```powershell
# Via VS Code task (runs Build → Deploy in order)
# Ctrl+Shift+P → "Run Task" → "Build & Deploy"
```

### Configuration
**File**: [settings.ini](../settings.ini)

Key settings:
- `music_dir`: Root for local music library
- `mpv_cmd`: Full command with IPC pipe path (`\\.\pipe\mpv-pipe`)
- `allowed_extensions`: `.mp3,.wav,.flac,.aac,.m4a`
- `local_volume`: Default volume (0-100)
- `playback_history_max`: Max history entries before trimming

**Reload**: Requires app restart. No hot-reload.

### Debugging
**Console**: [static/js/debug.js](../static/js/debug.js) — press `` ` `` (backtick) to toggle debug panel.
**Logs**: File-based logs in `logs/` directory (daily rotation, 7-day retention). Also stdout in dev mode.

## High-Value Files (Read These First)

| File | Purpose |
|------|---------|
| [app.py](../app.py) | FastAPI app shell — router mounting, lifecycle, middleware |
| [routers/state.py](../routers/state.py) | Global singletons, WebSocket manager, RoomPlayer pool |
| [routers/dependencies.py](../routers/dependencies.py) | Dependency injection providers for all routers |
| [models/player.py](../models/player.py) | MPV lifecycle, event listener, playback history, auto-next logic |
| [models/playlists.py](../models/playlists.py) | Multi-playlist model, persistence (`playlists.json`) |
| [models/song.py](../models/song.py) | Song classes (LocalSong, StreamSong), yt-dlp wrappers |
| [static/js/api.js](../static/js/api.js) | Frontend API wrapper—**must mirror routers/*.py** |
| [static/js/main.js](../static/js/main.js) | App initialization, state management, polling loop |
| [static/js/i18n.js](../static/js/i18n.js) | Translations (zh/en/zh-TW)—add all languages for new strings |

## Common Mistakes & How to Avoid

| Mistake | How to Detect | Fix |
|---------|---------------|-----|
| API mismatch | 400 errors, missing fields in response | Compare `routers/*.py` route with [static/js/api.js](../static/js/api.js) method |
| Forgot `save()` | Playlist changes lost on restart | Add `PLAYLISTS_MANAGER.save()` after mutation |
| Wrong payload type | "form required" or empty request body | Check endpoint in `routers/*.py`: FormData vs JSON |
| Duplicated singleton | State out of sync, missing songs | Always use DI via `Depends()` in routers, or access from `routers.state` |
| Frontend auto-next | Double-play, skipped songs | Remove frontend logic; backend owns auto-next |
| Missing i18n key | "undefined" in UI | Add to `zh`, `en`, and `zh-TW` in [static/js/i18n.js](../static/js/i18n.js) |
| PyInstaller path issue | FileNotFoundError in packaged exe | Use `_get_resource_path()` for bundled assets |

## API Design Conventions

### FormData Endpoints (Player Control)
```python
# In routers/player.py
@router.post("/play")
async def play(request: Request, player: MusicPlayer = Depends(get_player)):
    form = await request.form()
    url = form.get("url")
    # ...
```

**Frontend**:
```javascript
async play(url, title, type = 'local') {
    const formData = new FormData();
    formData.append('url', url);
    formData.append('title', title);
    formData.append('type', type);
    return this.postForm('/play', formData);
}
```

### JSON Endpoints (Data CRUD)
```python
# In routers/playlist.py
@router.post("/playlist_add")
async def add_to_playlist(request: Request, player: MusicPlayer = Depends(get_player)):
    data = await request.json()
    playlist_id = data.get("playlist_id")
    # ...
```

**Frontend**:
```javascript
async addToPlaylist(data) {
    return this.post('/playlist_add', data);
}
```

## Code Examples

### Adding a New Endpoint

**1. Backend** (in appropriate `routers/*.py`):
```python
from fastapi import Depends
from routers.dependencies import get_player

@router.post("/my_endpoint")
async def my_endpoint(request: Request, player: MusicPlayer = Depends(get_player)):
    data = await request.json()  # or request.form()
    # ... logic using injected player ...
    return {"status": "OK", "data": result}
```

**2. Frontend** ([static/js/api.js](../static/js/api.js)):
```javascript
async myEndpoint(data) {
    return this.post('/my_endpoint', data);
}
```

**3. Usage** (in UI module):
```javascript
import { api } from './api.js';

const result = await api.myEndpoint({ key: value });
if (result.status === "OK") {
    // handle success
}
```

### Modifying Playlist
```python
playlist = PLAYLISTS_MANAGER.get_playlist(playlist_id)
playlist.songs.append(song_dict)
playlist.updated_at = time.time()
PLAYLISTS_MANAGER.save()  # ← CRITICAL: don't forget
```

### Adding i18n String
**File**: [static/js/i18n.js](../static/js/i18n.js)

```javascript
const translations = {
    zh: {
        'my.new.key': '我的新文本',
        // ...
    },
    en: {
        'my.new.key': 'My New Text',
        // ...
    },
    'zh-TW': {
        'my.new.key': '我的新文本',
        // ...
    }
};
```

**Usage**:
```javascript
import { i18n } from './i18n.js';
const text = i18n.t('my.new.key');
```

## Testing & Verification

### Quick Checks After Changes
1. **API change**: Test both endpoints (curl/Postman) AND frontend UI
2. **Playlist mutation**: Restart app → verify `playlists.json` persisted
3. **Auto-next**: Play song to end → verify next song plays automatically
4. **Multi-language**: Switch language in settings → all text updates
5. **PyInstaller**: Build exe → run → verify paths resolve correctly

### Manual Test Scenarios
- **User isolation**: Open two browser tabs → select different playlists → verify independent
- **YouTube search**: Search "test" → add to playlist → verify thumbnail shows
- **Cover art**: Play local MP3 → verify cover displays (embedded or folder)
- **Loop modes**: Toggle loop (0→1→2→0) → verify behavior matches mode

## Dependencies & External Tools

### Python Requirements ([requirements.txt](../requirements.txt))
```
fastapi         # Web framework
uvicorn         # ASGI server
python-multipart # FormData support
psutil          # Process management
requests        # HTTP client
Pillow          # Image processing
yt-dlp          # YouTube download
mutagen         # Audio metadata extraction
pyinstaller     # Exe packaging
opencc-python-reimplemented  # Traditional/Simplified Chinese conversion
```

### External Binaries (required in production)
- **MPV** (`bin/mpv.exe`): Media player with IPC support
- **yt-dlp** (`bin/yt-dlp.exe`): YouTube video extraction
- Must exist alongside `ClubMusic.exe` in deployment

## Questions & Feedback

If any section is unclear or you need more detail on:
- Specific endpoint patterns (e.g., YouTube playlist extraction)
- Frontend module interactions (e.g., player ↔ playlist manager)
- MPV IPC command examples
- Error handling conventions
- Logging patterns

...please ask! I'll expand those sections with concrete examples from the codebase.
