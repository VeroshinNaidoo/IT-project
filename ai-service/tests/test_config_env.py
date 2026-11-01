import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))
from config import read_env_file


def test_env_parser_trims_spaces_quotes_and_crlf(tmp_path):
    path = tmp_path / ".env"
    path.write_bytes(b'AI_MODEL = " llama3.2:1b "\r\nAI_PROVIDER=openai_compatible\r\n')
    values = read_env_file(path)
    assert values["AI_MODEL"] == "llama3.2:1b"
    assert values["AI_PROVIDER"] == "openai_compatible"


def test_env_parser_removes_utf8_bom(tmp_path):
    path = tmp_path / ".env"
    path.write_text("AI_MODEL='llama3.1:8b'\n", encoding="utf-8-sig")
    assert read_env_file(path)["AI_MODEL"] == "llama3.1:8b"


def test_env_parser_preserves_blank_value_as_blank(tmp_path):
    path = tmp_path / ".env"
    path.write_text("AI_MODEL=   \n", encoding="utf-8")
    assert read_env_file(path)["AI_MODEL"] == ""
