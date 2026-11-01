// @ts-nocheck - parser implementation is runtime JavaScript with recursive grammar functions.
// Pure, bounded spreadsheet formula evaluator. It intentionally never executes
// input as JavaScript; formulas are parsed into values by this module only.
const MAX_LENGTH = 2000;
const MAX_DEPTH = 40;
const CELL = /^[A-Z]{1,2}[1-9][0-9]?$/;

const tokenize = (source) => {
  if (typeof source !== 'string' || source.length > MAX_LENGTH)
    throw new Error('#REF! Formula is too long.');
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      i += 1;
      continue;
    }
    const rest = source.slice(i);
    const match = rest.match(
      /^(>=|<=|<>|=|>|<|\+|-|\*|\/|\^|\(|\)|:|,|%|(?:[A-Za-z]{1,2}\d{1,2})|(?:\d+\.\d+|\d+)|(?:[A-Za-z]{1,20}))/,
    );
    if (!match) throw new Error('#REF! Invalid formula token.');
    const value = match[0];
    tokens.push(value);
    i += value.length;
  }
  return tokens;
};

export const evaluateGrid = (grid, formula, stack = []) => {
  const get = (address) => {
    const key = address.toUpperCase();
    if (!CELL.test(key) || !Object.prototype.hasOwnProperty.call(grid, key))
      throw new Error('#REF! Cell reference not found.');
    if (stack.includes(key))
      throw new Error('#CIRC! Circular reference detected.');
    const value = grid[key];
    if (typeof value !== 'string' || !value.startsWith('='))
      return Number(value) || 0;
    return evaluateGrid(grid, value, [...stack, key]);
  };
  const source = String(formula || '').trim();
  if (!source.startsWith('=')) return Number(source) || 0;
  const tokens = tokenize(source.slice(1).toUpperCase());
  let index = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];
  const depth = (level) => {
    if (level > MAX_DEPTH)
      throw new Error('#REF! Formula is too deeply nested.');
  };
  const range = (from, to) => {
    const parse = (address) => {
      const [, letters, row] = address.match(/^([A-Z]+)([0-9]+)$/) || [];
      if (!letters) throw new Error('#REF! Invalid range.');
      let col = 0;
      for (const ch of letters) col = col * 26 + ch.charCodeAt(0) - 64;
      return { col, row: Number(row) };
    };
    const a = parse(from),
      b = parse(to),
      values = [];
    for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r += 1)
      for (
        let c = Math.min(a.col, b.col);
        c <= Math.max(a.col, b.col);
        c += 1
      ) {
        let n = c,
          letters = '';
        while (n) {
          const rem = (n - 1) % 26;
          letters = String.fromCharCode(65 + rem) + letters;
          n = Math.floor((n - 1) / 26);
        }
        values.push(get(`${letters}${r}`));
      }
    return values;
  };
  const primary = (level) => {
    depth(level);
    const token = take();
    if (token === '(') {
      const value = comparison(level + 1);
      if (take() !== ')') throw new Error('#REF! Missing closing parenthesis.');
      return value;
    }
    if (token === '-' || token === '+') {
      const value = primary(level + 1);
      return token === '-' ? -value : value;
    }
    if (/^\d/.test(token)) return Number(token);
    if (token && CELL.test(token)) {
      if (peek() === ':') {
        take();
        return range(token, take());
      }
      return get(token);
    }
    if (token && /^[A-Z]+$/.test(token)) {
      if (take() !== '(') throw new Error('#NAME? Unknown function.');
      const args = [];
      if (peek() !== ')') {
        while (true) {
          const first = comparison(level + 1);
          args.push(first);
          if (peek() !== ',') break;
          take();
        }
      }
      if (take() !== ')')
        throw new Error('#REF! Missing function parenthesis.');
      const flat = args.flatMap((x) => (Array.isArray(x) ? x : [x]));
      switch (token) {
        case 'SUM':
          return flat.reduce((a, b) => a + Number(b || 0), 0);
        case 'AVERAGE':
          return flat.length
            ? flat.reduce((a, b) => a + Number(b || 0), 0) / flat.length
            : 0;
        case 'MIN':
          return Math.min(...flat);
        case 'MAX':
          return Math.max(...flat);
        case 'COUNT':
          return flat.filter((x) => Number.isFinite(Number(x))).length;
        case 'ROUND':
          return (
            Math.round(Number(flat[0] || 0) * 10 ** Number(flat[1] || 0)) /
            10 ** Number(flat[1] || 0)
          );
        case 'IF':
          return Number(flat[0]) ? flat[1] : flat[2];
        case 'AND':
          return flat.every(Boolean) ? 1 : 0;
        case 'OR':
          return flat.some(Boolean) ? 1 : 0;
        case 'ABS':
          return Math.abs(Number(flat[0] || 0));
        default:
          throw new Error('#NAME? Unknown function.');
      }
    }
    throw new Error('#REF! Invalid expression.');
  };
  const power = (level) => {
    let value = primary(level);
    while (peek() === '^') {
      take();
      value **= primary(level + 1);
    }
    return value;
  };
  const product = (level) => {
    let value = power(level);
    while (peek() === '*' || peek() === '/') {
      const op = take();
      const next = power(level + 1);
      if (op === '/' && next === 0)
        throw new Error('#DIV/0! Cannot divide by zero.');
      value = op === '*' ? value * next : value / next;
    }
    return value;
  };
  const sum = (level) => {
    let value = product(level);
    while (peek() === '+' || peek() === '-') {
      const op = take();
      const next = product(level + 1);
      value = op === '+' ? value + next : value - next;
    }
    return value;
  };
  const comparison = (level) => {
    let value = sum(level);
    const op = peek();
    if (['=', '<>', '>', '<', '>=', '<='].includes(op)) {
      take();
      const next = sum(level + 1);
      value =
        op === '='
          ? Number(value === next)
          : op === '<>'
            ? Number(value !== next)
            : op === '>'
              ? Number(value > next)
              : op === '<'
                ? Number(value < next)
                : op === '>='
                  ? Number(value >= next)
                  : Number(value <= next);
    }
    if (peek() === '%') {
      take();
      value /= 100;
    }
    return value;
  };
  const result = comparison(0);
  if (index !== tokens.length)
    throw new Error('#REF! Unexpected formula input.');
  return result;
};

export const evaluateCell = (grid, address) => {
  try {
    if (!Object.prototype.hasOwnProperty.call(grid, address.toUpperCase()))
      throw new Error('#REF! Cell reference not found.');
    return {
      value: evaluateGrid(grid, grid[address.toUpperCase()] ?? '', [
        address.toUpperCase(),
      ]),
      error: null,
    };
  } catch (error) {
    const text = String(error.message || '#REF!');
    return { value: text.split(' ')[0], error: text };
  }
};
