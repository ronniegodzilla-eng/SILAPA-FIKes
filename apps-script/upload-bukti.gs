/**
 * SILAPA-FIKes — backend upload bukti (Google Apps Script, disimpan sebagai
 * Web App terpisah di akun Google institusi). Bukan bagian dari deployment
 * Next.js — file ini hanya referensi; salin isinya ke editor Apps Script
 * (script.google.com) lalu deploy sebagai Web App. Lihat README di folder
 * ini untuk langkah deploy lengkap.
 *
 * Kontrak (dipanggil server-side dari /api/upload-bukti, BUKAN langsung dari
 * browser — jadi secret ini tidak pernah terkirim ke client):
 *   POST body (JSON): { secret, npm, label, filename, mimeType, data (base64) }
 *   Response (JSON):  { ok: true, url, fileId } atau { ok: false, error }
 */

var ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
var MAX_BYTES = 3 * 1024 * 1024; // 3MB — selaras dengan batas di src/app/api/upload-bukti/route.ts
var ROOT_FOLDER_NAME = 'SILAPA-FIKes Bukti';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    var expectedSecret = PropertiesService.getScriptProperties().getProperty('UPLOAD_SECRET');
    if (!expectedSecret || body.secret !== expectedSecret) {
      return jsonResponse({ ok: false, error: 'Secret tidak valid.' });
    }

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
