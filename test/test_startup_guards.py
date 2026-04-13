import main as clubmusic_main


class _FakeStdin:
    def __init__(self, interactive):
        self._interactive = interactive

    def isatty(self):
        return self._interactive


def test_supports_interactive_startup_prompts_respects_stdin_isatty():
    assert clubmusic_main._supports_interactive_startup_prompts(_FakeStdin(True)) is True
    assert clubmusic_main._supports_interactive_startup_prompts(_FakeStdin(False)) is False
    assert clubmusic_main._supports_interactive_startup_prompts(None) is False


def test_status_has_running_clubmusic_instance_requires_live_matching_listener():
    active_status = {
        'existing_instance_summary': 'PID=1234',
        'port_accepting': True,
        'listening_is_clubmusic': True,
    }
    missing_listener_status = {
        'existing_instance_summary': 'PID=1234',
        'port_accepting': True,
        'listening_is_clubmusic': False,
    }

    assert clubmusic_main._status_has_running_clubmusic_instance(active_status) is True
    assert clubmusic_main._status_has_running_clubmusic_instance(missing_listener_status) is False