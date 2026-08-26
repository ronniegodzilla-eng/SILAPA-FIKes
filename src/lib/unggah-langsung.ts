'use client';

/**
 * Unggah berkas LANGSUNG dari browser ke Google Apps Script memakai tiket
 * bertanda tangan yang diterbitkan server kita.
 *
 * Ini jalur utama sekarang. Pada jalur proksi lama, tiap berkas melintasi
 * Serverless Function Vercel dua kali (masuk dari browser, keluar lagi ke
 * Apps Script) — dari 3.853 bukti yang sudah terunggah, itu saja ±6,4GB Fast
 * Origin Transfer. Lewat sini yang melewati Vercel tinggal permintaan tiket
 * berukuran beberapa ratus byte.
 *
 * Content-Type sengaja text/plain: dengan itu browser memperlakukan permintaan
 * sebagai "simple request" sehingga TIDAK ada preflight OPTIONS — Apps Script
 * tidak melayani OPTIONS, jadi preflight akan menggagalkan unggahan.
 */

export interface Tiket {
  npm: string;
  label: string;
  exp: number;
  sig: string;
}

/**
 * Mengembalikan URL Drive bila berhasil.
 * Melempar bila gagal — pemanggil yang memutuskan untuk mundur ke jalur proksi.
 */
export async function unggahLangsung(
  uploadUrl: string,
  tiket: Tiket,
  file: File,
  data: string
): Promise<string> {
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ tiket, filename: file.name, mimeType: file.type, data }),
  });
  const teks = await res.text();

  let json: any;
  try {
    json = JSON.parse(teks);
  } catch {
    // Halaman error Google, atau Apps Script versi lama yang belum mengenal
    // tiket. Dilempar agar pemanggil mencoba jalur proksi.
    throw new Error(`Balasan bukan JSON (HTTP ${res.status}).`);
  }
  if (!json?.ok) throw new Error(json?.error ?? 'Unggah langsung ditolak.');
  return json.url as string;
}
