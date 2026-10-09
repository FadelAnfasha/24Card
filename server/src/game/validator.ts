// Validator ekspresi anti-cheat. Server TIDAK PERNAH eval mentah:
// tokenize -> recursive-descent parse ke AST -> evaluasi dengan cek
// pembagian bulat di SETIAP simpul -> cek hasil 24 -> cek multiset kartu.
// As cocok dengan angka 1 ATAU 11.

import type { Card } from './deck.js';

export interface ProofResult {
  valid: boolean;
  reason?: string;
}

type Token = { kind: 'num'; value: number } | { kind: 'op'; value: string } | { kind: 'paren'; value: '(' | ')' };

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (/[0-9]/.test(ch)) {
      let num = '';
      while (i < input.length && /[0-9]/.test(input[i]!)) { num += input[i]!; i++; }
      const v = Number(num);
      if (v > 11) return null; // angka di luar jangkauan kartu
      tokens.push({ kind: 'num', value: v });
      continue;
    }
    if ('+-*/'.includes(ch)) { tokens.push({ kind: 'op', value: ch }); i++; continue; }
    if (ch === '(' || ch === ')') { tokens.push({ kind: 'paren', value: ch }); i++; continue; }
    return null; // karakter asing
  }
  return tokens;
}

type Ast = { t: 'num'; v: number } | { t: 'bin'; op: string; l: Ast; r: Ast };

// Grammar: expr := term (('+'|'-') term)* ; term := factor (('*'|'/') factor)* ; factor := num | '(' expr ')'
function parse(tokens: Token[]): Ast | null {
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];

  function expr(): Ast | null {
    let left = term();
    if (!left) return null;
    while (peek()?.kind === 'op' && (peek()!.value === '+' || peek()!.value === '-')) {
      const tok = eat();
      if (!tok || tok.kind !== 'op') return null;
      const op = String(tok.value);
      const right = term();
      if (!right) return null;
      left = { t: 'bin', op, l: left, r: right };
    }
    return left;
  }
  function term(): Ast | null {
    let left = factor();
    if (!left) return null;
    while (peek()?.kind === 'op' && (peek()!.value === '*' || peek()!.value === '/')) {
      const tok = eat();
      if (!tok || tok.kind !== 'op') return null;
      const op = String(tok.value);
      const right = factor();
      if (!right) return null;
      left = { t: 'bin', op, l: left, r: right };
    }
    return left;
  }
  function factor(): Ast | null {
    const t = peek();
    if (!t) return null;
    if (t.kind === 'num') { eat(); return { t: 'num', v: t.value }; }
    if (t.kind === 'paren' && t.value === '(') {
      eat();
      const inner = expr();
      const close = peek();
      if (!inner || !close || close.kind !== 'paren' || close.value !== ')') return null;
      eat();
      return inner;
    }
    return null;
  }

  const ast = expr();
  if (!ast || pos !== tokens.length) return null;
  return ast;
}

// Evaluasi AST; setiap pembagian wajib bulat. Return null kalau ada pelanggaran.
function evalAst(ast: Ast): number | null {
  if (ast.t === 'num') return ast.v;
  const l = evalAst(ast.l);
  const r = evalAst(ast.r);
  if (l === null || r === null) return null;
  switch (ast.op) {
    case '+': return l + r;
    case '-': return l - r;
    case '*': return l * r;
    case '/': return r !== 0 && l % r === 0 ? l / r : null;
    default: return null;
  }
}

function collectNums(ast: Ast, out: number[]): void {
  if (ast.t === 'num') { out.push(ast.v); return; }
  collectNums(ast.l, out);
  collectNums(ast.r, out);
}

// Cek multiset angka ekspresi cocok dengan 4 kartu (As = 1 atau 11).
function multisetMatches(cards: Card[], nums: number[]): boolean {
  if (nums.length !== cards.length) return false;
  const remaining = [...nums].sort((a, b) => a - b);
  const cardOptions = cards.map((c) => (c.rank === 'A' ? [1, 11] : [Number(c.rank)]));

  // backtrack: setiap kartu ambil satu angka dari sisa
  function match(idx: number): boolean {
    if (idx === cards.length) return remaining.length === 0;
    for (const opt of cardOptions[idx]!) {
      const pos = remaining.indexOf(opt);
      if (pos === -1) continue;
      const used = remaining.splice(pos, 1)[0]!;
      if (match(idx + 1)) { remaining.splice(pos, 0, used); return true; }
      remaining.splice(pos, 0, used);
    }
    return false;
  }
  return match(0);
}

export function validateExpression(expression: string, cards: Card[]): ProofResult {
  const tokens = tokenize(expression);
  if (!tokens) return { valid: false, reason: 'karakter tidak diizinkan' };
  if (tokens.length === 0) return { valid: false, reason: 'ekspresi kosong' };

  const ast = parse(tokens);
  if (!ast) return { valid: false, reason: 'struktur ekspresi tidak valid' };

  const result = evalAst(ast);
  if (result === null) return { valid: false, reason: 'pembagian harus bilangan bulat (atau nol)' };
  if (result !== 24) return { valid: false, reason: `hasil = ${result}, bukan 24` };

  const nums: number[] = [];
  collectNums(ast, nums);
  if (!multisetMatches(cards, nums)) return { valid: false, reason: 'kartu yang dipakai tidak cocok dengan 4 kartu ronde' };

  return { valid: true };
}
