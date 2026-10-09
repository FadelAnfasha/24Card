// Test REST auth/profile/leaderboard via fetch (Node 24 punya global fetch).
const BASE = 'http://localhost:3000/api';

async function main() {
  // register
  const reg = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'tes_' + Math.floor(Math.random() * 100000), password: 'rahasia123' }),
  }).then((r) => r.json());
  console.log('register:', JSON.stringify(reg.user));
  const token = reg.token as string;

  // profile
  const prof = await fetch(`${BASE}/profile`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  console.log('profile:', JSON.stringify(prof));

  // leaderboard
  const lb = await fetch(`${BASE}/leaderboard?limit=5`).then((r) => r.json());
  console.log('leaderboard:', JSON.stringify(lb));

  // guest
  const guest = await fetch(`${BASE}/auth/guest`, { method: 'POST' }).then((r) => r.json());
  console.log('guest:', JSON.stringify(guest.user));

  console.log('REST TEST OK');
}

main().catch((e) => { console.error('GAGAL:', e); process.exit(1); });
