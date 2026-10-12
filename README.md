# 24Card 🃏 — Saloon

Game kartu **24** multiplayer real-time. Susun 4 kartu jadi rumus yang hasilnya tepat **24**, gertak lawan, dan jadi pemain dengan kartu paling sedikit buat menang. Tema **bar cowboy Texas**.

Main bareng temen lewat **room code** — Android/iOS via Flutter (belum) + web client yang udah jalan.

## Cara Main 🤠

Tiap ronde, 4 kartu dibagikan ke meja. Tugasmu: **gabungin ke-4 kartu itu pakai `+ − × ÷` dan kurung biar hasilnya 24**. Tiap kartu wajib dipakai **tepat sekali**, dan **pembagian harus bulat**.

**Nilai kartu:** `2–10` sesuai angka. **As (A) = 1 atau 11**, bebas kamu pilih (toggle `⇄`).

**Alur ronde:**
1. **Raise** — kalo kamu yakin bisa bikin 24, raise hand. Pemain lain bisa bluff (gertak) juga.
2. **Challenge** — pas tinggal 1 pemain yang belum raise, dia **wajib** menantang salah satu yang raise, nyuruh buktiin rumusnya.
3. **Bukti** — yang ditantang susun rumusnya (drag kartu + operator ke strip).
   - **Bukti benar** → 4 kartu jatuh ke **penantang** (yang nantang kalah).
   - **Bluff ketahuan (salah)** → yang nyontek ambil **4 kartu** penalty.
4. Semua raise → **pemain terakhir yang raise wajib bukti**. Gagal = dia ambil kartunya.

**Menang:** main **10 ronde** (40 kartu habis). Pemain dengan **kartu penalty paling sedikit** menang. Seri = dua-duanya kalah.

**Fitur:** anti-stall (challenge/bukti ada deadline 45 detik), surrender pas fase raise (setelah 30 detik), countdown 5 detik yang sinkron antar HP.

## Tech Stack

- **Server:** Node.js, Express, Socket.IO, Prisma + PostgreSQL
- **Client:** Web SPA (vanilla JS, Socket.IO) — `server/public/`
- **Game core:** solver + validator anti-cheat (parser AST, tanpa `eval`) + state machine — `server/src/game/`

## Menjalankan (Local Dev) 🖥️

Prasyarat: Node.js 18+, Docker.

```bash
# 1. Install dependensi
cd server
npm install

# 2. Jalankan PostgreSQL via Docker (port 5433)
docker compose up -d

# 3. Migrasi database
npx prisma migrate dev

# 4. Jalankan server (port 3000)
npm run dev
```

Buka `http://localhost:3000` (atau `http://<IP-PC>:3000` dari HP yang satu WiFi).

> `server/.env` berisi password DB + JWT secret dan **sudah di-gitignore** — jangan commit.

## Struktur Repo

```
24Card/
├── server/
│   ├── public/          # web client (SPA)
│   ├── prisma/          # skema DB + migrasi
│   └── src/
│       ├── game/        # core: solver, validator, engine
│       ├── room/        # room manager (lobby, countdown)
│       ├── socket/      # handler Socket.IO
│       ├── api/         # REST (auth, leaderboard)
│       └── db/          # koneksi Prisma
├── PRD.md
├── SystemDesign.md
└── Architecture.md
```

## Test ✅

```bash
cd server
npm run typecheck   # cek tipe
npx vitest run      # 33 unit test (solver, validator, engine)
```

## Status

- ✅ Core game, server multiplayer, web client (tema saloon)
- ⏳ Client Flutter (Android/iOS) — belum
- Mockup arah desain: v2 casino, v3 neon arcade, v4 saloon (pilih v4)

---

Dibuat dengan ♠ oleh [FadelAnfasha](https://github.com/FadelAnfasha).
