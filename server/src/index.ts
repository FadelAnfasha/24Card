// Bootstrap: Express + HTTP + Socket.IO + auth middleware.
// Jalankan: npm run dev (tsx watch src/index.ts)

import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Server } from 'socket.io';
import cors from 'cors';
import { api } from './api/routes.js';
import { registerSocketHandlers } from './socket/handlers.js';
import { verifyToken } from './auth/service.js';

const PORT = Number(process.env.PORT) || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', api);

// static web client (buat testing di device sebelum Flutter)
app.use(express.static(path.join(__dirname, '..', 'public')));

// health check
app.get('/health', (_req, res) => res.json({ ok: true, service: 'twentycard-server' }));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

// Auth middleware: identitas stabil.
// - Registered: pakai JWT (userId akun) — stabil via localStorage.
// - Guest: pakai playerId dari client (uuid localStorage) + nickname — stabil
//   walau refresh, tanpa perlu akun DB.
io.use((socket, next) => {
  const auth = (socket.handshake.auth ?? {}) as { token?: string; playerId?: string; nickname?: string };
  if (auth.token) {
    const payload = verifyToken(auth.token);
    if (payload) {
      socket.data.playerId = payload.userId; // akun id stabil
      socket.data.nickname = payload.username;
      return next();
    }
  }
  // guest: uuid stabil dari client
  socket.data.playerId = auth.playerId && auth.playerId.length >= 8 ? auth.playerId : `p_${socket.id.slice(0, 12)}`;
  socket.data.nickname = (auth.nickname || 'Pemain').slice(0, 24);
  next();
});

io.on('connection', (socket) => registerSocketHandlers(io, socket));

httpServer.listen(PORT, () => {
  console.log(`24Card server jalan di http://localhost:${PORT}`);
  console.log(`Socket.IO di ws://localhost:${PORT}`);
});
