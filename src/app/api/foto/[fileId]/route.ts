import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

/**
 * Menyajikan foto profil yang tersimpan di Google Drive lewat origin kita
 * sendiri.
 *
 * Kenapa perlu proxy, tidak langsung memakai link Drive sebagai src <img>:
 * Drive/googleusercontent MENOLAK melayani gambar ke tag <img> lintas-origin
 * (diuji langsung: `curl` berhasil 200 image/png, tapi di browser ketiga
 * bentuk URL — /thumbnail, /uc?export=view, dan lh3/d/ — semuanya gagal
 * memuat, sementara gambar eksternal lain di halaman yang sama normal).
 * Dengan diproksi, browser memuatnya sebagai same-origin dan selalu tampil.
 *
 * Rute ini sengaja TANPA autentikasi Bearer: <img> tidak dapat mengirim
 * header Authorization. Tingkat keamanannya setara link Drive-nya sendiri
 * (file memang sudah "siapa pun dengan tautan"), dan fileId-nya tidak
 * dapat ditebak. Justru lebih baik: tautan Drive mentah tidak pernah
 * terekspos ke publik.
 */
export async function GET(req: NextRequest, { params }: { params: { fileId: string } }) {
  const fileId = params.fileId;
  // Pagar SSRF: fileId Drive hanya huruf/angka/_/- — apa pun selain itu
  // ditolak agar rute ini tidak bisa dipakai mengambil URL sembarangan.
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(fileId)) {
    return new Response('fileId tidak valid.', { status: 400 });
  }
  try {
    const upstream = await fetch(`https://lh3.googleusercontent.com/d/${fileId}=w400`, {
      redirect: 'follow',
    });
    if (!upstream.ok) {
      return new Response('Foto tidak ditemukan.', { status: 404 });
    }
    const type = upstream.headers.get('content-type') ?? 'image/jpeg';
    if (!type.startsWith('image/')) {
      return new Response('Berkas bukan gambar.', { status: 415 });
    }
    return new Response(upstream.body, {
      headers: {
        'Content-Type': type,
        // Foto profil jarang berubah dan tiap unggahan menghasilkan fileId
        // baru, jadi aman di-cache lama.
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch {
    return new Response('Gagal mengambil foto.', { status: 502 });
  }
}
