# API contract notes

Milestone 1 reserves `/api/v1` for the REST API. All request and response schemas will be documented here before implementation.

Milestone 4 will define strict Pydantic schemas for:

- `POST /generate-quiz`: resource text, question count, difficulty; structured questions, options, marks, and topics.
- `POST /generate-mini-scope`: one resource and topic data; a short per-topic revision summary.
- `POST /generate-analysis`: aggregate topic statistics only; no student names, emails, or IDs.

AI generation is asynchronous through `ai_generation_jobs`; clients poll job status.

## FR-22 Infected solo API

All endpoints use the existing session cookie, generic error shape, strict unknown-field rejection, and `/api/v1` prefix.

- `POST /games/infected/sessions` with `{ "quizId": "uuid" }` starts or resumes the caller’s solo session. It returns session state and up to three cards containing only `cardId`, `difficulty`, `topic`, `reward`, and `penalty`.
- `POST /games/infected/sessions/:id/choose` with `{ "cardId": "uuid" }` locks one offered card. It returns question text and options without correctness. Repeating the same choice is idempotent; changing it returns 409.
- `POST /games/infected/sessions/:id/answer` with `{ "optionId": "uuid" }` applies one locked transition and returns `isCorrect`, `correctOption`, `explanation`, updated state, and next cards or a terminal outcome. Replaying the same answer returns the stored result without applying it twice.
- `GET /games/infected/sessions/:id` restores the owner’s current state and pending question without correctness.
- `GET /modules/:moduleId/games/infected/activity` returns aggregate status/count/average data to the module’s lecturer. It never returns a student’s live question or options.
- `GET /quizzes/:quizId/games` lists enabled catalog games with `available` and a friendly `reason` when competitive access is locked or the quiz has fewer than `GAME_MIN_QUESTIONS` questions.

Client-supplied `cure`, `hearts`, `score`, `difficulty`, `isCorrect`, or `status` fields are rejected with HTTP 422. Another user’s session is hidden with 404. Finished sessions reject new moves with 409.

Generated quiz questions include:

```json
{
  "question_text": "Question text",
  "topic": "Topic",
  "marks": 1,
  "difficulty": "easy | medium | hard",
  "explanation": "One or two sentences, at most 300 characters.",
  "options": [{ "option_text": "Answer", "is_correct": true }]
}
```

The backend rejects missing/invalid difficulty, empty/oversize or instruction-like explanations, duplicate questions/options, invalid correct-option counts, and profanity before persistence.
