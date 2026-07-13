/**
 * One-time Firebase project bootstrap using the service-account key.
 * Idempotent — safe to re-run.
 *
 *  1. Ensures a Web App exists and writes its config to .env.local
 *  2. Ensures the (default) Firestore database exists (asia-southeast2 / Jakarta)
 *  3. Enables Email/Password sign-in
 *  4. Deploys firestore.rules
 *
 * Run:  npx tsx scripts/setup-firebase.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

const KEY_PATH = './serviceAccountKey.json';
const key = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
const PROJECT = key.project_id as string;

const auth = new GoogleAuth({
  keyFile: KEY_PATH,
  scopes: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/firebase',
  ],
});

async function api(
  method: string,
  url: string,
  body?: unknown
): Promise<{ status: number; json: any }> {
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json };
}

async function waitOperation(opName: string, base: string): Promise<any> {
  for (let i = 0; i < 60; i++) {
    const { json } = await api('GET', `${base}/${opName}`);
    if (json?.done) {
      if (json.error) throw new Error(`Operation failed: ${JSON.stringify(json.error)}`);
      return json.response;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Operation timed out: ${opName}`);
}

// ── 1. Web app + config ─────────────────────────────────────────────────
async function ensureWebApp(): Promise<void> {
  console.log('▶ [1/4] Web app config…');
  const base = 'https://firebase.googleapis.com/v1beta1';
  const list = await api('GET', `${base}/projects/${PROJECT}/webApps`);
  let appId: string | undefined = list.json?.apps?.[0]?.appId;

  if (!appId) {
    console.log('   No web app found — creating one…');
    const create = await api('POST', `${base}/projects/${PROJECT}/webApps`, {
      displayName: 'SILAPA-FIKes Web',
    });
    if (create.status >= 400) throw new Error(`Create web app failed: ${JSON.stringify(create.json)}`);
    const op = create.json.name as string; // operations/...
    const resp = await waitOperation(op, base);
    appId = resp?.appId;
    console.log(`   Created web app ${appId}`);
  } else {
    console.log(`   Found web app ${appId}`);
  }

  const cfg = await api('GET', `${base}/projects/${PROJECT}/webApps/${appId}/config`);
  if (cfg.status >= 400) throw new Error(`Get config failed: ${JSON.stringify(cfg.json)}`);
  const c = cfg.json;

  const env = [
    `NEXT_PUBLIC_FIREBASE_API_KEY=${c.apiKey ?? ''}`,
    `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${c.authDomain ?? `${PROJECT}.firebaseapp.com`}`,
    `NEXT_PUBLIC_FIREBASE_PROJECT_ID=${c.projectId ?? PROJECT}`,
    `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${c.storageBucket ?? ''}`,
    `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${c.messagingSenderId ?? ''}`,
    `NEXT_PUBLIC_FIREBASE_APP_ID=${c.appId ?? appId}`,
    ``,
    `GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json`,
    ``,
  ].join('\n');
  writeFileSync('.env.local', env);
  console.log('   .env.local written ✓');
}

// ── 2. Firestore database ───────────────────────────────────────────────
async function ensureFirestore(): Promise<void> {
  console.log('▶ [2/4] Firestore database…');
  const base = 'https://firestore.googleapis.com/v1';
  const get = await api('GET', `${base}/projects/${PROJECT}/databases/(default)`);
  if (get.status === 200) {
    console.log(`   (default) exists in ${get.json.locationId} ✓`);
    return;
  }
  console.log('   Creating (default) in asia-southeast2 (Jakarta)…');
  const create = await api(
    'POST',
    `${base}/projects/${PROJECT}/databases?databaseId=(default)`,
    { type: 'FIRESTORE_NATIVE', locationId: 'asia-southeast2' }
  );
  if (create.status >= 400) throw new Error(`Create DB failed: ${JSON.stringify(create.json)}`);
  await waitOperation(create.json.name, base);
  console.log('   Firestore created ✓');
}

// ── 3. Email/password sign-in ───────────────────────────────────────────
async function enableEmailAuth(): Promise<void> {
  console.log('▶ [3/4] Email/password sign-in…');
  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired`;
  const res = await api('PATCH', url, {
    signIn: { email: { enabled: true, passwordRequired: true } },
  });
  if (res.status >= 400) {
    // Auth may not be initialized yet; initialize via identitytoolkit v2.
    if (res.json?.error?.status === 'NOT_FOUND' || res.json?.error?.code === 404) {
      console.log('   Initializing Identity Platform config…');
      const init = await api(
        'POST',
        `https://identitytoolkit.googleapis.com/v2/projects/${PROJECT}/identityPlatform:initializeAuth`,
        {}
      );
      if (init.status >= 400) throw new Error(`initializeAuth failed: ${JSON.stringify(init.json)}`);
      const retry = await api('PATCH', url, {
        signIn: { email: { enabled: true, passwordRequired: true } },
      });
      if (retry.status >= 400) throw new Error(`Enable email auth failed: ${JSON.stringify(retry.json)}`);
    } else {
      throw new Error(`Enable email auth failed: ${JSON.stringify(res.json)}`);
    }
  }
  console.log('   Email/password enabled ✓');
}

// ── 4. Security rules ───────────────────────────────────────────────────
async function deployRules(): Promise<void> {
  console.log('▶ [4/4] Deploying firestore.rules…');
  const rules = readFileSync('./firestore.rules', 'utf8');
  const base = 'https://firebaserules.googleapis.com/v1';

  const ruleset = await api('POST', `${base}/projects/${PROJECT}/rulesets`, {
    source: { files: [{ name: 'firestore.rules', content: rules }] },
  });
  if (ruleset.status >= 400) throw new Error(`Ruleset failed: ${JSON.stringify(ruleset.json)}`);
  const rulesetName = ruleset.json.name as string;

  const releaseName = `projects/${PROJECT}/releases/cloud.firestore`;
  const patch = await api('PATCH', `${base}/${releaseName}`, {
    release: { name: releaseName, rulesetName },
  });
  if (patch.status === 404) {
    const create = await api('POST', `${base}/projects/${PROJECT}/releases`, {
      name: releaseName,
      rulesetName,
    });
    if (create.status >= 400) throw new Error(`Release failed: ${JSON.stringify(create.json)}`);
  } else if (patch.status >= 400) {
    throw new Error(`Release patch failed: ${JSON.stringify(patch.json)}`);
  }
  console.log('   Rules deployed ✓');
}

async function main() {
  console.log(`Bootstrapping Firebase project "${PROJECT}"…\n`);
  await ensureWebApp();
  await ensureFirestore();
  await enableEmailAuth();
  await deployRules();
  console.log('\n✅ Firebase bootstrap complete. Next: npm run seed');
}

main().catch((e) => {
  console.error('\n❌ Bootstrap failed:', e.message ?? e);
  process.exit(1);
});
