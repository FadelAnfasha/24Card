// Room manager — model Kahoot-style.
// Identitas pemain PAKAI playerId stabil (bukan socket.id), jadi refresh/
// reconnect tetep dikenali. Lobby bersih: pemain putus >15 dtk dihapus.

import { randomBytes } from 'node:crypto';
import { Game24, type EngineEvent } from '../game/engine.js';
import { db } from '../db/client.js';

export interface RoomPlayer {
  playerId: string; // stabil: akun id (registered) ATAU uuid localStorage (guest)
  nickname: string;
  socketId: string;
  removalTimer?: ReturnType<typeof setTimeout>;
}

export interface Room {
  code: string;
  hostId: string; // playerId host
  players: RoomPlayer[]; // 2-10
  game: Game24 | null;
  gameRecordId: string | null;
  status: 'lobby' | 'countdown' | 'playing' | 'finished';
  countdownEndsAt: number | null;
  createdAt: number;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const LOBBY_REMOVE_MS = 15_000; // pemain lobby putus >15 dtk dihapus

function genCode(): string {
  const bytes = randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return out;
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  createRoom(host: RoomPlayer): Room {
    let code = genCode();
    while (this.rooms.has(code)) code = genCode();
    const room: Room = { code, hostId: host.playerId, players: [host], game: null, gameRecordId: null, status: 'lobby', countdownEndsAt: null, createdAt: Date.now() };
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  // Cari room berdasarkan playerId (untuk auto-rejoin + dispatch).
  roomOfPlayer(playerId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.players.some((p) => p.playerId === playerId)) return room;
    }
    return undefined;
  }

  findPlayer(room: Room, playerId: string): RoomPlayer | undefined {
    return room.players.find((p) => p.playerId === playerId);
  }

  // Reconnect: update socketId pemain yang sudah ada + batalkan timer hapus.
  updateSocket(room: Room, playerId: string, socketId: string): boolean {
    const p = this.findPlayer(room, playerId);
    if (!p) return false;
    p.socketId = socketId;
    if (p.removalTimer) { clearTimeout(p.removalTimer); p.removalTimer = undefined; }
    return true;
  }

  // Join baru ATAU reconnect. Pemain lama boleh reconnect walau game jalan.
  joinRoom(code: string, player: RoomPlayer): { room: Room } | { error: string } {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return { error: 'room tidak ditemukan' };

    // sudah jadi pemain -> reconnect (update socket), berlaku di fase apa pun
    const existing = this.findPlayer(room, player.playerId);
    if (existing) {
      this.updateSocket(room, player.playerId, player.socketId);
      return { room };
    }

    // pemain baru -> hanya di lobby
    if (room.status !== 'lobby') return { error: 'game sudah berjalan — hanya pemain awal yang bisa reconnect' };
    if (room.players.length >= MAX_PLAYERS) return { error: `room penuh (maks ${MAX_PLAYERS})` };
    room.players.push(player);
    return { room };
  }

  // Pemain keluar sendiri (bukan putus) — langsung hapus.
  leaveRoom(code: string, playerId: string): Room | undefined {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return undefined;
    const p = this.findPlayer(room, playerId);
    if (p?.removalTimer) clearTimeout(p.removalTimer);
    room.players = room.players.filter((x) => x.playerId !== playerId);
    if (room.players.length === 0) { this.rooms.delete(code.toUpperCase()); return undefined; }
    if (room.hostId === playerId && room.status === 'lobby') room.hostId = room.players[0]!.playerId;
    return room;
  }

  // Putus koneksi: di lobby, jadwalkan hapus setelah grace (biar refresh gak kebuang).
  // Di game, biarkan (reconnect ditangani engine grace period sendiri).
  onDisconnect(room: Room, playerId: string, onRemoved: () => void): void {
    const p = this.findPlayer(room, playerId);
    if (!p) return;
    p.socketId = '';
    if (room.status !== 'lobby') return; // di game/countdown: jangan hapus
    if (p.removalTimer) clearTimeout(p.removalTimer);
    p.removalTimer = setTimeout(() => {
      // kalau belum reconnect, hapus dari lobby
      if (room.status === 'lobby' && p.socketId === '') {
        this.leaveRoom(room.code, playerId);
        onRemoved();
      }
    }, LOBBY_REMOVE_MS);
  }

  beginCountdown(code: string): Room | undefined {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return undefined;
    room.status = 'countdown';
    room.countdownEndsAt = Date.now() + 5000;
    return room;
  }

  async startGame(code: string, onEvent: (room: Room, event: EngineEvent) => void): Promise<{ room: Room } | { error: string }> {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return { error: 'room tidak ditemukan' };
    if (room.status === 'playing' || room.status === 'finished') return { error: 'game sudah berjalan' };
    if (room.players.length < MIN_PLAYERS) return { error: `minimal ${MIN_PLAYERS} pemain` };

    try {
      const gameRec = await db().game.create({ data: { roomCode: room.code, status: 'in_progress' } });
      room.gameRecordId = gameRec.id;
      for (let i = 0; i < room.players.length; i++) {
        await db().gamePlayer.create({ data: { gameId: gameRec.id, userId: room.players[i]!.playerId, seat: i } });
      }
    } catch (e) {
      console.error('gagal bikin record game:', e);
    }

    const game = new Game24(
      room.players.map((p) => p.playerId),
      { now: () => Date.now(), onEvent: (e) => onEvent(room, e) },
    );
    room.game = game;
    room.status = 'playing';
    game.start();
    return { room };
  }
}

export const roomManager = new RoomManager();
