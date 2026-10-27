# Credential-dependent verification setup

Add these two lines to the project `.env` without committing or sharing their values:

```text
REAL_TEST_DATABASE_URL=<disposable real PostgreSQL test URL>
ANTHROPIC_API_KEY=<Anthropic API key>
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
