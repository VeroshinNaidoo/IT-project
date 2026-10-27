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

## Free OpenAI-compatible options

Limits, pricing, retention, and terms change. Check each vendor's current site before use. Never commit keys.

Google AI Studio:

```text
AI_PROVIDER=openai_compatible
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
AI_API_KEY=<Google AI Studio key>
AI_MODEL=<current Gemini model>
```

Groq:

```text
AI_PROVIDER=openai_compatible
AI_BASE_URL=https://api.groq.com/openai/v1
AI_API_KEY=<Groq key>
AI_MODEL=<current Groq model>
```

OpenRouter:

```text
AI_PROVIDER=openai_compatible
AI_BASE_URL=https://openrouter.ai/api/v1
AI_API_KEY=<OpenRouter key>
AI_MODEL=<current routed model>
```

Ollama (local):

```powershell
ollama pull <model-name>
```

```text
AI_PROVIDER=openai_compatible
AI_BASE_URL=http://127.0.0.1:11434/v1
AI_API_KEY=ollama
AI_MODEL=<pulled model name>
```

The compatible provider reports the provider, base URL host, and model only. It never reports `AI_API_KEY`.
