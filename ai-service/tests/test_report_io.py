import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from tools.report_io import write_report


def test_write_report_creates_missing_parent_directories(tmp_path):
    target = tmp_path / "missing" / "quality" / "review.md"
    write_report(target, "verified")
    assert target.read_text(encoding="utf-8") == "verified"
