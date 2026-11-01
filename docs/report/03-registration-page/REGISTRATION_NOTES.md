# Registration Page Notes

## Frontend rules

| Field or behavior         | Rule actually enforced                                                                                                                                                       | Implementation                                                                           | Test evidence                                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full name                 | Required on the registration form; the browser requires a non-empty value.                                                                                                   | `frontend/src/main.jsx` (`required` input)                                               | `frontend/src/main.test.jsx` — `shows the authentication form and reports inline errors`                                                           |
| Email                     | Required, browser email input validation, and backend email format/max-length validation.                                                                                    | `frontend/src/main.jsx`; `backend/src/app.js` `registerSchema`                           | `backend/tests/authorization-matrix.test.js` — `POST /api/v1/auth/register executes all authorization cases`                                       |
| Password                  | Required in the browser, minimum 8 characters in the browser and backend, maximum 200 characters on the backend. No additional uppercase, digit, or symbol rule is enforced. | `frontend/src/main.jsx`; `backend/src/app.js` `registerSchema`                           | `backend/tests/authorization-matrix.test.js` — registration validation case                                                                        |
| Student-only registration | The public registration route inserts the role `student`; there is no public lecturer-registration option.                                                                   | `backend/src/app.js` `POST /api/v1/auth/register`                                        | `backend/tests/authorization-matrix.test.js` — registration success and validation cases                                                           |
| Profanity                 | Full name is checked server-side with the shared profanity policy. Rejection is HTTP 422 with the generic message and never echoes the matched term.                         | `backend/src/profanity/index.js`; `backend/src/app.js` `nameSchema`                      | `backend/tests/api.test.js` — `rejects profanity directly at the backend boundary with generic 422`; `backend/tests/profanity.test.js`             |
| Email uniqueness          | Email is lowercased and protected by a database uniqueness index on `lower(email)`. Duplicate registration returns HTTP 409 with a generic account-exists message.           | `backend/src/app.js`; `db/migrations/002_schema.sql`; `db/migrations/003_invariants.sql` | `backend/tests/database.invariants.test.js` — case-insensitive email uniqueness; `backend/tests/authorization-matrix.test.js` — registration cases |
| Rate limiting             | Login and registration share a 10-minute rate-limit window; the default limit is 30 requests and `AUTH_RATE_LIMIT` can configure it.                                         | `backend/src/app.js` authentication rate-limit middleware                                | No dedicated passing test currently isolates the 30-request threshold; this is implemented but not independently proven.                           |

## Error behavior

The backend returns a standard error object with a code, friendly message, and request ID. The frontend displays the returned friendly message in the authentication form. Browser-native `required`, email, and minimum-length validation remains active on the form controls.

## Screenshot mapping

- `01-empty-form.png`: empty student registration form at 1280×800.
- `02-validation-errors.png`: invalid email, weak password, and missing name submitted together; the product currently presents the standard validation message rather than separate server field messages.
- `03-profanity-rejected.png`: profanity rejection with the generic message; the rejected word was cleared before capture and is not visible.
- `04-duplicate-email.png`: duplicate account response.
- `05-success.png`: successful student registration and authenticated student dashboard.
- `06-mobile-390.png`: empty form at 390×844.
