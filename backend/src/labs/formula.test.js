import { describe, expect, it } from 'vitest';
import { evaluateCell, evaluateGrid } from './formula.js';

describe('safe spreadsheet formula evaluator', () => {
  const grid = {
    A1: '10',
    A2: '20',
    A3: '=A1+A2*2',
    B1: '=SUM(A1:A2)',
    B2: '=IF(A1>5,100,0)',
  };
  it('honours precedence, parentheses, percentages and comparisons', () => {
    expect(evaluateGrid(grid, '=A1+A2*2')).toBe(50);
    expect(evaluateGrid(grid, '=(A1+A2)*2')).toBe(60);
    expect(evaluateGrid(grid, '=50%')).toBe(0.5);
    expect(evaluateGrid(grid, '=A1>5')).toBe(1);
  });
  it('supports ranges and nested functions', () => {
    expect(evaluateGrid(grid, '=SUM(A1:A2)')).toBe(30);
    expect(evaluateGrid(grid, '=ROUND(AVERAGE(A1:A2),1)')).toBe(15);
    expect(evaluateGrid(grid, '=MAX(ABS(-4),MIN(2,3))')).toBe(4);
    expect(evaluateGrid(grid, '=AND(1,1)')).toBe(1);
    expect(evaluateGrid(grid, '=OR(0,1)')).toBe(1);
  });
  it('reports formula errors without executing input', () => {
    expect(evaluateCell({ A1: '=A1+1' }, 'A1').value).toBe('#CIRC!');
    expect(evaluateCell({}, 'A1').value).toBe('#REF!');
    expect(evaluateCell({ A1: '=1/0' }, 'A1').value).toBe('#DIV/0!');
    expect(evaluateCell({ A1: '=HACK(1)' }, 'A1').value).toBe('#NAME?');
    expect(evaluateCell({ A1: '=Function("return 1")()' }, 'A1').value).toBe(
      '#REF!',
    );
  });
  it('bounds huge and deeply nested formulas', () => {
    expect(
      evaluateCell({ A1: `=${'('.repeat(50)}1${')'.repeat(50)}` }, 'A1').value,
    ).toBe('#REF!');
    expect(evaluateCell({ A1: `=${'('.repeat(2100)}1` }, 'A1').value).toBe(
      '#REF!',
    );
  });
  it('supports known business calculator answers', () => {
    expect(evaluateCell({ A1: '=10000/(50-30)' }, 'A1').value).toBe(500);
    expect(evaluateCell({ A1: '=1000*(1+15/100)' }, 'A1').value).toBe(1150);
    expect(evaluateCell({ A1: '=1000/(1+15/100)' }, 'A1').value).toBeCloseTo(
      869.565,
      2,
    );
  });
});
