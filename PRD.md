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
4. Ketika tersisa **1 pemain yang belum raise**, pemain tersebut berhak **menantang** (challenge) pemain manapun yang sudah raise
5. Pemain yang ditantang wajib membuktikan rumusnya dengan **menyusun ekspresi secara drag & drop** — menggeser kartu ke strip ekspresi dan memilih operator (tanpa keyboard, menghindari typo) → hasil susunan divalidasi server

**Hasil pembuktian:**
| Kondisi | Konsekuensi |
|---|---|
| Rumus **valid** (hasil 24, pakai 4 kartu benar) | **Penantang** mengambil 4 kartu penalty |
| Rumus **tidak valid** / gagal membuktikan (bluff) | **Pemain bohong** (yang ditantang) mengambil 4 kartu penalty |

6. 4 kartu penalty masuk **permanen ke tangan** pemain yang kalah ronde (tidak kembali ke pool)
7. Ronde berikutnya dimulai dengan 4 kartu baru dari pool

**Tidak ada timer** — ronde berjalan sampai ada pembuktian.

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
- Mekanisme masuk:
  - **Room code 6 karakter**
  - **Share link** invite
  - **Friend list** + invite langsung ke teman
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
| 1 | Tidak ada pemain yang raise (semua stuck) | Dianggap **tidak mungkin** oleh product owner (kombinasi selalu solvable + tanpa timer, pemain bisa mikir selama apapun). Risiko teoretis tetap dicatat — lihat §7 |
| 2 | Tie di akhir game | Semua pemain tie dianggap kalah |
| 3 | Pemain disconnect di tengah ronde | Grace period 60 detik → auto-fold |
| 4 | As bernilai 1 atau 11 | Pemain yang membuktikan bebas memilih interpretasi; validasi server menerima keduanya |
| 5 | Pemain mengetik rumus tapi hasil ≠ 24 | Rumus tidak valid → dianggap bluff |
| 6 | Pemain mengetik rumus yang memakai kartu lebih/kurang dari 4 | Rumus tidak valid → dianggap bluff |

## 7. Open Questions / Risiko Terbuka

1. **Deadlock teoretis:** jika semua pemain terhubung tapi tidak ada yang bisa menyelesaikan (meski solvable), ronde tidak akan pernah berakhir karena tidak ada timer. Belum ada mekanisme escape — lihat poin 3 (kandidat solusi: tombol surrender).
2. **Definisi "bisa solve tapi raise"** — tidak ada biaya/batas raise; pemain bisa raise lalu menunggu. Belum ada aturan anti-stalling.
3. **Mekanisme Surrender (kandidat solusi deadlock — belum final):**
   - Setelah kartu muncul, jika pemain tidak yakin bisa solve, tersedia tombol **SURRENDER** yang muncul setelah **N detik** (rekomendasi: **30 detik**, agar jendela bluffing tetap ada dan pemain kasual sempat mikir — 15 detik dinilai terlalu cepat).
   - **Pertanyaan terbuka sebelum finalisasi:**
     a. Jika hanya **sebagian** pemain yang surrender (sisanya masih raise/mikir), kartu penalty ronde itu jatuh ke siapa?
     b. Jika **semua** pemain surrender serentak (tidak ada yang raise), 4 kartu ke siapa — dibagi rata, masuk pot ronde berikutnya, atau pemain tercepat yang ambil?
   - Aturan final mekanisme surrender (kondisi a & b) menunggu keputusan product owner.


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
