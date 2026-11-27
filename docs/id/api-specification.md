# Spesifikasi REST API — Stock-Mate v2 (Bahasa Indonesia)

> **Kembali ke Panduan Utama:** [docs/id/README.md](README.md)  
> **Versi Inggris:** [docs/api-specification.md](../api-specification.md)  
> **Base URL:** `/api/v1`

---

## 1. Aturan Umum Pemanggilan API

1. **Format Body:** Semua endpoint `POST` / `PUT` / `PATCH` wajib memakai `Content-Type: application/json`, **kecuali** 3 endpoint tanpa body: `POST /api/v1/auth/logout`, `POST /api/v1/watchlist/sync-all`, dan `POST /api/v1/watchlist/catalog/sync`.
2. **Batas Ukuran Body:** Maksimal **64 KB** (`65.536 byte`); lebih dari itu ditolak `413 Payload Too Large`.
3. **Header CSRF Wajib (untuk request ubah data yang membawa cookie login):** Sertakan `X-Requested-With: StockMate` (atau `Origin` / `Referer` / `Sec-Fetch-Site: same-origin`). Jika tidak, ditolak `403 Forbidden`.
4. **Correlation ID:** Setiap response selalu mengembalikan header `x-correlation-id` (`req_*`) untuk melacak log jika terjadi error.
5. **Cookie Sesi:**
   - Di HTTPS: `__Host-sm_session` (7 hari) dan `__Host-sm_at` (15 menit).
   - Di HTTP lokal: `sm_session` dan `sm_at`.

---

## 2. Format Error Standar (RFC 7807)

Semua error `4xx` dan `5xx` dikirim dengan `Content-Type: application/problem+json` tanpa pernah membocorkan *stack trace*:

```json
{
  "type": "https://stock-mate-v2/errors/validation-error",
  "title": "Validation Failed",
  "status": 400,
  "detail": "One or more fields are invalid.",
  "instance": "/api/v1/watchlist",
  "correlationId": "req_a1b2c3d4e5f60718",
  "errors": {
    "ticker": ["Must be a 4-letter IDX ticker (e.g. BBCA)"]
  }
}
```

| Status | Arti Umum |
| :-: | :--- |
| `400` | Input tidak valid, JSON rusak, kuota akun penuh (200 saham / 30 grup), atau email duplikat saat register (pesan netral). |
| `401` | Belum login, sesi habis/dicabut, atau email/password salah. |
| `403` | Ditolak guard CSRF/Origin, atau token `CATALOG_SYNC_SECRET` salah/tidak ada. |
| `404` | Endpoint/resource tidak ada, format ID/ticker salah, atau milik user lain (anti-IDOR). |
| `409` | Ticker sudah ada di watchlist aktif, nama custom watchlist kembar, atau ticker sudah ada di grup. |
| `413` / `415` | Body > 64 KB (`413`) atau `Content-Type` bukan JSON (`415`). |
| `429` | Melebihi batas rate limit (lihat header `Retry-After`). |
| `502` / `503` | Provider pasar error (`502`), D1 readiness gagal, atau circuit breaker terbuka (`503`). |

---

## 3. Batas Rate Limit

| Endpoint | Batas | Jendela | Pengelompokan |
| :--- | :---: | :---: | :--- |
| `POST /api/v1/auth/register` & `/login` | `15` req | `60 detik` | Per IP (`cf-connecting-ip`) |
| `POST /api/v1/watchlist/sync-all` | `6` req | `60 detik` | Per `userId` (fallback IP) |
| `POST /api/v1/watchlist/catalog/sync` | `4` req | `60 detik` | Per `userId` (fallback IP) |
| `GET /api/v1/market-data/idx/:ticker` | `60` req | `60 detik` | Per `userId` (fallback IP) |

---

## 4. Daftar Lengkap Endpoint

### A. Kesehatan & Snapshot Publik

| Method & Path | Akses | Penjelasan |
| :--- | :---: | :--- |
| `GET /api/v1/health/live` | Publik | Cek apakah Worker hidup (0 query DB). Balas `{"status":"ok"}`. |
| `GET /api/v1/health` & `/health/ready` | Publik | Cek koneksi D1 (`SELECT 1`). Balas `{"status":"ok","db":"ok"}`. |
| `GET /api/v1/catalog/snapshot` | Publik | Snapshot lengkap ~900 saham IHSG dari Edge Cache / KV. Mendukung `If-None-Match` → `304 Not Modified`. Header `X-Catalog-Cache` menunjukkan sumber (`EDGE-HIT`, `HOT`, `KV`, `D1`, `EMPTY`). |

### B. Autentikasi (`/api/v1/auth`)

| Method & Path | Body | Hasil Sukses |
| :--- | :--- | :--- |
| `POST /api/v1/auth/register` | `{ email, name, password }` | `201` `{ user }` + set 2 cookie auth |
| `POST /api/v1/auth/login` | `{ email, password }` | `200` `{ user }` + set 2 cookie auth (pangkas jika >5 sesi) |
| `POST /api/v1/auth/logout` | *(kosong)* | `204` + cabut sesi di D1 & KV + hapus cookie |
| `GET /api/v1/auth/me` | — | `200` `{ user }` (0 query D1 saat cookie JWT 15m valid) |

### C. Portofolio & Watchlist Pribadi (`/api/v1/watchlist`)

| Method & Path | Penjelasan |
| :--- | :--- |
| `GET /api/v1/watchlist` | Daftar saham pribadi. Query opsional: `search`, `sector`, `sort` (`updated_desc`, `mos_desc`, `fqs_desc`, `ticker_asc`). |
| `POST /api/v1/watchlist` | Tambah saham baru + fundamental secara atomik (`201`). Mendukung `holdingTranches` (maks. 20). |
| `GET /api/v1/watchlist/:id` | Detail 1 saham pribadi beserta valuasi Core-3, FQS, dan posisi (`200`). |
| `PATCH /api/v1/watchlist/:id` | Update sebagian (harga, tranche, tesis, target PER/PBV, DCF, atau fundamental) (`200`). |
| `DELETE /api/v1/watchlist/:id` | Soft delete atomik (`204`). |
| `POST /api/v1/watchlist/ensure` | Body `{ "ticker": "BBCA" }`. Ambil item pribadi jika sudah ada (`200`), atau buat otomatis dari katalog/live quote (`201`). |
| `POST /api/v1/watchlist/sync-all` | Segarkan harga & fundamental seluruh saham pribadi dari katalog `idx_stocks` (`200` `{ updatedCount }`). |

### D. Katalog IHSG & Radar (`/api/v1/watchlist/catalog`)

| Method & Path | Penjelasan |
| :--- | :--- |
| `GET /api/v1/watchlist/catalog` | Endpoint utama tab **Semua IHSG** & **Radar**. Mendukung filter: `search`, `sector`, `valuationStatus`, `minMos`, `maxMos`, `qualityGrade` (`S–E`), `qarpQuadrant`, `minFqs`, `maxFqs`, `minProfitability`, `minGrowth`, `minHealth`, `minCashFlow`, `minAdtvBillion`, `minPiotroski`, `excludeHighRiskTrap`, `sort` (15 pilihan urutan), `page` (`1..500`), `pageSize` (`10..100`, default `10`). |
| `POST /api/v1/watchlist/catalog/sync` | Tarik ulang ~900 saham IHSG dari TradingView, simpan ke D1 & KV, lalu perbarui item user pemanggil. Jika `CATALOG_SYNC_SECRET` dipasang, wajib sertakan `Authorization: Bearer <secret>`. |

### E. Custom Watchlist (`/api/v1/watchlist/groups`)

| Method & Path | Penjelasan |
| :--- | :--- |
| `GET /api/v1/watchlist/groups` | Daftar semua custom watchlist milik user (`200`). |
| `POST /api/v1/watchlist/groups` | Buat custom watchlist baru `{ name, description?, tickers? }` (`201`, maks. 30 grup). |
| `PATCH /api/v1/watchlist/groups/:groupId` | Ubah nama/deskripsi grup (`200`). |
| `DELETE /api/v1/watchlist/groups/:groupId` | Soft delete grup (`204`). |
| `GET /api/v1/watchlist/groups/:groupId/stocks` | Daftar saham dalam grup dengan dukungan filter screener & urutan (`200`). |
| `POST /api/v1/watchlist/groups/:groupId/stocks` | Tambah 1 ticker `{ ticker }` ke grup (`201`, maks. 100 ticker/grup). |
| `DELETE /api/v1/watchlist/groups/:groupId/stocks/:ticker` | Hapus ticker dari grup (`204`). |

### F. Data Pasar On-Demand (`/api/v1/market-data`)

| Method & Path | Penjelasan |
| :--- | :--- |
| `GET /api/v1/market-data/idx/:ticker` | Ambil data terbaru 1 emiten 4 huruf dari rantai provider (Sectors.app opsional → TradingView → Yahoo Finance fallback). |
