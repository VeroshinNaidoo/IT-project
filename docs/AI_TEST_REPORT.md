# AI test report

## Environment and live check

The configured provider was `mock`. `AI_BASE_URL` was present with host
`generativelanguage.googleapis.com` and path `/v1beta/openai/`; the configured
model name was present. No API key or token value was printed or recorded.

One bounded full-pipeline request was attempted against the local AI service
using the clean databases fixture and five questions. It failed before the
provider call because `127.0.0.1:8000` refused the connection. A restart was
also attempted, but Windows denied starting `ai-service/run.py` with
`Access is denied (os error 5)`. This is a local process-start restriction,
not an HTML/JSON 404, model error, key error, quota response, timeout, or
response-format failure.

## Evidence matrix

| Check | Result | Provider | Evidence |
|---|---|---|---|
| Generates questions from the uploaded text | NOT PROVED | mock | Local service was unavailable for the live pipeline check. MockProvider is covered by the offline Python suite. |
| Each question valid (one correct option, 2 to 6 options, topic, level, explanation, no profanity) | PASS | mock/offline | Strict Pydantic validation and 28 Python tests passed. |
| Questions are about the document | NOT PROVED | real model | Live provider was not reached. |
| Respects requested count and difficulty | PASS | mock/offline | Request validation and provider tests passed; real-model behavior remains unproved. |
| Empty, garbage, oversize and non-English files fail cleanly | NOT PROVED | real model | The fixture suite is present, but the live service was unavailable. |
| Hostile instructions in a document are ignored | PASS | mock/offline | Prompt treats source text as untrusted data; hostile-output validation tests passed. Real-model behavior remains unproved. |
| Invalid output is retried then fails cleanly | PASS | fake clients | Malformed-output, retry, request-cap and secret-safe error tests passed. |

## Provider hardening evidence

- OpenAI-compatible base URLs are trimmed, quote-normalised, reduced from a
  pasted `/chat/completions` endpoint to one trailing slash, and rejected when
  they have no valid host or unsafe scheme.
- `AI_TIMEOUT_SECONDS` defaults to 120 seconds.
- Requests are batched in groups of at most five, merged, validated, and
  near-duplicate question text is removed.
- `AI_MODEL_FALLBACKS` is used after timeout or 429 failures. `Retry-After` is
  honoured and the request cap remains enforced.
- Correct-answer evidence is checked against the source text; unsupported
  questions are discarded before the merged result is returned.
- Fake-client coverage includes timeout, 429, JSON-mode fallback, fenced JSON,
  batching, merging, deduplication, fallback, groundedness filtering,
  malformed output and secret-safe errors.

## Verification numbers

Each of the three full offline runs:

- JS unit/frontend: 172 passed, 0 skipped
- DB/API: 223 passed, 0 skipped
- Python AI service: 28 passed, 0 skipped
- Lint, format check, type-check and frontend production build: passed

## Verdict

Working with problems for offline/demo mode. The provider code and tests are
green, but real AI generation is not proved because the local AI service could
not be started in this environment. Next action: start the service from a
normal user terminal with `python ai-service/run.py`, then run
`npm run test:ai:real` with a non-mock `AI_PROVIDER` and the existing variables
configured in `.env`.
