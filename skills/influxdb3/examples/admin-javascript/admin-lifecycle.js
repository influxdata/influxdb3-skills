// Admin lifecycle example for InfluxDB 3 Enterprise.
//
// Exercises a full token + database lifecycle (10 steps).
// Cleanup runs in a try/finally so partial failures don't orphan tokens or DBs.
//
// Targets Enterprise (uses /api/v3/enterprise/configure/token). For Core,
// change the resource-token create endpoint to /api/v3/configure/token.

import 'dotenv/config';

const host = process.env.INFLUXDB_HOST;
const adminToken = process.env.INFLUXDB_TOKEN;
if (!host || !adminToken) {
  throw new Error('INFLUXDB_HOST and INFLUXDB_TOKEN are required');
}

const ts = Math.floor(Date.now() / 1000);
const testDb = `admin_test_javascript_${ts}`;
const tokenA = `admin_test_javascript_token_${ts}_a`;
const tokenB = `admin_test_javascript_token_${ts}_b`;

const state = { db: null, tokenA: null, tokenB: null };
const adminHeaders = { Authorization: `Bearer ${adminToken}` };

async function listDbs() {
  const r = await fetch(`${host}/api/v3/configure/database?format=json`, { headers: adminHeaders });
  if (!r.ok) throw new Error(`list dbs: HTTP ${r.status}`);
  const data = await r.json();
  return data.map(row => row['iox::database']);
}

async function createDb(db) {
  const r = await fetch(`${host}/api/v3/configure/database`, {
    method: 'POST',
    headers: { ...adminHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ db }),
  });
  if (!r.ok) throw new Error(`create db ${db}: HTTP ${r.status}`);
}

async function deleteDb(db) {
  const r = await fetch(`${host}/api/v3/configure/database?db=${encodeURIComponent(db)}`, {
    method: 'DELETE',
    headers: adminHeaders,
  });
  if (![200, 204, 404].includes(r.status)) throw new Error(`delete db: HTTP ${r.status}`);
}

async function createScopedToken(name, db) {
  const r = await fetch(`${host}/api/v3/enterprise/configure/token`, {
    method: 'POST',
    headers: { ...adminHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'resource',
      token_name: name,
      permissions: [
        { resource_type: 'db', resource_names: [db], actions: ['read', 'write'] },
      ],
    }),
  });
  if (!r.ok) throw new Error(`create token ${name}: HTTP ${r.status}: ${await r.text()}`);
  const body = await r.json();
  if (!body.token) throw new Error('no token in response');
  return body.token;
}

async function deleteToken(name) {
  const r = await fetch(`${host}/api/v3/configure/token?token_name=${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: adminHeaders,
  });
  if (![200, 204, 404].includes(r.status)) throw new Error(`delete token: HTTP ${r.status}`);
}

async function querySql(db, q) {
  const r = await fetch(`${host}/api/v3/query_sql`, {
    method: 'POST',
    headers: { ...adminHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ db, q }),
  });
  if (!r.ok) throw new Error(`query: HTTP ${r.status}`);
  return await r.json();
}

async function writePoint(scopedToken, db, line) {
  const r = await fetch(`${host}/api/v3/write_lp?db=${encodeURIComponent(db)}&precision=second`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${scopedToken}` },
    body: line,
  });
  return r.status;
}

try {
  console.log('==> step 1: list databases');
  const dbs0 = await listDbs();
  console.log(`   ${dbs0.length} databases`);

  console.log(`==> step 2: create ${testDb}`);
  await createDb(testDb);
  state.db = testDb;

  console.log(`==> step 3: create scoped token A for ${testDb}`);
  const scopedA = await createScopedToken(tokenA, testDb);
  state.tokenA = tokenA;
  console.log(`  ok (secret captured, length ${scopedA.length})`);

  console.log('==> step 4: write a point with token A');
  const now = Math.floor(Date.now() / 1000);
  const sc1 = await writePoint(scopedA, testDb, `lifecycle_test,host=h1 value=1.0 ${now}`);
  console.log(`  HTTP ${sc1}`);
  if (![200, 204].includes(sc1)) throw new Error(`write returned ${sc1}`);

  console.log(`==> step 5: list tokens via SQL, find ${tokenA}`);
  const rows = await querySql('_internal', `SELECT name FROM system.tokens WHERE name = '${tokenA}'`);
  const matches = rows.filter(r => r.name === tokenA);
  console.log(`  found: ${matches.length}`);
  if (matches.length === 0) throw new Error('token A not found');

  console.log(`==> step 6: rotate — create scoped token B for ${testDb}`);
  const scopedB = await createScopedToken(tokenB, testDb);
  state.tokenB = tokenB;

  console.log('==> step 7: verify B, delete A');
  const sc2 = await writePoint(scopedB, testDb, `lifecycle_test,host=h1 value=2.0 ${now + 1}`);
  if (![200, 204].includes(sc2)) throw new Error(`write with B returned ${sc2}`);
  await deleteToken(tokenA);
  state.tokenA = null;

  console.log(`==> step 8: delete ${testDb}`);
  await deleteDb(testDb);
  state.db = null;

  console.log('==> step 9: delete token B');
  await deleteToken(tokenB);
  state.tokenB = null;

  console.log('==> step 10: orphan check');
  const dbsEnd = (await listDbs()).filter(d => d.startsWith('admin_test_javascript_'));
  const tksEnd = (await querySql('_internal', "SELECT name FROM system.tokens WHERE name LIKE 'admin_test_javascript_%'"))
    .map(r => r.name)
    .filter(n => n && n.startsWith('admin_test_javascript_'));
  console.log(`  database orphans: ${dbsEnd.length ? dbsEnd.join(',') : '<none>'}`);
  console.log(`  token orphans:    ${tksEnd.length ? tksEnd.join(',') : '<none>'}`);
  if (dbsEnd.length || tksEnd.length) throw new Error('orphans found');

  console.log('==> Done. Lifecycle completed cleanly.');
} finally {
  if (state.tokenA) await deleteToken(state.tokenA).catch(e => console.log(`  cleanup A: ${e}`));
  if (state.tokenB) await deleteToken(state.tokenB).catch(e => console.log(`  cleanup B: ${e}`));
  if (state.db) await deleteDb(state.db).catch(e => console.log(`  cleanup db: ${e}`));
}
