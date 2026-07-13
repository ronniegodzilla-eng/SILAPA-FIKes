import * as XLSX from 'xlsx';

/** NPM must be an unbroken digit string — scientific notation ("2.21E+11") fails. */
export const NPM_RE = /^\d{8,}$/;

export function normKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * Parse the first sheet of an .xlsx/.csv file into rows keyed by normalized
 * header. raw:false keeps every value as its FORMATTED TEXT, so an Excel
 * number-mangled NPM surfaces as "2.21013E+11" and gets caught by validation
 * instead of silently committing a corrupted ID (PRD masalah #2).
 */
export async function parseSheetFile(file: File): Promise<Record<string, string>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
  return raw.map((r) => {
    const o: Record<string, string> = {};
    Object.keys(r).forEach((k) => (o[normKey(k)] = String(r[k]).trim()));
    return o;
  });
}

/** Build a downloadable data-URI CSV listing failed rows. */
export function failedRowsCsv(rows: { npm: string; nama: string; msg: string }[]): string {
  const header = 'npm,nama,alasan_gagal';
  const body = rows.map(
    (r) => `${r.npm.replace(/,/g, ' ')},${r.nama.replace(/,/g, ' ')},${r.msg.replace(/,/g, ';')}`
  );
  return 'data:text/csv;charset=utf-8,' + encodeURIComponent([header, ...body].join('\n'));
}
