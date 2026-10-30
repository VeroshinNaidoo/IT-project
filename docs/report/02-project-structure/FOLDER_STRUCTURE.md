# EduQuest Project Folder Structure

```text
IT project build/
├── 📄 .env.example
├── 📄 .gitignore
├── 📄 .prettierignore
├── 📄 .prettierrc
├── 📄 AGENTS.md
├── 📁 ai-service — FastAPI AI boundary and provider implementations
  ├── 📄 .gitkeep
  ├── 📄 app.py
  ├── 📄 conftest.py
  ├── 📄 requirements.txt
  ├── 📄 run.py
  ├── 📄 test_app.py
  ├── 📁 tests — Unit, integration, accessibility and authorization tests
    ├── 📁 fixtures
    ├── 📄 test_anthropic_provider.py
    ├── 📄 test_service_exposure.py
    ├── 📄 test_startup_token.py
├── 📁 backend — Express API, authorization, validation and game services
  ├── 📄 db.js — Shared PostgreSQL connection pool
  ├── 📁 scripts — Local setup, test, backup and verification tooling
    ├── 📄 ai-worker.js
    ├── 📄 migrate.js
    ├── 📄 reset-test-db.js
    ├── 📄 seed.js
  ├── 📁 src — Express routes, middleware, validation and game logic
    ├── 📄 app.js — Express routes, RBAC and central errors
    ├── 📄 authorization-matrix.js
    ├── 📁 games — Six practice-only game implementations
      ├── 📄 access.js
      ├── 📁 boss_battle
        ├── 📄 config.js
        ├── 📄 engine.js
        ├── 📄 engine.test.js
        ├── 📄 routes.js
        ├── 📄 state.js
      ├── 📄 difficulty.js
      ├── 📁 infected
        ├── 📄 engine.js
        ├── 📄 routes.js
      ├── 📄 interface.js
      ├── 📁 island_escape
        ├── 📄 config.js
        ├── 📄 engine.js
        ├── 📄 routes.js
        ├── 📄 state.js
      ├── 📁 memory_match
        ├── 📄 config.js
        ├── 📄 engine.js
        ├── 📄 routes.js
        ├── 📄 state.js
      ├── 📁 pixel_racer
        ├── 📄 config.js
        ├── 📄 engine.js
        ├── 📄 engine.test.js
        ├── 📄 routes.js
        ├── 📄 state.js
      ├── 📄 play-state.js
      ├── 📁 timer_trivia
        ├── 📄 config.js
        ├── 📄 engine.js
        ├── 📄 engine.test.js
        ├── 📄 routes.js
        ├── 📄 state.js
    ├── 📄 index.js
    ├── 📁 profanity — Shared profanity policy and JSON term lists
  ├── 📁 tests — Unit, integration, accessibility and authorization tests
    ├── 📄 ai-worker.test.js
    ├── 📄 api.test.js
    ├── 📄 authorization-matrix.test.js
    ├── 📄 boss-battle-api.test.js
    ├── 📄 database.invariants.test.js
    ├── 📄 game-foundation.test.js
    ├── 📁 helpers
    ├── 📄 infected-api.test.js
    ├── 📄 infected-engine.test.js
    ├── 📄 island-escape-api.test.js
    ├── 📄 island-escape-engine.test.js
    ├── 📄 memory-match-api.test.js
    ├── 📄 memory-match-engine.test.js
    ├── 📄 pixel-racer-api.test.js
    ├── 📄 profanity.test.js
    ├── 📄 startup-token.test.js
    ├── 📄 timer-trivia-api.test.js
├── 📁 db — SQL migrations and database invariants
  ├── 📁 migrations — Ordered PostgreSQL/PGlite schema migrations
    ├── 📄 001_extensions.sql
    ├── 📄 002_schema.sql
    ├── 📄 003_invariants.sql
    ├── 📄 004_game_type_catalog.sql
    ├── 📄 005_ai_job_parameters.sql
    ├── 📄 006_infected_game.sql
    ├── 📄 007_game_platform_foundation.sql
    ├── 📄 008_island_escape.sql
    ├── 📄 009_enable_memory_match.sql
    ├── 📄 010_enable_boss_battle.sql
    ├── 📄 011_enable_pixel_racer.sql
    ├── 📄 012_extended_time_preference.sql
    ├── 📄 013_enable_timer_trivia.sql
├── 📄 docker-compose.yml
├── 📁 docs — Architecture, requirements, decisions and verification evidence
  ├── 📄 API.md
  ├── 📄 BACKUP.md
  ├── 📄 DECISIONS.md
  ├── 📄 DESIGN.md
  ├── 📄 ERD.md
  ├── 📄 GAME_AUDIT.md
  ├── 📄 INVARIANTS.md
  ├── 📄 MANUAL_TESTS.md
  ├── 📄 PROGRESS.md
  ├── 📄 SETUP_CREDENTIALS.md
  ├── 📄 STATUS.md
  ├── 📄 TRACEABILITY.md
  ├── 📄 VERIFICATION.md
├── 📄 eslint.config.js
├── 📁 frontend — React presentation layer and browser tests
  ├── 📄 .gitkeep
  ├── 📁 e2e
    ├── 📄 local-smoke.spec.js
    ├── 📄 main.spec.js
  ├── 📄 index.html
  ├── 📄 package.json — Frontend dependencies and Vite scripts
  ├── 📁 src — Frontend screens, API client and design system
    ├── 📄 game-visuals.test.jsx
    ├── 📄 main.jsx
    ├── 📄 main.test.jsx
    ├── 📄 styles.css
    ├── 📄 timer-trivia.test.jsx
  ├── 📄 vite.config.js
├── 📄 package-lock.json
├── 📄 package.json — Frontend dependencies and Vite scripts
├── 📄 playwright.config.js
├── 📄 README.md
├── 📁 scripts — Local setup, test, backup and verification tooling
  ├── 📄 backup-pg.mjs
  ├── 📄 db-backup.mjs
  ├── 📄 db-restore.mjs
  ├── 📄 db-setup-check.mjs
  ├── 📄 no-skipped-tests-reporter.mjs
  ├── 📄 pglite-server.mjs
  ├── 📄 restore-pg.mjs
  ├── 📄 run-tests.mjs
  ├── 📄 setup-token.mjs
  ├── 📄 test-ai-real.mjs
  ├── 📄 test-backup-restore.mjs
  ├── 📄 test-real-db.mjs
  ├── 📄 verify-all.mjs
├── 📄 tsconfig.json
├── 📄 vitest.config.js
├── 📄 vitest.db.config.js
├── 📄 vitest.unit.config.js
```

Descriptions are based on the real repository file tree; generated files and secrets are excluded.