// REST API: auth (guest/register/upgrade), profile, leaderboard.
// Lihat Architecture.md §7.

import { Router } from 'express';
import { createGuest, register, upgradeGuest, verifyToken } from '../auth/service.js';
import { db } from '../db/client.js';

export const api = Router();

// ---------- auth ----------

api.post('/auth/guest', async (_req, res) => {
  const result = await createGuest();
  res.json(result);
});

api.post('/auth/register', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'username & password wajib' });
  }
  const result = await register(username, password);
  if ('error' in result) return res.status(400).json(result);
  res.json(result);
});

api.post('/auth/upgrade', async (req, res) => {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return res.status(401).json({ error: 'token tidak valid' });

  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'username & password wajib' });
  }
  const result = await upgradeGuest(payload.userId, username, password);
  if ('error' in result) return res.status(400).json(result);
  res.json(result);
});

// ---------- profile ----------

function requireAuth(req: Parameters<Parameters<Router['use']>[1]>[0], res: Parameters<Parameters<Router['use']>[1]>[1], next: () => void) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: 'token tidak valid' });
    return;
  }
  (req as unknown as { userId: string }).userId = payload.userId;
  next();
}

api.get('/profile', requireAuth, async (req, res) => {
  const userId = (req as unknown as { userId: string }).userId;
  const user = await db().user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: 'user tidak ditemukan' });
  res.json({
    id: user.id,
    username: user.username,
    isGuest: user.isGuest,
    gamesPlayed: user.gamesPlayed,
    wins: user.wins,
    winRate: Number(user.winRate),
  });
});

// ---------- leaderboard ----------

api.get('/leaderboard', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const users = await db().user.findMany({
    where: { isGuest: false }, // hanya akun terdaftar tampil di leaderboard
    orderBy: [{ winRate: 'desc' }, { gamesPlayed: 'desc' }],
    take: limit,
    select: { id: true, username: true, gamesPlayed: true, wins: true, winRate: true },
  });
  res.json(
    users.map((u, i) => ({
      rank: i + 1,
      username: u.username,
      gamesPlayed: u.gamesPlayed,
      wins: u.wins,
      winRate: Number(u.winRate),
    })),
  );
});
