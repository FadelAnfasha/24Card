// Socket.IO handlers — dispatch event klien ke engine + room manager,
// broadcast state ke semua pemain room, persistensi ronde/game ke DB.

import type { Server, Socket } from 'socket.io';
import { roomManager, type Room } from '../room/roomManager.js';
import type { EngineEvent } from '../game/engine.js';
import { db } from '../db/client.js';

// Tick loop: cek deadline engine (challenge 45s, proof 45s) tiap 1s.
const TICK_MS = 1000;

export function registerSocketHandlers(io: Server, socket: Socket): void {
  // userId di-set via middleware auth (lihat index.ts)
  const userId = (socket.data as { userId: string; username: string }).userId;
  const username = (socket.data as { userId: string; username: string }).username;

  const roomSnapshot = (room: Room) => ({
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    countdownEndsAt: room.countdownEndsAt,
    players: room.players.map((p) => ({ userId: p.userId, username: p.username })),
    game: room.game ? room.game.snapshot() : null,
  });

  const broadcastRoom = (room: Room) => {
    io.to(room.code).emit('room:state', roomSnapshot(room));
  };

  const handleEngineEvent = (room: Room, event: EngineEvent) => {
    io.to(room.code).emit('game:event', event);

    // Persistensi: ronde selesai -> simpan round; game over -> update game + stats
    if (event.type === 'round_resolved') {
      const r = event.resolution;
      const snap = room.game?.snapshot();
      if (room.gameRecordId) {
        void db().round
          .create({
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
          })
          .catch((e) => console.error('gagal simpan round:', e));
      }
    }

    if (event.type === 'game_over') {
      room.status = 'finished';
      void persistGameOver(room, event).catch((e) => console.error('gagal simpan game over:', e));
    }

    broadcastRoom(room);
  };

  // ---------- room ----------

  socket.on('room:create', (cb?: (res: { code: string } | { error: string }) => void) => {
    const room = roomManager.createRoom({ userId, username, socketId: socket.id });
    socket.join(room.code);
    cb?.({ code: room.code });
    broadcastRoom(room);
  });

  socket.on('room:join', (payload: { code: string }, cb?: (res: object) => void) => {
    const result = roomManager.joinRoom(payload?.code ?? '', { userId, username, socketId: socket.id });
    if ('error' in result) {
      cb?.({ error: result.error });
      return;
    }
    socket.join(result.room.code);
    cb?.({ code: result.room.code });
    broadcastRoom(result.room);
  });

  socket.on('room:leave', () => {
    const room = roomManager.roomOfUser(userId);
    if (!room) return;
    socket.leave(room.code);
    const updated = roomManager.leaveRoom(room.code, userId);
    if (updated) broadcastRoom(updated);
  });

  // ---------- game ----------

  socket.on('game:start', async (cb?: (res: object) => void) => {
    const room = roomManager.roomOfUser(userId);
    if (!room) return cb?.({ error: 'belum di room' });
    if (room.hostId !== userId) return cb?.({ error: 'hanya host yang bisa start' });
    if (room.status !== 'lobby') return cb?.({ error: 'sudah dimulai' });
    if (room.players.length < 2) return cb?.({ error: 'minimal 2 pemain' });

    // mulai countdown 5 dtk, broadcast, baru start game
    roomManager.beginCountdown(room.code);
    broadcastRoom(room);
    cb?.({ ok: true });

    setTimeout(async () => {
      if (room.status !== 'countdown') return; // room batal/keluar
      const result = await roomManager.startGame(room.code, handleEngineEvent);
      if ('error' in result) {
        io.to(room.code).emit('game:error', { message: result.error });
        return;
      }
      broadcastRoom(result.room);
    }, 5000);
  });

  socket.on('round:raise', (cb?: (res: object) => void) => {
    const room = roomManager.roomOfUser(userId);
    if (!room?.game) return cb?.({ error: 'belum ada game' });
    const ok = room.game.raise(userId);
    cb?.(ok ? { ok: true } : { error: 'raise tidak valid' });
  });

  socket.on('round:challenge', (payload: { targetId: string }, cb?: (res: object) => void) => {
    const room = roomManager.roomOfUser(userId);
    if (!room?.game) return cb?.({ error: 'belum ada game' });
    const ok = room.game.challenge(userId, payload?.targetId ?? '');
    cb?.(ok ? { ok: true } : { error: 'challenge tidak valid' });
  });

  socket.on('round:surrender', (cb?: (res: object) => void) => {
    const room = roomManager.roomOfUser(userId);
    if (!room?.game) return cb?.({ error: 'belum ada game' });
    const ok = room.game.surrender(userId);
    cb?.(ok ? { ok: true } : { error: 'surrender tidak diizinkan' });
  });

  socket.on('round:prove', (payload: { expression: string }, cb?: (res: object) => void) => {
    const room = roomManager.roomOfUser(userId);
    if (!room?.game) return cb?.({ error: 'belum ada game' });
    const ok = room.game.prove(userId, payload?.expression ?? '');
    cb?.(ok ? { ok: true } : { error: 'pembuktian tidak valid' });
  });

  // ---------- disconnect ----------

  socket.on('disconnect', () => {
    const room = roomManager.roomOfUser(userId);
    if (!room) return;
    // Grace period handled oleh client; di sini kita tandai disconnected
    // dan update socketId. Full grace-period logic = item v1 berikutnya.
    const player = roomManager.findPlayer(room, userId);
    if (player) player.socketId = '';
    broadcastRoom(room);
  });

  // Tick loop untuk deadline engine (per-room)
  const interval = setInterval(() => {
    const room = roomManager.roomOfUser(userId);
    if (room?.game) room.game.tick(Date.now());
  }, TICK_MS);
  socket.on('disconnect', () => clearInterval(interval));
}

// Catatan persistensi: gameId di DB idealnya UUID game tersendiri.
// Untuk v1 lokal, room code dipakai sementara sebagai kunci game.
async function persistGameOver(room: Room, event: Extract<EngineEvent, { type: 'game_over' }>): Promise<void> {
  const winnerId = event.winnerId;

  // update record Game
  if (room.gameRecordId) {
    await db().game
      .update({
        where: { id: room.gameRecordId },
        data: { status: 'finished', endedAt: new Date(), winnerId },
      })
      .catch((e) => console.error('gagal update game:', e));

    // update tiap GamePlayer (finalCardCount + placement)
    for (const s of event.standings) {
      await db().gamePlayer
        .update({
          where: { gameId_userId: { gameId: room.gameRecordId, userId: s.playerId } },
          data: { finalCardCount: s.cardCount, placement: s.isWinner ? s.placement : s.placement },
        })
        .catch(() => {});
    }
  }

  // update statistik User HANYA untuk pemain terdaftar (id asli di tabel User).
  // pemain anon (id "anon_*") dilewati — gak ada record User-nya.
  for (const s of event.standings) {
    if (s.playerId.startsWith('anon_')) continue;
    const u = await db().user.findUnique({ where: { id: s.playerId } });
    if (!u) continue;
    const gamesPlayed = u.gamesPlayed + 1;
    const wins = u.wins + (s.isWinner ? 1 : 0);
    const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;
    await db().user.update({
      where: { id: s.playerId },
      data: { gamesPlayed, wins, winRate },
    });
  }
}
