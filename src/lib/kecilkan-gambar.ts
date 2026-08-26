'use client';

/**
 * Perkecil foto bukti sebelum diunggah.
 *
 * Bukti KRS/KHS hampir selalu difoto dengan kamera HP: berkasnya 4–8MB,
 * jauh di atas batas 3MB, padahal isinya cuma satu lembar yang perlu terbaca.
 * Tanpa ini mahasiswa mentok di "Ukuran file maksimal 3MB" tanpa cara mudah
 * memperkecilnya dari HP. Payload yang lebih kecil sekaligus menurunkan
 * peluang Apps Script kehabisan waktu — penyebab kegagalan unggah yang
 * ditangani di lib/apps-script-upload.ts.
 *
 * PDF tidak disentuh. Bila apa pun gagal, berkas ASLI yang dikembalikan —
 * perilakunya tidak pernah lebih buruk daripada sebelum ada fungsi ini.
 */

/**
 * Ambang ini sengaja RENDAH. Sebelumnya 1MB, padahal ukuran median bukti yang
 * sudah terunggah cuma 0,37MB — artinya sebagian besar berkas lolos tanpa
 * diperkecil sama sekali, dan tiap byte-nya melintasi Serverless Function dua
 * kali (masuk dari browser, lalu keluar lagi ke Apps Script). Itulah sumber
 * utama lonjakan Fast Origin Transfer.
 */
const AMAN_BYTES = 200 * 1024;
/**
 * Sisi terpanjang setelah diperkecil. 1600px pada selembar A4 setara ~135 DPI
 * — teks KRS/KHS tetap terbaca jelas, sementara berkasnya jauh lebih ringan.
 */
const SISI_MAKS = 1600;
const MUTU = 0.75;

export async function kecilkanGambarBilaPerlu(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.size <= AMAN_BYTES) return file;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

  try {
    // imageOrientation 'from-image' WAJIB: tanpa itu foto dari kamera HP yang
    // punya metadata rotasi akan tergambar miring/terbalik ke canvas, dan
    // bukti yang tidak terbaca lebih buruk daripada berkas yang kebesaran.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const skala = Math.min(1, SISI_MAKS / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * skala);
    const h = Math.round(bitmap.height * skala);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // Latar putih supaya PNG transparan tidak jadi hitam saat dijadikan JPEG.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', MUTU)
    );
    if (!blob || blob.size >= file.size) return file; // tidak membantu — pakai asli

    const namaDasar = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${namaDasar}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}
