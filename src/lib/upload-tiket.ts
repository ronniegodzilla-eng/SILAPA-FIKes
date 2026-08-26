import 'server-only';
import { createHmac } from 'node:crypto';

/**
 * Tiket unggah bukti — izin berbatas waktu agar browser dapat mengunggah
 * LANGSUNG ke Google Apps Script tanpa berkasnya melewati Vercel.
 *
 * Kenapa: pada jalur proksi lama, tiap berkas melintasi Serverless Function
 * dua kali (masuk dari browser, keluar lagi ke Apps Script). Dari 3.853 bukti
 * yang sudah terunggah, itu menghasilkan ±6,4GB Fast Origin Transfer. Dengan
 * tiket, yang melewati Vercel tinggal JSON beberapa ratus byte.
 *
 * Rahasia bersama (APPS_SCRIPT_UPLOAD_SECRET) TIDAK pernah dikirim ke browser.
 * Yang dikirim hanya tanda tangan HMAC atas (npm|label|exp) — terikat pada
 * satu mahasiswa, satu jenis bukti, dan kedaluwarsa beberapa menit. Otorisasi
 * sesungguhnya (token isi-data / Firebase Auth + kepemilikan bimbingan) tetap
 * diperiksa di sini, persis seperti sebelumnya; yang berpindah hanya jalur
 * byte-nya.
 */

/** Umur tiket — cukup untuk memilih berkas lalu mengunggah, tidak lebih. */
const UMUR_MS = 5 * 60 * 1000;

export interface Tiket {
  npm: string;
  label: string;
  /** Waktu kedaluwarsa (epoch milidetik). */
  exp: number;
  sig: string;
}

/** Data yang ditandatangani. Formatnya HARUS sama persis dengan sisi Apps Script. */
export function muatanTandaTangan(npm: string, label: string, exp: number): string {
  return `${npm}|${label}|${exp}`;
}

export function tandaTangani(npm: string, label: string, exp: number, secret: string): string {
  // base64url tanpa padding — Apps Script memakai base64EncodeWebSafe lalu
  // membuang '=' agar hasilnya identik.
  return createHmac('sha256', secret).update(muatanTandaTangan(npm, label, exp)).digest('base64url');
}

export type HasilTiket =
  | { ok: true; uploadUrl: string; tiket: Tiket }
  | { ok: false; status: number; message: string };

export function buatTiket(npm: string, label: string): HasilTiket {
  const uploadUrl = process.env.APPS_SCRIPT_UPLOAD_URL;
  const secret = process.env.APPS_SCRIPT_UPLOAD_SECRET;
  if (!uploadUrl || !secret) {
    return {
      ok: false,
      status: 500,
      message: 'Upload bukti belum dikonfigurasi di server (lihat apps-script/README.md).',
    };
  }
  // Karakter pemisah '|' tidak boleh muncul di dalam nilainya, agar
  // (npm='a', label='b|c') tidak menghasilkan tanda tangan yang sama dengan
  // (npm='a|b', label='c').
  if (npm.includes('|') || label.includes('|')) {
    return { ok: false, status: 400, message: 'npm/label mengandung karakter yang tidak diizinkan.' };
  }

  const exp = Date.now() + UMUR_MS;
  return { ok: true, uploadUrl, tiket: { npm, label, exp, sig: tandaTangani(npm, label, exp, secret) } };
}
