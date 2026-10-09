// Room manager: lifecycle room in-memory (kode 6 karakter, 2-10 pemain, host).
// State game dipegang Game24 engine; persistence ke DB terjadi saat ronde/game selesai.

import { randomBytes } from 'node:crypto';
import { Game24, type EngineEvent } from '../game/engine.js';

export interface RoomPlayer {
  userId: string;
  username: string;
  socketId: string;
}

export interface Room {
  code: string;
  hostId: string;
  players: RoomPlayer[]; // 2-10
  game: Game24 | null;
  status: 'lobby' | 'playing' | 'finished';
  createdAt: number;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa 0/O/1/I
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;

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
    const room: Room = { code, hostId: host.userId, players: [host], game: null, status: 'lobby', createdAt: Date.now() };
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  joinRoom(code: string, player: RoomPlayer): { room: Room } | { error: string } {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return { error: 'room tidak ditemukan' };
    if (room.status !== 'lobby') return { error: 'game sudah berjalan — join hanya di lobby' };
    if (room.players.some((p) => p.userId === player.userId)) {
      // reconnect/refresh: update socketId saja
      const existing = room.players.find((p) => p.userId === player.userId)!;
      existing.socketId = player.socketId;
      return { room };
    }
    if (room.players.length >= MAX_PLAYERS) return { error: `room penuh (maks ${MAX_PLAYERS})` };
    room.players.push(player);
    return { room };
  }

  leaveRoom(code: string, userId: string): Room | undefined {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return undefined;
    room.players = room.players.filter((p) => p.userId !== userId);
    if (room.players.length === 0) {
      this.rooms.delete(code.toUpperCase());
      return undefined;
    }
    // host pindah ke pemain pertama kalau host keluar (hanya di lobby)
    if (room.hostId === userId && room.status === 'lobby') {
      room.hostId = room.players[0]!.userId;
    }
    return room;
  }

  // Mulai game — hanya host, minimal MIN_PLAYERS pemain.
  startGame(code: string, onEvent: (room: Room, event: EngineEvent) => void): { room: Room } | { error: string } {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return { error: 'room tidak ditemukan' };
    if (room.status !== 'lobby') return { error: 'game sudah berjalan' };
    if (room.players.length < MIN_PLAYERS) return { error: `minimal ${MIN_PLAYERS} pemain` };

    const game = new Game24(
      room.players.map((p) => p.userId),
      {
        now: () => Date.now(),
        onEvent: (e) => onEvent(room, e),
      },
    );
    room.game = game;
    room.status = 'playing';
    game.start();
    return { room };
  }

  // Cari room berdasarkan userId (untuk dispatch event socket).
  roomOfUser(userId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.players.some((p) => p.userId === userId)) return room;
    }
    return undefined;
  }

  findPlayer(room: Room, userId: string): RoomPlayer | undefined {
    return room.players.find((p) => p.userId === userId);
  }
}

export const roomManager = new RoomManager();
