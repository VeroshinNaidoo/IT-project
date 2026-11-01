# Offline AI with Ollama

EduQuest can use a local Ollama model through the existing
`openai_compatible` provider. The frontend never calls Ollama directly; the
backend calls the AI service, which calls Ollama on localhost.

## Install and choose a model

Install Ollama from the official Ollama website and start the Ollama desktop
application. Check installed models with:

```powershell
ollama list
```

For a PC with 16 GB RAM or more, prefer a 7B–8B model. For less memory, use a
3B model such as `llama3.2:3b`:

```powershell
ollama pull llama3.2:3b
```

## `.env`

Set these four lines in the project-root `.env`:

```text
AI_PROVIDER=openai_compatible
AI_BASE_URL=http://127.0.0.1:11434/v1/
AI_API_KEY=ollama
AI_MODEL=llama3.2:3b
```

Change only `AI_MODEL` if you installed another model. To switch back to
Google's OpenAI-compatible endpoint, set `AI_PROVIDER=openai_compatible`, set
`AI_BASE_URL` to the Google `/openai/` endpoint, set `AI_API_KEY` to the local
Google key, and set `AI_MODEL` to the model you selected. Never commit `.env`.

## Run

1. Start Ollama.
2. Double-click `Run EduQuest.bat` on the Desktop.
3. After the app is running, double-click `Check EduQuest AI.bat`.

The checker makes one small request first and does not use a server port.

## Troubleshooting

- “Ollama is not running”: start the Ollama desktop application.
- “Model not downloaded”: run `ollama pull <model>`.
- Timeout or out-of-memory: choose a smaller model, close other applications,
  or increase `AI_TIMEOUT_SECONDS`.
- If Windows reports Access denied, run the command from a normal terminal with
  the project folder as the current directory; do not repeatedly retry it here.
