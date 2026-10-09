// Test: submit bukti INVALID -> ack balikin proofValid=false + reason informatif.
import { io } from 'socket.io-client';
const URL = 'http://localhost:3000';
const log = (...a: unknown[]) => console.log('[reason]', ...a);
function connect(pid: string, nick: string) {
  const s = io(URL, { auth: { playerId: pid, nickname: nick }, transports: ['websocket'] });
  const states: any[] = [];
  s.on('room:state', (st) => states.push(st));
  return { s, states };
}
function ack(s: any, ev: string, payload?: any): Promise<any> {
  return new Promise((res) => { if (payload === undefined) s.emit(ev, (r: any) => res(r)); else s.emit(ev, payload, (r: any) => res(r)); });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond: () => boolean, ms = 10000): Promise<boolean> {
  const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(50); } return false;
}
async function main() {
  const A = connect('p_rhA' + Date.now(), 'Host');
  await sleep(300);
  const { code } = await ack(A.s, 'room:create');
  const B = connect('p_rhB' + Date.now(), 'Temen');
  await sleep(300);
  await ack(B.s, 'room:join', { code });
  await ack(A.s, 'game:start');
  log('start, nunggu game...');
  await waitFor(() => A.states.some((st) => st.status === 'playing' && st.game?.roundNo >= 1), 10000);
  // B raise, A jadi challenger terakhir
  await ack(B.s, 'round:raise');
  await sleep(200);
  const aLast = A.states[A.states.length - 1];
  const challengerId = aLast?.game?.challengerId;
  log('challenger =', challengerId, '(harus A)');
  // A challenge B
  await ack(A.s, 'round:challenge', { targetId: B.s.auth.playerId });
  await sleep(200);
  // B (target) submit bukti INVALID
  const r = await ack(B.s, 'round:prove', { expression: '1+1' });
  log('ack prove invalid:', JSON.stringify(r));
  if (r.ok && r.proofValid === false && r.reason && r.reason.includes('24')) {
    log('REASON RELAY OK ->', r.reason);
  } else {
    log('GAGAL: reason gak informatif', JSON.stringify(r));
  }
  A.s.close(); B.s.close(); process.exit(0);
}
main().catch((e) => { console.error('ERR', e); process.exit(1); });
