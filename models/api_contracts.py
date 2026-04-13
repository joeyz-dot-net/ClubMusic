from typing import Any, Literal

from fastapi import Form, Request
from pydantic import BaseModel, Field


async def _read_json_or_form_payload(request: Request) -> dict[str, Any]:
    content_type = (request.headers.get("content-type") or "").lower()
    if "application/json" in content_type:
        payload = await request.json()
        return payload if isinstance(payload, dict) else {}

    form = await request.form()
    return {key: value for key, value in form.items()}


class SongSnapshot(BaseModel):
    url: str | None = None
    title: str | None = None
    name: str | None = None
    type: str | None = None
    duration: float | None = None
    thumbnail_url: str | None = None
    artist: str | None = None
    video_id: str | None = None

    class Config:
        extra = "allow"


class MpvStateSnapshot(BaseModel):
    paused: bool | None = None
    time_pos: float | None = None
    duration: float | None = None
    volume: float | None = None


class PlayRequestForm(BaseModel):
    url: str = ""
    title: str = ""
    type: str = "local"
    stream_format: str = "mp3"
    duration: float = 0.0

    @classmethod
    def as_form(
        cls,
        url: str = Form(""),
        title: str = Form(""),
        type: str = Form("local"),
        stream_format: str = Form("mp3"),
        duration: float = Form(0.0),
    ) -> "PlayRequestForm":
        return cls(
            url=url,
            title=title,
            type=type,
            stream_format=stream_format,
            duration=duration,
        )


class SeekRequestForm(BaseModel):
    percent: float = 0.0

    @classmethod
    def as_form(cls, percent: float = Form(0.0)) -> "SeekRequestForm":
        return cls(percent=percent)


class PitchShiftRequest(BaseModel):
    semitones: int = 0


class PlaySuccessResponse(BaseModel):
    status: Literal["OK"]
    message: str
    current: SongSnapshot = Field(default_factory=SongSnapshot)
    current_index: int


class PlayerStatusResponse(BaseModel):
    status: Literal["OK"]
    current_meta: SongSnapshot = Field(default_factory=SongSnapshot)
    current_playlist_id: str
    current_playlist_name: str
    current_index: int
    playlist_updated_at: float
    loop_mode: int
    shuffle_mode: bool
    pitch_shift: int
    mpv_state: MpvStateSnapshot = Field(default_factory=MpvStateSnapshot)
    server_time: float | None = None


class PauseToggleResponse(BaseModel):
    status: Literal["OK"]
    paused: bool


class SeekResponse(BaseModel):
    status: Literal["OK"]
    position: float | None = None
    percent: float | None = None


class LoopModeResponse(BaseModel):
    status: Literal["OK"]
    loop_mode: int


class ShuffleModeResponse(BaseModel):
    status: Literal["OK"]
    shuffle_mode: bool


class PitchShiftResponse(BaseModel):
    status: Literal["OK"]
    pitch_shift: int


class StatusMessageResponse(BaseModel):
    status: Literal["OK"]
    message: str


class ErrorResponse(BaseModel):
    status: Literal["ERROR"]
    error: str


class HistoryEntrySnapshot(BaseModel):
    url: str | None = None
    title: str | None = None
    is_local: bool | None = None
    thumbnail_url: str | None = None
    ts: float | None = None
    type: str | None = None

    class Config:
        extra = "allow"


class PlaybackHistoryResponse(BaseModel):
    status: Literal["OK"]
    history: list[HistoryEntrySnapshot] = Field(default_factory=list)


class PlaybackHistoryMergedResponse(PlaybackHistoryResponse):
    count: int


class HistoryAddRequest(BaseModel):
    url: str = ""
    title: str = ""
    type: str = "local"
    thumbnail_url: str = ""

    @classmethod
    async def from_request(cls, request: Request) -> "HistoryAddRequest":
        payload = await _read_json_or_form_payload(request)
        return cls(
            url=payload.get("url", ""),
            title=payload.get("title", ""),
            type=payload.get("type", "local"),
            thumbnail_url=payload.get("thumbnail_url", ""),
        )


class HistoryDeleteRequest(BaseModel):
    url: str = ""

    @classmethod
    async def from_request(cls, request: Request) -> "HistoryDeleteRequest":
        payload = await _read_json_or_form_payload(request)
        return cls(url=payload.get("url", ""))


class VolumeRequestForm(BaseModel):
    value: str = ""

    @classmethod
    def as_form(cls, value: str = Form("")) -> "VolumeRequestForm":
        return cls(value=value)


class VolumeResponse(BaseModel):
    status: Literal["OK"]
    volume: int


class VolumeDefaultsResponse(BaseModel):
    status: Literal["OK"]
    local_volume: int


class RefreshVideoUrlResponse(BaseModel):
    status: Literal["OK"]
    video_url: str


class RoomInitRequest(BaseModel):
    room_id: str = ""
    default_volume: int = 80


class RoomStatusSnapshot(BaseModel):
    room_id: str
    ipc_pipe: str
    pcm_pipe: str
    exists: bool
    mpv_running: bool
    pipe_exists: bool
    bot_ready: bool
    current_playlist_id: str
    current_index: int
    queue_length: int
    playlist_updated_at: float
    current_meta: SongSnapshot = Field(default_factory=SongSnapshot)
    last_activity: float


class RoomErrorResponse(BaseModel):
    status: Literal["error"]
    message: str
    room_id: str | None = None
    ipc_pipe: str | None = None
    pcm_pipe: str | None = None
    exists: bool | None = None
    mpv_running: bool | None = None
    pipe_exists: bool | None = None
    bot_ready: bool | None = None
    current_playlist_id: str | None = None
    current_index: int | None = None
    queue_length: int | None = None
    playlist_updated_at: float | None = None
    current_meta: SongSnapshot | None = None
    last_activity: float | None = None


class RoomInitResponse(RoomStatusSnapshot):
    status: Literal["ok"]
    existed: bool


class RoomStatusResponse(RoomStatusSnapshot):
    status: Literal["ok"]


class RoomDestroyResponse(BaseModel):
    status: Literal["ok"]


class RoomListResponse(BaseModel):
    status: Literal["ok"]
    rooms: list[RoomStatusSnapshot] = Field(default_factory=list)
    count: int
    max: int


class PlaylistNameRequest(BaseModel):
    name: str = ""


class PlaylistSongForm(BaseModel):
    url: str = ""
    title: str = ""
    type: str = "local"
    thumbnail_url: str = ""

    @classmethod
    def as_form(
        cls,
        url: str = Form(""),
        title: str = Form(""),
        type: str = Form("local"),
        thumbnail_url: str = Form(""),
    ) -> "PlaylistSongForm":
        return cls(url=url, title=title, type=type, thumbnail_url=thumbnail_url)


class IndexRequestForm(BaseModel):
    index: int = -1

    @classmethod
    def as_form(cls, index: int = Form(-1)) -> "IndexRequestForm":
        return cls(index=index)


class PlaylistAddRequest(BaseModel):
    playlist_id: str | None = None
    song: SongSnapshot
    insert_index: int | None = None


class PlaylistReorderRequest(BaseModel):
    from_index: int | None = None
    to_index: int | None = None
    playlist_id: str | None = None


class PlaylistUpdateRequest(BaseModel):
    name: str = ""


class PlaylistItemSummary(BaseModel):
    id: str
    name: str
    count: int
    songs: list[SongSnapshot | str] = Field(default_factory=list)
    is_room: bool | None = None
    current_playing_index: int | None = None


class PlaylistSongsResponse(BaseModel):
    status: Literal["OK"]
    songs: list[SongSnapshot | str] = Field(default_factory=list)
    playlist_id: str
    playlist_name: str


class FileTreeResponse(BaseModel):
    status: Literal["OK"]
    tree: Any


class PlaylistsListResponse(BaseModel):
    status: Literal["OK"]
    playlists: list[PlaylistItemSummary] = Field(default_factory=list)


class PlaylistCreateRestResponse(BaseModel):
    id: str
    name: str
    songs: list[SongSnapshot | str] = Field(default_factory=list)


class PlaylistCreateResponse(BaseModel):
    status: Literal["OK"]
    playlist_id: str
    name: str


class PlaylistQueryResponse(BaseModel):
    status: Literal["OK"]
    playlist: list[SongSnapshot] = Field(default_factory=list)
    playlist_id: str
    playlist_name: str
    current_index: int


class PlaylistSwitchInfo(BaseModel):
    id: str
    name: str
    count: int


class PlaylistSwitchResponse(BaseModel):
    status: Literal["OK"]
    playlist: PlaylistSwitchInfo


class PlaylistRenameData(BaseModel):
    name: str


class PlaylistRenameResponse(BaseModel):
    status: Literal["OK"]
    message: str
    data: PlaylistRenameData


class SearchSongRequest(BaseModel):
    query: str = ""
    max_results: int | None = None


class SearchSongResponse(BaseModel):
    status: Literal["OK"]
    local: list[Any] = Field(default_factory=list)
    youtube: list[Any] = Field(default_factory=list)
    local_max_results: int
    youtube_max_results: int


class YouTubeSearchConfigResponse(BaseModel):
    local_max_results: int
    page_size: int
    max_results: int


class SearchYoutubeRequestForm(BaseModel):
    query: str = ""

    @classmethod
    def as_form(cls, query: str = Form("")) -> "SearchYoutubeRequestForm":
        return cls(query=query)


class SearchYoutubeResponse(BaseModel):
    status: Literal["OK"]
    results: Any


class DirectorySongsRequest(BaseModel):
    directory: str = ""


class DirectorySongsResponse(BaseModel):
    status: Literal["OK"]
    directory: str
    songs: list[SongSnapshot] = Field(default_factory=list)
    count: int


class VersionResponse(BaseModel):
    status: Literal["OK"]
    version: str


class UserSettingsData(BaseModel):
    theme: str
    language: str


class UserSettingsResponse(BaseModel):
    status: Literal["OK"]
    data: UserSettingsData


class UserSettingsUpdateRequest(BaseModel):
    theme: str | None = None
    language: str | None = None

    class Config:
        extra = "allow"


class SettingsValueRequest(BaseModel):
    value: Any = None


class SettingsMutationResponse(BaseModel):
    status: Literal["OK"]
    message: str
    data: dict[str, Any]


class SettingsSchemaResponse(BaseModel):
    status: Literal["OK"]
    schema: dict[str, Any]


class UIConfigData(BaseModel):
    youtube_controls: bool = True
    expand_button: bool = True
    url_cache_enabled: bool = True


class UIConfigRequest(BaseModel):
    youtube_controls: bool = True
    expand_button: bool = True
    url_cache_enabled: bool = True


class UIConfigResponse(BaseModel):
    status: Literal["OK"]
    data: UIConfigData


class UIConfigMutationResponse(BaseModel):
    status: Literal["OK"]
    message: str
    data: UIConfigData


class DiagnosticInstanceStatusResponse(BaseModel):
    status: Literal["OK"]
    data: dict[str, Any]


class DiagnosticYtDlpResponse(BaseModel):
    status: Literal["OK"]
    yt_dlp_path: str
    exists: bool
    executable: bool
    mpv_running: bool
    mpv_cmd: str | None = None
    env_yt_dlp_path: str
    version: str | None = None
    working: bool | None = None
    test_error: str | None = None