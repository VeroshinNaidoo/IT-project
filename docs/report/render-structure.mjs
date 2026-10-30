import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = process.cwd();
const ignored = new Set(['node_modules', '.git', '.pgdata', '.pgsql', 'dist', 'build', 'coverage', 'test-results', '.pytest_cache', '__pycache__', 'uploads', 'backups']);
const generated = new Set(['.env', '.pglite-dev.pid', '.pglite-test.pid']);

async function walk(directory, relative = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (ignored.has(entry.name) || generated.has(entry.name)) continue;
    if (relative === 'docs' && entry.name === 'report') continue;
    const next = path.join(relative, entry.name);
    result.push({ path: next.replaceAll('\\', '/'), directory: entry.isDirectory() });
    if (entry.isDirectory()) result.push(...(await walk(path.join(directory, entry.name), next)));
  }
  return result;
}

const all = await walk(root);
const depth = (item) => item.path.split('/').length;
const visible = all.filter((item) => depth(item) <= 3 || item.path.startsWith('backend/src/games/'));

const descriptions = {
  frontend: 'React presentation layer and browser tests',
  backend: 'Express API, authorization, validation and game services',
  'ai-service': 'FastAPI AI boundary and provider implementations',
  db: 'SQL migrations and database invariants',
  docs: 'Architecture, requirements, decisions and verification evidence',
  scripts: 'Local setup, test, backup and verification tooling',
  'frontend/src': 'Frontend screens, API client and design system',
  'backend/src': 'Express routes, middleware, validation and game logic',
  games: 'Pure engines, state rules and game-specific routes',
  migrations: 'Ordered PostgreSQL/PGlite schema migrations',
  tests: 'Unit, integration, accessibility and authorization tests',
  app: 'FastAPI schemas, middleware and provider boundary',
  main: 'Frontend application entry point',
  package: 'Project dependency and npm script manifest',
  'package.json': 'Frontend dependencies and Vite scripts',
  'backend/src/app.js': 'Express routes, RBAC and central errors',
  'backend/db.js': 'Shared PostgreSQL connection pool',
  'backend/src/profanity': 'Shared profanity policy and JSON term lists',
  'backend/src/games': 'Six practice-only game implementations',
};

function label(item) {
  const base = path.basename(item.path);
  const description = descriptions[item.path] || descriptions[base] || '';
  return `${base}${description ? ` — ${description}` : ''}`;
}

function treeFor(prefix) {
  const start = prefix ? `${prefix}/` : '';
  return visible.filter((item) => !prefix || item.path === prefix || item.path.startsWith(start));
}

function markdownTree(items, title) {
  const lines = [`# ${title}`, '', '```text', 'IT project build/'];
  for (const item of items) {
    const relative = prefixless(item.path, title);
    const level = relative.split('/').length - 1;
    lines.push(`${'  '.repeat(level)}${item.directory ? '├── 📁 ' : '├── 📄 '}${label(item)}`);
  }
  lines.push('```', '', 'Descriptions are based on the real repository file tree; generated files and secrets are excluded.');
  return lines.join('\n');
}

function prefixless(itemPath, title) {
  if (title.includes('Frontend')) return itemPath.replace(/^frontend\//, 'frontend/');
  if (title.includes('Backend')) return itemPath.replace(/^backend\//, 'backend/');
  return itemPath;
}

await writeFile('docs/report/02-project-structure/FOLDER_STRUCTURE.md', markdownTree(visible, 'EduQuest Project Folder Structure'), 'utf8');
await writeFile('docs/report/02-project-structure/ARCHITECTURE_LAYERS.md', `# EduQuest Architecture Layers

## Presentation

- \`frontend/src/main.jsx\`: React screens, route selection, forms, game views and API calls.
- \`frontend/src/styles.css\`: palette, typography, responsive layout and accessibility states.
- \`frontend/e2e/\`: Playwright viewport and axe flows.

## Application logic

- \`backend/src/app.js\`: Express routes, authentication, RBAC, validation, quiz engine, leaderboard and analytics endpoints.
- \`backend/src/profanity/\`: shared server-side text policy.
- \`backend/src/games/*/engine.js\`: pure authoritative engines for Infected, Island Escape, Memory Match, Boss Battle, Pixel Car Racer and Timer Trivia.
- \`backend/src/games/*/routes.js\`: persistence, authorization and response shaping for each game.
- \`backend/src/games/*/state.js\`: versioned Zod state schemas and registry entries.

## Data access

- \`backend/db.js\`: parameterized \`pg\` pool.
- \`db/migrations/\`: ordered schema, constraints, indexes and triggers.
- \`backend/scripts/migrate.js\` and \`backend/scripts/reset-test-db.js\`: migration and repeatable test-database lifecycle.

## AI service

- \`ai-service/app.py\`: FastAPI request schemas, shared-secret middleware, timeout/body limits and provider selection.
- \`ai-service/run.py\`: localhost-bound service startup guard.
- \`backend/scripts/ai-worker.js\`: queued job worker; the backend is the only component that calls the AI service.

## Communication

\`\`\`mermaid
flowchart LR
  Browser[Frontend browser] -->|HTTP /api/v1 + httpOnly session cookie| Backend[Express backend]
  Backend -->|parameterized SQL| DB[(PostgreSQL-compatible database)]
  Backend -->|HTTP + x-ai-service-token| AI[FastAPI AI service]
  AI -->|provider SDK when explicitly selected| Model[Configured model provider]
\`\`\`

The frontend never calls the AI service directly. The backend supplies the shared-secret header and validates every AI response before persistence.
`, 'utf8');

const panels = [
  ['explorer-frontend.png', 'Frontend Explorer', treeFor('frontend')],
  ['explorer-backend.png', 'Backend Explorer', treeFor('backend')],
  ['explorer-ai-and-db.png', 'AI Service and Database Explorer', [...treeFor('ai-service'), ...treeFor('db')]],
];

const icon = (directory) => directory ? '📁' : '📄';
for (const [filename, title, items] of panels) {
  const rows = items.map((item) => {
    const level = item.path.split('/').length - (title.startsWith('AI') ? 1 : 1);
    return `<div class="row" style="padding-left:${Math.max(0, level) * 32}px"><span class="icon">${icon(item.directory)}</span><span>${label(item)}</span></div>`;
  }).join('');
  const html = `<html><head><style>body{margin:0;background:#181818;color:#d4d4d4;font:18px Consolas,monospace}.panel{width:1800px;min-height:1600px;background:#1e1e1e}.head{height:74px;padding:22px 28px 0;box-sizing:border-box;color:#fff;font:700 26px Segoe UI,sans-serif;border-bottom:1px solid #333}.sub{padding:14px 28px;color:#9cdcfe;font:16px Segoe UI,sans-serif}.row{height:34px;line-height:34px;white-space:nowrap}.icon{display:inline-block;width:34px}.row:nth-child(even){background:#202020}</style></head><body><div class="panel"><div class="head">${title}</div><div class="sub">Real repository tree · generated locally · secrets and generated output excluded</div>${rows}</div></body></html>`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1600 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.screenshot({ path: `docs/report/02-project-structure/${filename}`, fullPage: true });
  await browser.close();
}

console.log(JSON.stringify({ items: visible.length, images: panels.length }));
