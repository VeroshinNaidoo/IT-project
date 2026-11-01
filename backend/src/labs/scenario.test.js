// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { validateScenarioConfig } from './scenario.js';

const node = (id, next = []) => ({
  id,
  text: id,
  terminal: next.length === 0,
  choices: next.map((target) => ({ label: target, next: target, changes: {} })),
});

describe('business scenario validation', () => {
  it('accepts reachable finite paths ending at terminal nodes', () => {
    expect(
      validateScenarioConfig({
        meters: [{ key: 'cash', label: 'Cash', initial: 0 }],
        nodes: [node('start', ['end']), node('end')],
      }),
    ).toEqual({ ok: true });
  });
  it('rejects cycles, unreachable nodes and invalid destinations', () => {
    const base = { meters: [{ key: 'cash', label: 'Cash', initial: 0 }] };
    expect(
      validateScenarioConfig({ ...base, nodes: [node('start', ['start'])] }).ok,
    ).toBe(false);
    expect(
      validateScenarioConfig({
        ...base,
        nodes: [node('start', ['end']), node('end'), node('unused')],
      }).ok,
    ).toBe(false);
    expect(
      validateScenarioConfig({ ...base, nodes: [node('start', ['missing'])] })
        .ok,
    ).toBe(false);
  });
});
