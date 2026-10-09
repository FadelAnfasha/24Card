// Cek 4,6,7,9 bisa 24 gak — aturan game: tiap pembagian harus bulat, tiap angka dipakai 1x.
const nums = [4, 6, 7, 9];
const results: string[] = [];

function apply(a: number, op: string, b: number): number | null {
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '*') return a * b;
  if (op === '/') return b !== 0 && a % b === 0 ? a / b : null; // bulat saja
  return null;
}

// cari semua cara mengurutkan + bracket (bentuk pohon biner) utk 4 angka
function solve(vals: number[], exprs: string[]): void {
  if (vals.length === 1) {
    if (vals[0] === 24) results.push(exprs[0]);
    return;
  }
  for (let i = 0; i < vals.length; i++) {
    for (let j = 0; j < vals.length; j++) {
      if (i === j) continue;
      const a = vals[i], b = vals[j];
      const ea = exprs[i], eb = exprs[j];
      const restV = vals.filter((_, k) => k !== i && k !== j);
      const restE = exprs.filter((_, k) => k !== i && k !== j);
      for (const op of ['+', '-', '*', '/']) {
        const r = apply(a, op, b);
        if (r === null) continue;
        solve([r, ...restV], [`(${ea} ${op} ${eb})`, ...restE]);
      }
    }
  }
}

solve(nums, nums.map(String));
if (results.length === 0) console.log('TIDAK BISA 24 (dengan aturan pembagian bulat)');
else {
  console.log('BISA 24! beberapa solusi:');
  [...new Set(results)].slice(0, 8).forEach((r) => console.log('  ', r));
}
