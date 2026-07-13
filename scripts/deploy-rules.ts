import { readFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';
const key = JSON.parse(readFileSync('./serviceAccountKey.json','utf8'));
const PROJECT = key.project_id;
const auth = new GoogleAuth({ keyFile: './serviceAccountKey.json', scopes: ['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase'] });
async function main() {
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const base = 'https://firebaserules.googleapis.com/v1';
  const rules = readFileSync('./firestore.rules','utf8');
  let res = await fetch(`${base}/projects/${PROJECT}/rulesets`, { method:'POST', headers:h, body: JSON.stringify({ source: { files: [{ name:'firestore.rules', content: rules }] } }) });
  const rs = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(rs));
  const releaseName = `projects/${PROJECT}/releases/cloud.firestore`;
  res = await fetch(`${base}/${releaseName}`, { method:'PATCH', headers:h, body: JSON.stringify({ release: { name: releaseName, rulesetName: rs.name } }) });
  const rel = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(rel));
  console.log('Rules deployed ✓', rs.name);
}
main().catch(e => { console.error(e); process.exit(1); });
