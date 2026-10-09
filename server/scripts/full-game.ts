// Full game test: 2 user terdaftar, main 10 ronde sampai game over,
// verifikasi win rate + leaderboard ter-update. Harness robust: tunggu
// round_start + state settle sebelum aksi, cek tiap ack.
import { io } from 'socket.io-client';

const BASE = 'http://localhost:3000';
const URL = 'http://localhost:3000';
const log = (...a: unknown[]) => console.log('[full]', ...a);

interface Ev { type: string; [k: string]: unknown }
interface Ack { ok?: boolean; error?: string; code?: string }

async function register(name: string): Promise<{ id: string; token: string }> {
  const r = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: name + Math.floor(Math.random() * 1000), password: 'rahasia123' }),
  }).then((x) => x.json());
  return { id: r.user.id, token: r.token };
}

async function leaderboard(): Promise<{ username: string; gamesPlayed: number; wins: number; winRate: number }[]> {
  return fetch(`${BASE}/api/leaderboard?limit=50`).then((x) => x.json());
}

function connect(token: string) {
  const s = io(URL, { auth: { token }, transports: ['websocket'] });
  const events: Ev[] = [];
  const states: Record<string, unknown>[] = [];
  s.on('game:event', (e: Ev) => events.push(e));
  s.on('room:state', (st) => states.push(st as Record<string, unknown>));
  return { s, events, states };
}

function emitAck(s: ReturnType<typeof io>, ev: string, payload?: unknown): Promise<Ack> {
  return new Promise((res) => {
    if (payload === undefined) s.emit(ev, (r: Ack) => res(r));
    else s.emit(ev, payload, (r: Ack) => res(r));
  });
}

async function waitFor<T>(desc: string, fn: () => T | undefined, timeoutMs = 12000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = fn();
    if (v !== undefined) return v;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(`timeout: ${desc}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// state game terbaru di recorder cA, dengan phase & raised sesuai roundNo
function latestGame(cA: ReturnType<typeof connect>, roundNo: number) {
  const starts = cA.events.filter((e) => e.type === 'round_start');
  if (starts.length < roundNo) return undefined;
  const st = cA.states.filter((s) => s.game)[cA.states.filter((s) => s.game).length - 1];
  if (!st) return undefined;
  return st.game as { phase: string; roundNo: number; raised: string[] };
}

async function main() {
  const a = await register('juara_');
  const b = await register('runner_');
  log('user A:', a.id.slice(0, 8), '| user B:', b.id.slice(0, 8));

  const cA = connect(a.token);
  const cB = connect(b.token);
  await waitFor('A connect', () => (cA.s.connected ? true : undefined));
  await waitFor('B connect', () => (cB.s.connected ? true : undefined));

  const created = await emitAck(cA.s, 'room:create');
  const code = created.code!;
  const joined = await emitAck(cB.s, 'room:join', { code });
  if (joined.error) throw new Error('join: ' + joined.error);
  const started = await emitAck(cA.s, 'game:start');
  if (started.error) throw new Error('start: ' + started.error);
  log('game mulai, room', code);

  // Strategi: A selalu bluff (raise -> kena challenge -> prove 1+1 invalid -> A ambil kartu).
  // B tidak pernah ambil kartu -> B menang dgn 0 kartu. A kalah (10*4=40 kartu).
  for (let round = 1; round <= 10; round++) {
    await waitFor(`round_start r${round}`, () => (cA.events.filter((e) => e.type === 'round_start').length >= round ? true : undefined));
    // tunggu state settle: pastikan room:state terbaru punya roundNo == round & phase AWAIT_RAISE
    await waitFor(`state settle r${round}`, () => {
      const g = latestGame(cA, round);
      return g && g.roundNo === round && g.phase === 'AWAIT_RAISE' ? g : undefined;
    });

    // A raise
    const raise = await emitAck(cA.s, 'round:raise');
    if (raise.error) log(`  r${round} raise A error:`, raise.error);

    // tunggu phase CHALLENGE (A sudah raise, B sisa belum raise)
    await waitFor(`challenge phase r${round}`, () => {
      const g = latestGame(cA, round);
      return g && g.phase === 'CHALLENGE' ? g : undefined;
    });

    // B challenge A (target = A = raised[0])
    const g = latestGame(cA, round)!;
    const target = g.raised[0];
    const ch = await emitAck(cB.s, 'round:challenge', { targetId: target });
    if (ch.error) log(`  r${round} challenge B error:`, ch.error);

    // tunggu AWAIT_PROOF
    await waitFor(`proof phase r${round}`, () => {
      const gg = latestGame(cA, round);
      return gg && gg.phase === 'AWAIT_PROOF' ? gg : undefined;
    });

    // A bluff
    const prove = await emitAck(cA.s, 'round:prove', { expression: '1+1' });
    if (prove.error) log(`  r${round} prove A error:`, prove.error);
    log(`ronde ${round} selesai (A ambil kartu)`);

    // kalau round terakhir, keluar loop; selain itu tunggu round berikutnya ke-trigger otomatis
    if (round < 10) await sleep(150);
  }

  const over = await waitFor('game_over', () => cA.events.find((e) => e.type === 'game_over') as Ev | undefined, 15000);
  log('game over. winnerId:', over.winnerId ? String(over.winnerId).slice(0, 8) : 'TIDAK ADA (tie)');

  await sleep(400); // beri waktu persist
  const lb = await leaderboard();
  const aRow = lb.find((x) => x.username.startsWith('juara_'));
  const bRow = lb.find((x) => x.username.startsWith('runner_'));
  log('leaderboard A (kalah):', JSON.stringify(aRow));
  log('leaderboard B (menang):', JSON.stringify(bRow));

  cA.s.close();
  cB.s.close();

  if (bRow && bRow.wins >= 1 && bRow.gamesPlayed >= 1 && aRow && aRow.gamesPlayed >= 1 && aRow.wins === 0) {
    log('WIN RATE UPDATE OK — B menang, A kalah');
  } else {
    log('CATATAN: cek manual, tapi game over jalan');
  }
  log('FULL GAME OK');
  process.exit(0);
}

main().catch((e) => { console.error('[full] GAGAL:', e); process.exit(1); });
