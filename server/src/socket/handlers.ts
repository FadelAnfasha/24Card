// Socket.IO handlers — dispatch event klien ke engine + room manager,
// broadcast state ke semua pemain room, persistensi ronde/game ke DB.
// Model Kahoot: identitas playerId stabil + auto-rejoin saat reconnect.

import type { Server, Socket } from 'socket.io';
import { roomManager, type Room } from '../room/roomManager.js';
import type { EngineEvent } from '../game/engine.js';
import { db } from '../db/client.js';

const TICK_MS = 1000;

export function registerSocketHandlers(io: Server, socket: Socket): void {
  // playerId & nickname di-set middleware auth (lihat index.ts)
  const data = socket.data as { playerId: string; nickname: string };
  const playerId = data.playerId;
  const nickname = data.nickname;

  const roomSnapshot = (room: Room) => ({
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    countdownEndsAt: room.countdownEndsAt,
    players: room.players.map((p) => ({ playerId: p.playerId, nickname: p.nickname, connected: p.socketId !== '' })),
    game: room.game ? room.game.snapshot() : null,
  });

  const broadcastRoom = (room: Room) => {
    io.to(room.code).emit('room:state', roomSnapshot(room));
  };

  const handleEngineEvent = (room: Room, event: EngineEvent) => {
    io.to(room.code).emit('game:event', event);

    if (event.type === 'round_resolved') {
      const r = event.resolution;
      const snap = room.game?.snapshot();
      if (room.gameRecordId) {
        void db().round.create({
          data: {
            gameId: room.gameRecordId,
            roundNo: r.roundNo,
            cards: r.cards as unknown as object,
            raisedPlayers: (snap?.raised ?? []) as unknown as object,
            challengerId: snap?.challengerId ?? null,
            targetId: snap?.targetId ?? null,
            penaltyUserId: r.penaltyHolderId,
            hangus: r.hangus,
          },
        }).catch((e) => console.error('gagal simpan round:', e));
      }
    }

    if (event.type === 'game_over') {
      room.status = 'finished';
      void persistGameOver(room, event).catch((e) => console.error('gagal simpan game over:', e));
    }

    broadcastRoom(room);
  };

  // ---------- auto-rejoin saat connect ----------
  // Kalau playerId sudah jadi pemain di room mana pun, re-attach socket +
  // kirim room:state supaya client langsung balik ke room (lobby/countdown/game).
  const existing = roomManager.roomOfPlayer(playerId);
  if (existing) {
    roomManager.updateSocket(existing, playerId, socket.id);
    socket.join(existing.code);
    socket.emit('room:state', roomSnapshot(existing));
  }

  // ---------- room ----------

  socket.on('room:create', (cb?: (res: { code: string } | { error: string }) => void) => {
    // keluar dari room lama dulu kalau ada
    const old = roomManager.roomOfPlayer(playerId);
    if (old) { socket.leave(old.code); roomManager.leaveRoom(old.code, playerId); }
    const room = roomManager.createRoom({ playerId, nickname, socketId: socket.id });
    socket.join(room.code);
    cb?.({ code: room.code });
    broadcastRoom(room);
  });

  socket.on('room:join', (payload: { code: string }, cb?: (res: object) => void) => {
    const code = (payload?.code ?? '').toUpperCase();
    // keluar dari room lama dulu
    const old = roomManager.roomOfPlayer(playerId);
    if (old && old.code !== code) { socket.leave(old.code); roomManager.leaveRoom(old.code, playerId); }
    const result = roomManager.joinRoom(code, { playerId, nickname, socketId: socket.id });
    if ('error' in result) { cb?.({ error: result.error }); return; }
    socket.join(result.room.code);
    cb?.({ code: result.room.code });
    broadcastRoom(result.room);
  });

  socket.on('room:leave', () => {
    const room = roomManager.roomOfPlayer(playerId);
    if (!room) return;
    socket.leave(room.code);
    const updated = roomManager.leaveRoom(room.code, playerId);
    if (updated) broadcastRoom(updated);
  });

  // ---------- game ----------

  socket.on('game:start', async (cb?: (res: object) => void) => {
    const room = roomManager.roomOfPlayer(playerId);
    if (!room) return cb?.({ error: 'belum di room' });
    if (room.hostId !== playerId) return cb?.({ error: 'hanya host yang bisa start' });
    if (room.status !== 'lobby') return cb?.({ error: 'sudah dimulai' });
    if (room.players.length < MIN_PLAYERS_LOCAL) return cb?.({ error: `minimal ${MIN_PLAYERS_LOCAL} pemain` });

    roomManager.beginCountdown(room.code);
    broadcastRoom(room);
    cb?.({ ok: true });

    setTimeout(async () => {
      if (room.status !== 'countdown') return;
      const result = await roomManager.startGame(room.code, handleEngineEvent);
      if ('error' in result) { io.to(room.code).emit('game:error', { message: result.error }); return; }
      broadcastRoom(result.room);
    }, 5000);
  });

  socket.on('round:raise', (cb?: (res: object) => void) => {
    const room = roomManager.roomOfPlayer(playerId);
    if (!room?.game) return cb?.({ error: 'belum ada game' });
    const ok = room.game.raise(playerId);
    cb?.(ok ? { ok: true } : { error: 'raise tidak valid' });
  });

  socket.on('round:challenge', (payload: { targetId: string }, cb?: (res: object) => void) => {
    const room = roomManager.roomOfPlayer(playerId);
    if (!room?.game) return cb?.({ error: 'belum ada game' });
    const ok = room.game.challenge(playerId, payload?.targetId ?? '');
    cb?.(ok ? { ok: true } : { error: 'challenge tidak valid' });
  });

  socket.on('round:surrender', (cb?: (res: object) => void) => {
    const room = roomManager.roomOfPlayer(playerId);
    if (!room?.game) return cb?.({ error: 'belum ada game' });
    const ok = room.game.surrender(playerId);
    cb?.(ok ? { ok: true } : { error: 'surrender tidak diizinkan' });
  });

  socket.on('round:prove', (payload: { expression: string }, cb?: (res: object) => void) => {
    const room = roomManager.roomOfPlayer(playerId);
    if (!room?.game) return cb?.({ error: 'belum ada game' });
    const expr = payload?.expression ?? '';
    const res = room.game.prove(playerId, expr);
    if (!res.accepted) return cb?.({ error: 'pembuktian tidak valid' });
    cb?.({ ok: true, proofValid: res.proofValid, reason: res.reason ?? null });
    // jawaban BENAR -> broadcast ke SEMUA pemain biar semua tau rumusnya
    if (res.proofValid) {
      io.to(room.code).emit('proof:correct', { proverId: playerId, proverNick: nickname, expression: expr });
    }
  });

  // ---------- disconnect ----------

  socket.on('disconnect', () => {
    const room = roomManager.roomOfPlayer(playerId);
    if (!room) return;
    // kalau socket ini masih pemilik (bukan socket lama yang sudah diganti), tandai putus
    const p = roomManager.findPlayer(room, playerId);
    if (p && p.socketId === socket.id) {
      roomManager.onDisconnect(room, playerId, () => broadcastRoom(room));
      broadcastRoom(room);
    }
  });

  const interval = setInterval(() => {
    const room = roomManager.roomOfPlayer(playerId);
    if (room?.game) room.game.tick(Date.now());
  }, TICK_MS);
  socket.on('disconnect', () => clearInterval(interval));
}

const MIN_PLAYERS_LOCAL = 2;

async function persistGameOver(room: Room, event: Extract<EngineEvent, { type: 'game_over' }>): Promise<void> {
  const winnerId = event.winnerId;

  if (room.gameRecordId) {
    await db().game.update({ where: { id: room.gameRecordId }, data: { status: 'finished', endedAt: new Date(), winnerId } }).catch((e) => console.error('gagal update game:', e));
    for (const s of event.standings) {
      await db().gamePlayer.update({
        where: { gameId_userId: { gameId: room.gameRecordId, userId: s.playerId } },
        data: { finalCardCount: s.cardCount, placement: s.placement },
      }).catch(() => {});
    }
  }

  // update statistik User hanya untuk pemain terdaftar (id asli di tabel User).
  for (const s of event.standings) {
    if (s.playerId.startsWith('anon_') || s.playerId.startsWith('p_')) continue; // guest
    const u = await db().user.findUnique({ where: { id: s.playerId } });
    if (!u) continue;
    const gamesPlayed = u.gamesPlayed + 1;
    const wins = u.wins + (s.isWinner ? 1 : 0);
    const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;
    await db().user.update({ where: { id: s.playerId }, data: { gamesPlayed, wins, winRate } });
  }
}
