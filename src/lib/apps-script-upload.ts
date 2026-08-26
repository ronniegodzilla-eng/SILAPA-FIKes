import 'server-only';

/**
 * Pemanggilan Google Apps Script untuk unggah bukti ke Drive — dipakai bersama
 * oleh /api/upload-bukti (dosen, ber-login) dan /api/public/upload-bukti
 * (mahasiswa, lewat token).
 *
 * Kenapa tidak `await res.json()` langsung seperti sebelumnya: doPost di Apps
 * Script selalu membungkus dirinya dengan try/catch dan selalu membalas JSON,
 * jadi kalau yang datang HTML, itu berasal dari Google SENDIRI — halaman error
 * "unable to open the file at this time", batas eksekusi terlampaui, atau
 * lonjakan pemanggilan bersamaan. Dulu res.json() melempar di situ dan pesan
 * mentahnya diteruskan apa adanya ke layar mahasiswa:
 *
 *   "Gagal menghubungi layanan upload: Unexpected token '<', "<!DOCTYPE "...
 *    is not valid JSON"
 *
 * — jargon yang tidak bisa ditindaklanjuti siapa pun. Kegagalan semacam itu
 * hampir selalu sesaat, jadi di sini dicoba ulang beberapa kali dulu, dan
 * kalau tetap gagal barulah dibalas dengan kalimat yang bisa dikerjakan.
 */

/**
 * Dua percobaan, bukan tiga. Tiap percobaan mengirim ULANG seluruh berkas ke
 * Apps Script, jadi tiap tambahan percobaan melipatgandakan lalu lintas keluar
 * Serverless Function. Dua sudah menangkap hampir semua gangguan sesaat Google
 * tanpa membuat satu kegagalan berbiaya tiga kali lipat.
 */
const PERCOBAAN_MAKS = 2;
const JEDA_MS = [1200];

export type HasilUpload =
  | { ok: true; url: string; fileId?: string }
  | { ok: false; status: number; message: string };

/** Batas waktu satu percobaan — Apps Script bisa menggantung sampai time-out sendiri. */
const TIMEOUT_MS = 25_000;

function jeda(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function unggahLewatAppsScript(payload: {
  npm: string;
  label: string;
  filename: string;
  mimeType: string;
  data: string;
}): Promise<HasilUpload> {
  const uploadUrl = process.env.APPS_SCRIPT_UPLOAD_URL;
  const secret = process.env.APPS_SCRIPT_UPLOAD_SECRET;
  if (!uploadUrl || !secret) {
    return {
      ok: false,
      status: 500,
      message: 'Upload bukti belum dikonfigurasi di server (lihat apps-script/README.md).',
    };
  }

  let terakhir = '';

  for (let percobaan = 1; percobaan <= PERCOBAAN_MAKS; percobaan++) {
    try {
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ secret, ...payload }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const teks = await res.text();

      let json: any = null;
      try {
        json = JSON.parse(teks);
      } catch {
        // Bukan JSON → halaman error Google. Dicatat agar bisa ditelusuri di
        // log Vercel, TAPI tidak pernah ditampilkan ke pengguna.
        terakhir = `HTTP ${res.status}, bukan JSON: ${teks.slice(0, 200).replace(/\s+/g, ' ')}`;
        console.error(
          `[upload-bukti] Apps Script membalas non-JSON (percobaan ${percobaan}/${PERCOBAAN_MAKS}, npm ${payload.npm}, label ${payload.label}, ${Math.round(payload.data.length / 1024)}KB): ${terakhir}`
        );
        if (percobaan < PERCOBAAN_MAKS) {
          await jeda(JEDA_MS[percobaan - 1]);
          continue;
        }
        return {
          ok: false,
          status: 502,
          message:
            'Layanan penyimpanan bukti sedang tidak merespons. Isian Anda tidak hilang — tunggu sebentar lalu coba unggah lagi. Bila tetap gagal, beri tahu dosen PA Anda.',
        };
      }

      if (json?.ok) return { ok: true, url: json.url, fileId: json.fileId };

      // Ditolak Apps Script dengan alasan yang jelas (secret salah, format,
      // ukuran) — ini bukan gangguan sesaat, jadi tidak diulang.
      return { ok: false, status: 502, message: json?.error ?? 'Gagal mengunggah bukti.' };
    } catch (e: any) {
      terakhir = e?.name === 'TimeoutError' ? 'time-out' : String(e?.message ?? e);
      console.error(
        `[upload-bukti] Gagal menghubungi Apps Script (percobaan ${percobaan}/${PERCOBAAN_MAKS}, npm ${payload.npm}, label ${payload.label}): ${terakhir}`
      );
      if (percobaan < PERCOBAAN_MAKS) {
        await jeda(JEDA_MS[percobaan - 1]);
        continue;
      }
    }
  }

  return {
    ok: false,
    status: 502,
    message:
      'Gagal menghubungi layanan penyimpanan bukti setelah beberapa kali percobaan. Periksa koneksi Anda, lalu coba unggah lagi. Isian yang sudah Anda ketik tidak hilang.',
  };
}
