/**
 * SILAPA-FIKes — backend upload bukti (Google Apps Script, disimpan sebagai
 * Web App terpisah di akun Google institusi). Bukan bagian dari deployment
 * Next.js — file ini hanya referensi; salin isinya ke editor Apps Script
 * (script.google.com) lalu deploy sebagai Web App. Lihat README di folder
 * ini untuk langkah deploy lengkap.
 *
 * DUA cara pemanggilan didukung sekaligus, supaya urutan deploy tidak pernah
 * memutus unggahan (Vercel dan Apps Script di-deploy terpisah):
 *
 * 1. TIKET (cara baru, dipakai langsung dari browser). Berkas TIDAK melewati
 *    Vercel sama sekali — itu yang dulu membuat Fast Origin Transfer melonjak,
 *    karena tiap berkas melintasi Serverless Function dua kali. Server hanya
 *    menerbitkan izin berbatas waktu:
 *      POST body (JSON): { tiket: { npm, label, exp, sig }, filename, mimeType, data }
 *    `sig` = HMAC-SHA256 atas "npm|label|exp" memakai UPLOAD_SECRET, dalam
 *    base64 web-safe tanpa '='. Secret-nya sendiri tidak pernah sampai ke
 *    browser; yang beredar cuma tanda tangan untuk satu mahasiswa, satu jenis
 *    bukti, dan berumur beberapa menit.
 *
 * 2. SECRET (cara lama, dari server /api/upload-bukti sebagai cadangan bila
 *    unggah langsung gagal):
 *      POST body (JSON): { secret, npm, label, filename, mimeType, data }
 *
 *   Response (JSON): { ok: true, url, fileId } atau { ok: false, error }
 */

var ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
var MAX_BYTES = 3 * 1024 * 1024; // 3MB — selaras dengan batas di src/app/api/upload-bukti/route.ts
var ROOT_FOLDER_NAME = 'SILAPA-FIKes Bukti';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    var expectedSecret = PropertiesService.getScriptProperties().getProperty('UPLOAD_SECRET');
    if (!expectedSecret) {
      return jsonResponse({ ok: false, error: 'UPLOAD_SECRET belum diset di Script Properties.' });
    }

    var izin = periksaIzin(body, expectedSecret);
    if (!izin.ok) return jsonResponse({ ok: false, error: izin.error });
    // npm/label diambil dari TIKET bila memakai jalur tiket — bukan dari
    // field bebas di body, yang bisa dikarang pengirim. Tanda tangan hanya
    // sah untuk pasangan npm+label yang memang diizinkan server.
    body.npm = izin.npm;
    body.label = izin.label;

    if (ALLOWED_MIME_TYPES.indexOf(body.mimeType) === -1) {
      return jsonResponse({ ok: false, error: 'Format file harus JPG, PNG, WEBP, atau PDF.' });
    }

    var bytes = Utilities.base64Decode(body.data);
    if (bytes.length > MAX_BYTES) {
      return jsonResponse({ ok: false, error: 'Ukuran file maksimal 3MB.' });
    }

    var npm = String(body.npm || 'tanpa-npm').replace(/[^a-zA-Z0-9_-]/g, '');
    var label = String(body.label || 'bukti').replace(/[^a-zA-Z0-9_-]/g, '');
    var timestamp = Utilities.formatDate(new Date(), 'GMT+7', 'yyyyMMdd-HHmmss');
    var ext = (body.filename || '').split('.').pop();
    var filename = npm + '_' + label + '_' + timestamp + (ext ? '.' + ext : '');

    var blob = Utilities.newBlob(bytes, body.mimeType, filename);
    var folder = getOrCreateNpmFolder(npm);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return jsonResponse({ ok: true, url: file.getUrl(), fileId: file.getId() });
  } catch (err) {
    return jsonResponse({ ok: false, error: 'Gagal memproses upload: ' + err.message });
  }
}

/**
 * Menentukan boleh-tidaknya sebuah permintaan, dan mengembalikan npm+label
 * yang SAH untuk dipakai. Menerima jalur tiket maupun jalur secret lama.
 */
function periksaIzin(body, expectedSecret) {
  // Jalur lama: server kita sendiri yang memanggil, membawa secret.
  if (body.secret) {
    if (body.secret !== expectedSecret) return { ok: false, error: 'Secret tidak valid.' };
    return { ok: true, npm: body.npm, label: body.label };
  }

  var t = body.tiket;
  if (!t || !t.npm || !t.label || !t.exp || !t.sig) {
    return { ok: false, error: 'Tiket unggah tidak ada atau tidak lengkap.' };
  }
  if (Number(t.exp) < Date.now()) {
    return { ok: false, error: 'Tiket unggah sudah kedaluwarsa. Muat ulang halaman lalu coba lagi.' };
  }
  var muatan = t.npm + '|' + t.label + '|' + t.exp;
  var bytes = Utilities.computeHmacSha256Signature(muatan, expectedSecret);
  // base64EncodeWebSafe menghasilkan '-' dan '_' plus padding '='; sisi Node
  // memakai base64url yang TANPA padding, jadi '=' dibuang agar sebanding.
  var harusnya = Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
  if (String(t.sig).replace(/=+$/, '') !== harusnya) {
    return { ok: false, error: 'Tiket unggah tidak sah.' };
  }
  return { ok: true, npm: t.npm, label: t.label };
}

/** SILAPA-FIKes Bukti/{npm}/ — satu subfolder per mahasiswa agar rapi. */
function getOrCreateNpmFolder(npm) {
  var root = getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
  return getOrCreateFolder(root, npm);
}

function getOrCreateFolder(parent, name) {
  var existing = parent.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return parent.createFolder(name);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
