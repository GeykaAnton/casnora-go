(() => {
  'use strict';

  const STORAGE_KEY = 'controlPensionApp_v1';

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

  let state = loadState();
  let currentFilter = 'todos';
  let searchTerm = '';
  let toastTimer = null;

  // ==============================
  // PERSISTENCIA EN LOCALSTORAGE
  // ==============================
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          tenants: Array.isArray(parsed.tenants) ? parsed.tenants : [],
          accounts: Array.isArray(parsed.accounts) && parsed.accounts.length > 0
            ? parsed.accounts
            : structuredClone(DEFAULT_ACCOUNTS),
          payments: Array.isArray(parsed.payments) ? parsed.payments : [],
          activeAccountId: parsed.activeAccountId || 'pm-1',
          lastRate: parsed.lastRate || '',
        };
      }
    } catch (err) {
      console.error('Error leyendo localStorage:', err);
    }

    return {
      tenants: [],
      accounts: structuredClone(DEFAULT_ACCOUNTS),
      payments: [],
      activeAccountId: DEFAULT_ACCOUNTS[0].id,
      lastRate: '',
    };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      showToast('No se pudo guardar en el navegador', 'error');
    }
  }

  // ==============================
  // UTILIDADES DE FECHA Y FORMATO
  // ==============================
  function getCurrentMonthKey() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  function getCurrentMonthLabel() {
    return new Intl.DateTimeFormat('es-VE', {
      month: 'long',
      year: 'numeric',
    }).format(new Date());
  }

  function formatUsd(amount) {
    const num = Number(amount) || 0;
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatBs(amount) {
    const num = Number(amount) || 0;
    return `Bs. ${num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function escapeHtml(text) {
    return String(text ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function generateId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function getEffectiveDueDay(dueDay) {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Math.min(Math.max(1, Number(dueDay) || 1), daysInMonth);
  }

  function getTenantMonthPayments(tenantId) {
    const monthKey = getCurrentMonthKey();
    return state.payments.filter(
      (p) => p.tenantId === tenantId && p.monthKey === monthKey
    );
  }

  function getTenantStatus(tenant) {
    const monthPayments = getTenantMonthPayments(tenant.id);
    if (monthPayments.length > 0) {
      return 'pagado';
    }
    const todayDay = new Date().getDate();
    const effectiveDue = getEffectiveDueDay(tenant.dueDay);
    return todayDay > effectiveDue ? 'atrasado' : 'pendiente';
  }

  function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const colors = {
      success: 'bg-emerald-600',
      error: 'bg-red-600',
      info: 'bg-slate-800',
    };
    toast.className = `fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-6 py-3.5 rounded-2xl shadow-xl font-bold text-lg text-white ${colors[type] || colors.info}`;
    toast.textContent = message;
    toast.classList.remove('hidden');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 3000);
  }

  // ==============================
  // RENDERIZADO PRINCIPAL
  // ==============================
  function renderAll() {
    document.getElementById('currentMonthLabel').textContent = getCurrentMonthLabel();
    renderSummary();
    renderPagoMovilSection();
    renderFilterButtons();
    renderTenantsList();
  }

  function renderSummary() {
    const monthKey = getCurrentMonthKey();
    const monthPayments = state.payments.filter((p) => p.monthKey === monthKey);

    const totalUsd = monthPayments.reduce((sum, p) => sum + (Number(p.usd) || 0), 0);
    const totalBs = monthPayments.reduce((sum, p) => sum + (Number(p.bs) || 0), 0);

    const totalTenants = state.tenants.length;
    const pendingCount = state.tenants.filter((t) => getTenantStatus(t) !== 'pagado').length;

    document.getElementById('totalUsdEl').textContent = formatUsd(totalUsd);
    document.getElementById('totalBsEl').textContent = formatBs(totalBs);
    document.getElementById('pendingCountEl').textContent = pendingCount;
    document.getElementById('pendingSubtextEl').textContent =
      totalTenants === 1
        ? 'De 1 inquilino registrado'
        : `De ${totalTenants} inquilinos registrados`;

    const card = document.getElementById('pendingSummaryCard');
    const title = document.getElementById('pendingSummaryTitle');
    const countEl = document.getElementById('pendingCountEl');
    const subtext = document.getElementById('pendingSubtextEl');
    const icon = document.getElementById('pendingSummaryIcon');

    if (totalTenants > 0 && pendingCount === 0) {
      card.className = 'bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-5 shadow-sm transition-colors';
      title.className = 'text-base font-bold text-emerald-900 uppercase tracking-wide';
      countEl.className = 'text-3xl sm:text-4xl font-extrabold text-emerald-700 mt-2';
      subtext.className = 'text-sm text-emerald-800 mt-1 font-medium';
      icon.textContent = '🎉';
    } else {
      card.className = 'bg-red-50 border-2 border-red-300 rounded-2xl p-5 shadow-sm transition-colors';
      title.className = 'text-base font-bold text-red-900 uppercase tracking-wide';
      countEl.className = 'text-3xl sm:text-4xl font-extrabold text-red-700 mt-2';
      subtext.className = 'text-sm text-red-800 mt-1 font-medium';
      icon.textContent = '⏳';
    }
  }

  function getActiveAccount() {
    return state.accounts.find((a) => a.id === state.activeAccountId) || state.accounts[0] || null;
  }

  function renderPagoMovilSection() {
    const active = getActiveAccount();
    const box = document.getElementById('activePagoMovilBox');
    const badge = document.getElementById('pmUsageBadge');
    const quickSelect = document.getElementById('pmQuickSelect');

    if (!active) {
      badge.textContent = 'Sin cuentas';
      box.innerHTML = `
        <p class="text-lg text-slate-600 font-medium">
          No hay cuentas Pago Móvil registradas. Presiona <strong>"Mis Pago Móvil"</strong> para agregar una.
        </p>
      `;
      quickSelect.innerHTML = '<option value="">Sin cuentas</option>';
      return;
    }

    state.activeAccountId = active.id;
    const uses = Number(active.uses) || 0;
    badge.textContent = uses === 1 ? 'Usada 1 vez' : `Usada ${uses} veces`;

    box.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border-2 border-slate-200 rounded-xl p-4">
        <div class="space-y-1">
          <p class="text-xl sm:text-2xl font-extrabold text-slate-900">${escapeHtml(active.bank)}</p>
          <p class="text-lg font-bold text-blue-700">
            📞 ${escapeHtml(active.phone)} &nbsp;|&nbsp; 🪪 ${escapeHtml(active.docId)}
          </p>
          ${active.holder ? `<p class="text-base text-slate-600 font-medium">Titular: ${escapeHtml(active.holder)}</p>` : ''}
        </div>
        <button
          type="button"
          id="btnCopyActivePM"
          class="tap-target px-4 py-2.5 rounded-xl bg-white hover:bg-blue-50 text-blue-700 border-2 border-blue-300 font-bold text-base shadow-sm cursor-pointer shrink-0"
        >
          📋 Copiar datos
        </button>
      </div>
    `;

    document.getElementById('btnCopyActivePM').addEventListener('click', () => {
      const text = `Pago Móvil:\nBanco: ${active.bank}\nTeléfono: ${active.phone}\nCédula: ${active.docId}`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => showToast('Datos de Pago Móvil copiados', 'success'))
          .catch(() => showToast('No se pudo copiar automáticamente', 'error'));
      } else {
        showToast(`${active.bank} - ${active.phone} - ${active.docId}`, 'info');
      }
    });

    quickSelect.innerHTML = state.accounts
      .map(
        (acc) =>
          `<option value="${escapeHtml(acc.id)}" ${acc.id === active.id ? 'selected' : ''}>
            ${escapeHtml(acc.bank)} (${escapeHtml(acc.phone)}) — ${acc.uses || 0} usos
          </option>`
      )
      .join('');
  }

  function renderFilterButtons() {
    document.querySelectorAll('.filter-btn').forEach((btn) => {
      const isSelected = btn.dataset.filter === currentFilter;
      if (isSelected) {
        btn.className = 'filter-btn tap-target px-4 py-2.5 rounded-xl font-bold text-base border-2 border-blue-600 bg-blue-600 text-white transition cursor-pointer';
      } else {
        btn.className = 'filter-btn tap-target px-4 py-2.5 rounded-xl font-bold text-base border-2 border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition cursor-pointer';
      }
    });
  }

  function renderTenantsList() {
    const container = document.getElementById('tenantsList');
    const query = searchTerm.trim().toLowerCase();

    const filtered = state.tenants
      .filter((tenant) => {
        const matchesQuery =
          !query ||
          tenant.name.toLowerCase().includes(query) ||
          tenant.room.toLowerCase().includes(query);

        if (!matchesQuery) return false;

        const status = getTenantStatus(tenant);
        if (currentFilter === 'pendientes') return status !== 'pagado';
        if (currentFilter === 'pagado') return status === 'pagado';
        return true;
      })
      .sort((a, b) => Number(a.dueDay) - Number(b.dueDay));

    if (state.tenants.length === 0) {
      container.innerHTML = `
        <div class="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-3">
          <p class="text-4xl" aria-hidden="true">🏠</p>
          <h3 class="text-2xl font-extrabold text-slate-800">Aún no hay inquilinos registrados</h3>
          <p class="text-lg text-slate-600 max-w-md mx-auto">
            Presiona el botón azul <strong>"➕ Nuevo Inquilino"</strong> arriba para agregar a tu primer inquilino y su día de pago.
          </p>
        </div>
      `;
      return;
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="bg-white border-2 border-slate-200 rounded-2xl p-8 text-center">
          <p class="text-xl font-bold text-slate-700">No se encontraron inquilinos con ese filtro o búsqueda.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered
      .map((tenant) => {
        const status = getTenantStatus(tenant);
        const monthPayments = getTenantMonthPayments(tenant.id);
        const totalPaidUsd = monthPayments.reduce((s, p) => s + (Number(p.usd) || 0), 0);
        const totalPaidBs = monthPayments.reduce((s, p) => s + (Number(p.bs) || 0), 0);

        let badgeHtml = '';
        let cardBorder = 'border-slate-200';
        if (status === 'pagado') {
          badgeHtml = `<span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold text-base">✅ Pagado</span>`;
          cardBorder = 'border-emerald-300';
        } else if (status === 'atrasado') {
          badgeHtml = `<span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-red-100 text-red-800 border border-red-300 font-extrabold text-base">⚠️ Atrasado</span>`;
          cardBorder = 'border-red-300';
        } else {
          badgeHtml = `<span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-base">⏳ Pendiente</span>`;
          cardBorder = 'border-amber-300';
        }

        const lastPayment = monthPayments[monthPayments.length - 1];
        const paymentDetailHtml =
          monthPayments.length > 0
            ? `
              <div class="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-base text-emerald-900 space-y-1">
                <p class="font-bold">
                  Pagado este mes:
                  ${totalPaidUsd > 0 ? `<span class="text-emerald-800">${formatUsd(totalPaidUsd)}</span>` : ''}
                  ${totalPaidUsd > 0 && totalPaidBs > 0 ? ' + ' : ''}
                  ${totalPaidBs > 0 ? `<span class="text-blue-800">${formatBs(totalPaidBs)}</span>` : ''}
                </p>
                ${lastPayment?.accountLabel ? `<p class="text-sm font-semibold text-slate-700">Cuenta: ${escapeHtml(lastPayment.accountLabel)}</p>` : ''}
                ${lastPayment?.note ? `<p class="text-sm text-slate-600">Nota: ${escapeHtml(lastPayment.note)}</p>` : ''}
              </div>
            `
            : '';

        return `
          <article class="bg-white border-2 ${cardBorder} rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="space-y-1.5 flex-1">
              <div class="flex flex-wrap items-center gap-3">
                <h3 class="text-2xl font-extrabold text-slate-900">${escapeHtml(tenant.name)}</h3>
                ${badgeHtml}
              </div>

              <div class="flex flex-wrap items-center gap-x-5 gap-y-1 text-lg text-slate-700 font-semibold">
                <span>🚪 ${escapeHtml(tenant.room)}</span>
                <span>📅 Día de pago: <strong class="text-slate-900">${escapeHtml(tenant.dueDay)}</strong> de cada mes</span>
                ${tenant.rentUsd ? `<span>💵 Canon: <strong class="text-slate-900">${formatUsd(tenant.rentUsd)}</strong></span>` : ''}
              </div>

              ${paymentDetailHtml}
            </div>

            <div class="flex flex-wrap sm:flex-nowrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                data-action="pay"
                data-id="${escapeHtml(tenant.id)}"
                class="tap-target flex-1 sm:flex-none px-5 py-3 rounded-xl ${
                  status === 'pagado'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                } text-white font-bold text-lg shadow-sm cursor-pointer"
              >
                ${status === 'pagado' ? '➕ Otro Abono' : '💵 Registrar Pago'}
              </button>

              ${
                monthPayments.length > 0
                  ? `<button
                      type="button"
                      data-action="undo-pay"
                      data-id="${escapeHtml(tenant.id)}"
                      class="tap-target px-4 py-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border-2 border-red-200 font-bold text-base cursor-pointer"
                      title="Anular pagos de este mes"
                    >
                      ↩️ Anular
                    </button>`
                  : ''
              }

              <button
                type="button"
                data-action="edit"
                data-id="${escapeHtml(tenant.id)}"
                class="tap-target px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-base cursor-pointer"
                aria-label="Editar inquilino ${escapeHtml(tenant.name)}"
              >
                ✏️ Editar
              </button>

              <button
                type="button"
                data-action="delete"
                data-id="${escapeHtml(tenant.id)}"
                class="tap-target px-4 py-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-bold text-base cursor-pointer"
                aria-label="Eliminar inquilino ${escapeHtml(tenant.name)}"
              >
                🗑️
              </button>
            </div>
          </article>
        `;
      })
      .join('');
  }

  // ==============================
  // SORTEO EQUITATIVO DE PAGO MÓVIL
  // ==============================
  function sortearPagoMovil() {
    if (state.accounts.length === 0) {
      showToast('Primero agrega una cuenta en "Mis Pago Móvil"', 'error');
      return;
    }

    const dice = document.getElementById('diceIcon');
    dice.classList.add('rolling');

    setTimeout(() => {
      dice.classList.remove('rolling');

      if (state.accounts.length === 1) {
        state.activeAccountId = state.accounts[0].id;
        saveState();
        renderPagoMovilSection();
        showToast(`Cuenta seleccionada: ${state.accounts[0].bank}`, 'info');
        return;
      }

      const minUses = Math.min(...state.accounts.map((a) => Number(a.uses) || 0));
      let candidates = state.accounts.filter((a) => (Number(a.uses) || 0) === minUses);

      if (candidates.length > 1) {
        const withoutCurrent = candidates.filter((a) => a.id !== state.activeAccountId);
        if (withoutCurrent.length > 0) {
          candidates = withoutCurrent;
        }
      }

      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      state.activeAccountId = chosen.id;
      saveState();
      renderPagoMovilSection();
      showToast(`Sugerida: ${chosen.bank} (${chosen.phone})`, 'success');
    }, 350);
  }

  // ==============================
  // MODALES DE INQUILINO
  // ==============================
  function openTenantModal(tenantId = null) {
    const modal = document.getElementById('tenantModal');
    const title = document.getElementById('tenantModalTitle');
    const idInput = document.getElementById('tenantIdInput');
    const nameInput = document.getElementById('tenantNameInput');
    const roomInput = document.getElementById('tenantRoomInput');
    const dayInput = document.getElementById('tenantDayInput');
    const rentInput = document.getElementById('tenantRentInput');

    if (tenantId) {
      const tenant = state.tenants.find((t) => t.id === tenantId);
      if (!tenant) return;
      title.textContent = 'Editar Inquilino';
      idInput.value = tenant.id;
      nameInput.value = tenant.name;
      roomInput.value = tenant.room;
      dayInput.value = tenant.dueDay;
      rentInput.value = tenant.rentUsd || '';
    } else {
      title.textContent = 'Nuevo Inquilino';
      idInput.value = '';
      nameInput.value = '';
      roomInput.value = '';
      dayInput.value = new Date().getDate();
      rentInput.value = '';
    }

    modal.classList.remove('hidden');
    nameInput.focus();
  }

  function closeTenantModal() {
    document.getElementById('tenantModal').classList.add('hidden');
  }

  function handleTenantSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('tenantIdInput').value.trim();
    const name = document.getElementById('tenantNameInput').value.trim();
    const room = document.getElementById('tenantRoomInput').value.trim();
    const dueDay = Math.min(31, Math.max(1, parseInt(document.getElementById('tenantDayInput').value, 10) || 1));
    const rentVal = parseFloat(document.getElementById('tenantRentInput').value);
    const rentUsd = Number.isFinite(rentVal) && rentVal > 0 ? rentVal : 0;

    if (!name || !room) {
      showToast('Completa el nombre y la habitación', 'error');
      return;
    }

    if (id) {
      const idx = state.tenants.findIndex((t) => t.id === id);
      if (idx !== -1) {
        state.tenants[idx] = { ...state.tenants[idx], name, room, dueDay, rentUsd };
        showToast('Inquilino actualizado', 'success');
      }
    } else {
      state.tenants.push({
        id: generateId('inq'),
        name,
        room,
        dueDay,
        rentUsd,
      });
      showToast('Inquilino agregado', 'success');
    }

    saveState();
    closeTenantModal();
    renderAll();
  }

  // ==============================
  // MODAL DE PAGO MULTIDIVISA
  // ==============================
  function openPaymentModal(tenantId) {
    const tenant = state.tenants.find((t) => t.id === tenantId);
    if (!tenant) return;

    document.getElementById('paymentTenantId').value = tenant.id;
    document.getElementById('paymentTenantSubtitle').textContent = `${tenant.name} — ${tenant.room}`;
    document.getElementById('payUsdInput').value = tenant.rentUsd ? String(tenant.rentUsd) : '';
    document.getElementById('payBsInput').value = '';
    document.getElementById('payRateInput').value = state.lastRate || '';
    document.getElementById('payNoteInput').value = '';

    const accountSelect = document.getElementById('payAccountSelect');
    const options = state.accounts.map(
      (acc) =>
        `<option value="${escapeHtml(acc.id)}" ${acc.id === state.activeAccountId ? 'selected' : ''}>
          ${escapeHtml(acc.bank)} — ${escapeHtml(acc.phone)}
        </option>`
    );
    options.push('<option value="efectivo">💵 Efectivo / Transferencia directa</option>');
    accountSelect.innerHTML = options.join('');

    updatePaymentPreview();
    document.getElementById('paymentModal').classList.remove('hidden');
    document.getElementById('payUsdInput').focus();
  }

  function closePaymentModal() {
    document.getElementById('paymentModal').classList.add('hidden');
  }

  function updatePaymentPreview() {
    const usd = parseFloat(document.getElementById('payUsdInput').value) || 0;
    const bs = parseFloat(document.getElementById('payBsInput').value) || 0;
    const rate = parseFloat(document.getElementById('payRateInput').value) || 0;
    const preview = document.getElementById('payEquivalentPreview');

    if (usd === 0 && bs === 0) {
      preview.textContent = 'Ingresa el monto en dólares ($), en bolívares (Bs) o ambos.';
      return;
    }

    if (rate > 0) {
      const totalInUsd = usd + bs / rate;
      const totalInBs = bs + usd * rate;
      preview.innerHTML = `Equivalente total: <span class="text-emerald-700">${formatUsd(totalInUsd)}</span> / <span class="text-blue-700">${formatBs(totalInBs)}</span> (tasa ${rate})`;
    } else {
      preview.textContent = `Se registrará: ${usd > 0 ? formatUsd(usd) : ''} ${usd > 0 && bs > 0 ? 'y' : ''} ${bs > 0 ? formatBs(bs) : ''}`;
    }
  }

  function handlePaymentSubmit(e) {
    e.preventDefault();
    const tenantId = document.getElementById('paymentTenantId').value;
    const usd = parseFloat(document.getElementById('payUsdInput').value) || 0;
    const bs = parseFloat(document.getElementById('payBsInput').value) || 0;
    const rate = parseFloat(document.getElementById('payRateInput').value) || 0;
    const accountId = document.getElementById('payAccountSelect').value;
    const note = document.getElementById('payNoteInput').value.trim();

    if (usd <= 0 && bs <= 0) {
      showToast('Debes ingresar un monto mayor a 0 en $ o Bs', 'error');
      return;
    }

    if (rate > 0) {
      state.lastRate = String(rate);
    }

    let accountLabel = 'Efectivo / Otro';
    if (accountId && accountId !== 'efectivo') {
      const acc = state.accounts.find((a) => a.id === accountId);
      if (acc) {
        acc.uses = (Number(acc.uses) || 0) + 1;
        accountLabel = `${acc.bank} (${acc.phone})`;
      }
    }

    state.payments.push({
      id: generateId('pag'),
      tenantId,
      monthKey: getCurrentMonthKey(),
      usd,
      bs,
      rate,
      accountId,
      accountLabel,
      note,
      createdAt: new Date().toISOString(),
    });

    saveState();
    closePaymentModal();
    renderAll();
    showToast('¡Pago registrado con éxito!', 'success');
  }

  // ==============================
  // MODAL DE CUENTAS PAGO MÓVIL
  // ==============================
  function openPagoMovilModal() {
    renderPagoMovilModalList();
    document.getElementById('pagoMovilModal').classList.remove('hidden');
  }

  function closePagoMovilModal() {
    document.getElementById('pagoMovilModal').classList.add('hidden');
  }

  function renderPagoMovilModalList() {
    const list = document.getElementById('pagoMovilList');
    if (state.accounts.length === 0) {
      list.innerHTML = '<p class="text-base text-slate-600">No hay cuentas registradas.</p>';
      return;
    }

    list.innerHTML = state.accounts
      .map(
        (acc) => `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border-2 border-slate-200 rounded-xl p-4">
          <div>
            <p class="text-lg font-extrabold text-slate-900">${escapeHtml(acc.bank)}</p>
            <p class="text-base font-semibold text-blue-700">${escapeHtml(acc.phone)} • ${escapeHtml(acc.docId)}</p>
            <p class="text-sm text-slate-600">${acc.holder ? `Titular: ${escapeHtml(acc.holder)} • ` : ''}Usada ${acc.uses || 0} veces</p>
          </div>
          <button
            type="button"
            data-delete-pm="${escapeHtml(acc.id)}"
            class="tap-target px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-base cursor-pointer self-start sm:self-center"
          >
            🗑️ Eliminar
          </button>
        </div>
      `
      )
      .join('');
  }

  function handleAddPagoMovil(e) {
    e.preventDefault();
    const bank = document.getElementById('pmBankInput').value.trim();
    const phone = document.getElementById('pmPhoneInput').value.trim();
    const docId = document.getElementById('pmIdInput').value.trim();
    const holder = document.getElementById('pmHolderInput').value.trim();

    if (!bank || !phone || !docId) {
      showToast('Completa banco, teléfono y cédula/RIF', 'error');
      return;
    }

    const newAcc = {
      id: generateId('pm'),
      bank,
      phone,
      docId,
      holder,
      uses: 0,
    };

    state.accounts.push(newAcc);
    if (!state.activeAccountId) {
      state.activeAccountId = newAcc.id;
    }

    saveState();
    e.target.reset();
    renderPagoMovilModalList();
    renderPagoMovilSection();
    showToast('Cuenta Pago Móvil agregada', 'success');
  }

  // ==============================
  // EVENTOS E INICIALIZACIÓN
  // ==============================
  function bindEvents() {
    document.getElementById('btnOpenNewTenant').addEventListener('click', () => openTenantModal());
    document.getElementById('btnCloseTenantModal').addEventListener('click', closeTenantModal);
    document.getElementById('btnCancelTenantModal').addEventListener('click', closeTenantModal);
    document.getElementById('tenantForm').addEventListener('submit', handleTenantSubmit);

    document.getElementById('btnClosePaymentModal').addEventListener('click', closePaymentModal);
    document.getElementById('btnCancelPaymentModal').addEventListener('click', closePaymentModal);
    document.getElementById('paymentForm').addEventListener('submit', handlePaymentSubmit);
    ['payUsdInput', 'payBsInput', 'payRateInput'].forEach((id) => {
      document.getElementById(id).addEventListener('input', updatePaymentPreview);
    });
    document.getElementById('btnPickSuggestedInModal').addEventListener('click', () => {
      if (state.activeAccountId) {
        document.getElementById('payAccountSelect').value = state.activeAccountId;
      }
    });

    document.getElementById('btnOpenPagoMovil').addEventListener('click', openPagoMovilModal);
    document.getElementById('btnClosePMModal').addEventListener('click', closePagoMovilModal);
    document.getElementById('btnDonePMModal').addEventListener('click', closePagoMovilModal);
    document.getElementById('pagoMovilForm').addEventListener('submit', handleAddPagoMovil);

    document.getElementById('pagoMovilList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-delete-pm]');
      if (!btn) return;
      const pmId = btn.dataset.deletePm;
      if (state.accounts.length <= 1) {
        showToast('Debes mantener al menos una cuenta Pago Móvil', 'error');
        return;
      }
      state.accounts = state.accounts.filter((a) => a.id !== pmId);
      if (state.activeAccountId === pmId) {
        state.activeAccountId = state.accounts[0]?.id || null;
      }
      saveState();
      renderPagoMovilModalList();
      renderPagoMovilSection();
      showToast('Cuenta eliminada', 'info');
    });

    document.getElementById('btnSortearPM').addEventListener('click', sortearPagoMovil);
    document.getElementById('pmQuickSelect').addEventListener('change', (e) => {
      state.activeAccountId = e.target.value;
      saveState();
      renderPagoMovilSection();
    });

    document.getElementById('searchTenant').addEventListener('input', (e) => {
      searchTerm = e.target.value;
      renderTenantsList();
    });

    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentFilter = btn.dataset.filter;
        renderFilterButtons();
        renderTenantsList();
      });
    });

    document.getElementById('tenantsList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;

      if (action === 'pay') {
        openPaymentModal(id);
      } else if (action === 'edit') {
        openTenantModal(id);
      } else if (action === 'undo-pay') {
        const tenant = state.tenants.find((t) => t.id === id);
        if (!tenant) return;
        if (!confirm(`¿Anular los pagos registrados este mes para ${tenant.name}?`)) return;
        const monthKey = getCurrentMonthKey();
        state.payments = state.payments.filter(
          (p) => !(p.tenantId === id && p.monthKey === monthKey)
        );
        saveState();
        renderAll();
        showToast('Pago del mes anulado', 'info');
      } else if (action === 'delete') {
        const tenant = state.tenants.find((t) => t.id === id);
        if (!tenant) return;
        if (!confirm(`¿Eliminar al inquilino ${tenant.name}?`)) return;
        state.tenants = state.tenants.filter((t) => t.id !== id);
        state.payments = state.payments.filter((p) => p.tenantId !== id);
        saveState();
        renderAll();
        showToast('Inquilino eliminado', 'info');
      }
    });
  }

  bindEvents();
  renderAll();
})();
