# API contract notes

Milestone 1 reserves `/api/v1` for the REST API. All request and response schemas will be documented here before implementation.

Milestone 4 will define strict Pydantic schemas for:

- `POST /generate-quiz`: resource text, question count, difficulty; structured questions, options, marks, and topics.
- `POST /generate-mini-scope`: one resource and topic data; a short per-topic revision summary.
- `POST /generate-analysis`: aggregate topic statistics only; no student names, emails, or IDs.

AI generation is asynchronous through `ai_generation_jobs`; clients poll job status.
