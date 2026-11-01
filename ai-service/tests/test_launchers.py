from pathlib import Path


DESKTOP = Path(r"C:\Users\User\Desktop")


def test_check_launcher_has_visible_dry_run_and_pause():
    text = (DESKTOP / "Check EduQuest AI.bat").read_text(encoding="utf-8")
    assert "--dry-run" in text
    assert "pause" in text.lower()
    assert "ai-service/tools/live_check.py" in text
    assert "AI_MODEL is empty" in text


def test_run_launcher_has_visible_dry_run_and_pause():
    text = (DESKTOP / "Run EduQuest.bat").read_text(encoding="utf-8")
    assert "--dry-run" in text
    assert "pause" in text.lower()
    assert "Start-EduQuest.ps1" in text
    assert "IT project build" in text
