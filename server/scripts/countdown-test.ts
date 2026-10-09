// Test: A buat room, B join (cek lobby update), A start -> countdown 5 dtk -> game mulai.
import { io } from 'socket.io-client';
const URL = 'http://localhost:3000';
const log = (...a: unknown[]) => console.log('[test]', ...a);
function connect(name: string) {
  const s = io(URL, { transports: ['websocket'] });
  const states: any[] = [];
  s.on('room:state', (st) => states.push(st));
  return { s, states, name };
}
function emitAck(s: any, ev: string, payload?: any): Promise<any> {
  return new Promise((res) => { if (payload === undefined) s.emit(ev, (r: any) => res(r)); else s.emit(ev, payload, (r: any) => res(r)); });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const A = connect('A'); const B = connect('B');
  await sleep(400);
  const { code } = await emitAck(A.s, 'room:create');
  log('room:', code);
  await emitAck(B.s, 'room:join', { code });
  await sleep(300);
  const lastA = A.states[A.states.length - 1];
  log('lobby: A lihat players =', lastA.players.length, '(harus 2)');

  // A start -> harusnya status countdown
  const startAck = await emitAck(A.s, 'game:start');
  log('start ack:', JSON.stringify(startAck));
  await sleep(300);
  const cd = A.states[A.states.length - 1];
  log('status setelah start:', cd.status, '| countdownEndsAt:', cd.countdownEndsAt ? 'ada' : 'null');
  if (cd.status !== 'countdown') { log('GAGAL: harusnya countdown'); process.exit(1); }

  // tunggu game mulai (setelah 5 dtk)
  log('nunggu 5 dtk countdown...');
  await sleep(5600);
  const playing = A.states[A.states.length - 1];
  log('status setelah countdown:', playing.status, '| roundNo:', playing.game?.roundNo, '| cards:', playing.game?.cards?.length);
  if (playing.status === 'playing' && playing.game?.roundNo === 1 && playing.game?.cards?.length === 4) {
    log('COUNTDOWN + GAME START OK');
  } else {
    log('GAGAL: game belum mulai dengan benar');
  }
  A.s.close(); B.s.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e); process.exit(1); });
