# Aturan Bisnis & Rumus Perhitungan — Stock-Mate v2 (Bahasa Indonesia)

> **Kembali ke Panduan Utama:** [docs/id/README.md](README.md)  
> **Versi Inggris:** [docs/business-rules.md](../business-rules.md)  
> **Sumber Kode:** [`src/shared/domain/`](../../src/shared/domain/)

Dokumen ini menjelaskan **rumus persis** yang dipakai Stock-Mate v2 agar kamu bisa mengecek ulang setiap angka yang tampil di layar.

---

## 1. Aturan Resmi Bursa Efek Indonesia (IDX / BEI)

Sumber: [`src/shared/domain/idx-rules.ts`](../../src/shared/domain/idx-rules.ts)

| Aturan | Nilai | Penjelasan |
| :--- | :--- | :--- |
| **Ukuran Lot** | `1 Lot = 100 lembar` | Standar perdagangan saham BEI. |
| **Rentang Harga** | `Rp 1` – `Rp 100.000.000` | Mendukung saham Papan Pemantauan Khusus / FCA di bawah Rp 50. |
| **Fee Beli Default** | `0,15%` | Estimasi komisi broker ritel + biaya bursa. |
| **Fee Jual Default** | `0,25%` | Estimasi komisi broker + biaya bursa + PPh Final `0,1%`. |
| **Bea Materai** | `Rp 10.000` (jika bruto `> Rp 10.000.000`) | Opsional (default mati), karena di BEI Bea Materai dihitung per *Trade Confirmation* harian, bukan per saham. |
| **Batas Data Basi (*Stale*)** | `> 14 hari` | Saham ditandai *stale* jika `updatedAt` lebih dari 14 hari lalu. |

### 5 Fraksi Harga BEI (`getIdxTickSize`)

| Rentang Harga | Fraksi (Kelipatan) | Contoh Naik 1 Tick | Contoh Turun 1 Tick (Batas) |
| :--- | :---: | :--- | :--- |
| `< Rp 200` | `Rp 1` | `199 → 200` | `200 → 199` |
| `Rp 200 – Rp 499` | `Rp 2` | `200 → 202` | `500 → 498` |
| `Rp 500 – Rp 1.999` | `Rp 5` | `500 → 505` | `2.000 → 1.995` |
| `Rp 2.000 – Rp 4.999` | `Rp 10` | `2.000 → 2.010` | `5.000 → 4.990` |
| `≥ Rp 5.000` | `Rp 25` | `5.000 → 5.025` | `5.025 → 5.000` |

---

## 2. Mesin Valuasi Core-3 (Harga Wajar)

Sumber: [`src/shared/domain/valuation.ts`](../../src/shared/domain/valuation.ts)

### Rasio Pasar Otomatis
- **PER Saat Ini:** `Harga / EPS` (hanya jika `EPS > 0`).
- **PBV Saat Ini:** `Harga / BVPS` (hanya jika `BVPS > 0`).
- **Dividend Yield:** `(DPS / Harga) × 100%` (jika `DPS > 0`, selain itu `0%`).
- **PEG Ratio:** `PER / Pertumbuhan EPS (%)` (jika PER ada dan pertumbuhan EPS `> 0`).

### 3 Metode Harga Wajar
1. **Relative P/E:** $\text{FV}_{\text{PER}} = \max(1, \text{round}(\text{EPS} \times \text{Target PER}))$ — valid jika `EPS > 0` dan `Target PER > 0`.
2. **Relative P/B:** $\text{FV}_{\text{PBV}} = \max(1, \text{round}(\text{BVPS} \times \text{Target PBV}))$ — valid jika `BVPS > 0` dan `Target PBV > 0` (sangat penting untuk sektor Perbankan).
3. **Simple DCF 5 Tahun:** Memproyeksikan EPS selama `5` tahun (default) dengan *discount rate* `12%` dan *terminal growth* `4%`. Agar hasil tidak ngaco saat laba melonjak/anjlok ekstrem, pertumbuhan efektif dibatasi pada rentang **`-20%` s.d. `+20%`**:
   $$\text{FV}_{\text{DCF}} = \sum_{t=1}^{N} \frac{\text{EPS}(1+g_{\text{eff}})^t}{(1+r)^t} + \frac{\text{EPS}(1+g_{\text{eff}})^N(1+g_t)}{(r-g_t)(1+r)^N}$$

### Rentang Harga Wajar, Margin of Safety & Status
Dari metode yang valid (diurutkan kecil ke besar):
- **Konservatif** = nilai terkecil.
- **Moderat** = nilai tengah (*median*; jika 2 metode valid, diambil rata-ratanya).
- **Optimistis** = nilai terbesar.
- **Margin of Safety (MoS %):** $\frac{\text{FV Moderat} - \text{Harga Sekarang}}{\text{FV Moderat}} \times 100\%$

| Status Valuasi | Syarat | Arti Sederhana |
| :--- | :--- | :--- |
| **`UNDERVALUED`** | `MoS ≥ 30%` | Diskon besar (murah dengan bantalan pengaman lebar) |
| **`FAIRLY_VALUED`** | `0% ≤ MoS < 30%` | Harga wajar / diskon tipis |
| **`OVERVALUED`** | `MoS < 0%` | Harga pasar sudah lebih mahal dari Harga Wajar Moderat |
| **`INSUFFICIENT_DATA`** | `0` metode valid | Data EPS/BVPS belum cukup atau rugi tanpa nilai buku positif |

---

## 3. IHSG Value Trap Shield (Perisai Jebakan Saham Murah)

Saham murah belum tentu layak beli! Sistem otomatis menandai 4 jenis jebakan umum di IHSG:

| Kode Peringatan | Kapan Muncul? |
| :--- | :--- |
| **`CYCLICAL_PEAK_WARNING`** | Sektor `ENERGY` / `BASIC_MATERIALS` dan (`PER ≤ 6` atau `MoS ≥ 25%`) — hati-hati sedang di puncak siklus komoditas. |
| **`SHRINKING_EARNINGS_TRAP`** | Terlihat murah (`MoS ≥ 0%` atau `PBV < 1`) padahal laba menyusut (`epsGrowth < 0%`) atau rugi (`EPS ≤ 0`). |
| **`LOW_ROE_VALUE_TRAP`** | Diskon (`MoS ≥ 15%`) tapi profitabilitas lemah (`ROE < 8%`). |
| **`HIGH_LEVERAGE_TRAP`** | Bukan bank, utang tinggi (`DER > 1,5x`), dan terlihat murah (`MoS ≥ 0%`). |

**Tingkat Risiko:**
- **`CLEAR`:** Tidak ada peringatan.
- **`HIGH_RISK`:** Ada `≥ 2` peringatan, **atau** terkena `SHRINKING_EARNINGS_TRAP`, **atau** terkena `HIGH_LEVERAGE_TRAP`.
- **`WATCH`:** Ada 1 peringatan selain dua jebakan berat di atas.

---

## 4. Fundamental Quality Score (FQS v2 — 4 Jalur & Grade S–E)

Sumber: [`src/shared/domain/quality-score.ts`](../../src/shared/domain/quality-score.ts)

Setiap emiten dinilai pada 4 pilar dengan bobot berbeda sesuai sifat industrinya:

| Jalur (Track) | Sektor IDX | Profitabilitas | Pertumbuhan | Kesehatan Keuangan | Arus Kas |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **`FINANCIALS`** | Perbankan & Keuangan | **35%** | **20%** | **30%** | **15%** |
| **`CYCLICALS`** | Energi & Barang Baku | **25%** | **15%** | **35%** | **25%** |
| **`PROPERTY_INFRA`** | Properti & Infrastruktur | **25%** | **20%** | **30%** | **25%** |
| **`NON_FINANCIALS`** | Konsumer, Kesehatan, Teknologi, Industri, Transportasi | **30%** | **25%** | **25%** | **20%** |

### Ringkasan Metrik per Pilar (Penilaian Halus / Interpolasi Linear)
1. **Profitabilitas:** Bank dinilai dari `ROE`, `ROA`, dan `Net Margin`. Non-bank dinilai dari `ROE`, `ROIC`, `Operating Margin`, dan `Net Margin`.
2. **Pertumbuhan:** `Pertumbuhan Pendapatan`, `Pertumbuhan EPS/Laba Bersih`, dan *Operating Leverage* (bonus jika laba tumbuh lebih kencang dari pendapatan).
3. **Kesehatan Keuangan:**
   - Bank: `Equity / Total Assets` dan `Wholesale DER` (tanpa menghitung ulang ROA).
   - Properti/Infra & Non-Bank: `DER`, `Net Debt / EBITDA`, dan `Current Ratio` (Properti/Infra diberi toleransi utang sedikit lebih longgar karena sifat bisnis padat modal).
4. **Kualitas Arus Kas:**
   - Bank: Rasio `CFO / Net Income` (atau indikasi CFO/FCF positif) + `Dividend Yield`.
   - Non-Bank: `CFO / Net Income`, `FCF Margin`, dan `FCF Yield`.

### Syarat Hitung & 7 Rem Pengaman (*Weak-Link Caps*)
- Minimal harus ada **2 pilar** yang terisi datanya (jika kurang → `INSUFFICIENT_DATA`). Pilar yang kosong (saat ada 2–3 pilar) diberi skor cadangan `35`.
- Setelah skor gabungan dihitung, **7 rem pengaman** langsung memangkas skor jika ada kelemahan fatal:

| Rem Pengaman | Kondisi Pemicu | Skor Maksimal |
| :--- | :--- | :---: |
| Rugi / Profit Lemah | `EPS ≤ 0` atau skor Profitabilitas `< 25` | **45** |
| Keuangan Rapuh | Skor Kesehatan Keuangan `< 30` | **50** |
| Risiko Bangkrut (Altman Z) | Non-Bank & `Altman Z < 1,8` | **55** |
| Arus Kas Buruk | Non-Bank & skor Arus Kas `< 25` | **58** |
| Jebakan Valuasi Tinggi | `Value Trap = HIGH_RISK` | **68** |
| Data Pilar Tidak Lengkap | Pilar tersedia `< 4` | **74** |
| ROE Bank Rendah / Omzet Turun | (Bank & `ROE < 10%`) atau `Revenue Growth < -5%` | **74** |

### Skala Grade Ketat (S sampai E)

| Grade | Skor FQS | Arti |
| :---: | :---: | :--- |
| **`S`** | `88 – 100` | Elite / Juara Kualitas Institusional |
| **`A`** | `76 – 87` | Sangat Kuat |
| **`B`** | `64 – 75` | Bagus |
| **`C`** | `50 – 63` | Rata-rata |
| **`D`** | `35 – 49` | Lemah |
| **`E`** | `0 – 34` | Kritis / Bermasalah |

---

## 5. Kuadran QARP & Peringkat "Best Value + Quality"

- **`PRIME_OPPORTUNITY`:** `MoS ≥ 20%`, `FQS ≥ 76`, dan bukan `HIGH_RISK` trap (Incaran Utama!).
- **`QUALITY_FAIR_PRICE`:** `0% ≤ MoS < 20%` dan `FQS ≥ 76` (Perusahaan bagus di harga wajar).
- **`DEEP_VALUE_TURNAROUND`:** `MoS ≥ 20%` dan `FQS 50–75`.
- **`VALUE_TRAP_RISK`:** `MoS ≥ 20%` tapi `FQS < 50` (Murah tapi kualitas jelek).
- **`OVERVALUED_OR_UNRATED`:** Sisanya (mahal atau data belum lengkap).

**Rumus Urutan `qarp_desc`:** `FQS × 0,6 + SkorMoS × 0,4 − PenaltiTrap` (MoS maksimal dihargai sampai `+60%` agar saham anomali tidak mengalahkan kualitas; penalti `25` untuk `HIGH_RISK`, `5` untuk `WATCH`).

---

## 6. Portofolio, X-Ray Risiko & Rumus Simulator

Sumber: [`src/shared/domain/simulator.ts`](../../src/shared/domain/simulator.ts)

- **Multi-Tranche Average Buy:** $\text{Avg} = \text{round2}\left(\frac{\sum(\text{Lot}_i \times \text{Harga}_i)}{\sum \text{Lot}_i}\right)$, disimpan sebagai integer `avg_buy_price_x100` agar akurat 2 desimal.
- **Peringatan Konsentrasi Portofolio:** Aktif jika kamu memegang `≥ 2` saham:
  - 1 saham `> 25%` dari total portofolio → `SINGLE_STOCK_CONCENTRATION`.
  - 1 sektor `> 40%` dari total portofolio → `SECTOR_CONCENTRATION`.
- **Real IDX Tick BEP (Forward Simulator):**
  - Hitung total modal termasuk fee beli (+ Bea Materai beli jika aktif & bruto `> Rp 10 juta`).
  - Hitung harga impas mentah setelah memotong fee jual (`totalCost / (totalShares × (1 - fSell))`), tambah `Rp 10.000` jika Bea Materai jual aktif & nilai jual `> Rp 10 juta`.
  - Bulatkan **ke atas** ke fraksi harga BEI resmi terdekat (`ceilToIdxTick`) agar benar-benar impas saat order jual dieksekusi di pasar.
- **Pyramiding Buy:** Membagi modal (setelah menyisihkan `Rp 10.000` Bea Materai jika aktif & modal `> Rp 10 juta`) ke 3 tahap dengan harga limit dibulatkan **ke bawah** ke fraksi BEI (`floorToIdxTick`).
- **Take-Profit Free-Ride:** Jika total hasil jual bersih dari beberapa level jual sudah `≥` modal awal seluruh posisi dan masih ada sisa lot, status **`isFreeRidePosition = true`** (sisa saham murni profit tanpa risiko rugi modal).
- **Goal-Seek:** $\text{Lot Dibutuhkan} = \left\lceil \frac{\text{Lot Lama} \times (\text{Avg Lama} - \text{Target Avg})}{\text{Target Avg} - \text{Harga Beli Rencana}} \right\rceil$.

---

## 7. Benchmark Default 11 Sektor IDX

Saat menarik data otomatis dari TradingView/Yahoo Finance, sistem mengisi `Target PER` dan `Target PBV` awal berdasarkan sektor ([`market-data.types.ts`](../../src/server/modules/market-data/domain/market-data.types.ts)):

| Sektor | Target PER | Target PBV | Catatan Khusus |
| :--- | :---: | :---: | :--- |
| `FINANCIALS` | `15x` | `2,5x` | `DER` dan `Current Ratio` diabaikan (`null`); pakai `wholesaleDer`. |
| `CONSUMER_NON_CYCLICALS` | `18x` | `3,5x` | Barang konsumsi pokok / defensif. |
| `CONSUMER_CYCLICALS` | `14x` | `2,0x` | Ritel & konsumsi siklikal. |
| `ENERGY` | `8x` | `1,5x` | Masuk jalur `CYCLICALS`. |
| `BASIC_MATERIALS` | `12x` | `1,5x` | Masuk jalur `CYCLICALS`. |
| `INFRASTRUCTURE` | `16x` | `2,2x` | Masuk jalur `PROPERTY_INFRA`. |
| `HEALTHCARE` | `22x` | `3,5x` | Kesehatan & farmasi. |
| `TECHNOLOGY` | `20x` | `2,5x` | Teknologi. |
| `PROPERTY_REAL_ESTATE` | `12x` | `1,0x` | Dicek **sebelum** `FINANCIALS` agar properti tidak salah masuk kategori bank di TradingView. |
| `INDUSTRIALS` | `12x` | `1,8x` | Sektor cadangan default jika tidak dikenali. |
| `TRANSPORTATION_LOGISTICS` | `12x` | `1,5x` | Pelayaran, penerbangan, logistik. |
