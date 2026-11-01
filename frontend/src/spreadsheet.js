const refPattern = /^[A-Z]{1,2}[1-9][0-9]?$/;
export function evaluateSpreadsheet(grid, address, stack = []) {
  const key = address.toUpperCase();
  if (stack.includes(key))
    return { value: '#CIRC!', error: 'Circular reference.' };
  const raw = grid[key] ?? '';
  if (typeof raw !== 'string' || !raw.startsWith('='))
    return {
      value: raw === '' ? '' : Number.isNaN(Number(raw)) ? raw : Number(raw),
      error: null,
    };
  const expression = raw.slice(1).trim().toUpperCase();
  if (expression.length > 2000)
    return { value: '#REF!', error: 'Formula is too long.' };
  const get = (cell) => evaluateSpreadsheet(grid, cell, [...stack, key]).value;
  const values = expression.match(
    /[A-Z]{1,2}[0-9]+|\d+(?:\.\d+)?|[()+\-*/^,:%]|>=|<=|<>|>|<|=|[A-Z]+/g,
  );
  if (!values || values.join('') !== expression.replace(/\s/g, ''))
    return { value: '#REF!', error: 'Invalid formula.' };
  try {
    let position = 0;
    const take = () => values[position++];
    const primary = () => {
      const token = take();
      if (token === '(') {
        const value = comparison();
        take();
        return value;
      }
      if (token === '-') return -primary();
      if (/^\d/.test(token)) return Number(token);
      if (refPattern.test(token)) {
        if (values[position] === ':') {
          take();
          const end = take();
          const startCol = token.match(/[A-Z]+/)[0].charCodeAt(0);
          const endCol = end.match(/[A-Z]+/)[0].charCodeAt(0);
          const startRow = Number(token.match(/\d+/)[0]);
          const endRow = Number(end.match(/\d+/)[0]);
          const out = [];
          for (let r = startRow; r <= endRow; r += 1)
            for (let c = startCol; c <= endCol; c += 1)
              out.push(get(`${String.fromCharCode(c)}${r}`));
          return out;
        }
        return get(token);
      }
      if (/^[A-Z]+$/.test(token)) {
        if (take() !== '(') throw new Error('#NAME?');
        const args = [];
        while (values[position] !== ')') {
          args.push(comparison());
          if (values[position] !== ',') break;
          take();
        }
        take();
        const flat = args.flatMap((item) =>
          Array.isArray(item) ? item : [item],
        );
        if (token === 'SUM')
          return flat.reduce((a, b) => a + Number(b || 0), 0);
        if (token === 'AVERAGE')
          return flat.length
            ? flat.reduce((a, b) => a + Number(b || 0), 0) / flat.length
            : 0;
        if (token === 'MIN') return Math.min(...flat);
        if (token === 'MAX') return Math.max(...flat);
        if (token === 'COUNT')
          return flat.filter((v) => Number.isFinite(Number(v))).length;
        if (token === 'ABS') return Math.abs(Number(flat[0] || 0));
        if (token === 'ROUND')
          return (
            Math.round(Number(flat[0] || 0) * 10 ** Number(flat[1] || 0)) /
            10 ** Number(flat[1] || 0)
          );
        if (token === 'IF') return Number(flat[0]) ? flat[1] : flat[2];
        if (token === 'AND') return flat.every(Boolean) ? 1 : 0;
        if (token === 'OR') return flat.some(Boolean) ? 1 : 0;
        throw new Error('#NAME?');
      }
      throw new Error('#REF!');
    };
    const power = () => {
      let value = primary();
      while (values[position] === '^') {
        take();
        value **= primary();
      }
      return value;
    };
    const product = () => {
      let value = power();
      while (['*', '/'].includes(values[position])) {
        const op = take();
        const next = power();
        if (op === '/' && next === 0) throw new Error('#DIV/0!');
        value = op === '*' ? value * next : value / next;
      }
      return value;
    };
    const sum = () => {
      let value = product();
      while (['+', '-'].includes(values[position])) {
        const op = take();
        const next = product();
        value = op === '+' ? value + next : value - next;
      }
      return value;
    };
    const comparison = () => {
      let value = sum();
      const op = values[position];
      if (['=', '<>', '>', '<', '>=', '<='].includes(op)) {
        take();
        const next = sum();
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
      if (values[position] === '%') {
        take();
        value /= 100;
      }
      return value;
    };
    const result = comparison();
    if (position !== values.length) throw new Error('#REF!');
    return { value: result, error: null };
  } catch (error) {
    const message = String(error.message || '#REF!');
    return {
      value: message.startsWith('#') ? message : '#REF!',
      error: message,
    };
  }
}
