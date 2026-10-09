from fastapi.testclient import TestClient
from app import app

client = TestClient(app)


def test_mock_quiz_is_structured_and_deterministic():
    response = client.post("/generate-quiz", json={"extracted_text": "3NF removes transitive dependencies", "question_count": 2, "difficulty": "easy"})
    assert response.status_code == 200
    assert len(response.json()["questions"]) == 2
    assert sum(option["is_correct"] for option in response.json()["questions"][0]["options"]) == 1


def test_malformed_quiz_shape_is_rejected():
    response = client.post("/generate-quiz", json={"extracted_text": "", "question_count": 2})
    assert response.status_code == 422
