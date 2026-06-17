import { easeInOut, easeInOutExpr } from '../../src/shared/domain/easing.js';

/**
 * Tiny recursive-descent evaluator over the limited grammar used by
 * easeInOutExpr: decimal numbers, identifiers bound to a single value, the
 * binary operators + - * /, and the functions pow(a,b), lt(a,b), if(cond,a,b).
 * Deliberately minimal so it cannot give false confidence in the curve test.
 */
function evalExpr(src: string, vars: Record<string, number>): number {
  let pos = 0;

  function skipWs(): void {
    while (pos < src.length && src[pos] === ' ') pos++;
  }

  function peek(): string {
    skipWs();
    return src[pos] ?? '';
  }

  function eat(ch: string): void {
    skipWs();
    if (src[pos] !== ch) throw new Error(`expected '${ch}' at ${pos} in '${src}'`);
    pos++;
  }

  // expr := term (('+' | '-') term)*
  function parseExpr(): number {
    let value = parseTerm();
    for (;;) {
      const op = peek();
      if (op === '+') {
        eat('+');
        value += parseTerm();
      } else if (op === '-') {
        eat('-');
        value -= parseTerm();
      } else {
        return value;
      }
    }
  }

  // term := factor (('*' | '/') factor)*
  function parseTerm(): number {
    let value = parseFactor();
    for (;;) {
      const op = peek();
      if (op === '*') {
        eat('*');
        value *= parseFactor();
      } else if (op === '/') {
        eat('/');
        value /= parseFactor();
      } else {
        return value;
      }
    }
  }

  // factor := '-' factor | '(' expr ')' | number | call | identifier
  function parseFactor(): number {
    const c = peek();
    if (c === '-') {
      eat('-');
      return -parseFactor();
    }
    if (c === '(') {
      eat('(');
      const v = parseExpr();
      eat(')');
      return v;
    }
    if ((c >= '0' && c <= '9') || c === '.') {
      return parseNumber();
    }
    return parseIdentifierOrCall();
  }

  function parseNumber(): number {
    skipWs();
    const start = pos;
    while (pos < src.length && ((src[pos]! >= '0' && src[pos]! <= '9') || src[pos] === '.')) pos++;
    const text = src.slice(start, pos);
    const n = Number(text);
    if (!Number.isFinite(n)) throw new Error(`bad number '${text}' in '${src}'`);
    return n;
  }

  function parseIdentifierOrCall(): number {
    skipWs();
    const start = pos;
    while (
      pos < src.length &&
      ((src[pos]! >= 'a' && src[pos]! <= 'z') ||
        (src[pos]! >= 'A' && src[pos]! <= 'Z') ||
        (src[pos]! >= '0' && src[pos]! <= '9') ||
        src[pos] === '_')
    ) {
      pos++;
    }
    const name = src.slice(start, pos);
    if (name === '') throw new Error(`unexpected char '${src[pos]}' at ${pos} in '${src}'`);

    if (peek() === '(') {
      const args = parseArgs();
      switch (name) {
        case 'pow':
          if (args.length !== 2) throw new Error('pow expects 2 args');
          return Math.pow(args[0]!, args[1]!);
        case 'lt':
          if (args.length !== 2) throw new Error('lt expects 2 args');
          return args[0]! < args[1]! ? 1 : 0;
        case 'if':
          if (args.length !== 3) throw new Error('if expects 3 args');
          return args[0]! !== 0 ? args[1]! : args[2]!;
        default:
          throw new Error(`unknown function '${name}'`);
      }
    }

    if (!(name in vars)) throw new Error(`unbound identifier '${name}'`);
    return vars[name]!;
  }

  function parseArgs(): number[] {
    eat('(');
    const args: number[] = [];
    if (peek() !== ')') {
      args.push(parseExpr());
      while (peek() === ',') {
        eat(',');
        args.push(parseExpr());
      }
    }
    eat(')');
    return args;
  }

  const result = parseExpr();
  skipWs();
  if (pos !== src.length) throw new Error(`trailing input at ${pos} in '${src}'`);
  return result;
}

const SAMPLE_TS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

describe('easeInOut (number form)', () => {
  test('anchor points', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBe(0.5);
    expect(easeInOut(1)).toBe(1);
  });

  test('monotonic non-decreasing across sampled t', () => {
    for (let i = 1; i < SAMPLE_TS.length; i++) {
      const prev = easeInOut(SAMPLE_TS[i - 1]!);
      const cur = easeInOut(SAMPLE_TS[i]!);
      expect(cur).toBeGreaterThanOrEqual(prev);
    }
  });
});

describe('easeInOutExpr (ffmpeg expression form)', () => {
  test('exact string for a simple progress var', () => {
    expect(easeInOutExpr('p')).toBe('if(lt(p,0.5),2*p*p,1-pow(-2*p+2,2)/2)');
  });

  test('exact string for a compound progress expression', () => {
    expect(easeInOutExpr('(t-1.000)/0.300')).toBe(
      'if(lt((t-1.000)/0.300,0.5),2*(t-1.000)/0.300*(t-1.000)/0.300,1-pow(-2*(t-1.000)/0.300+2,2)/2)',
    );
  });
});

describe('evaluator self-check', () => {
  test('evaluates easeInOutExpr(0.5) to ~0.5', () => {
    const v = evalExpr(easeInOutExpr('0.5'), {});
    expect(Math.abs(v - 0.5)).toBeLessThan(1e-9);
  });

  test('basic grammar sanity', () => {
    expect(evalExpr('1+2*3', {})).toBe(7);
    expect(evalExpr('(1+2)*3', {})).toBe(9);
    expect(evalExpr('pow(2,3)', {})).toBe(8);
    expect(evalExpr('lt(1,2)', {})).toBe(1);
    expect(evalExpr('lt(2,1)', {})).toBe(0);
    expect(evalExpr('if(lt(1,2),10,20)', {})).toBe(10);
    expect(evalExpr('if(lt(2,1),10,20)', {})).toBe(20);
    expect(evalExpr('-2*p+2', { p: 0.5 })).toBe(1);
  });
});

describe('anti-divergence: number form === expression form', () => {
  test('easeInOut(t) matches eval(easeInOutExpr(t)) within 1e-9 for sampled t', () => {
    for (const t of SAMPLE_TS) {
      const numeric = easeInOut(t);
      const fromExpr = evalExpr(easeInOutExpr(String(t)), {});
      expect(Math.abs(numeric - fromExpr)).toBeLessThan(1e-9);
    }
  });
});
