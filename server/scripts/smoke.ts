// Smoke test end-to-end via Socket.IO — 2 pemain, room -> game -> 1 ronde.
// Jalankan: npx tsx scripts/smoke.ts (server harus jalan di :3000)
// Pakai event recorder + timeout supaya tidak pernah hang (race-free).
import { io } from 'socket.io-client';

const URL = 'http://localhost:3000';
const log = (...a: unknown[]) => console.log('[smoke]', ...a);

interface Ev { type: string; [k: string]: unknown }

function makeClient(name: string) {
  const s = io(URL, { transports: ['websocket'] });
  const events: Ev[] = [];
  const states: Record<string, unknown>[] = [];
  s.on('connect', () => log(`${name} connected ${s.id}`));
  s.on('game:event', (e: Ev) => events.push(e));
  s.on('room:state', (st) => states.push(st as Record<string, unknown>));
  return { s, events, states, name };
}

async function waitFor<T>(desc: string, fn: () => T | undefined, timeoutMs = 8000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = fn();
    if (v !== undefined) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timeout nunggu: ${desc}`);
}

function emitAck(s: ReturnType<typeof io>, ev: string, payload?: unknown): Promise<unknown> {
  return new Promise((res) => {
    if (payload === undefined) s.emit(ev, (r: unknown) => res(r));
    else s.emit(ev, payload, (r: unknown) => res(r));
  });
}

// --- helper findExpr: enumerate A=1/11, semua permutasi + operator, validasi ketat ---
type C = { rank: string };
function findExpr(cards: C[]): string | null {
  const optionsPerCard = cards.map((c) => (c.rank === 'A' ? ['1', '11'] : [c.rank]));
  const combos = (opts: string[][]): string[][] => (opts.length === 0 ? [[]] : opts[0]!.flatMap((f) => combos(opts.slice(1)).map((rc) => [f, ...rc])));
  const perms = (arr: string[]): string[][] => {
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
  };
  const ops = ['+', '-', '*', '/'];
  for (const vals of combos(optionsPerCard))
    for (const p of perms(vals)) {
      const [w, x, y, z] = p as [string, string, string, string];
      for (const o1 of ops) for (const o2 of ops) for (const o3 of ops) {
        for (const s of [`((${w}${o1}${x})${o2}${y})${o3}${z}`, `(${w}${o1}(${x}${o2}${y}))${o3}${z}`, `(${w}${o1}${x})${o2}(${y}${o3}${z})`, `${w}${o1}((${x}${o2}${y})${o3}${z})`, `${w}${o1}(${x}${o2}(${y}${o3}${z}))`]) {
          if (evalStrict(s) === 24) return s;
        }
      }
    }
  return null;
}
function evalStrict(expr: string): number | null {
  const tokens = expr.match(/\d+|[+\-*/()]/g);
  if (!tokens) return null;
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];
  const factor = (): number | null => {
    const t = peek();
    if (t === '(') { eat(); const v = expr_(); if (peek() !== ')') return null; eat(); return v; }
    if (t && /\d/.test(t)) { eat(); return Number(t); }
    return null;
  };
  const term = (): number | null => {
    let l = factor();
    if (l === null) return null;
    while (peek() === '*' || peek() === '/') {
      const op = eat();
      const r = factor();
      if (r === null) return null;
      if (op === '*') l = l * r;
      else { if (r === 0 || l % r !== 0) return null; l = l / r; }
    }
    return l;
  };
  const expr_ = (): number | null => {
    let l = term();
    if (l === null) return null;
    while (peek() === '+' || peek() === '-') {
      const op = eat();
      const r = term();
      if (r === null) return null;
      l = op === '+' ? l + r : l - r;
    }
    return l;
  };
  const v = expr_();
  return pos === tokens.length ? v : null;
}

async function main() {
  const c1 = makeClient('p1');
  const c2 = makeClient('p2');

  await waitFor('p1 connect', () => (c1.s.connected ? true : undefined));
  await waitFor('p2 connect', () => (c2.s.connected ? true : undefined));

  // p1 buat room
  const r1 = (await emitAck(c1.s, 'room:create')) as { code?: string; error?: string };
  if (!r1.code) throw new Error('gagal buat room: ' + JSON.stringify(r1));
  const code = r1.code;
  log('room dibuat:', code);

  // p2 join
  const r2 = (await emitAck(c2.s, 'room:join', { code })) as { error?: string };
  if (r2.error) throw new Error('gagal join: ' + r2.error);
  log('p2 join room');

  // host start
  const r3 = (await emitAck(c1.s, 'game:start')) as { error?: string };
  if (r3.error) throw new Error('gagal start: ' + r3.error);
  log('game dimulai');

  // tunggu round_start muncul di recorder p1 (race-free)
  const roundStart = await waitFor('round_start', () => c1.events.find((e) => e.type === 'round_start') as Ev | undefined);
  const cards = roundStart.cards as C[];
  log('ronde 1 kartu:', cards.map((c) => c.rank).join(' '));

  // p1 raise
  const rr = (await emitAck(c1.s, 'round:raise')) as { error?: string };
  log('p1 raise:', rr.error ?? 'ok');

  // ambil target dari snapshot room (raised[0] = p1)
  const state = await waitFor('room:state dgn raised', () => c2.states.find((st) => (st.game as { raised: string[] } | null)?.raised?.length) as Record<string, unknown> | undefined);
  const target = ((state.game as { raised: string[] }).raised)[0]!;
  log('target challenge:', target);

  const rc = (await emitAck(c2.s, 'round:challenge', { targetId: target })) as { error?: string };
  log('p2 challenge:', rc.error ?? 'ok');

  // p1 prove valid
  const expr = findExpr(cards);
  if (expr) {
    log('p1 prove expr:', expr);
    const rp = (await emitAck(c1.s, 'round:prove', { expression: expr })) as { error?: string };
    log('p1 prove:', rp.error ?? 'ok');
  } else {
    throw new Error('findExpr gagal untuk kartu ronde (harusnya solvable): ' + cards.map((c) => c.rank).join(','));
  }

  const resolved = await waitFor('round_resolved', () => c1.events.find((e) => e.type === 'round_resolved') as Ev | undefined);
  log('ronde selesai, resolution:', JSON.stringify(resolved));

  const counts = (resolved.cardCounts ?? resolved) as Record<string, number>;
  log('card counts:', JSON.stringify(counts));

  c1.s.close();
  c2.s.close();
  log('SMOKE OK');
  process.exit(0);
}

main().catch((e) => { console.error('[smoke] GAGAL:', e); process.exit(1); });
