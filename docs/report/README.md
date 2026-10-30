# EduQuest Report Package

This package contains the final database report, project-structure evidence, and registration-page evidence.

## Folders

- `01-database/` — copied database deliverables: `schema.sql`, the Mermaid `ERD.md`, rendered `erd.svg`/`erd.png`, and `DB_DIFFERENCES.md`.
- `02-project-structure/` — the real repository tree, architecture-layer notes, and three dark Explorer-style tree images.
- `03-registration-page/` — six Playwright captures and `REGISTRATION_NOTES.md`.

The Explorer-style images were rendered from the real repository file list with a local HTML page and Playwright. They are not screenshots of VS Code. Secret files, caches, dependencies, build output, and generated report output were excluded.

## Registration image checks

I checked all six registration images for visible passwords, API keys, tokens, database URLs, `.env` contents, and other credential values. Password inputs are masked. The throwaway email is non-secret test data and was deleted from the database after capture. No secret values are present in the images or report text.

The registration captures use the local app at `http://127.0.0.1:5173` and the existing frontend/backend; application code was not changed.
