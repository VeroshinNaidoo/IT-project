from pathlib import Path


DESKTOP = Path(r"C:\Users\User\Desktop")


def test_check_launcher_has_visible_dry_run_and_pause():
    text = (DESKTOP / "Check EduQuest AI.bat").read_text(encoding="utf-8")
    assert "--dry-run" in text
    assert "pause" in text.lower()
    assert "check-ai.ps1" in text
    assert "AI_MODEL is empty" in (Path(__file__).parents[2] / "scripts" / "check-ai.ps1").read_text(encoding="utf-8")


def test_run_launcher_has_visible_dry_run_and_pause():
    text = (DESKTOP / "Run EduQuest.bat").read_text(encoding="utf-8")
    assert "--dry-run" in text
    assert "pause" in text.lower()
    assert "Start-EduQuest.ps1" in text
    assert "IT project build" in text


def test_script_file_invocation_is_safe_for_paths_with_spaces():
    root = Path(__file__).parents[2]
    start = (root / "Start-EduQuest.ps1").read_text(encoding="utf-8")
    check = (root / "scripts" / "check-ai.ps1").read_text(encoding="utf-8")
    for text in (start, check):
        assert "$args[0]" not in text
        assert "powershell -Command" not in text
        assert "Set-Location -LiteralPath" in text
    assert "IT project build" in (DESKTOP / "Run EduQuest.bat").read_text(encoding="utf-8")


def test_start_script_dry_run_is_a_short_lived_smoke_test():
    import subprocess

    root = Path(__file__).parents[2]
    completed = subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(root / "Start-EduQuest.ps1"), "-DryRun"],
        cwd=root,
        capture_output=True,
        text=True,
        timeout=15,
        check=True,
    )
    assert str(root) in completed.stdout
    assert "Would start:" in completed.stdout
