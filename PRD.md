# PRD — 24Card

**Versi:** 1.0 (Draft)
**Platform:** Android & iOS (Flutter)
**Status:** Menunggu review

---

## 1. Gambaran Umum

24Card adalah game kartu multiplayer real-time berbasis permainan klasik "Game of 24". Empat kartu ditarik dari pool 40 kartu, dan pemain harus menggabungkan keempatnya dengan operasi aritmatika (+, −, ×, ÷) agar hasilnya tepat 24. Elemen bluffing menjadi inti permainan: pemain boleh berpura-pura tahu jawaban (raise hand), dan pemain lain bisa menantangnya untuk membuktikan rumusnya.

Pemain terakhir dengan jumlah kartu penalty paling sedikit dinyatakan menang.

## 2. Konsep Game

### 2.1 Kartu

- **Pool kartu:** 40 kartu — empat jenis (♠ Heart, Spade, Diamond, Club) × 10 nilai (A, 2–10)
- **Nilai kartu:**
  - Kartu angka 2–10: sesuai nilai muka
  - **As (A): fleksibel — pemilik memilih bernilai 1 ATAU 11**
- **Jenis kartu (suit) TIDAK memengaruhi perhitungan aritmatika** — hanya nilainya yang dipakai.

### 2.2 Aturan Menyusun 24

Setiap ronde, 4 kartu ditarik dari pool. Pemain harus:

1. Menggunakan **keempat kartu**, masing-masing **tepat satu kali**
2. Menggabungkannya dengan operasi `+`, `−`, `×`, `÷`
3. **Boleh memakai kurung** — bebas urutan operasi
4. Hasil akhir harus **tepat 24**
5. Hasil setiap operasi pembagian (`÷`) **harus bilangan bulat** — pecahan tidak diizinkan

Contoh: kartu 6♥, 4♠, 3♦, 2♣
- `6 × 4 = 24`; `3 − 2 = 1`; `24 ÷ 1 = 24` ✓
- `(6 × 3) + 4 + 2 = 24` ✓

### 2.3 Alur Ronde

1. Server menarik 4 kartu dari pool (hanya kombinasi yang **terbukti solvable**)
2. Keempat kartu ditampilkan ke semua pemain
3. Pemain yang yakin bisa menyusun 24 menekan **RAISE HAND** (status publik — semua pemain melihat siapa yang sudah raise)
4. Ketika tersisa **1 pemain yang belum raise**, pemain tersebut berhak **menantang** (challenge) pemain manapun yang sudah raise — **wajib dalam 45 detik**; jika diam sampai waktu habis, **dia yang mengambil 4 kartu penalty** (anti-stall)
5. Pemain yang ditantang wajib membuktikan rumusnya dengan **menyusun ekspresi secara drag & drop** — menggeser kartu ke strip ekspresi dan memilih operator (tanpa keyboard, menghindari typo) → hasil susunan divalidasi server. **Jendela pembuktian: 45 detik** — lewat itu dianggap bluff
6. **Jika semua pemain raise** (tidak ada yang bisa ditantang): **pemain terakhir yang raise wajib membuktikan dalam 45 detik** (raise terakhir dianggap paling mencurigakan)
   - Gagal bukti → **dia yang mengambil 4 kartu**
   - Berhasil bukti → **4 kartu hangus** (semua mengaku bisa — tidak ada yang bisa dituduh bluff)

**Hasil pembuktian:**
| Kondisi | Konsekuensi |
|---|---|
| Rumus **valid** (hasil 24, pakai 4 kartu benar) | **Penantang** mengambil 4 kartu penalty |
| Rumus **tidak valid** / gagal membuktikan (bluff) | **Pemain bohong** (yang ditantang) mengambil 4 kartu penalty |

### 2.3a Mekanisme Surrender (final)

- Tombol **SURRENDER** tersedia di fase raise terbuka, muncul setelah **30 detik** kartu dibagikan
- **Surrender = fold ronde** — pemain keluar dari ronde itu: tidak bisa ditantang, tidak menerima kartu
- **Ronde lanjut** normal antar pemain yang tersisa
- **4 kartu hangus** (keluar pool, tidak ke tangan siapapun) jika:
  - sisa pemain aktif tinggal **1 orang** (tidak ada lawan untuk challenge), atau
  - **semua pemain surrender** serentak
- **Surrender DILARANG setelah challenge aktif** — setelah ditantang, jalan keluar hanya: buktikan rumus dalam 45 detik atau ambil kartu penalty. Surrender bukan tombol kabur dari tantangan

7. 4 kartu penalty masuk **permanen ke tangan** pemain yang kalah ronde (tidak kembali ke pool)
8. Jika kartu hangus, 4 kartu langsung keluar dari pool (tidak ke tangan siapapun)
9. Ronde berikutnya dimulai dengan 4 kartu baru dari pool — game berakhir saat pool habis (10 ronde)

**Tidak ada timer ronde** — tiap aksi punya deadline sendiri: challenge/bukti **45 detik**, surrender aktif setelah **30 detik**.

### 2.4 Akhir Game & Pemenang

- Game berakhir ketika **pool 40 kartu habis** (10 ronde)
- **Pemenang: 1 pemain dengan jumlah kartu paling sedikit**
- **Tie** (2+ pemain dengan kartu sama sedikitnya): **semua pemain tersebut dianggap KALAH** (berbagi posisi terakhir)
- Sisanya kalah

## 3. Fitur MVP

### 3.1 Akun
- Bermain sebagai **guest/anonymous** tanpa registrasi
- Opsi **registrasi belakangan** (upgrade guest → akun penuh) — username + password
- Profil pemain: username, jumlah game, jumlah menang, win rate

### 3.2 Room Multiplayer
- Kapasitas **2–10 pemain** per room
- Mekanisme masuk (v1 minimal):
  - **Room code 6 karakter**
  - **Share link** invite
  - *(Friend list penuh — request/search/online — di v2)*
- Host room memulai game

### 3.3 Gameplay Real-Time
- Sinkronisasi state ronde ke semua pemain dalam room
- Fitur raise hand (publik), challenge, pembuktian
- **Validasi jawaban dilakukan di server** (anti-cheat)

### 3.4 Leaderboard
- Berbasis **win rate** (% menang dari total game)
- Peringkat global pemain

### 3.5 Penanganan Disconnect
- **Grace period 60 detik** setelah koneksi terputus
- Jika tidak kembali dalam grace period: **auto-fold** — kartu penalty ronde berjalan jatuh ke pemain tersebut
- Jika kembali dalam grace period: permainan dilanjutkan normal

## 4. User Stories

| # | Sebagai... | Saya ingin... | Agar... |
|---|---|---|---|
| 1 | Pemain baru | Bermain tanpa daftar akun (guest) | Langsung coba game |
| 2 | Pemain | Membuat room & mengundang teman via kode/link | Bisa main bareng |
| 3 | Pemain | Melihat siapa yang sudah raise hand | Bisa memutuskan menantang atau tidak |
| 4 | Pemain | Menantang pemain yang dicurigai bluffing | Menantang pembohong agar dia yang ambil kartu |
| 5 | Pemain | Membuktikan rumus dengan drag kartu & memilih operator | Menunjukkan saya benar-benar tahu jawaban tanpa takut typo |
| 6 | Pemain | Mendaftar akun setelah main guest | Menyimpan progres & win rate |
| 7 | Pemain | Melihat leaderboard | Membandingkan skill dengan pemain lain |

## 5. Non-Functional Requirements

- **Platform:** Android 8+ & iOS 13+
- **Multiplayer:** state game real-time, latency rendah (<100ms ideal)
- **Anti-cheat:** semua validasi aritmatika, giliran, dan challenge di sisi server — klien tidak pernah dipercaya
- **Keamanan akun:** password di-hash (bcrypt/argon2), JWT untuk sesi
- **Skalabilitas:** mendukung banyak room simultan
- **Ketersediaan pool solvable:** server wajib hanya menarik kombinasi 4 kartu yang memiliki minimal 1 solusi valid

## 6. Edge Cases & Risiko

| # | Kasus | Penanganan |
|---|---|---|
| 1 | Tidak ada pemain yang raise (semua stuck) | Semua bisa **surrender** → 4 kartu hangus, ronde berikutnya jalan (§2.3a) |
| 2 | Semua pemain raise | Pemain **terakhir yang raise** wajib bukti 45 detik — gagal = ambil kartu, berhasil = hangus (§2.3 poin 6) |
| 3 | Pemain terakhir belum raise tapi diam | 45 detik → **dia yang ambil kartu** (anti-stall) |
| 4 | Tie di akhir game | Semua pemain tie dianggap kalah |
| 5 | Pemain disconnect di tengah ronde | Grace period 60 detik → auto-fold |
| 6 | Reconnect **setelah** grace period habis | Pemain keluar game, status jadi penonton sampai game berikutnya (kartu yang sudah terlanjur jatuh ke dia tetap dihitung) |
| 7 | As bernilai 1 atau 11 | Pemain yang membuktikan bebas memilih interpretasi; validasi server menerima keduanya |
| 8 | Rumus tidak valid / hasil ≠ 24 / kartu kurang-lebih | Dianggap bluff → yang ditantang ambil kartu |
| 9 | Join di tengah game berlangsung | Tidak diizinkan — join hanya di lobby sebelum game dimulai |

## 7. Open Questions / Risiko Terbuka

Pertanyaan kritis ronde sudah **FINAL**: surrender (§2.3a), semua-raise (§2.3 poin 6), anti-stall 45 detik, jendela bukti 45 detik. Sisa yang tertunda:

1. **Reconnect setelah grace period habis** — perilaku default v1: penonton sampai game berikutnya (bisa diubah)
2. **Ranked / rating ELO** — out of scope v1, dipertimbangkan v2
3. **Friend list penuh** (request/search/online status) — v2
4. **Notifikasi push** — v2


## 8. Success Metrics

- Jumlah game selesai per hari
- Rata-rata durasi ronde
- Retensi pemain guest → registered
- Win rate leaderboard aktif

## 9. Out of Scope (v1)

- Ranked/competitive mode dengan rating ELO
- In-game chat
- Cosmetics / shop
- Notifikasi push
- Mode turnamen
