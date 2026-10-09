// Auth service: guest, register, upgrade guest -> akun penuh, JWT.
// Password di-hash bcrypt. Sesi pakai JWT (lihat Architecture.md §5).

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/client.js';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-ganti-di-produksi';
const BCRYPT_ROUNDS = 10;

export interface JwtPayload {
  userId: string;
  username: string;
  isGuest: boolean;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

function randomGuestName(): string {
  return `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function createGuest(): Promise<{ user: { id: string; username: string; isGuest: boolean }; token: string }> {
  const username = randomGuestName();
  const user = await db().user.create({ data: { username, isGuest: true } });
  const token = signToken({ userId: user.id, username: user.username, isGuest: true });
  return { user: { id: user.id, username: user.username, isGuest: true }, token };
}

export async function register(username: string, password: string): Promise<{ user: { id: string; username: string; isGuest: boolean }; token: string } | { error: string }> {
  if (username.length < 3 || username.length > 24) return { error: 'username 3-24 karakter' };
  if (password.length < 6) return { error: 'password minimal 6 karakter' };
  const exists = await db().user.findUnique({ where: { username } });
  if (exists) return { error: 'username sudah dipakai' };
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await db().user.create({ data: { username, passwordHash, isGuest: false } });
  const token = signToken({ userId: user.id, username: user.username, isGuest: false });
  return { user: { id: user.id, username: user.username, isGuest: false }, token };
}

// Upgrade guest -> akun: kaitkan username+password ke user guest yang sama,
// progress/win rate terbawa.
export async function upgradeGuest(userId: string, username: string, password: string): Promise<{ user: { id: string; username: string; isGuest: boolean }; token: string } | { error: string }> {
  const user = await db().user.findUnique({ where: { id: userId } });
  if (!user) return { error: 'user tidak ditemukan' };
  if (!user.isGuest) return { error: 'sudah terdaftar' };
  if (username.length < 3 || username.length > 24) return { error: 'username 3-24 karakter' };
  if (password.length < 6) return { error: 'password minimal 6 karakter' };
  const exists = await db().user.findUnique({ where: { username } });
  if (exists) return { error: 'username sudah dipakai' };
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const updated = await db().user.update({ where: { id: userId }, data: { username, passwordHash, isGuest: false } });
  const token = signToken({ userId: updated.id, username: updated.username, isGuest: false });
  return { user: { id: updated.id, username: updated.username, isGuest: false }, token };
}
