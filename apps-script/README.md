# Backend Upload Bukti — Google Apps Script

Fitur upload bukti (prestasi, beasiswa, TOEFL, PKKMB, ESQ, organisasi — semua
opsional, semkes sengaja tanpa bukti) memakai Google Apps Script sebagai
penyimpanan file gratis (Google Drive), karena proyek ini sengaja menghindari
paket Firebase berbayar (Blaze). Ini **satu-satunya langkah manual** yang
harus dilakukan sendiri oleh pemilik akun Google institusi — Claude tidak
bisa login ke akun Google Anda untuk melakukannya.

## Langkah deploy

1. Buka [script.google.com](https://script.google.com) dengan akun Google
   institusi (mis. akun yang sama dipakai untuk Google Workspace UIS —
   file bukti akan tersimpan di Drive akun ini).
2. **New project** → beri nama, mis. "SILAPA-FIKes Upload Bukti".
3. Hapus isi default `Code.gs`, lalu tempel seluruh isi
   [`upload-bukti.gs`](./upload-bukti.gs) di folder ini.
4. **Buat secret**: menu kiri **Project Settings** (ikon gerigi) → scroll ke
   **Script Properties** → **Add script property**:
   - Property: `UPLOAD_SECRET`
   - Value: string acak yang panjang (mis. buka
     [1password.com/password-generator](https://1password.com/password-generator/)
     atau ketik bebas ±32 karakter). **Simpan nilai ini** — akan dipakai lagi
     di `.env.local` server Next.js sebagai `APPS_SCRIPT_UPLOAD_SECRET`.
5. **Deploy** (tombol biru kanan atas) → **New deployment**:
   - Klik ikon gerigi di "Select type" → pilih **Web app**.
   - Description: bebas, mis. "v1".
   - **Execute as**: `Me` (akun Anda — supaya file tersimpan di Drive Anda).
   - **Who has access**: `Anyone` (wajib — dipanggil server-to-server dari
     Next.js, bukan lewat login Google; keamanan sesungguhnya dijaga oleh
     `UPLOAD_SECRET` di atas + otorisasi Firebase Auth di endpoint
     `/api/upload-bukti` kita, bukan oleh setting akses Apps Script ini).
   - Klik **Deploy**. Google akan minta izin akses Drive — setujui (izin ini
     untuk akun Anda sendiri, bukan untuk pengguna SILAPA).
   - Salin **Web app URL** yang muncul (formatnya
     `https://script.google.com/macros/s/XXXXX/exec`).
6. Tambahkan ke `.env.local` (server Next.js, **jangan** pakai prefix
   `NEXT_PUBLIC_` — nilai ini harus tetap di server, tidak boleh terkirim ke
   browser):
   ```
   APPS_SCRIPT_UPLOAD_URL=https://script.google.com/macros/s/XXXXX/exec
   APPS_SCRIPT_UPLOAD_SECRET=<nilai UPLOAD_SECRET dari langkah 4>
   ```
7. Restart dev server (env baru tidak otomatis ke-reload).

## Kalau nanti perlu redeploy (mengubah kode Apps Script)

Apps Script **tidak otomatis** menerbitkan perubahan kode ke URL Web App yang
sudah ada — setelah edit `Code.gs` di editor, harus **Deploy → Manage
deployments → (deployment aktif) → Edit (ikon pensil) → Version: New version
→ Deploy** supaya perubahan benar-benar aktif di URL yang sama.

## Struktur penyimpanan

File tersimpan di Drive akun yang deploy, di folder
`SILAPA-FIKes Bukti/{NPM mahasiswa}/`, otomatis dibuat oleh script saat
upload pertama. Nama file: `{npm}_{label}_{tanggal-waktu}.{ext}`.

## Batasan yang disengaja

- Maks 3MB per file (base64 encoding menambah ±33% ukuran; batas ini jaga-jaga
  agar tidak kena limit ukuran body function serverless saat nanti deploy ke
  Vercel).
- Hanya JPG/PNG/WEBP/PDF.
- Kuota Google Drive mengikuti kuota akun Google yang dipakai deploy (bukan
  "unlimited" secara teknis, tapi jauh lebih longgar dibanding kuota gratis
  Firebase Storage untuk kebutuhan ini).
