import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const script = path.join(root, 'Start-EduQuest.ps1');
const desktopBat = path.join(path.dirname(root), 'Run EduQuest.bat');

describe('EduQuest launcher', () => {
  it('targets an existing parseable PowerShell script', () => {
    expect(existsSync(script)).toBe(true);
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile('${script.replaceAll("'", "''")}',[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){$errors|% Message;exit 1}`,
      ],
      { encoding: 'utf8' },
    );
    expect(output).toBe('');
    if (existsSync(desktopBat)) {
      const bat = readFileSync(desktopBat, 'utf8');
      expect(bat).toContain(`-File "%ROOT%\\Start-EduQuest.ps1"`);
    }
  });

  it('dry-run lists every startup step and the project directory', () => {
    const output = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-DryRun'],
      { encoding: 'utf8' },
    );
    expect(output).toContain(`DRY RUN: project root = ${root}`);
    for (const step of [
      'db:start',
      'db:migrate',
      'seed',
      'run-backend.ps1',
      'run-ai-service.ps1',
      'run-worker.ps1',
      'run-frontend.ps1',
    ])
      expect(output).toContain(step);
  });

  it('quotes every child PowerShell script path so folders with spaces work', () => {
    const source = readFileSync(script, 'utf8');
    expect(source).toContain("$quotedScriptPath = '\"' + $scriptPath + '\"'");
    expect(source).toContain(
      "ArgumentList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $quotedScriptPath)",
    );
    expect(source).not.toMatch(
      /-File',\s*"\$ProjectRoot\\scripts\\run-(?:backend|ai-service|worker|frontend)\.ps1"/,
    );
  });
});
