import os
import inspect

from models.player import MusicPlayer


def _make_player(mpv_cmd: str) -> MusicPlayer:
    player = object.__new__(MusicPlayer)
    player.mpv_cmd = mpv_cmd
    return player


def test_build_effective_mpv_launch_cmd_applies_runtime_audio_device(monkeypatch):
    player = _make_player('mpv --idle=yes --audio-device=wasapi/{old-device}')

    monkeypatch.setenv('MPV_AUDIO_DEVICE', 'wasapi/{new-device}')
    monkeypatch.setattr(MusicPlayer, '_list_available_audio_devices', lambda self: {
        'wasapi/{new-device}': 'CABLE-B Input',
    })

    command, runtime_audio_device = player._build_effective_mpv_launch_cmd()

    assert runtime_audio_device == 'wasapi/{new-device}'
    assert command == 'mpv --idle=yes --audio-device=wasapi/{new-device}'


def test_build_effective_mpv_launch_cmd_ignores_unavailable_runtime_audio_device(monkeypatch):
    player = _make_player('mpv --idle=yes --audio-device=wasapi/{old-device}')

    monkeypatch.setenv('MPV_AUDIO_DEVICE', 'wasapi/{missing-device}')
    monkeypatch.setattr(MusicPlayer, '_list_available_audio_devices', lambda self: {
        'wasapi/{old-device}': 'Old Device',
    })

    command, runtime_audio_device = player._build_effective_mpv_launch_cmd()

    assert runtime_audio_device == ''
    assert command == 'mpv --idle=yes --audio-device=wasapi/{old-device}'
    assert os.environ.get('MPV_AUDIO_DEVICE') is None


def test_startup_logging_uses_effective_mpv_launch_command_variable():
    player_source = inspect.getsource(MusicPlayer)

    assert 'logger.info(f"尝试启动 mpv: {mpv_launch_cmd}")' in player_source
    assert 'logger.info(f"尝试启动 mpv: {self.mpv_cmd}")' not in player_source