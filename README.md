# SILAPA-FIKes

**Sistem Informasi Pelaporan Pembimbing Akademik** — Fakultas Ilmu Kesehatan, Universitas Ibnu Sina.

Next.js 14 (App Router) + TypeScript + Firebase (Auth + Firestore). Implements the
Claude Design prototype (`SILAPA-FIKes.dc.html`) against the data model and features in
`PRD_SILAPA_FIKES.md`.

## What's implemented

All 11 screens from the design, wired to Firestore:

| Role | Screens |
|---|---|
| **Dosen PA** | Dashboard (D1), Daftar Bimbingan + mode isi cepat (D2), Form laporan per mahasiswa + autosave (D3), Riwayat + grafik IP + badge peringatan (D4) |
| **Admin** | Master Mahasiswa CRUD (A1), Import massal + validasi (A2), Plotting dosen PA + distribusi (A3), Kelola Periode (A4) |
| **Wakil Dekan I** | Dashboard fakultas (W1), Verifikasi + terima/kembalikan (W2), Ekspor PDF/Excel + arsip (W3) |

Plus, fully implemented from the PRD:

- Role-based auth + route guards; `npm` always **string** end-to-end (PRD §4).
- IPK validated 0.00–4.00 in forms, at import, **and** in Security Rules (defence-in-depth).
- **A2**: real `.xlsx`/`.csv` parser (SheetJS) — mode *nilai KRS/KHS* and *mahasiswa baru*,
  preview + validation (scientific-notation NPM rejected), commit to Firestore, downloadable
  failed-rows report.
- **A3**: plotting benar-benar memindahkan `dosenPaUid` (per mahasiswa + massal per
  angkatan/kelas/prodi), dengan opsi menerapkan ke laporan periode aktif (PRD §7.3).
- **A4**: "Buka Periode" men-generate seluruh dokumen `laporan` dari plotting aktif +
  menghitung `semesterKe` (PRD §4.6); buat periode baru setelah periode dikunci.
- **W1**: seluruh angka dashboard Wadek dihitung live dari koleksi `laporan` (PRD §6) —
  IPK per prodi = mean seluruh record (bukan rata-rata dari rata-rata), sorotan KRS kosong.
- **W3**: PDF per dosen server-side (`@react-pdf/renderer`) dengan kop FIKes, tabel
  akademik/non-akademik/non-aktif-cuti, pengesahan + QR verifikasi; Excel rekap 3 sheet
  (REKAPITULASI ±25 kolom + catatan transisi IPK, PROPOSAL SKRIPSI, DISTRIBUSI DOSEN PA).
- **D4**: riwayat status & konsultasi lintas periode + badge early-warning.
- Catatan pengembalian Wadek tampil sebagai banner di dashboard dosen.

## Setup

Requires Node 18+ and a Firebase project with a service-account key.

```bash
npm install

# put the service-account JSON in the project root:
#   serviceAccountKey.json   (git-ignored)

npm run setup   # writes .env.local from the project's web-app config,
                # provisions Firestore if needed, enables email/password
                # sign-in, and deploys firestore.rules — idempotent
npm run seed    # wipes old data, creates demo accounts, and loads the REAL
                # distribusi dosen PA (22 dosen, 1.522 mahasiswa) from
                # data/distribusi-dosen-pa.json — extracted from the SIAKAD
                # PDFs in "DAFTAR DISTRIBUSI DOSEN PA/" (periode 2025/2026 Genap)

npm run dev     # http://localhost:3000
npm run build   # production build
```

To redeploy only the Security Rules after editing `firestore.rules`:

```bash
npm run deploy:rules
```

**Demo logins** (password `silapa123` for all):

- `roni.saputra@uis.ac.id` — Dosen PA
- `admin.fikes@uis.ac.id` — Admin Fakultas
- `wadek1.fikes@uis.ac.id` — Wakil Dekan I

## Architecture

```
src/
  app/
    layout.tsx                 root layout: fonts + AuthProvider
    page.tsx                   redirect by role
    login/                     login + demo role picker
    (app)/                     authenticated area (route group)
      layout.tsx               role guard + DataProvider + AppShell
      dosen/ · admin/ · wadek/ the 11 screens
    api/export/pdf/            server-side PDF export
  components/
    AppShell.tsx               sidebar + header + mobile nav
    ui.tsx                     Icon, Pill, Card, StatCard, inputs
  lib/
    firebase.ts                client SDK init (env-driven)
    auth-context.tsx           Auth state + role → route
    data-context.tsx           loads role-scoped data, optimistic writes
    firestore/data.ts          Firestore read/write (master ⨯ laporan split)
    compute.ts                 rekap, statusPengisian, badges, semesterKe
    theme.ts                   design tokens from the prototype
    types.ts                   domain types (npm = string)
    seed-data.ts               prototype fixtures (seed + demo users)
scripts/seed.ts                firebase-admin seeder
firestore.rules                security rules (PRD §4.6, §8)
```

### Firestore model (PRD §4)

- `users/{uid}` — role + identity
- `mahasiswa/{npm}` — master record; once-per-degree fields (PKKMB/TOEFL/ESQ/Semkes) + `ipHistory`
- `periode/{id}` — e.g. `2025-2026-genap`, with `status`
- `laporan/{periodeId}_{npm}` — one report per mahasiswa per periode
- `submissions/{periodeId}_{dosenUid}` — per-dosen submission status

The UI composes `mahasiswa` + `laporan` into one `MahasiswaRecord`; writes are routed back
to the correct document by field path.

## Notes / next steps (v2, di luar cakupan PRD v1)

- Akun untuk 21 dosen PA lain (saat ini hanya Roni yang punya akun login; dosen lain
  diwakili entri `submissions` untuk roster/verifikasi).
- `rekapCache/{periodeId}` via Cloud Function bila volume data sudah ±1.500 record (PRD §8) —
  saat ini agregasi dihitung di client/route dari query langsung.
- AI narasi permasalahan/rekomendasi, notifikasi WhatsApp, integrasi SIAKAD (PRD M8).
