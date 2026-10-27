# Credential-dependent verification setup

Add these two lines to the project `.env` without committing or sharing their values:

```text
REAL_TEST_DATABASE_URL=<disposable real PostgreSQL test URL>
ANTHROPIC_API_KEY=<Anthropic API key>
# For OpenAI instead, use these lines and choose a current model in your account:
OPENAI_API_KEY=<OpenAI API key>
AI_PROVIDER=openai
AI_MODEL=<current model name from platform.openai.com>
```

Confirm the file is ignored:

```powershell
git check-ignore .env
```

Then run the complete verification command:

```powershell
npm run verify:all
```

The command prints variable names and presence only. It never prints secret values. `REAL_TEST_DATABASE_URL` must point to a disposable real PostgreSQL test database and must not equal `DATABASE_URL`.

For Anthropic, set `AI_PROVIDER=anthropic` and `AI_MODEL` to the model you intend to use. For OpenAI, set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and a current `AI_MODEL`; OpenAI selection fails clearly if `AI_MODEL` is missing. The default remains MockProvider, so normal tests never call a network provider.
