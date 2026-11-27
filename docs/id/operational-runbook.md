# Panduan Operasional & Troubleshooting — Stock-Mate v2 (Bahasa Indonesia)

> **Kembali ke Panduan Utama:** [docs/id/README.md](README.md)  
> **Versi Inggris:** [docs/operational-runbook.md](../operational-runbook.md)

---

## 1. Cek Kesehatan & Target Performa (SLO)

| Endpoint | Kegunaan | Hasil Normal |
| :--- | :--- | :--- |
| `GET /api/v1/health/live` | Cek Worker hidup (0 query DB, aman diping terus-terusan) | `200` `{"status":"ok"}` |
| `GET /api/v1/health/ready` | Cek Worker + koneksi D1 (`SELECT 1`) | `200` `{"status":"ok","db":"ok"}` |

**Target SLO ([ADR-001](../ADR-001-100k-scaling-architecture.md) & [`load-test.k6.js`](../../scripts/load-test.k6.js)):**
- Error rate `< 0,1%` (ketersediaan `99,9%`).
- Latensi baca snapshot Edge: `p95 < 200 ms`, `p99 < 400 ms`.
- Latensi baca API terautentikasi: `p95 < 250 ms`, `p99 < 500 ms`.

---

## 2. Monitoring Log (Structured JSON & Anti-PII)

Semua log di [`logger.ts`](../../src/server/shared/logger.ts) berbentuk JSON rapi dan otomatis menyensor 23 field sensitif (`password`, `email`, cookie, token, secret, IP) menjadi `"[REDACTED]"`.

### Melihat Log Produksi Secara Live
```bash
npx wrangler tail
```

**Nama event log utama yang perlu dipantau:**
- `http_request` (`info`) — mencatat `method`, `path`, `status`, `durationMs` + `correlationId`.
- `cron_catalog_sync_completed` (`info`) — mencatat berapa saham berhasil disinkron (`syncedCount`), durasi, dan apakah KV aktif.
- `cron_catalog_sync_failed` (`error`) — tanda sinkronisasi TradingView gagal.
- `app_error` / `unhandled_error` (`error`) — error server `5xx`.

---

## 3. Jadwal Sinkronisasi Otomatis (Cron Trigger)

Diatur pada [`wrangler.jsonc`](../../wrangler.jsonc):
- **`*/5 1-10 * * 1-5` (UTC):** Setiap **5 menit**, Senin–Jumat pukul **08:00 – 17:55 WIB** (jam bursa IDX).
- **`0 15 * * *` (UTC):** Setiap hari pukul **22:00 WIB** (sinkronisasi penutupan malam).

### Perintah Admin Berguna

```bash
# Cek jumlah saham & waktu sinkronisasi terakhir di D1 produksi (read-only)
npx wrangler d1 execute stock-mate-db --remote \
  --command "SELECT COUNT(*) AS total_stocks, MAX(synced_at) AS latest_synced_at FROM idx_stocks;"

# Cek key yang tersimpan di KV
npx wrangler kv key list --binding STOCK_MATE_KV

# Paksa sync manual IHSG (butuh cookie login + CATALOG_SYNC_SECRET jika aktif)
curl -X POST https://stock-mate-v2.charlymicolas21.workers.dev/api/v1/watchlist/catalog/sync \
  -H "Authorization: Bearer $CATALOG_SYNC_SECRET" \
  -H "X-Requested-With: StockMate" \
  -b "cookies.txt"
```

---

## 4. Panduan Troubleshooting Cepat (Jika Ada Masalah)

| Gejala / Error | Penyebab Paling Mungkin | Cara Mengatasi |
| :--- | :--- | :--- |
| **`503` pada `/health/ready`** | Gangguan D1, salah `database_id`, atau migrasi belum dijalankan. | Cek status Cloudflare D1, pastikan `wrangler.jsonc` benar, dan jalankan `npm run db:migrate:remote`. |
| **Katalog kosong (`EMPTY`) atau harga tidak update >15 menit di jam bursa** | Cron gagal tarik data dari TradingView, circuit breaker 60 detik sedang terbuka, atau KV lock 240 detik masih aktif. | Cek `npx wrangler tail` cari `cron_catalog_sync_failed`. Tunggu 60 detik lalu panggil `/api/v1/catalog/snapshot` atau jalankan sync manual. |
| **`502` / `503` saat klik tombol Auto-Fetch 1 ticker** | TradingView gagal 3x berturut-turut (*circuit breaker* terbuka 60 detik) dan ticker tersebut tidak ada di fallback D1 `idx_stocks`. | Tunggu 60 detik (pulih otomatis). Untuk emiten yang sudah ada di `idx_stocks`, sistem otomatis menyajikan data Cron terakhir (`source: 'idx_catalog'`). User tetap bisa input manual. |
| **`403 Forbidden` saat tes API via Postman / curl** | Request `POST`/`PATCH`/`DELETE` membawa cookie tapi tidak menyertakan header bukti same-origin. | Tambahkan header `-H "X-Requested-With: StockMate"`. |
| **User terasa sering logout atau banyak hit D1 pada `/auth/me`** | `JWT_SECRET` belum dipasang di produksi (sehingga tiap isolate memakai kunci acak berbeda) atau user login di >5 perangkat. | Pasang secret permanen via `npx wrangler secret put JWT_SECRET` lalu deploy ulang. |
| **`429 Too Many Requests`** | Melewati jatah rate limit (`15/mnt` auth, `6/mnt` sync-all, `4/mnt` catalog sync, `60/mnt` market-data). | Tunggu sesuai angka detik pada header `Retry-After`. |

---

## 5. Uji Beban dengan k6 (`scripts/load-test.k6.js`)

```bash
# Tes ringan (20 user virtual selama 40 detik) — aman dijalankan kapan saja
k6 run -e BASE_URL=https://stock-mate-v2.charlymicolas21.workers.dev scripts/load-test.k6.js

# Tes stress 10.000 user virtual (staging)
k6 run -e BASE_URL=https://stock-mate-v2.charlymicolas21.workers.dev \
  -e LOAD_PROFILE=stress_10k scripts/load-test.k6.js
```

---

## 6. Prosedur Darurat Keamanan

- **Jika `JWT_SECRET` bocor:** Segera ganti lewat `npx wrangler secret put JWT_SECRET`. Semua cookie akses 15 menit lama langsung ditolak dan otomatis diverifikasi ulang lewat D1.
- **Paksa logout semua user sekaligus:** Kosongkan tabel `sessions` di D1 dan ganti `JWT_SECRET`.
- **Ganti `CATALOG_SYNC_SECRET`:** Cukup jalankan `npx wrangler secret put CATALOG_SYNC_SECRET` (langsung aktif tanpa perlu ubah kode).
