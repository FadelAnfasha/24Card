// Solver: precompute semua multiset 4 rank (A,2..10) yang bisa mencapai tepat 24.
// Aturan: tiap kartu dipakai sekali, operator + - * /, kurung bebas,
// SEMUA pembagian harus bilangan bulat, As bernilai 1 ATAU 11.

type Op = '+' | '-' | '*' | '/';
const OPS: Op[] = ['+', '-', '*', '/'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;

function applyStrict(a: number, op: Op, b: number): number | null {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b !== 0 && a % b === 0 ? a / b : null;
  }
}

// 5 bentuk pohon biner untuk 4 operand
function canMake24(w: number, x: number, y: number, z: number): boolean {
  for (const o1 of OPS) for (const o2 of OPS) for (const o3 of OPS) {
    // ((w o1 x) o2 y) o3 z
    let r = applyStrict(w, o1, x);
    if (r !== null) { r = applyStrict(r, o2, y); if (r !== null && applyStrict(r, o3, z) === 24) return true; }
    // (w o1 (x o2 y)) o3 z
    const r2 = applyStrict(x, o2, y);
    if (r2 !== null) { const l = applyStrict(w, o1, r2); if (l !== null && applyStrict(l, o3, z) === 24) return true; }
    // (w o1 x) o2 (y o3 z)
    const l3 = applyStrict(w, o1, x), r3 = applyStrict(y, o3, z);
    if (l3 !== null && r3 !== null && applyStrict(l3, o2, r3) === 24) return true;
    // w o1 ((x o2 y) o3 z)
    let r4 = applyStrict(x, o2, y);
    if (r4 !== null) { r4 = applyStrict(r4, o3, z); if (r4 !== null && applyStrict(w, o1, r4) === 24) return true; }
    // w o1 (x o2 (y o3 z))
    let r5 = applyStrict(y, o3, z);
    if (r5 !== null) { const rr = applyStrict(x, o2, r5); if (rr !== null && applyStrict(w, o1, rr) === 24) return true; }
  }
  return false;
}

function permutations(arr: number[]): number[][] {
  if (arr.length <= 1) return [arr];
  const out: number[][] = [];
  const seen = new Set<number>();
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i]!;
    if (seen.has(v)) continue; // dedupe nilai identik
    seen.add(v);
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const perm of permutations(rest)) out.push([v, ...perm]);
  }
  return out;
}

export function rankValueOptions(rank: string): number[] {
  return rank === 'A' ? [1, 11] : [Number(rank)];
}

export function comboKey(ranks: string[]): string {
  return [...ranks].sort().join(',');
}

function ranksSolvable(ranks: string[]): boolean {
  // coba semua kombinasi nilai As (1/11)
  let valueSets: number[][] = [ranks.map((r) => rankValueOptions(r)[0]!)];
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== 'A') continue;
    const opts = rankValueOptions('A');
    const next: number[][] = [];
    for (const set of valueSets) for (const v of opts) next.push(set.map((s, j) => (j === i ? v : s)));
    valueSets = next;
  }
  for (const vals of valueSets) {
    for (const perm of permutations(vals)) {
      if (canMake24(perm[0]!, perm[1]!, perm[2]!, perm[3]!)) return true;
    }
  }
  return false;
}

function allRankMultisets(): string[][] {
  const out: string[][] = [];
  const cur: string[] = [];
  function rec(start: number): void {
    if (cur.length === 4) { out.push([...cur]); return; }
    for (let i = start; i < RANKS.length; i++) {
      cur.push(RANKS[i]!);
      rec(i);
      cur.pop();
    }
  }
  rec(0);
  return out;
}

let _solvable: Set<string> | null = null;
export function solvableSet(): Set<string> {
  if (!_solvable) {
    _solvable = new Set();
    for (const ranks of allRankMultisets()) {
      if (ranksSolvable(ranks)) _solvable.add(comboKey(ranks));
    }
  }
  return _solvable;
}

export function isSolvable(ranks: string[]): boolean {
  return solvableSet().has(comboKey(ranks));
}
