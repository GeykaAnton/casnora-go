require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

app.use(
  cors({
    origin: CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(',').map((s) => s.trim()),
  })
);
app.use(express.json());

function generateId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'casnoraGo-backend',
    storage: db.usePostgres ? 'postgresql' : 'local-json',
  });
});

app.get('/api/state', async (_req, res) => {
  try {
    const state = await db.getFullState();
    res.json(state);
  } catch (err) {
    console.error('Error en GET /api/state:', err);
    res.status(500).json({ error: 'Error obteniendo los datos' });
  }
});

app.post('/api/tenants', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const room = String(req.body.room || '').trim();
    const dueDay = Math.min(31, Math.max(1, parseInt(req.body.dueDay, 10) || 1));
    const rentVal = parseFloat(req.body.rentUsd);
    const rentUsd = Number.isFinite(rentVal) && rentVal > 0 ? rentVal : 0;

    if (!name || !room) {
      return res.status(400).json({ error: 'Nombre y habitación son obligatorios' });
    }

    const tenant = await db.createTenant({
      id: generateId('inq'),
      name,
      room,
      dueDay,
      rentUsd,
    });
    res.status(201).json(tenant);
  } catch (err) {
    console.error('Error en POST /api/tenants:', err);
    res.status(500).json({ error: 'No se pudo crear el inquilino' });
  }
});

app.put('/api/tenants/:id', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const room = String(req.body.room || '').trim();
    const dueDay = Math.min(31, Math.max(1, parseInt(req.body.dueDay, 10) || 1));
    const rentVal = parseFloat(req.body.rentUsd);
    const rentUsd = Number.isFinite(rentVal) && rentVal > 0 ? rentVal : 0;

    if (!name || !room) {
      return res.status(400).json({ error: 'Nombre y habitación son obligatorios' });
    }

    const updated = await db.updateTenant(req.params.id, { name, room, dueDay, rentUsd });
    if (!updated) {
      return res.status(404).json({ error: 'Inquilino no encontrado' });
    }
    res.json(updated);
  } catch (err) {
    console.error('Error en PUT /api/tenants/:id:', err);
    res.status(500).json({ error: 'No se pudo actualizar el inquilino' });
  }
});

app.delete('/api/tenants/:id', async (req, res) => {
  try {
    await db.deleteTenant(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /api/tenants/:id:', err);
    res.status(500).json({ error: 'No se pudo eliminar el inquilino' });
  }
});

app.post('/api/payments', async (req, res) => {
  try {
    const { tenantId, monthKey, accountId, accountLabel, note } = req.body;
    const usd = parseFloat(req.body.usd) || 0;
    const bs = parseFloat(req.body.bs) || 0;
    const rate = parseFloat(req.body.rate) || 0;

    if (!tenantId || !monthKey || (usd <= 0 && bs <= 0)) {
      return res.status(400).json({ error: 'Datos de pago inválidos' });
    }

    const payment = await db.createPayment({
      id: generateId('pag'),
      tenantId,
      monthKey,
      usd,
      bs,
      rate,
      accountId: accountId || null,
      accountLabel: String(accountLabel || ''),
      note: String(note || '').trim(),
      createdAt: new Date().toISOString(),
    });
    res.status(201).json(payment);
  } catch (err) {
    console.error('Error en POST /api/payments:', err);
    res.status(500).json({ error: 'No se pudo registrar el pago' });
  }
});

app.delete('/api/payments/tenant/:tenantId/month/:monthKey', async (req, res) => {
  try {
    await db.deleteTenantMonthPayments(req.params.tenantId, req.params.monthKey);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /api/payments:', err);
    res.status(500).json({ error: 'No se pudieron anular los pagos' });
  }
});

app.post('/api/accounts', async (req, res) => {
  try {
    const bank = String(req.body.bank || '').trim();
    const phone = String(req.body.phone || '').trim();
    const docId = String(req.body.docId || '').trim();
    const holder = String(req.body.holder || '').trim();

    if (!bank || !phone || !docId) {
      return res.status(400).json({ error: 'Banco, teléfono y cédula/RIF son obligatorios' });
    }

    const account = await db.createAccount({
      id: generateId('pm'),
      bank,
      phone,
      docId,
      holder,
      uses: 0,
    });
    res.status(201).json(account);
  } catch (err) {
    console.error('Error en POST /api/accounts:', err);
    res.status(500).json({ error: 'No se pudo agregar la cuenta' });
  }
});

app.delete('/api/accounts/:id', async (req, res) => {
  try {
    const result = await db.deleteAccount(req.params.id);
    if (result.error === 'MIN_ONE') {
      return res.status(400).json({ error: 'Debes mantener al menos una cuenta Pago Móvil' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /api/accounts/:id:', err);
    res.status(500).json({ error: 'No se pudo eliminar la cuenta' });
  }
});

app.put('/api/accounts/active', async (req, res) => {
  try {
    const { accountId } = req.body;
    if (!accountId) {
      return res.status(400).json({ error: 'accountId es obligatorio' });
    }
    await db.setActiveAccount(accountId);
    res.json({ ok: true, activeAccountId: accountId });
  } catch (err) {
    console.error('Error en PUT /api/accounts/active:', err);
    res.status(500).json({ error: 'No se pudo actualizar la cuenta activa' });
  }
});

db.initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`casnoraGo backend escuchando en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Error fatal al iniciar base de datos:', err);
    process.exit(1);
  });
