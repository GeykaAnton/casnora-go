const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DEFAULT_ACCOUNTS = [
  {
    id: 'pm-1',
    bank: 'Banco Mercantil',
    phone: '0414-0000001',
    docId: 'V-12345678',
    holder: 'Administración',
    uses: 0,
  },
  {
    id: 'pm-2',
    bank: 'Banco de Venezuela',
    phone: '0412-0000002',
    docId: 'V-12345678',
    holder: 'Administración',
    uses: 0,
  },
];

const usePostgres = Boolean(process.env.DATABASE_URL);
let pool = null;

const DATA_DIR = path.join(__dirname, '..', 'data');
const JSON_DB_PATH = path.join(DATA_DIR, 'db.json');

function readJsonDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(JSON_DB_PATH)) {
    const initial = {
      tenants: [],
      accounts: structuredClone(DEFAULT_ACCOUNTS),
      payments: [],
      activeAccountId: DEFAULT_ACCOUNTS[0].id,
      lastRate: '',
    };
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  return JSON.parse(fs.readFileSync(JSON_DB_PATH, 'utf8'));
}

function writeJsonDb(data) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(JSON_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

async function initDb() {
  if (!usePostgres) {
    readJsonDb();
    console.log('Modo local: usando almacenamiento JSON en backend/data/db.json');
    return;
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      room TEXT NOT NULL,
      due_day INTEGER NOT NULL,
      rent_usd NUMERIC(12, 2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      bank TEXT NOT NULL,
      phone TEXT NOT NULL,
      doc_id TEXT NOT NULL,
      holder TEXT DEFAULT '',
      uses INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      month_key TEXT NOT NULL,
      usd NUMERIC(12, 2) DEFAULT 0,
      bs NUMERIC(14, 2) DEFAULT 0,
      rate NUMERIC(12, 4) DEFAULT 0,
      account_id TEXT,
      account_label TEXT,
      note TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const { rows: accRows } = await pool.query('SELECT COUNT(*)::int AS count FROM accounts');
  if (accRows[0].count === 0) {
    for (const acc of DEFAULT_ACCOUNTS) {
      await pool.query(
        'INSERT INTO accounts (id, bank, phone, doc_id, holder, uses) VALUES ($1, $2, $3, $4, $5, $6)',
        [acc.id, acc.bank, acc.phone, acc.docId, acc.holder, acc.uses]
      );
    }
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ('activeAccountId', $1) ON CONFLICT (key) DO NOTHING",
      [DEFAULT_ACCOUNTS[0].id]
    );
  }

  console.log('Conectado a PostgreSQL (Railway)');
}

async function getFullState() {
  if (!usePostgres) {
    return readJsonDb();
  }

  const [tenantsRes, accountsRes, paymentsRes, settingsRes] = await Promise.all([
    pool.query('SELECT id, name, room, due_day AS "dueDay", rent_usd::float AS "rentUsd" FROM tenants ORDER BY due_day ASC, created_at ASC'),
    pool.query('SELECT id, bank, phone, doc_id AS "docId", holder, uses FROM accounts ORDER BY created_at ASC'),
    pool.query('SELECT id, tenant_id AS "tenantId", month_key AS "monthKey", usd::float AS usd, bs::float AS bs, rate::float AS rate, account_id AS "accountId", account_label AS "accountLabel", note, created_at AS "createdAt" FROM payments ORDER BY created_at ASC'),
    pool.query('SELECT key, value FROM settings'),
  ]);

  const settingsMap = Object.fromEntries(settingsRes.rows.map((r) => [r.key, r.value]));
  return {
    tenants: tenantsRes.rows,
    accounts: accountsRes.rows,
    payments: paymentsRes.rows,
    activeAccountId: settingsMap.activeAccountId || accountsRes.rows[0]?.id || null,
    lastRate: settingsMap.lastRate || '',
  };
}

async function createTenant(tenant) {
  if (!usePostgres) {
    const db = readJsonDb();
    db.tenants.push(tenant);
    writeJsonDb(db);
    return tenant;
  }

  await pool.query(
    'INSERT INTO tenants (id, name, room, due_day, rent_usd) VALUES ($1, $2, $3, $4, $5)',
    [tenant.id, tenant.name, tenant.room, tenant.dueDay, tenant.rentUsd || 0]
  );
  return tenant;
}

async function updateTenant(id, updates) {
  if (!usePostgres) {
    const db = readJsonDb();
    const idx = db.tenants.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    db.tenants[idx] = { ...db.tenants[idx], ...updates };
    writeJsonDb(db);
    return db.tenants[idx];
  }

  const res = await pool.query(
    'UPDATE tenants SET name = $1, room = $2, due_day = $3, rent_usd = $4 WHERE id = $5 RETURNING id, name, room, due_day AS "dueDay", rent_usd::float AS "rentUsd"',
    [updates.name, updates.room, updates.dueDay, updates.rentUsd || 0, id]
  );
  return res.rows[0] || null;
}

async function deleteTenant(id) {
  if (!usePostgres) {
    const db = readJsonDb();
    db.tenants = db.tenants.filter((t) => t.id !== id);
    db.payments = db.payments.filter((p) => p.tenantId !== id);
    writeJsonDb(db);
    return true;
  }

  await pool.query('DELETE FROM tenants WHERE id = $1', [id]);
  return true;
}

async function createPayment(payment) {
  if (!usePostgres) {
    const db = readJsonDb();
    db.payments.push(payment);
    if (payment.rate > 0) {
      db.lastRate = String(payment.rate);
    }
    if (payment.accountId && payment.accountId !== 'efectivo') {
      const acc = db.accounts.find((a) => a.id === payment.accountId);
      if (acc) acc.uses = (Number(acc.uses) || 0) + 1;
    }
    writeJsonDb(db);
    return payment;
  }

  await pool.query(
    'INSERT INTO payments (id, tenant_id, month_key, usd, bs, rate, account_id, account_label, note, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
    [
      payment.id,
      payment.tenantId,
      payment.monthKey,
      payment.usd || 0,
      payment.bs || 0,
      payment.rate || 0,
      payment.accountId || null,
      payment.accountLabel || '',
      payment.note || '',
      payment.createdAt,
    ]
  );

  if (payment.rate > 0) {
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ('lastRate', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [String(payment.rate)]
    );
  }

  if (payment.accountId && payment.accountId !== 'efectivo') {
    await pool.query('UPDATE accounts SET uses = uses + 1 WHERE id = $1', [payment.accountId]);
  }

  return payment;
}

async function deleteTenantMonthPayments(tenantId, monthKey) {
  if (!usePostgres) {
    const db = readJsonDb();
    db.payments = db.payments.filter(
      (p) => !(p.tenantId === tenantId && p.monthKey === monthKey)
    );
    writeJsonDb(db);
    return true;
  }

  await pool.query('DELETE FROM payments WHERE tenant_id = $1 AND month_key = $2', [
    tenantId,
    monthKey,
  ]);
  return true;
}

async function createAccount(account) {
  if (!usePostgres) {
    const db = readJsonDb();
    db.accounts.push(account);
    if (!db.activeAccountId) db.activeAccountId = account.id;
    writeJsonDb(db);
    return account;
  }

  await pool.query(
    'INSERT INTO accounts (id, bank, phone, doc_id, holder, uses) VALUES ($1, $2, $3, $4, $5, $6)',
    [account.id, account.bank, account.phone, account.docId, account.holder || '', 0]
  );
  return account;
}

async function deleteAccount(id) {
  if (!usePostgres) {
    const db = readJsonDb();
    if (db.accounts.length <= 1) return { error: 'MIN_ONE' };
    db.accounts = db.accounts.filter((a) => a.id !== id);
    if (db.activeAccountId === id) {
      db.activeAccountId = db.accounts[0]?.id || null;
    }
    writeJsonDb(db);
    return { ok: true };
  }

  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM accounts');
  if (rows[0].count <= 1) return { error: 'MIN_ONE' };

  await pool.query('DELETE FROM accounts WHERE id = $1', [id]);
  const { rows: remaining } = await pool.query('SELECT id FROM accounts ORDER BY created_at ASC LIMIT 1');
  if (remaining[0]) {
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ('activeAccountId', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [remaining[0].id]
    );
  }
  return { ok: true };
}

async function setActiveAccount(accountId) {
  if (!usePostgres) {
    const db = readJsonDb();
    db.activeAccountId = accountId;
    writeJsonDb(db);
    return accountId;
  }

  await pool.query(
    "INSERT INTO settings (key, value) VALUES ('activeAccountId', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [accountId]
  );
  return accountId;
}

module.exports = {
  initDb,
  getFullState,
  createTenant,
  updateTenant,
  deleteTenant,
  createPayment,
  deleteTenantMonthPayments,
  createAccount,
  deleteAccount,
  setActiveAccount,
  usePostgres,
};
