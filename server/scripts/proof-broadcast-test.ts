// Test: bukti BENAR -> event proof:correct ke-emit ke SEMUA pemain (bukan cuma pembuktian).
import { io } from 'socket.io-client';
const URL = 'http://localhost:3000';
const log = (...a: unknown[]) => console.log('[bc]', ...a);
function connect(pid: string, nick: string) {
  const s = io(URL, { auth: { playerId: pid, nickname: nick }, transports: ['websocket'] });
  const states: any[] = [];
  const proofs: any[] = [];
  s.on('room:state', (st) => states.push(st));
  s.on('proof:correct', (d) => proofs.push(d));
  return { s, states, proofs };
}
function ack(s: any, ev: string, payload?: any): Promise<any> {
  return new Promise((res) => { if (payload === undefined) s.emit(ev, (r: any) => res(r)); else s.emit(ev, payload, (r: any) => res(r)); });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond: () => boolean, ms = 10000): Promise<boolean> {
  const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(50); } return false;
}

// brute-force cari ekspresi valid (pembagian bulat, hasil 24) dari kartu ronde
function apply(a: number, op: string, b: number): number | null {
  if (op === '+') return a + b; if (op === '-') return a - b; if (op === '*') return a * b;
  if (op === '/') return b !== 0 && a % b === 0 ? a / b : null; return null;
}
function findExpr(cards: { rank: string }[]): string | null {
  // tiap kartu: opsi nilai (A = 1 atau 11)
  const opts = cards.map((c) => (c.rank === 'A' ? [1, 11] : [Number(c.rank)]));
  let out: string | null = null;
  function rec(vals: number[], exprs: string[]): void {
    if (out) return;
    if (vals.length === 1) { if (vals[0] === 24) out = exprs[0]; return; }
    for (let i = 0; i < vals.length; i++) for (let j = 0; j < vals.length; j++) {
      if (i === j) continue;
      const a = vals[i], b = vals[j], ea = exprs[i], eb = exprs[j];
      const rv = vals.filter((_, k) => k !== i && k !== j), re = exprs.filter((_, k) => k !== i && k !== j);
      for (const op of ['+', '-', '*', '/']) { const r = apply(a, op, b); if (r === null) continue; rec([r, ...rv], [`(${ea}${op}${eb})`, ...re]); if (out) return; }
    }
  }
  // coba kombinasi nilai As
  const first = opts[0]!;
  const rest = opts.slice(1);
  function pick(i: number, accV: number[], accE: string[]): void {
    if (out) return;
    if (i === rest.length) { rec([...accV], [...accE]); return; }
    for (const v of rest[i]!) pick(i + 1, [...accV, v], [...accE, String(v)]);
  }
  for (const v of first) pick(0, [v], [String(v)]);
  return out;
}

async function main() {
  const A = connect('p_bcA' + Date.now(), 'Host');
  await sleep(300);
  const { code } = await ack(A.s, 'room:create');
  const B = connect('p_bcB' + Date.now(), 'Temen');
  await sleep(300);
  await ack(B.s, 'room:join', { code });
  await ack(A.s, 'game:start');
  await waitFor(() => A.states.some((st) => st.status === 'playing' && st.game?.roundNo >= 1));
  const cards = A.states[A.states.length - 1].game.cards;
  log('kartu ronde:', cards.map((c: any) => c.rank).join(','));
  const expr = findExpr(cards);
  log('solusi ditemukan:', expr);
  // B raise, A challenge B, B bukti BENAR
  await ack(B.s, 'round:raise'); await sleep(150);
  await ack(A.s, 'round:challenge', { targetId: B.s.auth.playerId }); await sleep(150);
  const r = await ack(B.s, 'round:prove', { expression: expr });
  log('ack prove (harus proofValid=true):', JSON.stringify(r));
  await sleep(400);
  // A (bukan pembuktian) harusnya terima proof:correct
  log('A (non-prover) terima proof:correct:', A.proofs.length, A.proofs[0]?.expression);
  if (A.proofs.length > 0 && r.proofValid) log('BROADCAST OK — semua pemain tau rumusnya');
  else log('GAGAL');
  A.s.close(); B.s.close(); process.exit(0);
}
main().catch((e) => { console.error('ERR', e); process.exit(1); });
