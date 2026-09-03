'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/lib/data-context';
import { RiwayatTervalidasi } from '@/components/RiwayatTervalidasi';
import { useAuth } from '@/lib/auth-context';
import { useViewportWidth } from '@/lib/use-viewport';
import { fetchMahasiswaRecords } from '@/lib/firestore/data';
import {
  computeWadekAggregates, computeIpkPerDosen, computeDrilldownList, groupByProdi,
  type WadekAggregates, type DrilldownKey,
} from '@/lib/compute';
import { colors } from '@/lib/theme';
import { Card, Icon } from '@/components/ui';
import { PaginationBar, SortableTh, TableSearch, useTableSort, usePagination } from '@/components/table-tools';
import { FeatureTour, type TourStep } from '@/components/FeatureTour';
import type { MahasiswaRecord } from '@/lib/types';

const WADEK_TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="wadek-progress"]',
    title: 'Progres pelaporan 22 dosen',
    body: 'Pantau berapa dosen yang belum mulai, sudah mengirim, dikembalikan, atau sudah diverifikasi — semua real-time.',
  },
  {
    target: '[data-tour="wadek-ipk"]',
    title: 'IPK rata-rata per prodi (bisa diklik!)',
    body: 'Klik salah satu kartu ini untuk melihat rincian IPK rata-rata per dosen PA dalam prodi tersebut.',
  },
  {
    target: '[data-tour="wadek-rekap"]',
    title: 'Rekap fakultas (bisa diklik!)',
    body: 'Klik kotak seperti Cuti, Penerima Beasiswa, atau Meraih Prestasi untuk melihat daftar mahasiswanya, dikelompokkan per prodi.',
  },
  {
    target: 'a[href="/wadek/verifikasi"]',
    title: 'Verifikasi Laporan',
    body: 'Terima atau kembalikan laporan yang dikirim dosen PA di sini, lengkap dengan catatan revisi.',
  },
  {
    target: 'a[href="/wadek/ekspor"]',
    title: 'Ekspor & Arsip',
    body: 'Unduh PDF laporan per dosen dan rekap Excel seluruh fakultas, atau buka arsip periode yang sudah terkunci.',
  },
];

const TH: React.CSSProperties = {
  textAlign: 'left', padding: '10px 24px', fontSize: 11, fontWeight: 700,
  color: colors.muted, textTransform: 'uppercase',
};

const DRILLDOWN_LABEL: Record<DrilldownKey, string> = {
  cuti: 'Mahasiswa cuti',
  non_aktif: 'Mahasiswa non-aktif',
  lulus: 'Mahasiswa lulus periode ini',
  organisasi: 'Mahasiswa aktif organisasi',
  beasiswa: 'Penerima beasiswa',
  prestasi: 'Mahasiswa meraih prestasi',
  belum_toefl: 'Mahasiswa belum TOEFL',
  belum_pkkmb: 'Mahasiswa belum PKKMB',
  belum_esq: 'Mahasiswa belum ESQ',
};

type Drilldown = { type: 'ipk'; prodi: string } | { type: 'list'; key: DrilldownKey };

export default function WadekDashboardPage() {
  const router = useRouter();
  const { periode, dosenRoster, refreshRekapCache } = useData();
  const { appUser } = useAuth();
  const width = useViewportWidth();
  const isNarrow = width < 880;

  const [agg, setAgg] = useState<WadekAggregates | null>(null);
  const [computedAt, setComputedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');

  // Filter progres skripsi: per prodi dari cache (gratis), per dosen via
  // query terpisah yang dibatasi (bounded ~70 baris, bukan full-scan).
  const [skripsiFilterProdi, setSkripsiFilterProdi] = useState('semua');
  const [skripsiFilterDosen, setSkripsiFilterDosen] = useState('');
  const [skripsiDosenRows, setSkripsiDosenRows] = useState<{ label: string; count: number }[] | null>(null);
  const [skripsiDosenLoading, setSkripsiDosenLoading] = useState(false);

  // Drill-down W1 (klik kartu IPK prodi / kotak rekap fakultas): full-faculty
  // fetch dilakukan sekali per sesi (lazy), bukan di setiap load dashboard.
  const [fullRecords, setFullRecords] = useState<MahasiswaRecord[] | null>(null);
  const [fullRecordsLoading, setFullRecordsLoading] = useState(false);
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);

  const ensureFullRecords = useCallback(async () => {
    if (fullRecords || !periode) return;
    setFullRecordsLoading(true);
    try {
      const records = await fetchMahasiswaRecords(periode.id);
      setFullRecords(records);
    } catch {
      setFullRecords([]);
    } finally {
      setFullRecordsLoading(false);
    }
  }, [fullRecords, periode]);

  function openDrilldown(d: Drilldown) {
    setDrilldown(d);
    ensureFullRecords();
  }

  const load = useCallback(async (forceRefresh: boolean) => {
    if (!periode) return;
    forceRefresh ? setRefreshing(true) : setLoading(true);
    setErr('');
    try {
      if (forceRefresh) {
        const a = await refreshRekapCache();
        setAgg(a);
        setComputedAt(new Date());
      } else {
        const { fetchRekapCache } = await import('@/lib/firestore/data');
        const cached = await fetchRekapCache(periode.id);
        // Cache yang ditulis sebelum IP semester & IPK dipisah hanya punya satu
        // angka gabungan. Diperlakukan seperti belum pernah dihitung supaya
        // dihitung ulang sendiri — tanpa ini kartu prodi tampil kosong sampai
        // ada orang yang kebetulan menekan Segarkan.
        const bentukLama =
          !!cached && !cached.aggregates.prodiIpk?.every((x) => 'rataIpk' in x);
        if (cached && !bentukLama) {
          setAgg(cached.aggregates);
          setComputedAt(
            (cached.computedAt as any)?.toDate ? (cached.computedAt as any).toDate() : null
          );
        } else {
          // Belum pernah dihitung untuk periode ini — bootstrap sekali.
          const a = await refreshRekapCache();
          setAgg(a);
          setComputedAt(new Date());
        }
      }
    } catch (e: any) {
      setErr(e?.message ?? 'Gagal memuat rekap.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [periode, refreshRekapCache]);

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode?.id]);

  // Filter dosen pada progres skripsi → scoped fetch (bukan full-scan).
  useEffect(() => {
    if (!skripsiFilterDosen || !periode) {
      setSkripsiDosenRows(null);
      return;
    }
    setSkripsiDosenLoading(true);
    fetchMahasiswaRecords(periode.id, { dosenPaUid: skripsiFilterDosen })
      .then((records) => {
        const namaByUid = new Map(dosenRoster.map((d) => [d.dosenUid, d.nama]));
        const scoped = computeWadekAggregates(records, namaByUid);
        setSkripsiDosenRows(scoped.skripsiTahap);
      })
      .catch(() => setSkripsiDosenRows(null))
      .finally(() => setSkripsiDosenLoading(false));
  }, [skripsiFilterDosen, periode, dosenRoster]);

  const progress = {
    draft: dosenRoster.filter((d) => d.statusKirim === 'draft').length,
    dikirim: dosenRoster.filter((d) => d.statusKirim === 'dikirim').length,
    dikembalikan: dosenRoster.filter((d) => d.statusKirim === 'dikembalikan').length,
    diverifikasi: dosenRoster.filter((d) => d.statusKirim === 'diverifikasi').length,
  };
  const semLabel = periode?.semester === 'genap' ? 'Genap' : 'Ganjil';

  if (loading || !agg) {
    return (
      <div style={{ fontSize: 13, color: colors.muted }}>
        {err || 'Memuat rekap fakultas…'}
      </div>
    );
  }

  const skripsiRows =
    skripsiFilterDosen && skripsiDosenRows
      ? skripsiDosenRows
      : skripsiFilterProdi !== 'semua'
        ? agg.skripsiTahapByProdi[skripsiFilterProdi] ?? agg.skripsiTahap
        : agg.skripsiTahap;
  const skripsiMax = Math.max(1, ...skripsiRows.map((r) => r.count));
  const semesterMax = Math.max(1, ...agg.semesterDistribution.map((r) => r.count));
  const semkesMax = Math.max(1, ...agg.semkesDistribution.map((r) => r.count));

  return (
    <div className="silapa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* progress KPIs */}
      <div data-tour="wadek-progress" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 16 }}>
        <ProgCard label="Belum Mulai" value={progress.draft} hint={`dari ${dosenRoster.length} dosen PA`} color={colors.muted} />
        <ProgCard label="Sudah Dikirim" value={progress.dikirim} hint="menunggu verifikasi" color={colors.amber} />
        <ProgCard label="Dikembalikan" value={progress.dikembalikan} hint="perlu revisi dosen" color={colors.danger} />
        <ProgCard label="Terverifikasi" value={progress.diverifikasi} hint="siap dikunci" color={colors.green} />
      </div>

      {/* prodi IPK */}
      <div data-tour="wadek-ipk" style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr 1fr', gap: 16 }}>
        {agg.prodiIpk.map((p) => (
          <div
            key={p.prodi}
            onClick={() => openDrilldown({ type: 'ipk', prodi: p.prodi })}
            style={{ cursor: 'pointer' }}
            title="Klik untuk lihat rata-rata IP & IPK per dosen PA"
          >
            <Card padding="18px 20px">
              <span style={{ fontSize: 12, fontWeight: 700, color: colors.muted, textTransform: 'uppercase' }}>{p.prodi}</span>
              {/* Dua angka berdampingan: IP semester periode ini dan IPK
                  kumulatif, masing-masing dengan n-nya. Sebelumnya hanya IP
                  semester yang tampil tapi berlabel "IPK", sehingga prodi yang
                  IP-nya belum terisi terbaca ber-IPK 0,00. */}
              <div style={{ display: 'flex', gap: 20, marginTop: 8, flexWrap: 'wrap' }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: colors.faint, textTransform: 'uppercase' }}>IP semester</span>
                  <div style={{ fontFamily: "'Lora',serif", fontSize: 24, fontWeight: 700, color: colors.ink }}>{p.rataIp}</div>
                  <span style={{ fontSize: 11.5, color: colors.faint }}>n = {p.nIp}</span>
                </div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: colors.faint, textTransform: 'uppercase' }}>IPK</span>
                  <div style={{ fontFamily: "'Lora',serif", fontSize: 24, fontWeight: 700, color: colors.green }}>{p.rataIpk}</div>
                  <span style={{ fontSize: 11.5, color: colors.faint }}>n = {p.nIpk}</span>
                </div>
              </div>
            </Card>
          </div>
        ))}
      </div>

      {/* rekap fakultas + skripsi */}
      <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '1.3fr 1fr', gap: 16, alignItems: 'start' }}>
        <div data-tour="wadek-rekap">
        <Card>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>
              Rekap fakultas — periode {periode?.tahunAkademik} {semLabel}
            </span>
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 11.5, fontWeight: 700, color: colors.ink, cursor: refreshing ? 'wait' : 'pointer', flexShrink: 0 }}
            >
              <Icon path="M4 4v6h6 M20 20v-6h-6 M5 15a7 7 0 0 0 12.6 2.5 M19 9A7 7 0 0 0 6.4 6.5" size={12} />
              {refreshing ? 'Menghitung…' : 'Refresh'}
            </button>
          </div>
          <span style={{ display: 'block', fontSize: 12, color: colors.faint, marginBottom: 16 }}>
            Dihitung otomatis dari {agg.total} record laporan periode ini.
            {computedAt && ` Terakhir dihitung: ${computedAt.toLocaleString('id-ID')}.`}
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 14 }}>
            <MiniTile label="Aktif" value={agg.status.aktif} />
            <MiniTile label="Cuti" value={agg.status.cuti} onClick={() => openDrilldown({ type: 'list', key: 'cuti' })} />
            <MiniTile label="Non-aktif" value={agg.status.nonAktif} onClick={() => openDrilldown({ type: 'list', key: 'non_aktif' })} />
            <MiniTile label="Lulus periode ini" value={agg.status.lulus} onClick={() => openDrilldown({ type: 'list', key: 'lulus' })} />
            {/* Menunggu KEPUTUSAN Wakil Dekan I, jadi diarahkan ke halaman
                validasinya, bukan ke drill-down daftar seperti kotak lain. */}
            <MiniTile
              label="Undur diri — menunggu Anda"
              value={agg.status.mengundurkanDiri ?? 0}
              title="Pengajuan pengunduran diri dari dosen PA/admin yang belum Anda validasi. Klik untuk membukanya."
              onClick={() => router.push('/wadek/pengunduran')}
            />
            <MiniTile label="Aktif organisasi" value={agg.nonAkademik.organisasi} title="Definisi 'aktif organisasi' (UKM/HIMA/BEM): tercatat sebagai anggota atau pengurus pada periode berjalan (§7.2 — tetapkan definisi resmi bersama Wadek I)." onClick={() => openDrilldown({ type: 'list', key: 'organisasi' })} />
            <MiniTile label="Penerima beasiswa" value={agg.nonAkademik.beasiswa} onClick={() => openDrilldown({ type: 'list', key: 'beasiswa' })} />
            <MiniTile label="Meraih prestasi" value={agg.nonAkademik.prestasi} onClick={() => openDrilldown({ type: 'list', key: 'prestasi' })} />
            <MiniTile label="Sudah TOEFL" value={agg.masterField.toefl} onClick={() => openDrilldown({ type: 'list', key: 'belum_toefl' })} />
            <MiniTile label="Sudah PKKMB" value={agg.masterField.pkkmb} onClick={() => openDrilldown({ type: 'list', key: 'belum_pkkmb' })} />
            <MiniTile label="Sudah ESQ" value={agg.masterField.esq} onClick={() => openDrilldown({ type: 'list', key: 'belum_esq' })} />
            <MiniTile label="Semkes ≥ 8" value={agg.masterField.semkes} />
          </div>
        </Card>
        </div>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink }}>Progres skripsi tingkat akhir</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                value={skripsiFilterProdi}
                onChange={(e) => { setSkripsiFilterProdi(e.target.value); setSkripsiFilterDosen(''); }}
                style={{ fontSize: 11.5, padding: '5px 7px', borderRadius: 7, border: `1px solid ${colors.border}`, background: colors.surface }}
              >
                <option value="semua">Semua prodi</option>
                <option value="K3">K3</option>
                <option value="KL">KL</option>
                <option value="S2KM">S2KM</option>
              </select>
              <select
                value={skripsiFilterDosen}
                onChange={(e) => setSkripsiFilterDosen(e.target.value)}
                style={{ fontSize: 11.5, padding: '5px 7px', borderRadius: 7, border: `1px solid ${colors.border}`, background: colors.surface, maxWidth: 140 }}
              >
                <option value="">Semua dosen</option>
                {dosenRoster.map((d) => (
                  <option key={d.dosenUid} value={d.dosenUid}>{d.nama}</option>
                ))}
              </select>
            </div>
          </div>
          {skripsiFilterDosen && skripsiDosenLoading ? (
            <span style={{ fontSize: 12, color: colors.faint }}>Memuat data dosen…</span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {skripsiRows.map((row) => (
                <div key={row.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: colors.ink, fontWeight: 600 }}>{row.label}</span>
                    <span style={{ color: colors.muted, fontWeight: 700 }}>{row.count}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: colors.track, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 999, background: colors.green, width: `${Math.round((row.count / skripsiMax) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* semester distribution + semkes distribution + beasiswa/prestasi breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card>
          <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 14 }}>Sebaran mahasiswa per semester</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {agg.semesterDistribution.map((row) => (
              <div key={row.semesterKe}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: colors.ink, fontWeight: 600 }}>Semester {row.semesterKe}</span>
                  <span style={{ color: colors.muted, fontWeight: 700 }}>{row.count}</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: colors.track, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 999, background: '#3E9A64', width: `${Math.round((row.count / semesterMax) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <span style={{ fontSize: 14, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 14 }}>Distribusi seminar kesehatan (semkes)</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {agg.semkesDistribution.map((row) => (
              <div key={row.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: colors.ink, fontWeight: 600 }}>{row.label} semkes</span>
                  <span style={{ color: colors.muted, fontWeight: 700 }}>{row.count}</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: colors.track, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 999, background: colors.amber, width: `${Math.round((row.count / semkesMax) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 6 }}>Beasiswa per jenis</span>
              {agg.beasiswaByJenis.length === 0 ? (
                <span style={{ fontSize: 11.5, color: colors.faint }}>Belum ada.</span>
              ) : agg.beasiswaByJenis.map((b) => (
                <div key={b.jenis} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                  <span style={{ color: colors.ink }}>{b.jenis}</span>
                  <span style={{ color: colors.muted, fontWeight: 700 }}>{b.count}</span>
                </div>
              ))}
            </div>
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 6 }}>Prestasi per tingkat</span>
              {agg.prestasiByTingkat.length === 0 ? (
                <span style={{ fontSize: 11.5, color: colors.faint }}>Belum ada.</span>
              ) : agg.prestasiByTingkat.map((p) => (
                <div key={p.tingkat} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', textTransform: 'capitalize' }}>
                  <span style={{ color: colors.ink }}>{p.tingkat}</span>
                  <span style={{ color: colors.muted, fontWeight: 700 }}>{p.count}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* KRS flag */}
      <KrsFlagTable rows={agg.krsFlag} />

      {/* Riwayat pengesahan seluruh dosen — tanpa dosenUid = lintas dosen. */}
      <RiwayatTervalidasi />

      {drilldown && (
        <DrilldownModal
          drilldown={drilldown}
          onClose={() => setDrilldown(null)}
          records={fullRecords}
          loading={fullRecordsLoading}
          dosenNamaByUid={new Map(dosenRoster.map((d) => [d.dosenUid, d.nama]))}
        />
      )}

      <FeatureTour steps={WADEK_TOUR_STEPS} storageKey={`silapa_tour_wadek_${appUser?.uid ?? ''}`} />
    </div>
  );
}

function ProgCard({ label, value, hint, color }: { label: string; value: number; hint: string; color: string }) {
  return (
    <Card padding="20px">
      <span style={{ fontSize: 12, fontWeight: 700, color: colors.muted, textTransform: 'uppercase' }}>{label}</span>
      <div style={{ fontFamily: "'Lora',serif", fontSize: 30, fontWeight: 700, color, marginTop: 6 }}>{value}</div>
      <span style={{ fontSize: 12, color: colors.faint }}>{hint}</span>
    </Card>
  );
}

function MiniTile({ label, value, title, onClick }: { label: string; value: React.ReactNode; title?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ background: colors.subtle, borderRadius: 10, padding: 14, cursor: onClick ? 'pointer' : 'default' }}
      title={title}
    >
      <span style={{ fontSize: 11, color: colors.muted, fontWeight: 600 }}>{label}</span>
      <div style={{ fontSize: 19, fontWeight: 800, color: colors.ink, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function DrilldownModal({
  drilldown, onClose, records, loading, dosenNamaByUid,
}: {
  drilldown: Drilldown;
  onClose: () => void;
  records: MahasiswaRecord[] | null;
  loading: boolean;
  dosenNamaByUid: Map<string, string>;
}) {
  const title =
    drilldown.type === 'ipk'
      ? `Rata-rata IP semester & IPK per dosen PA — ${drilldown.prodi}`
      : DRILLDOWN_LABEL[drilldown.key];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,20,12,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div style={{ background: colors.surface, borderRadius: 16, padding: '24px 26px', width: 560, maxWidth: '94vw', maxHeight: '82vh', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: colors.ink }}>{title}</span>
          <span onClick={onClose} style={{ cursor: 'pointer', color: colors.muted, fontSize: 20, lineHeight: 1 }}>&times;</span>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading || !records ? (
            <span style={{ fontSize: 12.5, color: colors.faint }}>Memuat data mahasiswa fakultas (sekali per sesi)…</span>
          ) : drilldown.type === 'ipk' ? (
            <IpkPerDosenTable records={records} dosenNamaByUid={dosenNamaByUid} prodi={drilldown.prodi} />
          ) : (
            <DrilldownListByProdi records={records} dosenNamaByUid={dosenNamaByUid} drilldownKey={drilldown.key} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Sorotan mahasiswa aktif yang SKS-nya belum tercatat. Bisa mencapai ribuan
 * baris di awal periode (semua laporan masih kosong), jadi dicari/diurut/
 * dipaginasi seperti tabel besar lainnya.
 */
function KrsFlagTable({ rows }: { rows: { npm: string; nama: string; prodi: string; dosen: string }[] }) {
  type Key = 'npm' | 'nama' | 'prodi' | 'dosen';
  const sort = useTableSort<Key>();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const filtered = rows.filter(
    (r) => !needle || r.nama.toLowerCase().includes(needle) || r.npm.includes(needle) || r.dosen.toLowerCase().includes(needle)
  );
  const p = usePagination(sort.sortRows(filtered, (r, key) => r[key]), undefined, sort.sortSig);
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: `1px solid ${colors.rowBorder}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Icon path="M12 9v4 M12 17h.01 M10.3 3.86L1.82 18a1 1 0 0 0 .86 1.5h18.64a1 1 0 0 0 .86-1.5L13.7 3.86a1 1 0 0 0-1.72 0Z" size={16} stroke={colors.danger} width={1.6} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink, flex: 1 }}>Sorotan: mahasiswa belum mengisi KRS</span>
        {rows.length > 0 && <TableSearch value={q} onChange={setQ} placeholder="Cari nama, NPM, atau dosen PA..." />}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: colors.subtle }}>
            <SortableTh label="NPM" sortKey="npm" sort={sort} style={TH} />
            <SortableTh label="Nama" sortKey="nama" sort={sort} style={TH} />
            <SortableTh label="Prodi" sortKey="prodi" sort={sort} style={TH} />
            <SortableTh label="Dosen PA" sortKey="dosen" sort={sort} style={TH} />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={4} style={{ padding: '14px 24px', fontSize: 12.5, color: colors.faint }}>Seluruh mahasiswa aktif sudah tercatat SKS-nya.</td></tr>
          )}
          {rows.length > 0 && p.total === 0 && (
            <tr><td colSpan={4} style={{ padding: '14px 24px', fontSize: 12.5, color: colors.faint }}>Tidak ada yang cocok dengan pencarian.</td></tr>
          )}
          {p.pageRows.map((r) => (
            <tr key={r.npm} style={{ borderTop: `1px solid ${colors.rowBorder}` }}>
              <td style={{ padding: '10px 24px', fontSize: 12.5, color: colors.muted }}>{r.npm}</td>
              <td style={{ padding: '10px 24px', fontSize: 13, fontWeight: 600, color: colors.ink }}>{r.nama}</td>
              <td style={{ padding: '10px 24px', fontSize: 12.5, color: colors.ink }}>{r.prodi}</td>
              <td style={{ padding: '10px 24px', fontSize: 12.5, color: colors.ink }}>{r.dosen}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 0 && (
        <div style={{ padding: '12px 24px', borderTop: `1px solid ${colors.rowBorder}` }}>
          <PaginationBar p={p} itemLabel="mahasiswa" />
        </div>
      )}
    </div>
  );
}

function IpkPerDosenTable({ records, dosenNamaByUid, prodi }: { records: MahasiswaRecord[]; dosenNamaByUid: Map<string, string>; prodi: string }) {
  type Key = 'dosen' | 'rataIp' | 'nIp' | 'rataIpk' | 'nIpk';
  const sort = useTableSort<Key>();
  const rows = computeIpkPerDosen(records, dosenNamaByUid, prodi);
  // Kolom rata-rata diurut sebagai ANGKA, bukan teks: "—" (belum ada data)
  // dibuang ke bawah oleh compareValues, dan 9,5 tidak lagi berada di bawah
  // 10 seperti pada urutan leksikal.
  const p = usePagination(
    sort.sortRows(rows, (r, key) => {
      if (key === 'rataIp' || key === 'rataIpk') {
        const v = Number(r[key]);
        return Number.isFinite(v) ? v : null;
      }
      return r[key] as never;
    }),
    undefined,
    sort.sortSig
  );
  if (rows.length === 0) {
    return <span style={{ fontSize: 12.5, color: colors.faint }}>Belum ada mahasiswa aktif di prodi ini.</span>;
  }
  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: colors.subtle }}>
            <SortableTh label="Dosen PA" sortKey="dosen" sort={sort} style={TH} />
            <SortableTh label="IP semester" sortKey="rataIp" sort={sort} style={{ ...TH, textAlign: 'right' }} align="right" />
            <SortableTh label="n" sortKey="nIp" sort={sort} style={{ ...TH, textAlign: 'right' }} align="right" />
            <SortableTh label="IPK" sortKey="rataIpk" sort={sort} style={{ ...TH, textAlign: 'right' }} align="right" />
            <SortableTh label="n" sortKey="nIpk" sort={sort} style={{ ...TH, textAlign: 'right' }} align="right" />
          </tr>
        </thead>
        <tbody>
          {p.pageRows.map((r) => (
            <tr key={r.dosenUid} style={{ borderTop: `1px solid ${colors.rowBorder}` }}>
              <td style={{ padding: '9px 24px', fontSize: 13, fontWeight: 600, color: colors.ink }}>{r.dosen}</td>
              <td style={{ padding: '9px 24px', fontSize: 13, color: colors.ink, textAlign: 'right' }}>{r.rataIp}</td>
              <td style={{ padding: '9px 24px', fontSize: 12.5, color: colors.muted, textAlign: 'right' }}>{r.nIp}</td>
              <td style={{ padding: '9px 24px', fontSize: 13, fontWeight: 700, color: colors.green, textAlign: 'right' }}>{r.rataIpk}</td>
              <td style={{ padding: '9px 24px', fontSize: 12.5, color: colors.muted, textAlign: 'right' }}>{r.nIpk}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ padding: '12px 24px' }}>
        <PaginationBar p={p} itemLabel="dosen PA" />
      </div>
    </>
  );
}

function DrilldownListByProdi({ records, dosenNamaByUid, drilldownKey }: { records: MahasiswaRecord[]; dosenNamaByUid: Map<string, string>; drilldownKey: DrilldownKey }) {
  const rows = computeDrilldownList(records, dosenNamaByUid, drilldownKey);
  // Satu kotak cari untuk seluruh modal — memfilter daftar SEBELUM dikelompokkan
  // supaya angka "(n)" tiap prodi ikut menyesuaikan hasil pencarian.
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const filtered = rows.filter(
    (r) => !needle || r.nama.toLowerCase().includes(needle) || r.npm.includes(needle) || r.dosen.toLowerCase().includes(needle)
  );
  const grouped = groupByProdi(filtered);
  const prodiOrder = Object.keys(grouped).sort();
  if (rows.length === 0) {
    return <span style={{ fontSize: 12.5, color: colors.faint }}>Tidak ada data untuk kategori ini.</span>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex' }}>
        <TableSearch value={q} onChange={setQ} placeholder="Cari nama, NPM, atau dosen PA..." width={9999} />
      </div>
      {prodiOrder.length === 0 && (
        <span style={{ fontSize: 12.5, color: colors.faint }}>Tidak ada yang cocok dengan pencarian.</span>
      )}
      {prodiOrder.map((prodi) => (
        <DrilldownProdiTable key={prodi} prodi={prodi} rows={grouped[prodi]} />
      ))}
    </div>
  );
}

/** Satu kelompok prodi di dalam modal drill-down — punya urutan & halamannya sendiri. */
function DrilldownProdiTable({ prodi, rows }: { prodi: string; rows: { npm: string; nama: string; dosen: string }[] }) {
  type Key = 'npm' | 'nama' | 'dosen';
  const sort = useTableSort<Key>();
  const p = usePagination(sort.sortRows(rows, (r, key) => r[key]), 10, sort.sortSig);
  return (
    <div>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.muted, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
        {prodi} ({rows.length})
      </span>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: colors.subtle }}>
            <SortableTh label="NPM" sortKey="npm" sort={sort} style={TH} />
            <SortableTh label="Nama" sortKey="nama" sort={sort} style={TH} />
            <SortableTh label="Dosen PA" sortKey="dosen" sort={sort} style={TH} />
          </tr>
        </thead>
        <tbody>
          {p.pageRows.map((r) => (
            <tr key={r.npm} style={{ borderTop: `1px solid ${colors.rowBorder}` }}>
              <td style={{ padding: '8px 24px', fontSize: 12.5, color: colors.muted }}>{r.npm}</td>
              <td style={{ padding: '8px 24px', fontSize: 13, fontWeight: 600, color: colors.ink }}>{r.nama}</td>
              <td style={{ padding: '8px 24px', fontSize: 12.5, color: colors.ink }}>{r.dosen}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ paddingTop: 10 }}>
        <PaginationBar p={p} itemLabel="mahasiswa" />
      </div>
    </div>
  );
}
