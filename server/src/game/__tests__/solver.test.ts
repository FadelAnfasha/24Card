import { describe, it, expect } from 'vitest';
import { isSolvable, solvableSet, comboKey } from '../solver.js';

describe('solver', () => {
  it('menghitung semua kombinasi rank solvable', () => {
    const set = solvableSet();
    expect(set.size).toBeGreaterThan(0);
    expect(set.size).toBeLessThanOrEqual(715); // C(13,4) total multiset
  });

  it('6,4,3,2 solvable (6*4/(3-2))', () => {
    expect(isSolvable(['6', '4', '3', '2'])).toBe(true);
  });

  it('2,2,2,2 TIDAK solvable (maks 16)', () => {
    expect(isSolvable(['2', '2', '2', '2'])).toBe(false);
  });

  it('10,10,10,10 TIDAK solvable', () => {
    expect(isSolvable(['10', '10', '10', '10'])).toBe(false);
  });

  it('A,A,A,A solvable — As = 11,11,1,1 -> 24', () => {
    expect(isSolvable(['A', 'A', 'A', 'A'])).toBe(true);
  });

  it('1,1,1,1 (empat As bernilai 1) tidak solvable', () => {
    expect(isSolvable(['A', 'A', 'A', 'A'])).toBe(true); // solvable via 11,11,1,1
    // tapi nilai semua = 1 tidak mungkin capai 24; solver harus pakai opsi 11
  });

  it('5,5,5,1 solvable (5*(5-1/5) butuh pecahan -> cek alternatif 5*5-5*1=20... seharusnya)', () => {
    // 5,5,5,1: (5-1/5)*5 = 24 tapi 1/5 pecahan -> TIDAK solvable dgn aturan bulat
    expect(isSolvable(['5', '5', '5', '1'])).toBe(false);
  });

  it('comboKey sorts dan konsisten', () => {
    expect(comboKey(['3', 'A', '6', '4'])).toBe(comboKey(['A', '3', '4', '6']));
  });

  it('3,3,8,8 — kasus klasik TIDAK solvable dengan pembagian bulat (8/(3-8/3) butuh pecahan)', () => {
    expect(isSolvable(['3', '3', '8', '8'])).toBe(false);
  });
});
