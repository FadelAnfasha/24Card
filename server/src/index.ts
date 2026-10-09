// Bootstrap: Express + HTTP + Socket.IO + auth middleware.
// Jalankan: npm run dev (tsx watch src/index.ts)

import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import cors from 'cors';
import { api } from './api/routes.js';
import { registerSocketHandlers } from './socket/handlers.js';
import { verifyToken } from './auth/service.js';

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', api);

// health check
app.get('/health', (_req, res) => res.json({ ok: true, service: 'twentycard-server' }));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

// Auth middleware: handshake socket bawa JWT via handshake.auth.token.
// Tanpa token = anonymous, hanya bisa join room (belum login).
io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      socket.data.userId = payload.userId;
      socket.data.username = payload.username;
      return next();
    }
  }
  // anonymous fallback
  socket.data.userId = `anon_${socket.id.slice(0, 8)}`;
  socket.data.username = `Anon_${socket.id.slice(0, 4)}`;
  next();
});

io.on('connection', (socket) => registerSocketHandlers(io, socket));

httpServer.listen(PORT, () => {
  console.log(`24Card server jalan di http://localhost:${PORT}`);
  console.log(`Socket.IO di ws://localhost:${PORT}`);
});
