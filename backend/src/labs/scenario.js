// @ts-nocheck
export function validateScenarioConfig(config) {
  const nodes = new Map((config.nodes || []).map((node) => [node.id, node]));
  const start = config.nodes?.[0]?.id;
  if (!start) return { ok: false, reason: 'A scenario needs a starting node.' };
  for (const node of config.nodes) {
    if (!node.terminal && node.choices.length === 0)
      return { ok: false, reason: 'Every non-terminal node needs a choice.' };
    for (const choice of node.choices) {
      if (!nodes.has(choice.next))
        return { ok: false, reason: 'Every choice must lead to a valid node.' };
    }
  }
  const reachable = new Set();
  const visiting = new Set();
  const visit = (id) => {
    if (visiting.has(id)) throw new Error('Scenario cycles are not allowed.');
    if (reachable.has(id)) return;
    visiting.add(id);
    const node = nodes.get(id);
    for (const choice of node.choices) visit(choice.next);
    visiting.delete(id);
    reachable.add(id);
  };
  try {
    visit(start);
  } catch (error) {
    return { ok: false, reason: error.message };
  }
  if (reachable.size !== nodes.size)
    return { ok: false, reason: 'Every scenario node must be reachable.' };
  return { ok: true };
}
