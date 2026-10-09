// Game engine 24Card — state machine ronde + game.
// SEMUA deadline digerakkan lewat tick(now) (injectable clock), tanpa setTimeout.
// Aturan: lihat PRD §2.3 / §2.3a (surrender final, semua-raise, anti-stall 45 dtk).

import type { Card } from './deck.js';
import { drawSolvableFour, fullDeck } from './deck.js';
import { validateExpression } from './validator.js';

export type Phase = 'AWAIT_RAISE' | 'CHALLENGE' | 'AWAIT_PROOF' | 'ROUND_RESOLVE' | 'GAME_OVER';

export interface Player {
  id: string;
  penaltyCards: Card[];
}

export interface RoundResolution {
  roundNo: number;
  cards: Card[];
  penaltyHolderId: string | null; // null = hangus
  hangus: boolean;
  reason:
    | 'proof_valid_challenger'
    | 'proof_invalid_target'
    | 'proof_timeout_target'
    | 'challenge_timeout_non_raiser'
    | 'all_raise_valid_last'
    | 'all_raise_invalid_last'
    | 'surrender_all'
    | 'surrender_one_left';
}

export interface Standings {
  playerId: string;
  cardCount: number;
  placement: number; // 1 = paling sedikit kartu; tie = placement sama
  isWinner: boolean; // true hanya untuk SATU pemenang unik
}

export interface EngineOptions {
  now: () => number;
  rng?: () => number;
  challengeDeadlineMs?: number; // default 45000
  proofDeadlineMs?: number; // default 45000
  surrenderOpenMs?: number; // default 30000
  onEvent?: (event: EngineEvent) => void;
}

export type EngineEvent =
  | { type: 'round_start'; roundNo: number; cards: Card[]; deckRemaining: number; surrenderOpenAt: number }
  | { type: 'raised'; playerId: string; raisedCount: number }
  | { type: 'surrendered'; playerId: string; activeCount: number }
  | { type: 'phase'; phase: Phase; challengerId: string | null; targetId: string | null; deadlineAt: number | null }
  | { type: 'round_resolved'; resolution: RoundResolution; cardCounts: Record<string, number>; deckRemaining: number }
  | { type: 'game_over'; winnerId: string | null; standings: Standings[] };

const TOTAL_ROUNDS = 10; // 40 kartu / 4

export class Game24 {
  readonly players: Player[];
  private pool: Card[];
  private phase: Phase = 'AWAIT_RAISE';
  private roundNo = 0;
  private roundCards: Card[] = [];
  private raised: Set<string> = new Set();
  private raisedOrder: string[] = [];
  private surrendered: Set<string> = new Set();
  private challengerId: string | null = null;
  private targetId: string | null = null; // pemain yang wajib bukti
  private challengeMode: 'normal' | 'allRaise' | null = null;
  private roundStartedAt = 0;
  private phaseDeadlineAt: number | null = null;
  private lastResolution: RoundResolution | null = null;
  private readonly now: () => number;
  private readonly rng: () => number;
  private readonly challengeMs: number;
  private readonly proofMs: number;
  private readonly surrenderMs: number;
  private readonly emit: (e: EngineEvent) => void;

  constructor(playerIds: string[], opts: EngineOptions) {
    if (playerIds.length < 2) throw new Error('minimal 2 pemain');
    this.players = playerIds.map((id) => ({ id, penaltyCards: [] }));
    this.now = opts.now;
    this.rng = opts.rng ?? Math.random;
    this.challengeMs = opts.challengeDeadlineMs ?? 45_000;
    this.proofMs = opts.proofDeadlineMs ?? 45_000;
    this.surrenderMs = opts.surrenderOpenMs ?? 30_000;
    this.emit = opts.onEvent ?? (() => {});
    this.pool = this.newPool();
  }

  private newPool(): Card[] {
    return fullDeck();
  }

  // ---------- lifecycle ----------

  start(): void {
    this.dealRound();
  }

  private dealRound(): void {
    if (this.pool.length < 4) { this.endGame(); return; }
    this.roundNo++;
    const drawn = drawSolvableFour(this.pool, this.rng);
    if (!drawn) { this.endGame(); return; }
    this.roundCards = drawn.cards;
    this.pool = drawn.rest;
    this.raised.clear();
    this.raisedOrder = [];
    this.surrendered.clear();
    this.challengerId = null;
    this.targetId = null;
    this.challengeMode = null;
    this.phase = 'AWAIT_RAISE';
    this.roundStartedAt = this.now();
    this.phaseDeadlineAt = null;
    this.emit({ type: 'round_start', roundNo: this.roundNo, cards: this.roundCards, deckRemaining: this.pool.length, surrenderOpenAt: this.roundStartedAt + this.surrenderMs });
    this.emit({ type: 'phase', phase: this.phase, challengerId: null, targetId: null, deadlineAt: null });
  }

  // ---------- aksi pemain ----------

  raise(playerId: string): boolean {
    if (this.phase !== 'AWAIT_RAISE' && this.phase !== 'CHALLENGE') return false;
    if (!this.isActive(playerId)) return false;
    if (this.raised.has(playerId)) return false;
    if (this.phase === 'CHALLENGE' && playerId !== this.challengerId) return false; // hanya non-raiser terakhir boleh raise di fase CHALLENGE

    this.raised.add(playerId);
    this.raisedOrder.push(playerId);
    this.emit({ type: 'raised', playerId, raisedCount: this.raisedOrder.length });

    const active = this.activePlayers();
    const notRaised = active.filter((p) => !this.raised.has(p.id));
    if (notRaised.length === 0) {
      // semua raise -> last raiser wajib bukti
      this.targetId = this.raisedOrder[this.raisedOrder.length - 1]!;
      this.challengerId = null;
      this.challengeMode = 'allRaise';
      this.enterPhase('AWAIT_PROOF', this.proofMs);
    } else if (notRaised.length === 1) {
      // sisa 1 belum raise -> dia wajib challenge
      this.challengerId = notRaised[0]!.id;
      this.challengeMode = 'normal';
      this.enterPhase('CHALLENGE', this.challengeMs);
    }
    return true;
  }

  surrender(playerId: string): boolean {
    // hanya di AWAIT_RAISE, setelah jendela 30 dtk, dan pemain masih aktif
    if (this.phase !== 'AWAIT_RAISE') return false;
    if (!this.isActive(playerId)) return false;
    if (this.now() < this.roundStartedAt + this.surrenderMs) return false;

    this.surrendered.add(playerId);
    this.emit({ type: 'surrendered', playerId, activeCount: this.activePlayers().length });

    const active = this.activePlayers();
    if (active.length === 0) {
      // semua surrender -> hangus
      this.resolveRound(null, 'surrender_all');
      return true;
    }
    if (active.length === 1) {
      // sisa 1 aktif -> hangus (tidak ada lawan challenge)
      this.resolveRound(null, 'surrender_one_left');
      return true;
    }
    // hitung ulang transisi (non-raiser mungkin berubah)
    const notRaised = active.filter((p) => !this.raised.has(p.id));
    if (notRaised.length === 0 && this.challengeMode !== 'allRaise') {
      this.targetId = this.raisedOrder[this.raisedOrder.length - 1] ?? active[active.length - 1]!.id;
      this.challengerId = null;
      this.challengeMode = 'allRaise';
      this.enterPhase('AWAIT_PROOF', this.proofMs);
    } else if (notRaised.length === 1) {
      this.challengerId = notRaised[0]!.id;
      this.challengeMode = 'normal';
      this.enterPhase('CHALLENGE', this.challengeMs);
    }
    return true;
  }

  challenge(challengerId: string, targetId: string): boolean {
    if (this.phase !== 'CHALLENGE') return false;
    if (challengerId !== this.challengerId) return false;
    if (!this.raised.has(targetId)) return false;
    if (!this.isActive(targetId)) return false;

    this.targetId = targetId;
    this.challengeMode = 'normal';
    this.enterPhase('AWAIT_PROOF', this.proofMs);
    return true;
  }

  prove(targetId: string, expression: string): boolean {
    if (this.phase !== 'AWAIT_PROOF') return false;
    if (targetId !== this.targetId) return false;

    const result = validateExpression(expression, this.roundCards);
    if (result.valid) {
      if (this.challengeMode === 'allRaise') {
        // semua raise + last raiser bukti benar -> hangus
        this.resolveRound(null, 'all_raise_valid_last');
      } else {
        // challenge biasa: penantang kalah -> penantang ambil kartu
        this.resolveRound(this.challengerId, 'proof_valid_challenger');
      }
    } else {
      // bluff -> target ambil kartu
      this.resolveRound(this.targetId, 'proof_invalid_target');
    }
    return true;
  }

  // ---------- clock ----------

  tick(now?: number): void {
    const t = now ?? this.now();
    if (this.phaseDeadlineAt === null) return;
    if (t < this.phaseDeadlineAt) return;

    if (this.phase === 'CHALLENGE') {
      // non-raiser terakhir diam -> dia ambil kartu
      this.resolveRound(this.challengerId, 'challenge_timeout_non_raiser');
    } else if (this.phase === 'AWAIT_PROOF') {
      // target gagal bukti dalam 45 dtk -> bluff
      this.resolveRound(this.targetId, 'proof_timeout_target');
    }
  }

  // ---------- internal ----------

  private enterPhase(phase: Phase, deadlineMs: number): void {
    this.phase = phase;
    this.phaseDeadlineAt = this.now() + deadlineMs;
    this.emit({ type: 'phase', phase, challengerId: this.challengerId, targetId: this.targetId, deadlineAt: this.phaseDeadlineAt });
  }

  private isActive(playerId: string): boolean {
    return this.players.some((p) => p.id === playerId) && !this.surrendered.has(playerId);
  }

  private activePlayers(): Player[] {
    const surrenderedIds = this.surrendered;
    return this.players.filter((p) => !surrenderedIds.has(p.id));
  }

  private resolveRound(penaltyHolderId: string | null, reason: RoundResolution['reason']): void {
    const hangus = penaltyHolderId === null;
    if (penaltyHolderId) {
      const holder = this.players.find((p) => p.id === penaltyHolderId);
      if (holder) holder.penaltyCards.push(...this.roundCards);
    }
    this.lastResolution = {
      roundNo: this.roundNo,
      cards: this.roundCards,
      penaltyHolderId,
      hangus,
      reason,
    };
    this.phase = 'ROUND_RESOLVE';
    this.phaseDeadlineAt = null;
    this.emit({ type: 'round_resolved', resolution: this.lastResolution, cardCounts: this.cardCounts(), deckRemaining: this.pool.length });

    // lanjut ronde berikutnya atau akhiri game
    if (this.pool.length >= 4) {
      this.dealRound();
    } else {
      this.endGame();
    }
  }

  private endGame(): void {
    this.phase = 'GAME_OVER';
    this.phaseDeadlineAt = null;
    const standings = this.computeStandings();
    const winner = standings.find((s) => s.isWinner);
    this.emit({ type: 'game_over', winnerId: winner?.playerId ?? null, standings });
  }

  private computeStandings(): Standings[] {
    const counts = this.players.map((p) => ({ playerId: p.id, cardCount: p.penaltyCards.length }));
    counts.sort((a, b) => a.cardCount - b.cardCount);
    const minCount = counts[0]?.cardCount ?? 0;
    const minHolders = counts.filter((c) => c.cardCount === minCount);
    const winnerId = minHolders.length === 1 ? minHolders[0]!.playerId : null; // tie = semua kalah

    // placement: 1 untuk kartu paling sedikit, tie share placement
    return counts.map((c, i) => {
      const placement = i > 0 && c.cardCount === counts[i - 1]!.cardCount ? counts.findIndex((x) => x.cardCount === c.cardCount) + 1 : i + 1;
      return { ...c, placement, isWinner: c.playerId === winnerId };
    });
  }

  // ---------- snapshot untuk broadcast ----------

  cardCounts(): Record<string, number> {
    return Object.fromEntries(this.players.map((p) => [p.id, p.penaltyCards.length]));
  }

  snapshot() {
    return {
      phase: this.phase,
      roundNo: this.roundNo,
      cards: this.roundCards,
      raised: [...this.raised],
      surrendered: [...this.surrendered],
      challengerId: this.challengerId,
      targetId: this.targetId,
      deckRemaining: this.pool.length,
      phaseDeadlineAt: this.phaseDeadlineAt,
      cardCounts: this.cardCounts(),
      lastResolution: this.lastResolution,
    };
  }

  get currentPhase(): Phase { return this.phase; }
}
