import os
import subprocess
import sys
from pathlib import Path


def test_ai_service_startup_fails_clearly_when_token_is_missing(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text("NODE_ENV=development\n", encoding="utf-8")
    environment = os.environ.copy()
    environment.pop("AI_SERVICE_TOKEN", None)
    environment["EDUQUEST_ENV_FILE"] = str(env_file)
    environment["AI_PORT"] = "0"
    result = subprocess.run(
        [sys.executable, "run.py"],
        cwd=Path(__file__).resolve().parents[1],
        env=environment,
        capture_output=True,
        text=True,
        timeout=5,
    )
    output = f"{result.stdout}\n{result.stderr}"
    assert result.returncode != 0
    assert "AI_SERVICE_TOKEN is missing: run npm run setup:token" in output
    assert "AI_SERVICE_TOKEN=" not in output
