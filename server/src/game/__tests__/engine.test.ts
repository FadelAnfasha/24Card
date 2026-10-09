import { describe, it, expect } from 'vitest';
import { Game24, type EngineEvent } from '../engine.js';
import { validateExpression } from '../validator.js';
import type { Card } from '../deck.js';

// Jam palsu buat kontrol deadline
class FakeClock {
  t = 0;
  now = () => this.t;
  advance(ms: number) { this.t += ms; }
}

function mkCards(specs: string[]): Card[] {
  return specs.map((s) => {
    const suit = s.slice(-1) as Card['suit'];
    const rank = s.slice(0, -1) as Card['rank'];
    return { id: s, suit, rank };
  });
}

// Helper: bikin game dengan kartu ronde terkontrol lewat rng palsu
// Kita pakai rng yang deterministik + override pool via start biasa lalu
// tangkap kartu dari event, supaya prove pakai kartu yang benar.
function makeGame(playerIds: string[], clock: FakeClock) {
  const events: EngineEvent[] = [];
  const game = new Game24(playerIds, {
    now: clock.now,
    challengeDeadlineMs: 45_000,
    proofDeadlineMs: 45_000,
    surrenderOpenMs: 30_000,
    onEvent: (e) => events.push(e),
  });
  return { game, events };
}

function currentCards(events: EngineEvent[]): Card[] {
  const starts = events.filter((e) => e.type === 'round_start');
  const last = starts[starts.length - 1]!;
  if (last.type !== 'round_start') throw new Error('no round_start');
  return last.cards;
}

// Cari ekspresi valid buat 4 kartu ronde. Enumerate A=1/11 lalu semua
// kombinasi operator + 5 bentuk pohon; validasi pakai validator asli.
function findExpr(cards: Card[]): string | null {
  const optionsPerCard = cards.map((c) => (c.rank === 'A' ? ['1', '11'] : [c.rank]));

  // cartesian product semua penugasan nilai (A bisa 1 atau 11)
  function combos(opts: string[][]): string[][] {
    if (opts.length === 0) return [[]];
    const [first, ...rest] = opts;
    const restCombos = combos(rest);
    return first!.flatMap((f) => restCombos.map((rc) => [f, ...rc]));
  }

  // semua permutasi unik dari 4 nilai (dedupe nilai identik)
  function perms(arr: string[]): string[][] {
    if (arr.length <= 1) return [arr];
    const out: string[][] = [];
    const seen = new Set<string>();
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i]!;
      if (seen.has(v)) continue;
      seen.add(v);
      for (const rest of perms([...arr.slice(0, i), ...arr.slice(i + 1)])) out.push([v, ...rest]);
    }
    return out;
  }

  const ops = ['+', '-', '*', '/'];
  for (const vals of combos(optionsPerCard)) {
    for (const p of perms(vals)) {
      const [w, x, y, z] = p as [string, string, string, string];
      for (const o1 of ops) for (const o2 of ops) for (const o3 of ops) {
        const shapes: string[] = [
          `((${w}${o1}${x})${o2}${y})${o3}${z}`,
          `(${w}${o1}(${x}${o2}${y}))${o3}${z}`,
          `(${w}${o1}${x})${o2}(${y}${o3}${z})`,
          `${w}${o1}((${x}${o2}${y})${o3}${z})`,
          `${w}${o1}(${x}${o2}(${y}${o3}${z}))`,
        ];
        for (const s of shapes) {
          if (validateExpression(s, cards).valid) return s;
        }
      }
    }
  }
  return null;
}

describe('engine — alur challenge & pembuktian', () => {
  it('happy path: challenger menang -> penantang ambil kartu', () => {
    const clock = new FakeClock();
    const { game, events } = makeGame(['p1', 'p2', 'p3'], clock);
    game.start();
    const cards = currentCards(events);
    const expr = findExpr(cards);
    expect(expr).not.toBeNull();

    // p1, p2 raise; p3 (sisa) challenge p1
    expect(game.raise('p1')).toBe(true);
    expect(game.raise('p2')).toBe(true);
    expect(game.challenge('p3', 'p1')).toBe(true);
    // p1 bukti benar -> p3 (penantang) ambil 4 kartu
    expect(game.prove('p1', expr!)).toBe(true);
    expect(game.cardCounts().p3).toBe(4);
  });

  it('bluff: bukti invalid -> target ambil kartu', () => {
    const clock = new FakeClock();
    const { game, events } = makeGame(['p1', 'p2', 'p3'], clock);
    game.start();
    game.raise('p1');
    game.raise('p2');
    game.challenge('p3', 'p1');
    // p1 bluff: ekspresi salah
    expect(game.prove('p1', '1+1')).toBe(true);
    expect(game.cardCounts().p1).toBe(4); // target (p1) ambil
  });

  it('challenge timeout -> non-raiser terakhir ambil kartu', () => {
    const clock = new FakeClock();
    const { game, events } = makeGame(['p1', 'p2', 'p3'], clock);
    game.start();
    game.raise('p1');
    game.raise('p2');
    // p3 diam; lewat 45 detik
    clock.advance(45_001);
    game.tick(clock.now());
    expect(game.cardCounts().p3).toBe(4);
  });

  it('proof timeout -> target dianggap bluff', () => {
    const clock = new FakeClock();
    const { game, events } = makeGame(['p1', 'p2', 'p3'], clock);
    game.start();
    game.raise('p1');
    game.raise('p2');
    game.challenge('p3', 'p1');
    clock.advance(45_001);
    game.tick(clock.now());
    expect(game.cardCounts().p1).toBe(4);
  });
});

describe('engine — semua raise (all-raise)', () => {
  it('last raiser bukti benar -> hangus', () => {
    const clock = new FakeClock();
    const { game, events } = makeGame(['p1', 'p2', 'p3'], clock);
    game.start();
    const cards = currentCards(events);
    const expr = findExpr(cards);
    game.raise('p1');
    game.raise('p2');
    game.raise('p3'); // last raiser = p3
    // p3 bukti benar -> hangus, tidak ada yang ambil
    expect(game.prove('p3', expr!)).toBe(true);
    const counts = game.cardCounts();
    expect(counts.p1).toBe(0);
    expect(counts.p2).toBe(0);
    expect(counts.p3).toBe(0);
  });

  it('last raiser gagal bukti -> last raiser ambil kartu', () => {
    const clock = new FakeClock();
    const { game, events } = makeGame(['p1', 'p2', 'p3'], clock);
    game.start();
    game.raise('p1');
    game.raise('p2');
    game.raise('p3');
    expect(game.prove('p3', '9+9')).toBe(true); // invalid
    expect(game.cardCounts().p3).toBe(4);
  });
});

describe('engine — surrender', () => {
  it('surrender sebelum 30 detik DITOLAK', () => {
    const clock = new FakeClock();
    const { game } = makeGame(['p1', 'p2', 'p3'], clock);
    game.start();
    expect(game.surrender('p1')).toBe(false); // belum 30 detik
  });

  it('partial surrender -> ronde lanjut antar sisa pemain', () => {
    const clock = new FakeClock();
    const { game, events } = makeGame(['p1', 'p2', 'p3'], clock);
    game.start();
    const cards = currentCards(events);
    const expr = findExpr(cards);
    clock.advance(30_001);
    // p3 surrender; sisa p1,p2. p1 raise -> p2 wajib challenge
    expect(game.surrender('p3')).toBe(true);
    expect(game.raise('p1')).toBe(true);
    expect(game.challenge('p2', 'p1')).toBe(true);
    expect(game.prove('p1', expr!)).toBe(true);
    // p1 bukti benar -> p2 (penantang) ambil; p3 (surrender) tidak kena
    expect(game.cardCounts().p2).toBe(4);
    expect(game.cardCounts().p3).toBe(0);
  });

  it('semua surrender -> hangus', () => {
    const clock = new FakeClock();
    const { game } = makeGame(['p1', 'p2', 'p3'], clock);
    game.start();
    clock.advance(30_001);
    game.surrender('p1');
    game.surrender('p2');
    game.surrender('p3');
    const counts = game.cardCounts();
    expect(counts.p1).toBe(0);
    expect(counts.p2).toBe(0);
    expect(counts.p3).toBe(0);
  });

  it('surrender DITOLAK setelah challenge aktif', () => {
    const clock = new FakeClock();
    const { game } = makeGame(['p1', 'p2', 'p3'], clock);
    game.start();
    clock.advance(30_001);
    game.raise('p1');
    game.raise('p2');
    // sekarang phase CHALLENGE (p3 mesti challenge)
    expect(game.surrender('p3')).toBe(false);
  });

  it('sisa 1 aktif setelah surrender -> hangus', () => {
    const clock = new FakeClock();
    const { game } = makeGame(['p1', 'p2', 'p3'], clock);
    game.start();
    clock.advance(30_001);
    game.surrender('p2');
    game.surrender('p3'); // sisa p1 doang
    // kartu hangus, tidak ada yang ambil
    expect(game.cardCounts().p1).toBe(0);
  });
});

describe('engine — akhir game & pemenang', () => {
  it('game berakhir: pemenang = kartu paling sedikit', () => {
    const clock = new FakeClock();
    const { game, events } = makeGame(['p1', 'p2'], clock);
    game.start();
    // main 10 ronde: tiap ronde p1 raise, p2 challenge p1, p1 bluff -> p1 ambil 4
    for (let round = 0; round < 10; round++) {
      const phase = game.snapshot().phase;
      if (phase === 'GAME_OVER') break;
      game.raise('p1');
      // kalau p1 raise doang (2 pemain), p2 jadi challenger
      game.challenge('p2', 'p1');
      game.prove('p1', '1+1'); // bluff
    }
    const over = events.find((e) => e.type === 'game_over');
    expect(over).toBeDefined();
    if (over?.type === 'game_over') {
      // p1 ambil tiap ronde -> p1 kalah, p2 menang
      expect(over.winnerId).toBe('p2');
    }
  });

  it('tie -> semua kalah (tidak ada pemenang)', () => {
    const clock = new FakeClock();
    const { game, events } = makeGame(['p1', 'p2'], clock);
    game.start();
    // bergantian: ronde ganjil p1 ambil, genap p2 ambil -> tie
    for (let round = 0; round < 10; round++) {
      if (game.snapshot().phase === 'GAME_OVER') break;
      const even = round % 2 === 0;
      const taker = even ? 'p1' : 'p2';
      const other = even ? 'p2' : 'p1';
      game.raise(taker);
      game.challenge(other, taker);
      game.prove(taker, '1+1'); // bluff -> taker ambil
    }
    const over = events.find((e) => e.type === 'game_over');
    if (over?.type === 'game_over') {
      expect(over.winnerId).toBeNull(); // tie -> tidak ada pemenang
    }
  });
});
