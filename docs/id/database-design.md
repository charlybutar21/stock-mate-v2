# Desain Database & Cloudflare KV — Stock-Mate v2 (Bahasa Indonesia)

> **Kembali ke Panduan Utama:** [docs/id/README.md](README.md)  
> **Versi Inggris:** [docs/database-design.md](../database-design.md)  
> **Sumber Skema:** [`src/server/shared/db/schema.ts`](../../src/server/shared/db/schema.ts) · [`migrations/`](../../migrations/)

---

## 1. Diagram Relasi Tabel (ERD)

```mermaid
erDiagram
    users ||--o{ sessions : "punya sesi (maks 5 aktif)"
    users ||--o{ watchlist_items : "punya saham pribadi (maks 200)"
    users ||--o{ custom_watchlists : "punya daftar kustom (maks 30)"
    watchlist_items ||--|| stock_fundamentals : "1-ke-1 data fundamental"
    custom_watchlists ||--o{ custom_watchlist_stocks : "isi ticker (maks 100)"
    idx_stocks ||..o{ watchlist_items : "sumber data awal (relasi logis)"
    idx_stocks ||..o{ custom_watchlist_stocks : "referensi ticker (relasi logis)"

    users {
        TEXT id PK
        TEXT email UK
        TEXT name
        TEXT password_hash
        INTEGER created_at
        INTEGER updated_at
        INTEGER deleted_at
    }

    sessions {
        TEXT id PK
        TEXT user_id FK
        TEXT token_hash UK
        INTEGER expires_at
        INTEGER created_at
    }

    watchlist_items {
        TEXT id PK
        TEXT user_id FK
        TEXT ticker
        TEXT company_name
        TEXT sector
        INTEGER current_price
        INTEGER owned_lots
        INTEGER avg_buy_price
        INTEGER avg_buy_price_x100
        TEXT holding_tranches_json
        INTEGER target_buy_price
        TEXT investment_thesis
        INTEGER updated_at
        INTEGER deleted_at
    }

    stock_fundamentals {
        TEXT id PK
        TEXT watchlist_item_id FK_UK
        INTEGER eps_bvps_dps
        INTEGER roe_der_growth_targets
        INTEGER dcf_assumptions
        INTEGER metrik_fqs_19_kolom
        INTEGER updated_at
    }

    idx_stocks {
        TEXT ticker PK
        TEXT company_name
        TEXT sector
        INTEGER current_price
        INTEGER open_price
        INTEGER daily_change
        INTEGER daily_change_bps
        INTEGER valuasi_dan_19_kolom_fqs
        TEXT source
        INTEGER synced_at
    }

    custom_watchlists {
        TEXT id PK
        TEXT user_id FK
        TEXT name
        TEXT description
        INTEGER updated_at
        INTEGER deleted_at
    }

    custom_watchlist_stocks {
        TEXT watchlist_id PK_FK
        TEXT ticker PK
        INTEGER added_at
    }
```

---

## 2. Kenapa Semua Angka Disimpan sebagai `INTEGER`?

Di SQLite/JavaScript, tipe desimal (`REAL`/float) bisa menimbulkan error kecil seperti `0.1 + 0.2 = 0.30000000000000004`. Untuk menghindari selisih uang atau rasio, Stock-Mate v2 menggunakan **konvensi skala bilangan bulat tetap (*fixed-point*)**:

| Akhiran Kolom | Aturan Penyimpanan | Contoh |
| :--- | :--- | :--- |
| Harga / Rupiah (`current_price`, `eps`, `*_idr`) | `1 : 1` Rupiah bulat | `Rp 9.000` → `9000` |
| `*_bps` (*basis points*) | Persen × `100` (`1% = 100`) | `12,50%` → `1250` |
| `*_x100` | Rasio atau harga 2 desimal × `100` | `2,50x` → `250`; `Rp 4.825,67` → `482567` |
| `*_positive` | Boolean integer (`1` = ya, `0` = tidak, `NULL` = kosong) | `true` → `1` |
| `*_at` | Timestamp Unix milidetik (`Date.now()`) | `1764230400000` |

---

## 3. Penjelasan Singkat 7 Tabel

1. **`users`**: Data akun pengguna. Password disimpan dalam format `pbkdf2_sha256$100000$<salt>$<hash>`. Menggunakan *soft delete* (`deleted_at`).
2. **`sessions`**: Sesi login aktif selama 7 hari. Token mentah tidak pernah disimpan — hanya SHA-256 hex 64 karakter (`token_hash`).
3. **`watchlist_items`**: Saham yang dilacak atau dimiliki user. Menyimpan `owned_lots`, `avg_buy_price_x100` (presisi 2 desimal), `holding_tranches_json` (JSON array cicilan beli), target beli, dan catatan tesis. Menggunakan *soft delete*.
4. **`stock_fundamentals`**: Data fundamental milik masing-masing baris `watchlist_items` (termasuk asumsi DCF pribadi dan 19 kolom metrik FQS/likuiditas). Diambil sekaligus lewat **1 query `LEFT JOIN`** sehingga bebas masalah N+1.
5. **`idx_stocks`**: Katalog publik ~900 saham aktif IHSG yang dipakai bersama semua user. Diperbarui oleh Cron Trigger tiap 5 menit selama jam bursa.
6. **`custom_watchlists`**: Grup daftar pantauan buatan user (unik per nama tanpa peduli huruf besar/kecil; *soft delete*).
7. **`custom_watchlist_stocks`**: Daftar ticker di dalam tiap grup kustom (`PRIMARY KEY (watchlist_id, ticker)`).

---

## 4. Indeks Penting & Riwayat Migrasi

Database dilengkapi indeks parsial (`WHERE deleted_at IS NULL`) agar query tetap cepat dan ticker/nama grup yang sudah dihapus (*soft delete*) bisa ditambahkan ulang:
- `idx_watchlist_user_active` pada `(user_id, updated_at DESC) WHERE deleted_at IS NULL` — bahkan diverifikasi dengan `EXPLAIN QUERY PLAN` di tes integrasi!
- `uq_watchlist_user_ticker_active` — mencegah 1 user punya 2 baris aktif untuk ticker yang sama.
- `uq_custom_watchlists_user_name_active` — mencegah nama custom watchlist ganda (case-insensitive).

### Urutan 7 Migrasi SQL (`migrations/`)
1. `0001_initial.sql` — Buat tabel `users`, `sessions`, `watchlist_items`, `stock_fundamentals`.
2. `0002_add_position_holdings.sql` — Tambah kolom `owned_lots` dan `avg_buy_price`.
3. `0003_add_holding_tranches.sql` — Tambah `holding_tranches_json` untuk multi-cicilan beli.
4. `0004_decimal_avg_buy_price.sql` — Tambah `avg_buy_price_x100` & salin data lama (`× 100`).
5. `0005_idx_catalog_and_custom_watchlists.sql` — Buat `idx_stocks`, `custom_watchlists`, `custom_watchlist_stocks`.
6. `0006_fundamental_quality_metrics.sql` — Tambah 19 kolom metrik FQS & likuiditas ke `idx_stocks` dan `stock_fundamentals`.
7. `0007_add_intraday_price_fields.sql` — Tambah `open_price`, `daily_change`, `daily_change_bps` ke `idx_stocks`.

---

## 5. Daftar Key di Cloudflare KV (`STOCK_MATE_KV`)

| Pola Key | TTL | Kegunaan |
| :--- | :--- | :--- |
| `catalog:v3:latest` | `12 jam` | Snapshot JSON ~900 saham IHSG yang sudah selesai dihitung valuasi & FQS-nya |
| `catalog:sync:lock` | `240 detik` | Kunci agar tidak ada 2 proses background sync berjalan bersamaan |
| `revoked:sid:<sessionId>` | `16 menit` | Daftar blokir instan untuk token akses 15 menit yang sudah logout/dirotasi |
| `rl:<scope>:<clientId>:<bucket>` | `≥ 60 detik` | Penghitung *rate limit* terdistribusi lintas server Cloudflare |

---

## 6. Atomisitas (`db.batch`) & Soft Delete

- Tambah saham pribadi (insert `watchlist_items` + `stock_fundamentals`), edit dengan fundamental, batch sync (per 25 saham = 50 statement), dan upsert katalog (per 100 saham) semuanya dibungkus dalam `db.batch()` agar atomik (sukses semua atau batal semua).
- Penghapusan (`DELETE`) pada `watchlist_items` dan `custom_watchlists` dilakukan secara **soft delete atomik** (`UPDATE ... SET deleted_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL RETURNING id`).
