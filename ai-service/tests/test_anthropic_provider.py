import json
import sys
from pathlib import Path
import pytest
sys.path.insert(0, str(Path(__file__).parents[1]))
from app import AnthropicProvider, OpenAIProvider, QuizRequest


class Part:
    def __init__(self, text): self.text = text


class Message:
    def __init__(self, text): self.content = [Part(text)]


class FakeMessages:
    def __init__(self, responses): self.responses = iter(responses); self.calls = 0
    def create(self, **kwargs):
        self.calls += 1
        response = next(self.responses)
        if isinstance(response, Exception): raise response
        return Message(response)


class FakeClient:
    def __init__(self, responses): self.messages = FakeMessages(responses)


class FakeOpenAIClient:
    def __init__(self, responses):
        class Completions:
            def __init__(self, values): self.values = iter(values); self.calls = 0
            def create(self, **kwargs):
                self.calls += 1
                value = next(self.values)
                if isinstance(value, Exception): raise value
                return type("Result", (), {"choices": [type("Choice", (), {"message": type("Message", (), {"content": value})()})()]})()
        self.chat = type("Chat", (), {"completions": Completions(responses)})()


def valid():
    return json.dumps({"title":"Test", "questions":[{"question_text":"Q", "topic":"T", "marks":1, "difficulty_level":3, "explanation":"A direct explanation.", "options":[{"option_text":"A","is_correct":True},{"option_text":"B","is_correct":False}]}]})


def request(): return QuizRequest(extracted_text="database notes", question_count=1)


def test_provider_parses_fake_response_without_network():
    assert AnthropicProvider(FakeClient([valid()])).generate_quiz(request()).questions[0].difficulty_level == 3


def test_rate_limit_retries_then_succeeds():
    result = AnthropicProvider(FakeClient([RuntimeError("rate limit"), valid()]), retries=1).generate_quiz(request())
    assert result.title == "Test"


def test_malformed_output_is_rejected_without_secret_details():
    with pytest.raises(RuntimeError, match="AI generation failed"):
        AnthropicProvider(FakeClient(["not json"]), retries=0).generate_quiz(request())


def test_request_cap_is_enforced():
    provider = AnthropicProvider(FakeClient([valid()]), max_requests=0)
    with pytest.raises(RuntimeError, match="request cap"):
        provider.generate_quiz(request())


def test_api_key_is_not_in_error_or_logs(monkeypatch, caplog):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "secret-test-key")
    with pytest.raises(RuntimeError) as error:
        AnthropicProvider(FakeClient([RuntimeError("secret-test-key timeout")]), retries=0).generate_quiz(request())
    assert "secret-test-key" not in str(error.value)
    assert "secret-test-key" not in caplog.text


def test_openai_timeout_retries_then_succeeds():
    result = OpenAIProvider(FakeOpenAIClient([RuntimeError("timeout"), valid()]), model="test-model", retries=1).generate_quiz(request())
    assert result.title == "Test"


def test_openai_rate_limit_retries_then_succeeds():
    result = OpenAIProvider(FakeOpenAIClient([RuntimeError("rate limit"), valid()]), model="test-model", retries=1).generate_quiz(request())
    assert result.questions[0].options[0].is_correct is True


def test_openai_malformed_output_is_rejected():
    with pytest.raises(RuntimeError, match="AI generation failed"):
        OpenAIProvider(FakeOpenAIClient(["not json"]), model="test-model", retries=0).generate_quiz(request())


def test_openai_request_cap_is_enforced():
    with pytest.raises(RuntimeError, match="request cap"):
        OpenAIProvider(FakeOpenAIClient([valid()]), model="test-model", max_requests=0).generate_quiz(request())


def test_openai_api_key_is_not_in_errors_or_logs(monkeypatch, caplog):
    monkeypatch.setenv("OPENAI_API_KEY", "openai-secret-test-key")
    with pytest.raises(RuntimeError) as error:
        OpenAIProvider(FakeOpenAIClient([RuntimeError("openai-secret-test-key timeout")]), model="test-model", retries=0).generate_quiz(request())
    assert "openai-secret-test-key" not in str(error.value)
    assert "openai-secret-test-key" not in caplog.text


def test_openai_requires_model(monkeypatch):
    monkeypatch.delenv("AI_MODEL", raising=False)
    with pytest.raises(RuntimeError, match="AI_MODEL is required"):
        OpenAIProvider(FakeOpenAIClient([]))
