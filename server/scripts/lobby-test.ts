// Test: A buat room, B join — apakah A terima room:state update (2 pemain)?
import { io } from 'socket.io-client';
const URL = 'http://localhost:3000';
const log = (...a: unknown[]) => console.log('[lobby]', ...a);

function connect(name: string) {
  const s = io(URL, { transports: ['websocket'] });
  const states: any[] = [];
  s.on('room:state', (st) => { states.push(st); log(`${name} terima room:state -> players=${st.players.length} status=${st.status}`); });
  return { s, states, name };
}

function emitAck(s: any, ev: string, payload?: any): Promise<any> {
  return new Promise((res) => { if (payload === undefined) s.emit(ev, (r: any) => res(r)); else s.emit(ev, payload, (r: any) => res(r)); });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const A = connect('A'); const B = connect('B');
  await sleep(500);
  log('A create room');
  const { code } = await emitAck(A.s, 'room:create');
  log('room:', code);
  await sleep(300);
  log('--- sebelum B join, A states:', A.states.length, 'terakhir players=', A.states[A.states.length-1]?.players?.length);
  log('B join');
  await emitAck(B.s, 'room:join', { code });
  await sleep(600);
  log('--- sesudah B join:');
  log('A states total:', A.states.length, '| players terakhir:', A.states[A.states.length-1]?.players?.length);
  log('B states total:', B.states.length, '| players terakhir:', B.states[B.states.length-1]?.players?.length);
  A.s.close(); B.s.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e); process.exit(1); });
