'use client';

import { useState } from 'react';
import { colors } from '@/lib/theme';
import { inputStyle, labelStyle } from './ui';
import { BuktiUploadField } from './BuktiUpload';
import { SEMKES_MAX, type SemkesEntry } from '@/lib/types';

/**
 * Daftar seminar kesehatan: judul + bukti per entri, ditambah satu per satu
 * sampai SEMKES_MAX. Jumlah semkes SELALU = panjang daftar — tidak pernah
 * diketik langsung (pola sama dengan KonsultasiSection).
 *
 * Dipakai di dua tempat dengan cara unggah berbeda: form dosen memakai
 * uploadBuktiFile (butuh Firebase Auth), halaman isi-data mandiri memakai
 * uploadBuktiFilePublic (token) — makanya `uploadFn` disuntikkan dari luar.
 */
export function SemkesSection({
  entries,
  onChange,
  npm,
  uploadFn,
  readOnly,
}: {
  entries: SemkesEntry[];
  onChange: (next: SemkesEntry[]) => void;
  npm: string;
  uploadFn?: (file: File) => Promise<string>;
  readOnly?: boolean;
}) {
  const [judul, setJudul] = useState('');
  const penuh = entries.length >= SEMKES_MAX;
  const canAdd = !readOnly && !penuh && judul.trim() !== '';

  function tambah() {
    if (!canAdd) return;
    onChange([
      ...entries,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, judul: judul.trim() },
    ]);
    setJudul('');
  }
  function hapus(id: string) {
    onChange(entries.filter((e) => e.id !== id));
  }
  function setBukti(id: string, url: string) {
    onChange(entries.map((e) => (e.id === id ? { ...e, bukti: url } : e)));
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 10, flexWrap: 'wrap' }}>
        <label style={{ ...labelStyle, marginBottom: 0 }}>Seminar kesehatan (semkes)</label>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: entries.length >= SEMKES_MAX ? colors.green : colors.ink }}>
          {entries.length} / {SEMKES_MAX}
        </span>
      </div>

      {entries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
          {entries.map((e, i) => (
            <div key={e.id} style={{ padding: '10px 12px', borderRadius: 9, border: `1px solid ${colors.border}`, background: colors.subtle }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: colors.green, background: colors.greenSoftBg, padding: '3px 8px', borderRadius: 999, flexShrink: 0 }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: 12.5, color: colors.ink, flex: 1, minWidth: 0 }}>
                  {e.judul || <em style={{ color: colors.faint }}>(judul belum diisi)</em>}
                </span>
                {!readOnly && (
                  <span onClick={() => hapus(e.id)} style={{ fontSize: 12, fontWeight: 700, color: colors.danger, cursor: 'pointer', flexShrink: 0 }}>
                    Hapus
                  </span>
                )}
              </div>
              <BuktiUploadField
                npm={npm}
                label={`Semkes-${i + 1}`}
                value={e.bukti}
                onChange={(url) => setBukti(e.id, url)}
                uploadFn={uploadFn}
                required={!e.bukti}
              />
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        penuh ? (
          <span style={{ fontSize: 11.5, color: colors.faint }}>
            Sudah mencapai batas {SEMKES_MAX} semkes — hapus salah satu bila ingin mengganti.
          </span>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <input
              value={judul}
              onChange={(ev) => setJudul(ev.target.value)}
              onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); tambah(); } }}
              placeholder="Judul seminar, mis. Seminar Kesehatan Reproduksi Remaja"
              style={{ ...inputStyle, flex: 1, minWidth: 200 }}
            />
            <button
              onClick={tambah}
              disabled={!canAdd}
              style={{ padding: '10px 18px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700, color: colors.white, background: canAdd ? colors.green : colors.disabled, cursor: canAdd ? 'pointer' : 'not-allowed', flexShrink: 0 }}
            >
              Tambah
            </button>
          </div>
        )
      )}
    </div>
  );
}
