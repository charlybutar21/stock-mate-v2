# Spesifikasi Fitur & Panduan Penggunaan — Stock-Mate v2 (Bahasa Indonesia)

> **Kembali ke Panduan Utama:** [docs/id/README.md](README.md)  
> **Versi Inggris:** [docs/functional-specification.md](../functional-specification.md)

---

## 1. Peran Pengguna & Hak Akses

| Peran | Apa yang Bisa Dilakukan |
| :--- | :--- |
| **Tamu (Belum Login)** | Membuka halaman `/login` dan `/register`, mengecek health endpoint, serta mengakses snapshot katalog publik (`GET /api/v1/catalog/snapshot`). |
| **Investor Terdaftar** | Akses penuh ke Portofolio pribadi, Semua Saham IHSG, Custom Watchlist, Detail Saham, Radar, Simulator, dan ambil harga live per ticker. **Hanya bisa melihat & mengubah data miliknya sendiri** (data user lain selalu dibalas `404`). |
| **Admin / Cron** | Menjalankan sinkronisasi penuh seluruh IHSG (`POST /api/v1/watchlist/catalog/sync`) menggunakan header `Authorization: Bearer <CATALOG_SYNC_SECRET>` saat secret diaktifkan. |

---

## 2. Navigasi Aplikasi

Di desktop, navigasi utama berada di bar atas; di HP, navigasi berada di **Bottom Tab Bar** 3 menu (ergonomis ala Stockbit/Ajaib) pada [`AppShell.tsx`](../../src/client/components/ui/AppShell.tsx):
1. **Watchlist / Portofolio (`/watchlist`)**
2. **Radar (`/radar`)**
3. **Simulator (`/simulator`)**

Di sudut kanan atas tersedia tombol ganti **Tema (Terang/Gelap)**, **Bahasa (`EN`/`ID`)**, inisial profil, dan tombol **Keluar (Logout)**.

---

## 3. Modul 1: Autentikasi (`/login` & `/register`)

- **Daftar Akun (`/register`):** Membutuhkan Nama (`2–80` karakter), Email valid (otomatis huruf kecil), dan Password (`8–128` karakter, minimal 1 huruf dan 1 angka). Jika email sudah terpakai, sistem memberi pesan error netral agar privasi akun lain tetap terjaga.
- **Masuk (`/login`):** Memverifikasi password, menghapus sesi kedaluwarsa, membatasi maksimal **5 perangkat/sesi aktif** (sesi paling lama otomatis keluar), lalu langsung masuk ke `/watchlist`.
- **Keluar (Logout):** Idempoten (tetap sukses `204` walau sesi sudah habis), langsung mencabut cookie akses & sesi di server, membersihkan cache data browser, dan mengarahkan ke `/login`.

---

## 4. Modul 2: Portofolio, Semua IHSG & Custom Watchlist (`/watchlist`)

Halaman [`WatchlistPage.tsx`](../../src/client/features/watchlist/WatchlistPage.tsx) memiliki 3 jenis tab utama:

### A. Tab Portofolio (Default saat Masuk)
- Menampilkan hanya saham yang sudah kamu miliki (`ownedLots > 0`).
- **Ringkasan Hero KPI:** Total Nilai Pasar, Total Modal Diinvestasikan, dan Total Untung/Rugi (*Unrealized P/L* dalam Rupiah & %).
- **Tombol Privacy (Ikon Mata):** Menyembunyikan nominal Rupiah (`Rp •••••••`) dan jumlah lot (`•••`) saat membuka aplikasi di tempat umum.
- **Mode Hitung `Broker Gross` vs `Net After Fees`:**
  - `Broker Gross` (default di UI): Menampilkan persentase return bruto seperti layar portofolio Stockbit.
  - `Net After Fees`: Sudah memperhitungkan fee beli `0,15%` ke modal dan memotong fee jual `0,25%` dari nilai pasar.
- **Allocation Risk X-Ray:** Baris status 1-baris (`Seimbang` atau `Peringatan Konsentrasi`) yang bisa diklik untuk membuka 2 diagram donat interaktif (bobot per saham vs per sektor).
- Jika portofolio masih kosong, muncul panduan pemula untuk **Cari Saham di Radar** atau **Catat Saham yang Dimiliki**.

### B. Tab Semua IHSG
- Menampilkan seluruh ~900 saham biasa aktif di IHSG dengan paginasi (`10`, `50`, atau `100` saham per halaman; default `10`).
- Menampilkan harga pembukaan (*open*), selisih & % perubahan hari ini, harga terakhir, Harga Wajar Moderat, MoS %, Grade FQS (`S–E`), dan status Value Trap.
- **Toolbar Filter:** Cari ticker/nama perusahaan, pilih 11 sektor IDX, status valuasi, Grade FQS, preset/rentang MoS, tombol cepat *Saham Likuid* (`ADTV ≥ Rp 1 M`), tombol *Bebas High-Risk Trap*, dan berbagai pilihan urutan.

### C. Tab Custom Watchlist
- Bisa membuat hingga **30** daftar pantauan sendiri (contoh: *"Bank Big 4"*, *"Dividen Hunter"*), masing-masing hingga **100** saham.
- Tambah saham super cepat lewat kotak pencarian autocomplete ([`CustomWatchlistQuickAdd.tsx`](../../src/client/features/watchlist/CustomWatchlistQuickAdd.tsx)) atau menu tombol `+` di setiap baris saham.

### D. Tambah/Edit Saham & Auto-Fetch Live
- Di modal [`StockFormModal.tsx`](../../src/client/features/watchlist/StockFormModal.tsx), ketik 4 huruf ticker (misal `BBCA`) lalu klik tombol sinkronisasi untuk mengisi otomatis harga dan seluruh data fundamental dari TradingView/Yahoo Finance.
- Kamu juga bisa klik tombol **Sync Semua** (`POST /api/v1/watchlist/sync-all`) untuk menyegarkan semua saham pribadimu sekaligus.

---

## 5. Modul 3: Detail Saham & Meja Kerja Valuasi (`/watchlist/:id`)

Ketika kamu mengklik saham dari tab *Semua IHSG* atau *Radar* yang belum ada di daftar pribadimu, aplikasi otomatis memanggil `POST /api/v1/watchlist/ensure` untuk menyalin data katalognya ke akunmu, lalu membuka [`StockDetailPage.tsx`](../../src/client/features/watchlist/StockDetailPage.tsx):

- **Kartu Core-3 Fair Value & Range Bar:** Membandingkan harga sekarang dengan estimasi **Konservatif**, **Moderat (Median)**, dan **Optimistis** dari Relative P/E, Relative P/B, dan Simple DCF. Jika suatu metode tidak bisa dihitung (misal EPS negatif), alasan resminya ditampilkan jelas.
- **Simulasi *What-If* Instan:** Ubah `Target PER`, `Target PBV`, atau `Discount Rate` dan langsung lihat Harga Wajar + MoS berubah seketika di layar. Klik **Simpan** jika ingin menjadikannya asumsi permanen untuk saham tersebut.
- **Fundamental Quality X-Ray & Value Trap Shield:** Menampilkan rincian skor 4 pilar FQS, jalur akuntansi, *Weak-Link Caps* yang aktif, Piotroski F-Score, Altman Z-Score, dan peringatan jebakan valuasi.
- **Editor Posisi Multi-Tranche:** Tambah hingga 20 baris cicilan beli (`Lot` & `Harga Beli` 2 desimal), sistem otomatis menghitung harga rata-rata tertimbang.
- **Tombol Langsung ke Simulator:** Membawa saham, harga wajar, jumlah lot, dan average buy price-mu langsung ke `/simulator?stockId=:id`.

---

## 6. Modul 4: Radar — Screener Kualitas & Valuasi (`/radar`)

[`RadarPage.tsx`](../../src/client/features/radar/RadarPage.tsx) dirancang untuk mencari saham bagus dengan cepat:

- **4 Kartu KPI Interaktif:** Total saham (dan jumlah yang punya FQS), jumlah **Prime Opportunity**, jumlah saham **Elite/Strong Quality (Grade S/A)**, dan jumlah **Undervalued**. Klik kartu langsung memfilter daftar.
- **5 Preset Sekali Klik:**
  1. **Semua Saham:** Urut berdasarkan FQS tertinggi.
  2. **Prime Opportunity (Kualitas Lagi Diskon):** `MoS ≥ 20%`, `FQS ≥ 76`, `Profitabilitas ≥ 65`, `Kesehatan ≥ 60`, `ADTV ≥ Rp 1 M`, bebas *High-Risk Trap*, urut `QARP terbaik`.
  3. **Compounders (Compounder Stabil):** `FQS ≥ 82`, `Profitabilitas ≥ 75`, `Pertumbuhan ≥ 65`, `Arus Kas ≥ 70`, `ADTV ≥ Rp 1 M`, bebas trap.
  4. **Fortress Cash (Kas Kuat):** `MoS ≥ 15%`, `Kesehatan ≥ 80`, `Arus Kas ≥ 80`, `ADTV ≥ Rp 1 M`, bebas trap.
  5. **GARP (Tumbuh & Diskon):** `MoS ≥ 15%`, `Pertumbuhan ≥ 75`, `Profitabilitas ≥ 60`, `ADTV ≥ Rp 1 M`, bebas trap.
- **Filter Lanjutan (Bisa Dilipat):** Filter angka minimum untuk masing-masing 4 pilar, `minFqs`, `minMos`, `minAdtvBillion`, dan `minPiotroski` (`0–9`).
- **Modal X-Ray Cepat:** Klik ikon X-Ray pada baris saham untuk membedah 4 pilar kualitasnya tanpa pindah halaman.

---

## 7. Modul 5: Simulator IDX Terhubung ke Posisi (`/simulator`)

[`SimulatorPage.tsx`](../../src/client/features/simulator/SimulatorPage.tsx) terhubung ke saham pribadimu dengan pengaturan global Fee Beli (`0,15%`), Fee Jual (`0,25%`), dan centang Bea Materai (`Rp 10.000` jika `> Rp 10 juta`). Input harga dilengkapi tombol `+ / -` yang otomatis loncat sesuai **5 fraksi harga resmi BEI**.

1. **Tab Average Down (Forward):** Masukkan hingga 5 rencana beli tambahan. Menampilkan rata-rata murni, rata-rata efektif (termasuk fee beli), **BEP Riil sesuai Fraksi BEI**, perbandingan % kenaikan menuju BEP sebelum vs sesudah average down, proyeksi profit bersih, dan peringatan jika harga beli di atas Harga Wajar atau justru *average up*.
2. **Tab Pyramiding Buy:** Masukkan total uang tunai yang siap dipakai, harga acuan, jarak diskon antar tahap (`1%–30%`), dan strategi (`20/30/50`, `33/33/34`, `15/35/50`). Sistem membagi otomatis menjadi 3 order limit sesuai fraksi BEI lengkap dengan sisa kas (*idle cash*).
3. **Tab Take-Profit Ladder:** Rencanakan penjualan bertahap hingga 5 level. Tersedia tombol **Auto-Isi dari Harga Wajar** (memecah lot 30%/40%/30% pada harga Konservatif, Moderat, Optimistis). Menampilkan sisa modal belum kembali dan lencana **100% Free-Ride** jika modal awal sudah balik seluruhnya.
4. **Tab Goal-Seek:** Tentukan harga rata-rata impian (`harga beli rencana < target avg < avg saat ini`), sistem langsung menghitung berapa lot tepat (`Math.ceil`) dan total dana yang dibutuhkan.

---

## 8. Fitur Kenyamanan Pengguna (UX)

- **Format Angka ala Stockbit:** Pemisah ribuan koma dan desimal titik (`Rp 4,825.67`), tapi pintar membaca *copy-paste* format Indonesia (`4.825,67`) maupun Stockbit (`4,825.67`).
- **Tooltip Glosarium Pemula:** Istilah seperti *Margin of Safety*, *Fair Value*, *Bea Materai*, dan *Piotroski F-Score* dilengkapi tombol info penjelasan singkat dalam Bahasa Indonesia/Inggris.
- **Ramah Layar HP:** Tabel otomatis berubah menjadi kartu ringkas di layar kecil tanpa perlu geser kiri-kanan.
