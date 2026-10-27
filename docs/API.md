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
- `GET /modules/:moduleId/games/activity` returns generic per-game-type play and completion counts for the owning lecturer. No player identity, state, question, or option data is returned.
- `GET /quizzes/:quizId/games` lists enabled catalog games with `available` and a friendly `reason` when competitive access is locked or the quiz has fewer than `GAME_MIN_QUESTIONS` questions.

Client-supplied `cure`, `hearts`, `score`, `difficulty`, `isCorrect`, or `status` fields are rejected with HTTP 422. Another user’s session is hidden with 404. Finished sessions reject new moves with 409.

Generated quiz questions include:

```json
{
  "question_text": "Question text",
  "topic": "Topic",
  "marks": 1,
  "difficulty_level": 3,
  "explanation": "One or two sentences, at most 300 characters.",
  "options": [{ "option_text": "Answer", "is_correct": true }]
}
```

`difficulty_level` is a required integer from 1 through 5. The backend rejects missing, fractional, or out-of-range levels, empty/oversize or instruction-like explanations, duplicate questions/options, invalid correct-option counts, and profanity before persistence.

## FR-28 Island Escape solo API

- `POST /games/island-escape/plays` with `{ "quizId": "uuid" }` starts or resumes the caller's play. It returns public state and the server-selected question/options without correctness. Fewer than 30 eligible questions returns 409.
- `GET /games/island-escape/plays/:id` restores only the owner's state and pending question, again without correctness.
- `POST /games/island-escape/plays/:id/answer` with `{ "optionId": "uuid" }` locks the play row, validates the option against the current question, applies one engine transition, appends the move, and returns correctness, correct option, explanation, points, state, event, and the next question or terminal result. A replay returns the stored response without scoring twice.

All bodies are strict: client-supplied score, phase, streak, correctness, or status produces 422. Practice-quiz students must be enrolled; competitive quizzes unlock only after their own scored attempt; lecturers are limited to quizzes in modules they own. Island data never enters scored-attempt analytics or leaderboards.
