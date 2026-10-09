# System Design — 24Card

**Versi:** 1.0 (Draft)
**Relasi:** [PRD](PRD.md) · [Architecture](Architecture.md)

---

## 1. Komponen Tingkat Tinggi

```
┌─────────────────┐         WebSocket (Socket.IO)        ┌──────────────────────┐
│  Flutter Client │ ◄──────────────────────────────────► │   Node.js Backend    │
│  (Android/iOS)  │                                      │  - Game Engine       │
│                 │  REST (auth, leaderboard, profile)   │  - Room Manager      │
│                 │ ───────────────────────────────────► │  - Formula Validator │
└─────────────────┘                                      │  - Auth Service      │
                                                         └──────────┬───────────┘
                                                                    │
                                                         ┌──────────▼───────────┐
                                                         │     PostgreSQL       │
                                                         │  users, games, rounds│
                                                         │  leaderboard         │
                                                         └──────────────────────┘
```

Tiga tanggung jawab terpisah:
- **Klien (Flutter):** render UI, input pemain, menampilkan state dari server. **Tidak pernah memutuskan hasil.**
- **Backend (Node.js):** otoritatif atas seluruh state game, menarik kartu, memvalidasi rumus, menentukan pemenang ronde.
- **PostgreSQL:** persistensi akun, riwayat game, statistik leaderboard.

## 2. Model Deck & Solvability Filter

- Pool: 40 kartu → kombinasi 4 kartu: `C(40,4) = 91.390`
- Server melakukan **precompute saat startup**: setiap kombinasi di-brute-force semua pohon ekspresi (`+ − × ÷`, kurung, As=1 atau 11, hasil `÷` wajib bulat) sampai hasil 24 ditemukan
- Hasilnya: **set kombinasi solvable disimpan in-memory** (dipindai ulang bila deck rules berubah)
- Ronde hanya menarik kombinasi dari set ini → menjamin "pasti ada yang bisa solve"

**Catatan performa:** 91 ribu kombinasi × evaluasi pohon ekspresi kecil ≈ hitungan detik saat boot. Bisa diparalelisasi worker thread bila perlu.

## 3. Game State Machine (per room)

```
LOBBY ──host start──► ROUND_DRAW ──► AWAIT_RAISE ──(sisa 1 belum raise)──► CHALLENGE (deadline 45 dtk)
  ▲                        │                │                                    │
  │                        │                │  ──(semua raise)──────────────┐   │
  │                        │                │                               ▼   ▼
  │                        │                │                    AWAIT_PROOF (deadline 45 dtk)
  │                        │                │  ──(semua surrender /           │
  │                        │                │     sisa aktif tinggal 1)       │
  │                        │                ▼                                │
  │                 ┌─────────────┐  ROUND_DISCARD (4 kartu hangus)           │
  │                 │ pool habis? │──YA──► GAME_OVER                          │
  │                 └──────┬──────┘                                           │
  │                        │TIDAK                                             ▼
  │                        ▼                                       ROUND_RESOLVE
  │              ROUND_RESOLVE ◄────────────────────────────────────(valid → challenger ambil kartu;
  │                        ▲                                         bluff/timeout → target ambil;
  │                        │                                         semua-raise & bukti valid → hangus)
  └────────────────────────┘
```

Deadline aksi (server-side, di-set saat fase masuk):
- **CHALLENGE:** 45 detik — habis = pemain terakhir yang belum raise **ambil 4 kartu** (anti-stall)
- **AWAIT_PROOF:** 45 detik — habis = target dianggap **bluff, ambil 4 kartu**
- **Surrender:** hanya di fase AWAIT_RAISE, aktif setelah 30 detik, **dilarang** saat CHALLENGE/AWAIT_PROOF aktif

State yang disimpan per room: `phase`, `roundNo`, `cards[4]`, `raised: Set<playerId>` (+ `lastRaiserId`), `surrendered: Set<playerId>`, `challengerId`, `targetId`, `penaltyHolderId`, `deckRemaining`, `phaseDeadlineAt`.

## 4. Katalog Event Socket.IO

### Klien → Server

| Event | Payload | Keterangan |
|---|---|---|
| `room:create` | `{ isPrivate }` | Buat room, return code 6 karakter |
| `room:join` | `{ code }` | Gabung room via kode |
| `room:invite` | `{ friendId }` / `code` | Undang via friend list / share link |
| `game:start` | `{}` | Host memulai game |
| `round:raise` | `{}` | Raise hand |
| `round:challenge` | `{ targetId }` | Tantang pemain yang sudah raise |
| `round:surrender` | `{}` | Fold ronde (hanya fase raise terbuka, setelah 30 detik) |
| `round:prove` | `{ expression }` | Buktikan rumus — string hasil rakitan drag (kartu + operator + kurung) |

### Server → Klien

| Event | Payload | Keterangan |
|---|---|---|
| `room:state` | `{ code, players[], hostId, phase }` | Snapshot room (lobby) |
| `game:started` | `{ deckRemaining, players[] }` | Game dimulai |
| `round:started` | `{ roundNo, cards[4], deckRemaining }` | 4 kartu baru |
| `round:raised` | `{ playerId, raisedCount }` | Pemain X raise (publik) |
| `round:challenge` | `{ challengerId, targetId }` | Challenge terjadi |
| `round:proof_result` | `{ expression, valid, reason }` | Hasil validasi rumus |
| `round:resolved` | `{ penaltyHolderId, penaltyCards, cardCounts{} }` | Kartu penalty dibagikan |
| `player:disconnected` / `player:reconnected` | `{ playerId, graceEndsAt }` | Sinyal disconnect |
| `game:ended` | `{ winnerId, standings[] }` | Pool habis, hasil akhir |
| `error` | `{ code, message }` | Error |

## 5. Validasi Formula (Anti-Cheat — di Server)

Server menerima `expression` string — **string hasil perakitan di klien dari urutan drag kartu + operator yang dipilih pemain**. Klien hanya merakit; server tidak mempercayai urutan drag apa pun dan memvalidasi ulang string secara penuh:

1. **Tokenisasi:** hanya diizinkan digit (1–10), operator `+ - * /`, kurung, spasi. Karakter lain → reject.
2. **Evaluasi parser:** parse ke AST, evaluasi aman (tanpa `eval` mentah).
3. **Cek hasil:** `== 24` (persis).
4. **Cek multiset kartu:** nilai hasil tokenisasi harus cocok **persis** dengan 4 kartu ronde (masing-masing tepat 1×). Untuk kartu As, server menerima nilai `1` atau `11` — cocok jika ada penempatan yang valid.
5. **Cek pembagian bulat:** setiap operasi `÷` pada AST wajib hasil bilangan bulat.

Hasil: `{ valid: true }` → penantang kalah ronde. `{ valid: false, reason }` → pembohong kalah ronde.

**Prinsip:** klien hanya mengirim niat (raise/challenge/prove). Semua penentuan pemenang ronde ada di server. Klien tidak pernah menerima kartu pemain lain sebelum state resmi.

## 6. Auth Flow

- **Guest:** klien minta `POST /auth/guest` → server buat user `is_guest=true` + username random → return JWT
- **Registrasi:** `POST /auth/register` (username, password) → user `is_guest=false`
- **Upgrade guest:** endpoint `POST /auth/upgrade` — user guest mengikat username+password ke akun yang sama (progress/win rate terbawa)
- **Sesi:** JWT (akses) + refresh token tersimpan di Postgres
- Password: **bcrypt** (cost 12) / argon2

## 7. Data Model (ringkas)

```
users(id, username, password_hash NULL, is_guest, created_at,
      games_played, wins, win_rate)

friends(user_id, friend_id, status)

games(id, room_code, started_at, ended_at, winner_id, status)

game_players(game_id, user_id, seat, final_card_count, placement)

rounds(id, game_id, round_no, cards JSONB, raised_players JSONB,
       challenger_id, target_id, proof_expression, proof_valid,
       penalty_user_id)
```

Leaderboard di-query dari `users` (win_rate, games_played) — tidak perlu tabel snapshot di v1.

## 8. Disconnect Handling

- Server memantau koneksi socket per pemain
- Disconnect → room masuk `pending`: `graceEndsAt = now + 60s`, event `player:disconnected` dikirim
- Kembali dalam grace → `player:reconnected`, ronde lanjut
- Lewat grace → **auto-fold**: pemain dihitung tidak raise, dan bila ronde sedang berjalan, **4 kartu penalty jatuh ke pemain tersebut** (sesuai PRD §3.5), ronde lanjut / ronde berikutnya dimulai

## 9. Skalabilitas

- **Horizontal:** state room in-memory di satu proses Node → untuk skala besar gunakan **Redis Socket.IO adapter** (sticky session) + sharding room per proses
- **Postgres:** hanya untuk persistensi — tidak di jalur kritis ronde
- Precompute solvable set di-load dari cache/disk agar boot cepat

## 10. Keputusan Terbuka

1. Mekanisme escape deadlock ronde (tanpa timer) — PRD §7
2. Anti-stalling untuk raise tanpa batas waktu
3. ELO/ranked mode (out of scope v1, dipertimbangkan v2)
