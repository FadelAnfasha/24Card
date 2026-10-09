// Test Kahoot-style reconnection: A buat room, B join, A "refresh" (disconnect
// lalu reconnect dgn playerId sama) -> harus auto-rejoin, room tetap 2 pemain.
import { io } from 'socket.io-client';
const URL = 'http://localhost:3000';
const log = (...a: unknown[]) => console.log('[recon]', ...a);
function connect(pid: string, nick: string) {
  const s = io(URL, { auth: { playerId: pid, nickname: nick }, transports: ['websocket'] });
  const states: any[] = [];
  s.on('room:state', (st) => states.push(st));
  return { s, states, pid, nick };
}
function emitAck(s: any, ev: string, payload?: any): Promise<any> {
  return new Promise((res) => { if (payload === undefined) s.emit(ev, (r: any) => res(r)); else s.emit(ev, payload, (r: any) => res(r)); });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const pidA = 'p_testhost_' + Date.now();
  const pidB = 'p_testfriend_' + Date.now();

  // A buat room
  const A1 = connect(pidA, 'Host');
  await sleep(400);
  const { code } = await emitAck(A1.s, 'room:create');
  log('room dibuat:', code);

  // B join
  const B = connect(pidB, 'Temen');
  await sleep(300);
  await emitAck(B.s, 'room:join', { code });
  await sleep(300);
  log('B join. A lihat players =', A1.states[A1.states.length-1]?.players?.length);

  // A "refresh": disconnect lalu connect ulang dgn playerId sama
  log('A refresh (disconnect)...');
  A1.s.disconnect();
  await sleep(500);

  log('A reconnect dgn playerId sama...');
  const A2 = connect(pidA, 'Host'); // socket baru, playerId sama
  await sleep(600);

  // A2 harusnya terima room:state otomatis (auto-rejoin)
  const rejoined = A2.states[A2.states.length-1];
  if (rejoined) {
    log('AUTO-REJOIN OK: A terima room:state. code=', rejoined.code, 'players=', rejoined.players.length, 'status=', rejoined.status);
  } else {
    log('GAGAL: A gak terima room:state setelah reconnect');
  }

  // B juga harusnya masih lihat 2 pemain
  const bLast = B.states[B.states.length-1];
  log('B lihat players =', bLast?.players?.length);

  // A bisa start? (hostId = pidA, harusnya masih host)
  if (rejoined && rejoined.hostId === pidA && rejoined.players.length === 2) {
    const start = await emitAck(A2.s, 'game:start');
    log('A start setelah reconnect:', JSON.stringify(start));
    if (start.ok) log('RECONNECT + START OK');
  }

  A2.s.close(); B.s.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e); process.exit(1); });
