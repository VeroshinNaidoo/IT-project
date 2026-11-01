import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))
from app import OpenAICompatibleProvider, QuizRequest


def payload(question_text="Database indexing speeds up lookups"):
    return json.dumps({
        "title": "Source quiz",
        "questions": [{
            "question_text": question_text,
            "topic": "Databases",
            "marks": 1,
            "difficulty_level": 3,
            "explanation": "The source states that indexes speed up lookups.",
            "options": [
                {"option_text": "Database indexing", "is_correct": True},
                {"option_text": "A network cable", "is_correct": False},
            ],
        }],
    })


class FakeCompletions:
    def __init__(self, values):
        self.values = iter(values)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        value = next(self.values)
        if isinstance(value, Exception):
            raise value
        return type("R", (), {"choices": [type("C", (), {"message": type("M", (), {"content": value})()})()]})()


def client(values):
    completions = FakeCompletions(values)
    return type("Client", (), {"chat": type("Chat", (), {"completions": completions})()})(), completions


def request(count=1, text="Database indexing speeds up lookups"):
    return QuizRequest(extracted_text=text, question_count=count)


def test_base_url_is_normalized():
    fake, _ = client([payload()])
    provider = OpenAICompatibleProvider(fake, base_url=' "https://example.test/openai/chat/completions" ', api_key="k", model="m", sleep=lambda _: None)
    assert provider.base_url == "https://example.test/openai/"


def test_timeout_uses_model_fallback():
    timeout = TimeoutError("upstream timeout")
    fake, calls = client([timeout, payload()])
    provider = OpenAICompatibleProvider(fake, base_url="https://example.test/openai/", api_key="k", model="primary", retries=0, sleep=lambda _: None)
    provider.model_fallbacks = ["fallback"]
    assert provider.generate_quiz(request()).questions
    assert calls.calls[0]["model"] == "primary"
    assert calls.calls[-1]["model"] == "fallback"


def test_batching_merges_and_deduplicates():
    fake, calls = client([payload("Database indexing speeds up lookups"), payload("Database indexing speeds up lookups"), payload("Database normalization reduces redundancy")])
    provider = OpenAICompatibleProvider(fake, base_url="https://example.test/openai/", api_key="k", model="m", retries=0, sleep=lambda _: None, max_requests=3)
    result = provider.generate_quiz(request(count=2))
    assert len(result.questions) == 2
    assert len(calls.calls) == 3


def test_groundedness_drops_unsupported_question():
    unsupported = payload("Quantum teleportation proves the source claim").replace("Database indexing", "Quantum teleportation")
    supported = payload("Database indexing speeds up lookups")
    fake, _ = client([unsupported, supported])
    provider = OpenAICompatibleProvider(fake, base_url="https://example.test/openai/", api_key="k", model="m", retries=0, sleep=lambda _: None, max_requests=2)
    result = provider.generate_quiz(request())
    assert result.questions[0].question_text == "Database indexing speeds up lookups"


def test_429_retry_after_is_respected():
    class RateLimit(Exception):
        status_code = 429
        headers = {"Retry-After": "7"}

    waits = []
    fake, _ = client([RateLimit(), payload()])
    provider = OpenAICompatibleProvider(fake, base_url="https://example.test/openai/", api_key="k", model="m", retries=1, sleep=waits.append)
    provider.generate_quiz(request())
    assert 7.0 in waits


def test_timeout_is_reported_without_secret():
    fake, _ = client([TimeoutError("private-key timeout")])
    with pytest.raises(RuntimeError, match="AI generation failed") as error:
        OpenAICompatibleProvider(fake, base_url="https://example.test/openai/", api_key="private-key", model="m", retries=0, sleep=lambda _: None).generate_quiz(request())
    assert "private-key" not in str(error.value)
