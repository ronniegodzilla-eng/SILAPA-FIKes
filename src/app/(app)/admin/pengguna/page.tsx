'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useData } from '@/lib/data-context';
import { fetchAllUsers } from '@/lib/firestore/data';
import { apiFetch } from '@/lib/download';
import { colors } from '@/lib/theme';
import { Card, Icon, Pill, inputStyle, labelStyle } from '@/components/ui';
import { PaginationBar, SortableTh, TableSearch, useTableSort, usePagination } from '@/components/table-tools';
import type { AppUser } from '@/lib/types';

type SortKey = 'nama' | 'prodi' | 'email' | 'peran' | 'statusAkun';

const TH: React.CSSProperties = {
  textAlign: 'left', padding: '12px 16px', fontSize: 11.5, fontWeight: 700,
  color: colors.muted, textTransform: 'uppercase',
};

const ROLE_LABEL: Record<string, string> = {
  dosen_pa: 'Dosen PA', admin: 'Admin', wadek1: 'Wakil Dekan I',
};

const ROLE_OPTIONS = ['dosen_pa', 'admin', 'wadek1'] as const;

function rolesLabel(roles: string[] | undefined): string {
  if (!roles || roles.length === 0) return '—';
  return roles.map((r) => ROLE_LABEL[r] ?? r).join(', ');
}

interface Draft {
  uid?: string; // roster dosenUid — akun dibuat dengan uid ini
  nama: string;
  email: string;
  password: string;
  roles: string[];
  prodiHomebase: string;
  namaLocked: boolean;
}

interface RolesDraft {
  uid: string;
  nama: string;
  roles: string[];
}

interface ProfilDraft {
  uid: string;
  nama: string;
  email: string;
  prodiHomebase: string;
  isDosen: boolean;
}

interface ResetDraft {
  uid: string;
  nama: string;
  password: string;
}

/** Checkbox group dipakai di modal Buat Akun & Ubah Peran (satu akun bisa multi-peran). */
function RoleCheckboxes({ value, onChange }: { value: string[]; onChange: (roles: string[]) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ROLE_OPTIONS.map((r) => (
        <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.ink, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={value.includes(r)}
            onChange={(e) =>
              onChange(e.target.checked ? [...value, r] : value.filter((x) => x !== r))
            }
          />
          {ROLE_LABEL[r]}
        </label>
      ))}
    </div>
  );
}

/** Tebakan email institusi dari nama (bisa diedit admin). */
function guessEmail(nama: string): string {
  const words = nama
    .toLowerCase()
    .replace(/\b(dr|hj|h|s\.?si|m\.?si|m\.?kes|m\.?km|s\.?km)\b\.?/g, '')
    .replace(/[^a-z ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (words.slice(0, 2).join('.') || 'pengguna') + '@uis.ac.id';
}

export default function PenggunaPage() {
  const { appUser } = useAuth();
  const { dosenRoster, reload } = useData();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [rolesDraft, setRolesDraft] = useState<RolesDraft | null>(null);
  const [resetDraft, setResetDraft] = useState<ResetDraft | null>(null);
  const [profilDraft, setProfilDraft] = useState<ProfilDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [err, setErr] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await fetchAllUsers());
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const usersByUid = useMemo(() => new Map(users.map((u) => [u.uid, u])), [users]);

  // Baris dosen dari roster (join dengan akun bila ada) + akun non-dosen.
  const dosenRows = dosenRoster.map((d) => ({
    dosenUid: d.dosenUid,
    nama: d.nama,
    prodi: d.prodi,
    account: usersByUid.get(d.dosenUid) ?? users.find((u) => u.nama === d.nama) ?? null,
  }));
  const rosterUids = new Set(dosenRoster.map((d) => d.dosenUid));
  const lainnya = users.filter((u) => !rosterUids.has(u.uid) && !dosenRows.some((r) => r.account?.uid === u.uid));

  // Tabel Dosen PA: cari + urut + halaman (tabel "Admin & Wakil Dekan" sengaja
  // dibiarkan polos — isinya hanya 2–4 baris).
  const sort = useTableSort<SortKey>();
  const [dosenQ, setDosenQ] = useState('');
  const dosenNeedle = dosenQ.trim().toLowerCase();
  const dosenFiltered = dosenRows.filter(
    (r) =>
      !dosenNeedle ||
      r.nama.toLowerCase().includes(dosenNeedle) ||
      (r.account?.email ?? '').toLowerCase().includes(dosenNeedle)
  );
  const dosenSorted = sort.sortRows(dosenFiltered, (r, key) => {
    switch (key) {
      case 'email': return r.account?.email ?? '';
      case 'peran': return r.account ? rolesLabel(r.account.roles) : '';
      case 'statusAkun': return r.account ? (r.account.aktif === false ? 'Nonaktif' : 'Aktif') : 'Belum ada akun';
      default: return r[key];
    }
  });
  const dosenPage = usePagination(dosenSorted, undefined, sort.sortSig);

  function openBuatAkun(row: { dosenUid: string; nama: string; prodi: string }) {
    setDraft({
      uid: row.dosenUid,
      nama: row.nama,
      email: guessEmail(row.nama),
      password: 'silapa123',
      roles: ['dosen_pa'],
      prodiHomebase: row.prodi,
      namaLocked: true,
    });
    setErr('');
  }

  function openTambah() {
    setDraft({ nama: '', email: '', password: 'silapa123', roles: ['dosen_pa'], prodiHomebase: 'K3', namaLocked: false });
    setErr('');
  }

  async function simpan() {
    if (!draft || busy) return;
    if (draft.roles.length === 0) {
      setErr('Pilih minimal satu peran.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: {
          uid: draft.uid,
          nama: draft.nama,
          email: draft.email.trim(),
          password: draft.password,
          roles: draft.roles,
          prodiHomebase: draft.roles.includes('dosen_pa') ? draft.prodiHomebase : null,
        },
      });
      setToast(`✓ Akun ${draft.nama} dibuat (${draft.email.trim()}).`);
      setDraft(null);
      await loadUsers();
    } catch (e: any) {
      setErr(e?.message ?? 'Gagal membuat akun.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleAktif(u: AppUser) {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      await apiFetch('/api/admin/users', { method: 'PATCH', body: { uid: u.uid, aktif: u.aktif === false } });
      setToast(`✓ Akun ${u.nama} ${u.aktif === false ? 'diaktifkan' : 'dinonaktifkan'}.`);
      await loadUsers();
    } catch (e: any) {
      setErr(e?.message ?? 'Gagal memperbarui akun.');
    } finally {
      setBusy(false);
    }
  }

  function openUbahPeran(u: AppUser) {
    setRolesDraft({ uid: u.uid, nama: u.nama, roles: [...(u.roles ?? [])] });
    setErr('');
  }

  async function simpanPeran() {
    if (!rolesDraft || busy) return;
    if (rolesDraft.roles.length === 0) {
      setErr('Pilih minimal satu peran.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await apiFetch('/api/admin/users', { method: 'PATCH', body: { uid: rolesDraft.uid, roles: rolesDraft.roles } });
      setToast(`✓ Peran ${rolesDraft.nama} diperbarui.`);
      setRolesDraft(null);
      await loadUsers();
    } catch (e: any) {
      setErr(e?.message ?? 'Gagal memperbarui peran.');
    } finally {
      setBusy(false);
    }
  }

  function openResetPassword(u: AppUser) {
    setResetDraft({ uid: u.uid, nama: u.nama, password: '' });
    setErr('');
  }

  async function simpanReset() {
    if (!resetDraft || busy) return;
    if (resetDraft.password.length < 6) {
      setErr('Kata sandi minimal 6 karakter.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await apiFetch('/api/admin/users', { method: 'PATCH', body: { uid: resetDraft.uid, password: resetDraft.password } });
      setToast(`✓ Kata sandi ${resetDraft.nama} direset.`);
      setResetDraft(null);
    } catch (e: any) {
      setErr(e?.message ?? 'Gagal mereset kata sandi.');
    } finally {
      setBusy(false);
    }
  }

  function openEditProfil(u: AppUser) {
    setProfilDraft({
      uid: u.uid,
      nama: u.nama,
      email: u.email,
      prodiHomebase: u.prodiHomebase ?? 'K3',
      isDosen: (u.roles ?? []).includes('dosen_pa'),
    });
    setErr('');
  }

  async function simpanProfil() {
    if (!profilDraft || busy) return;
    if (!profilDraft.nama.trim()) {
      setErr('Nama tidak boleh kosong.');
      return;
    }
    if (!profilDraft.email.trim()) {
      setErr('Email tidak boleh kosong.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await apiFetch('/api/admin/users', {
        method: 'PATCH',
        body: {
          uid: profilDraft.uid,
          nama: profilDraft.nama.trim(),
          email: profilDraft.email.trim(),
          prodiHomebase: profilDraft.isDosen ? profilDraft.prodiHomebase : null,
        },
      });
      setToast(`✓ Profil ${profilDraft.nama.trim()} diperbarui.`);
      setProfilDraft(null);
      await Promise.all([loadUsers(), reload()]);
    } catch (e: any) {
      setErr(e?.message ?? 'Gagal memperbarui profil.');
    } finally {
      setBusy(false);
    }
  }

  const belumPunya = dosenRows.filter((r) => !r.account).length;

  return (
    <div className="silapa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: colors.muted }}>
          {loading ? 'Memuat…' : `${users.length} akun terdaftar · ${belumPunya} dosen PA belum punya akun.`}
        </span>
        <button onClick={openTambah} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, border: 'none', background: colors.green, color: colors.white, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Icon path="M12 5v14 M5 12h14" size={15} width={2} />
          Tambah Pengguna
        </button>
      </div>

      {toast && <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.green }}>{toast}</span>}
      {err && !draft && !rolesDraft && !resetDraft && !profilDraft && (
        <div style={{ background: colors.dangerBg, border: `1px solid ${colors.dangerBorder}`, borderRadius: 12, padding: '11px 16px', fontSize: 12.5, fontWeight: 600, color: colors.danger }}>{err}</div>
      )}

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, overflowX: 'auto' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.rowBorder}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink, flex: 1 }}>Dosen PA ({dosenRoster.length})</span>
          <TableSearch value={dosenQ} onChange={setDosenQ} placeholder="Cari nama atau email..." />
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: colors.subtle }}>
              <SortableTh label="Nama" sortKey="nama" sort={sort} style={TH} />
              <SortableTh label="Prodi" sortKey="prodi" sort={sort} style={TH} />
              <SortableTh label="Email" sortKey="email" sort={sort} style={TH} />
              <SortableTh label="Peran" sortKey="peran" sort={sort} style={TH} />
              <SortableTh label="Status Akun" sortKey="statusAkun" sort={sort} style={TH} />
              <th style={{ ...TH, textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {dosenPage.total === 0 && (
              <tr><td colSpan={6} style={{ padding: '14px 16px', fontSize: 12.5, color: colors.faint }}>Tidak ada dosen yang cocok dengan pencarian.</td></tr>
            )}
            {dosenPage.pageRows.map((r) => (
              <tr key={r.dosenUid} style={{ borderTop: `1px solid ${colors.rowBorder}` }}>
                <td style={{ padding: '11px 16px', fontSize: 13.5, fontWeight: 600, color: colors.ink }}>{r.nama}</td>
                <td style={{ padding: '11px 16px', fontSize: 13, color: colors.ink }}>{r.prodi}</td>
                <td style={{ padding: '11px 16px', fontSize: 12.5, color: colors.muted }}>{r.account?.email ?? '—'}</td>
                <td style={{ padding: '11px 16px', fontSize: 12.5, color: colors.ink }}>{r.account ? rolesLabel(r.account.roles) : '—'}</td>
                <td style={{ padding: '11px 16px' }}>
                  {r.account ? (
                    r.account.aktif === false
                      ? <Pill label="Nonaktif" color={colors.danger} bg={colors.dangerBg} />
                      : <Pill label="Aktif" color={colors.green} bg={colors.greenSoftBg} />
                  ) : (
                    <Pill label="Belum punya akun" color={colors.amberText} bg={colors.amberBg} />
                  )}
                </td>
                <td style={{ padding: '11px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {r.account ? (
                    <span style={{ display: 'inline-flex', gap: 12 }}>
                      <span onClick={() => openEditProfil(r.account!)} style={{ fontSize: 12, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}>Edit Profil</span>
                      <span onClick={() => openUbahPeran(r.account!)} style={{ fontSize: 12, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}>Ubah Peran</span>
                      <span onClick={() => openResetPassword(r.account!)} style={{ fontSize: 12, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}>Reset Sandi</span>
                      {r.account.uid !== appUser?.uid && (
                        <span onClick={() => toggleAktif(r.account!)} style={{ fontSize: 12, fontWeight: 700, color: r.account.aktif === false ? colors.green : colors.danger, cursor: 'pointer' }}>
                          {r.account.aktif === false ? 'Aktifkan' : 'Nonaktifkan'}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span onClick={() => openBuatAkun(r)} style={{ fontSize: 12, fontWeight: 700, color: colors.green, cursor: 'pointer' }}>Buat Akun</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${colors.rowBorder}` }}>
          <PaginationBar p={dosenPage} itemLabel="dosen PA" />
        </div>
      </div>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, overflowX: 'auto' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.rowBorder}` }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink }}>Admin &amp; Wakil Dekan</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {lainnya.map((u) => (
              <tr key={u.uid} style={{ borderTop: `1px solid ${colors.rowBorder}` }}>
                <td style={{ padding: '11px 16px', fontSize: 13.5, fontWeight: 600, color: colors.ink }}>{u.nama}</td>
                <td style={{ padding: '11px 16px', fontSize: 13, color: colors.ink }}>{rolesLabel(u.roles)}</td>
                <td style={{ padding: '11px 16px', fontSize: 12.5, color: colors.muted }}>{u.email}</td>
                <td style={{ padding: '11px 16px' }}>
                  {u.aktif === false
                    ? <Pill label="Nonaktif" color={colors.danger} bg={colors.dangerBg} />
                    : <Pill label="Aktif" color={colors.green} bg={colors.greenSoftBg} />}
                </td>
                <td style={{ padding: '11px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-flex', gap: 12 }}>
                    <span onClick={() => openEditProfil(u)} style={{ fontSize: 12, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}>Edit Profil</span>
                    <span onClick={() => openUbahPeran(u)} style={{ fontSize: 12, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}>Ubah Peran</span>
                    <span onClick={() => openResetPassword(u)} style={{ fontSize: 12, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}>Reset Sandi</span>
                    {u.uid !== appUser?.uid && (
                      <span onClick={() => toggleAktif(u)} style={{ fontSize: 12, fontWeight: 700, color: u.aktif === false ? colors.green : colors.danger, cursor: 'pointer' }}>
                        {u.aktif === false ? 'Aktifkan' : 'Nonaktifkan'}
                      </span>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draft && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,20,12,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: colors.surface, borderRadius: 16, padding: '26px 28px', width: 440, maxWidth: '92vw', boxShadow: '0 30px 60px rgba(0,0,0,0.3)' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: colors.ink, display: 'block', marginBottom: 4 }}>
              {draft.namaLocked ? `Buat Akun — ${draft.nama}` : 'Tambah Pengguna Baru'}
            </span>
            <span style={{ fontSize: 12, color: colors.faint, display: 'block', marginBottom: 16 }}>
              Sampaikan email &amp; kata sandi awal ke pengguna; sarankan ganti sandi setelah login pertama.
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {!draft.namaLocked && (
                <div>
                  <label style={labelStyle}>Nama lengkap + gelar</label>
                  <input value={draft.nama} onChange={(e) => setDraft({ ...draft, nama: e.target.value })} style={inputStyle} />
                </div>
              )}
              <div>
                <label style={labelStyle}>Email institusi</label>
                <input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Kata sandi awal (min. 6 karakter)</label>
                <input value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Peran (boleh lebih dari satu)</label>
                <RoleCheckboxes value={draft.roles} onChange={(roles) => setDraft({ ...draft, roles })} />
              </div>
              {draft.roles.includes('dosen_pa') && !draft.namaLocked && (
                <div>
                  <label style={labelStyle}>Prodi Homebase</label>
                  <select value={draft.prodiHomebase} onChange={(e) => setDraft({ ...draft, prodiHomebase: e.target.value })} style={inputStyle}>
                    <option value="K3">K3</option>
                    <option value="KL">KL</option>
                    <option value="S2KM">S2KM</option>
                  </select>
                </div>
              )}
            </div>
            {err && <span style={{ display: 'block', marginTop: 12, fontSize: 12.5, fontWeight: 600, color: colors.danger }}>{err}</span>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setDraft(null)} style={{ padding: '10px 16px', borderRadius: 9, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 13, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}>Batal</button>
              <button onClick={simpan} disabled={busy} style={{ padding: '10px 16px', borderRadius: 9, border: 'none', background: colors.green, color: colors.white, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {busy ? 'Membuat…' : 'Buat Akun'}
              </button>
            </div>
          </div>
        </div>
      )}

      {rolesDraft && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,20,12,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: colors.surface, borderRadius: 16, padding: '26px 28px', width: 360, maxWidth: '92vw', boxShadow: '0 30px 60px rgba(0,0,0,0.3)' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: colors.ink, display: 'block', marginBottom: 4 }}>
              Ubah Peran — {rolesDraft.nama}
            </span>
            <span style={{ fontSize: 12, color: colors.faint, display: 'block', marginBottom: 16 }}>
              Satu akun bisa memiliki lebih dari satu peran sekaligus.
            </span>
            <RoleCheckboxes value={rolesDraft.roles} onChange={(roles) => setRolesDraft({ ...rolesDraft, roles })} />
            {err && <span style={{ display: 'block', marginTop: 12, fontSize: 12.5, fontWeight: 600, color: colors.danger }}>{err}</span>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setRolesDraft(null)} style={{ padding: '10px 16px', borderRadius: 9, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 13, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}>Batal</button>
              <button onClick={simpanPeran} disabled={busy} style={{ padding: '10px 16px', borderRadius: 9, border: 'none', background: colors.green, color: colors.white, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {busy ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetDraft && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,20,12,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: colors.surface, borderRadius: 16, padding: '26px 28px', width: 360, maxWidth: '92vw', boxShadow: '0 30px 60px rgba(0,0,0,0.3)' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: colors.ink, display: 'block', marginBottom: 4 }}>
              Reset Kata Sandi — {resetDraft.nama}
            </span>
            <span style={{ fontSize: 12, color: colors.faint, display: 'block', marginBottom: 16 }}>
              Sampaikan kata sandi baru ke pengguna secara langsung; sarankan ganti sandi setelah login.
            </span>
            <label style={labelStyle}>Kata sandi baru (min. 6 karakter)</label>
            <input
              value={resetDraft.password}
              onChange={(e) => setResetDraft({ ...resetDraft, password: e.target.value })}
              style={inputStyle}
            />
            {err && <span style={{ display: 'block', marginTop: 12, fontSize: 12.5, fontWeight: 600, color: colors.danger }}>{err}</span>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setResetDraft(null)} style={{ padding: '10px 16px', borderRadius: 9, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 13, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}>Batal</button>
              <button onClick={simpanReset} disabled={busy} style={{ padding: '10px 16px', borderRadius: 9, border: 'none', background: colors.green, color: colors.white, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {busy ? 'Menyimpan…' : 'Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {profilDraft && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,20,12,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: colors.surface, borderRadius: 16, padding: '26px 28px', width: 400, maxWidth: '92vw', boxShadow: '0 30px 60px rgba(0,0,0,0.3)' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: colors.ink, display: 'block', marginBottom: 4 }}>
              Edit Profil — {profilDraft.nama}
            </span>
            <span style={{ fontSize: 12, color: colors.faint, display: 'block', marginBottom: 16, lineHeight: 1.5 }}>
              Perubahan nama/prodi juga disinkronkan ke roster bimbingan (lintas periode) agar kirim laporan &amp; unduh PDF tetap cocok.
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Nama lengkap + gelar</label>
                <input value={profilDraft.nama} onChange={(e) => setProfilDraft({ ...profilDraft, nama: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Email institusi</label>
                <input value={profilDraft.email} onChange={(e) => setProfilDraft({ ...profilDraft, email: e.target.value })} style={inputStyle} />
              </div>
              {profilDraft.isDosen && (
                <div>
                  <label style={labelStyle}>Prodi Homebase</label>
                  <select value={profilDraft.prodiHomebase} onChange={(e) => setProfilDraft({ ...profilDraft, prodiHomebase: e.target.value })} style={inputStyle}>
                    <option value="K3">K3</option>
                    <option value="KL">KL</option>
                    <option value="S2KM">S2KM</option>
                  </select>
                </div>
              )}
            </div>
            {err && <span style={{ display: 'block', marginTop: 12, fontSize: 12.5, fontWeight: 600, color: colors.danger }}>{err}</span>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setProfilDraft(null)} style={{ padding: '10px 16px', borderRadius: 9, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 13, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}>Batal</button>
              <button onClick={simpanProfil} disabled={busy} style={{ padding: '10px 16px', borderRadius: 9, border: 'none', background: colors.green, color: colors.white, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {busy ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
