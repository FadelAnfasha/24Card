// Deck 40 kartu: 4 suit (S/H/D/C) x 10 rank (A,2..10).
// Rank 2-10 bernilai sesuai angka; A fleksibel (1 atau 11) — fleksibilitas
// ditangani validator/solver, di sini A disimpan sebagai rank saja.

import { comboKey, isSolvable } from './solver.js';

export type Suit = 'S' | 'H' | 'D' | 'C';
export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  id: string; // contoh: "6H"
  suit: Suit;
  rank: Rank;
}

export function fullDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ id: `${rank}${suit}`, suit, rank });
    }
  }
  return cards; // 40 kartu
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Ambil 4 kartu acak dari pool yang kombinasi rank-nya solvable.
 * Return null kalau pool tidak cukup (< 4 kartu).
 */
export function drawSolvableFour(pool: Card[], rng: () => number = Math.random): { cards: Card[]; rest: Card[] } | null {
  if (pool.length < 4) return null;

  // Coba acak dulu (cepat di praktiknya)
  for (let attempt = 0; attempt < 200; attempt++) {
    const picked = shuffle(pool, rng).slice(0, 4);
    const key = comboKey(picked.map((c) => c.rank));
    if (isSolvable(picked.map((c) => c.rank))) {
      const pickedIds = new Set(picked.map((c) => c.id));
      return { cards: picked.sort((a, b) => Number(a.rank) - Number(b.rank)), rest: pool.filter((c) => !pickedIds.has(c.id)) };
    }
    void key;
  }

  // Fallback: pindai kombinasi eksak (pool kecil / rng jelek)
  const n = pool.length;
  for (let a = 0; a < n - 3; a++)
    for (let b = a + 1; b < n - 2; b++)
      for (let c = b + 1; c < n - 1; c++)
        for (let d = c + 1; d < n; d++) {
          const picked = [pool[a]!, pool[b]!, pool[c]!, pool[d]!];
          if (isSolvable(picked.map((x) => x.rank))) {
            const pickedIds = new Set(picked.map((x) => x.id));
            return { cards: picked.sort((x, y) => Number(x.rank) - Number(y.rank)), rest: pool.filter((x) => !pickedIds.has(x.id)) };
          }
        }
  return null;
}
