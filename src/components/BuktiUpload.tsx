'use client';

import { useState } from 'react';
import { colors } from '@/lib/theme';
import { uploadBuktiFile } from '@/lib/upload-bukti';

/**
 * Unggah bukti (opsional — bisa dinaikkan jadi wajib nanti bila pimpinan
 * memutuskan demikian). Backend: Google Apps Script + Drive (lihat
 * apps-script/README.md).
 *
 * `uploadFn` dapat dioverride supaya komponen ini juga dipakai di halaman
 * publik "Isi Data Mandiri" (token, tanpa login) yang memanggil
 * /api/public/upload-bukti alih-alih /api/upload-bukti — default-nya tetap
 * jalur terautentikasi lama.
 */
export function BuktiUploadField({
  npm,
  label,
  value,
  onChange,
  uploadFn,
  required,
}: {
  npm: string;
  label: string;
  value?: string;
  onChange: (url: string) => void;
  uploadFn?: (file: File) => Promise<string>;
  /** Tampilkan label sebagai "wajib" (mis. KRS/KHS saat angkanya berubah). */
  required?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const inputId = `bukti-${npm}-${label}`.replace(/\s+/g, '-');

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setErr('');
    try {
      const url = await (uploadFn ? uploadFn(file) : uploadBuktiFile(npm, label, file));
      onChange(url);
    } catch (er: any) {
      setErr(er?.message ?? 'Gagal mengunggah bukti.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
      {value && (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 11.5, fontWeight: 700, color: colors.green, textDecoration: 'underline' }}
        >
          Lihat bukti
        </a>
      )}
      <label
        htmlFor={inputId}
        style={{ fontSize: 11.5, fontWeight: 700, color: required && !value ? colors.danger : colors.muted, cursor: busy ? 'wait' : 'pointer', textDecoration: 'underline' }}
      >
        {busy ? 'Mengunggah…' : value ? 'Ganti bukti' : required ? 'Unggah bukti (wajib)' : 'Unggah bukti (opsional)'}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={onFile}
        disabled={busy}
        style={{ display: 'none' }}
      />
      {err && <span style={{ fontSize: 11, color: colors.danger }}>{err}</span>}
    </div>
  );
}
