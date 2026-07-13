import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireRole } from '@/lib/server-auth';
import { LaporanPdf, type PdfLaporanRow } from '@/lib/pdf/laporan-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PDF Laporan per Dosen (PRD §5.4 W3): kop FIKes UIS, identitas dosen,
 * tabel akademik + non-akademik + non-aktif/cuti, pengesahan + QR verifikasi.
 * Rendered server-side (PRD §8) with @react-pdf/renderer.
 *
 * Akses (PRD §3, §7.5): wadek1/admin boleh mengunduh laporan dosen mana pun;
 * dosen_pa hanya laporannya sendiri.
 */
export async function GET(req: NextRequest) {
  const caller = await requireRole(req, ['wadek1', 'admin', 'dosen_pa']);
  if (caller instanceof Response) return caller;

  const dosenNama = req.nextUrl.searchParams.get('dosen') || '';
  const periodeParam = req.nextUrl.searchParams.get('periodeId');

  try {
    const db = getAdminDb();

    // Resolve periode (param or the active non-locked one).
    let periodeId = periodeParam ?? '';
    let periodeLabel = '';
    const periodeSnap = await db.collection('periode').get();
    const periodes = periodeSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const target = periodeId
      ? periodes.find((p) => p.id === periodeId)
      : periodes.find((p) => p.status !== 'dikunci') ?? periodes[0];
    if (!target) return new Response('Periode tidak ditemukan', { status: 404 });
    periodeId = target.id;
    periodeLabel = `${target.tahunAkademik} — Semester ${target.semester === 'genap' ? 'Genap' : 'Ganjil'}`;

    // Submission → dosenUid + prodi.
    const subsSnap = await db
      .collection('submissions')
      .where('periodeId', '==', periodeId)
      .where('nama', '==', dosenNama)
      .limit(1)
      .get();
    if (subsSnap.empty) return new Response('Dosen tidak ditemukan pada periode ini', { status: 404 });
    const sub = subsSnap.docs[0].data() as any;

    // Dosen PA hanya boleh mengunduh laporannya sendiri — kecuali caller juga
    // punya peran admin/wadek1 (akun multi-role).
    const isPrivileged = caller.roles.includes('admin') || caller.roles.includes('wadek1');
    if (!isPrivileged && sub.dosenUid !== caller.uid) {
      return new Response('Dosen PA hanya dapat mengunduh laporan miliknya sendiri.', { status: 403 });
    }

    // Laporan + master join.
    const lapSnap = await db
      .collection('laporan')
      .where('periodeId', '==', periodeId)
      .where('dosenPaUid', '==', sub.dosenUid)
      .get();
    const npms = lapSnap.docs.map((d) => (d.data() as any).npm as string);
    const masterByNpm = new Map<string, any>();
    // Firestore getAll in chunks of 100 (well above demo size).
    for (let i = 0; i < npms.length; i += 100) {
      const refs = npms.slice(i, i + 100).map((npm) => db.doc(`mahasiswa/${npm}`));
      if (refs.length) {
        const docs = await db.getAll(...refs);
        docs.forEach((d) => d.exists && masterByNpm.set((d.data() as any).npm, d.data()));
      }
    }

    const rows: PdfLaporanRow[] = lapSnap.docs
      .map((d) => d.data() as any)
      .sort((a, b) => String(a.npm).localeCompare(String(b.npm)))
      .map((l) => {
        const m = masterByNpm.get(l.npm) ?? {};
        const org = [l.nonAkademik?.ukm && 'UKM', l.nonAkademik?.hima && 'HIMA', l.nonAkademik?.bem && 'BEM']
          .filter(Boolean)
          .join(', ');
        const bea = l.nonAkademik?.beasiswa?.ada ? l.nonAkademik.beasiswa.jenis ?? 'Ya' : '—';
        const pres = l.nonAkademik?.prestasi?.ada
          ? `${l.nonAkademik.prestasi.jenis ?? ''} (${l.nonAkademik.prestasi.tingkat ?? ''})`
          : '—';
        return {
          npm: String(l.npm),
          nama: m.nama ?? l.npm,
          semesterKe: l.semesterKe ?? 0,
          status: l.status ?? 'aktif',
          sksKrs: l.akademik?.sksKrs ?? null,
          ipKhs: l.akademik?.ipKhs ?? null,
          jumlahKonsultasi: l.akademik?.konsultasi?.length ?? 0,
          mkNilaiDE: l.akademik?.mkNilaiDE ?? [],
          organisasi: org || '—',
          beasiswa: bea,
          prestasi: pres,
          pkkmb: !!m.pkkmb,
          toefl: !!m.toefl,
          esq: !!m.esq,
          semkesCount: m.semkesCount ?? 0,
          permasalahan: l.permasalahan ?? '',
          rekomendasi: l.rekomendasi ?? '',
          organisasiBukti: l.nonAkademik?.organisasiBukti || undefined,
          beasiswaBukti: l.nonAkademik?.beasiswa?.bukti || undefined,
          prestasiBukti: l.nonAkademik?.prestasi?.bukti || undefined,
          pkkmbBukti: m.pkkmbBukti || undefined,
          toeflBukti: m.toeflBukti || undefined,
          esqBukti: m.esqBukti || undefined,
        };
      });

    // QR verifikasi + logo.
    const verifikasiKode = `SILAPA/${periodeId}/${sub.dosenUid}`.toUpperCase().slice(0, 48);
    const qrDataUrl = await QRCode.toDataURL(
      JSON.stringify({ sistem: 'SILAPA-FIKes', periode: periodeId, dosen: dosenNama, kode: verifikasiKode }),
      { margin: 1, width: 256 }
    );
    const logoBuf = readFileSync(resolve(process.cwd(), 'public/logo-uis-hd.png'));
    const logoDataUrl = `data:image/png;base64,${logoBuf.toString('base64')}`;

    const tanggal = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    const buf = await renderToBuffer(
      createElement(LaporanPdf, {
        data: {
          dosenNama,
          dosenProdi: sub.prodi ?? '—',
          periodeLabel,
          rows,
          qrDataUrl,
          verifikasiKode,
          logoDataUrl,
          tanggal,
        },
      }) as any
    );

    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Laporan_PA_${dosenNama.replace(/[^a-zA-Z0-9]+/g, '_')}_${periodeId}.pdf"`,
      },
    });
  } catch (e: any) {
    return new Response(`Gagal membuat PDF: ${e?.message ?? e}`, { status: 500 });
  }
}
