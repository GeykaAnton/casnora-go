(() => {
  'use strict';

  const API_URL = (window.CASNORAGO_CONFIG && window.CASNORAGO_CONFIG.API_URL) || 'http://localhost:3000/api';

  let state = {
    tenants: [],
    accounts: [],
    payments: [],
    activeAccountId: null,
    lastRate: '',
  };

  let currentFilter = 'todos';
  let searchTerm = '';
  let toastTimer = null;

  // ==============================
  // CLIENTE HTTP HACIA EL BACKEND
  // ==============================
  function setConnectionStatus(ok, text) {
    const badge = document.getElementById('backendStatusBadge');
    if (!badge) return;
    if (ok) {
      badge.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#14532d] text-white border border-[#1e6b3b]';
      badge.textContent = text || '● En línea';
    } else {
      badge.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#721c24] text-white border border-[#9b2c36]';
      badge.textContent = text || '● Sin conexión';
    }
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Error ${response.status}`);
    }
    return data;
  }

  async function syncFromServer() {
    try {
      const data = await apiRequest('/state');
      state = {
        tenants: Array.isArray(data.tenants) ? data.tenants : [],
        accounts: Array.isArray(data.accounts) ? data.accounts : [],
        payments: Array.isArray(data.payments) ? data.payments : [],
        activeAccountId: data.activeAccountId || data.accounts?.[0]?.id || null,
        lastRate: data.lastRate || '',
      };
      setConnectionStatus(true, '● En línea');
      renderAll();
    } catch (err) {
      console.error('Error conectando con el backend:', err);
      setConnectionStatus(false, '● Sin conexión');
      showToast('No se pudo conectar con el servidor', 'error');
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
      success: 'bg-[#14532d]',
      error: 'bg-[#721c24]',
      info: 'bg-[#4a2e1b]',
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
      card.className = 'bg-[#edf5f0] border-2 border-[#14532d] rounded-2xl p-5 shadow-sm transition-colors';
      title.className = 'text-base font-bold text-[#14532d] uppercase tracking-wide';
      countEl.className = 'text-3xl sm:text-4xl font-extrabold text-[#14532d] mt-2';
      subtext.className = 'text-sm text-[#1e4620] mt-1 font-medium';
      icon.textContent = '🎉';
    } else {
      card.className = 'bg-[#faecee] border-2 border-[#721c24] rounded-2xl p-5 shadow-sm transition-colors';
      title.className = 'text-base font-bold text-[#721c24] uppercase tracking-wide';
      countEl.className = 'text-3xl sm:text-4xl font-extrabold text-[#6b1426] mt-2';
      subtext.className = 'text-sm text-[#721c24] mt-1 font-medium';
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
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#faf6f0] border-2 border-[#c8ab89] rounded-xl p-4">
        <div class="space-y-1">
          <p class="text-xl sm:text-2xl font-extrabold text-[#2c1b10]">${escapeHtml(active.bank)}</p>
          <p class="text-lg font-bold text-[#1e3a8a]">
            📞 ${escapeHtml(active.phone)} &nbsp;|&nbsp; 🪪 ${escapeHtml(active.docId)}
          </p>
          ${active.holder ? `<p class="text-base text-[#5c3a21] font-medium">Titular: ${escapeHtml(active.holder)}</p>` : ''}
        </div>
        <button
          type="button"
          id="btnCopyActivePM"
          class="tap-target px-4 py-2.5 rounded-xl bg-white hover:bg-[#edf2f9] text-[#1e3a8a] border-2 border-[#1e3a8a] font-bold text-base shadow-sm cursor-pointer shrink-0"
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
        btn.className = 'filter-btn tap-target px-4 py-2.5 rounded-xl font-bold text-base border-2 border-[#1e3a8a] bg-[#1e3a8a] text-white transition cursor-pointer';
      } else {
        btn.className = 'filter-btn tap-target px-4 py-2.5 rounded-xl font-bold text-base border-2 border-[#b69574] bg-white hover:bg-[#f5efe6] text-[#4a2e1b] transition cursor-pointer';
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
        let cardBorder = 'border-[#b69574]';
        if (status === 'pagado') {
          badgeHtml = `<span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#14532d] text-white font-extrabold text-base">✅ Pagado</span>`;
          cardBorder = 'border-[#14532d]';
        } else if (status === 'atrasado') {
          badgeHtml = `<span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#721c24] text-white font-extrabold text-base">⚠️ Atrasado</span>`;
          cardBorder = 'border-[#721c24]';
        } else {
          badgeHtml = `<span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#7c4d2b] text-white font-extrabold text-base">⏳ Pendiente</span>`;
          cardBorder = 'border-[#7c4d2b]';
        }

        const lastPayment = monthPayments[monthPayments.length - 1];
        const paymentDetailHtml =
          monthPayments.length > 0
            ? `
              <div class="mt-3 bg-[#edf5f0] border border-[#14532d] rounded-xl p-3 text-base text-[#14532d] space-y-1">
                <p class="font-bold">
                  Pagado este mes:
                  ${totalPaidUsd > 0 ? `<span class="text-[#14532d]">${formatUsd(totalPaidUsd)}</span>` : ''}
                  ${totalPaidUsd > 0 && totalPaidBs > 0 ? ' + ' : ''}
                  ${totalPaidBs > 0 ? `<span class="text-[#1e3a8a]">${formatBs(totalPaidBs)}</span>` : ''}
                </p>
                ${lastPayment?.accountLabel ? `<p class="text-sm font-semibold text-[#4a2e1b]">Cuenta: ${escapeHtml(lastPayment.accountLabel)}</p>` : ''}
                ${lastPayment?.note ? `<p class="text-sm text-[#5c3a21]">Nota: ${escapeHtml(lastPayment.note)}</p>` : ''}
              </div>
            `
            : '';

        return `
          <article class="bg-white border-2 ${cardBorder} rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="space-y-1.5 flex-1">
              <div class="flex flex-wrap items-center gap-3">
                <h3 class="text-2xl font-extrabold text-[#2c1b10]">${escapeHtml(tenant.name)}</h3>
                ${badgeHtml}
              </div>

              <div class="flex flex-wrap items-center gap-x-5 gap-y-1 text-lg text-[#4a2e1b] font-semibold">
                <span>🚪 ${escapeHtml(tenant.room)}</span>
                <span>📅 Día de pago: <strong class="text-[#2c1b10]">${escapeHtml(tenant.dueDay)}</strong> de cada mes</span>
                ${tenant.rentUsd ? `<span>💵 Canon: <strong class="text-[#14532d]">${formatUsd(tenant.rentUsd)}</strong></span>` : ''}
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
                    ? 'bg-[#14532d] hover:bg-[#0f3f22]'
                    : 'bg-[#1e3a8a] hover:bg-[#172554]'
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
                      class="tap-target px-4 py-3 rounded-xl bg-[#faecee] hover:bg-[#f3d6da] text-[#721c24] border-2 border-[#721c24] font-bold text-base cursor-pointer"
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
                class="tap-target px-4 py-3 rounded-xl bg-[#f5efe6] hover:bg-[#eadbc8] text-[#4a2e1b] border border-[#c8ab89] font-bold text-base cursor-pointer"
                aria-label="Editar inquilino ${escapeHtml(tenant.name)}"
              >
                ✏️ Editar
              </button>

              <button
                type="button"
                data-action="delete"
                data-id="${escapeHtml(tenant.id)}"
                class="tap-target px-4 py-3 rounded-xl bg-[#faecee] hover:bg-[#f3d6da] text-[#721c24] border border-[#721c24] font-bold text-base cursor-pointer"
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

    setTimeout(async () => {
      dice.classList.remove('rolling');

      let chosen = state.accounts[0];
      if (state.accounts.length > 1) {
        const minUses = Math.min(...state.accounts.map((a) => Number(a.uses) || 0));
        let candidates = state.accounts.filter((a) => (Number(a.uses) || 0) === minUses);
        if (candidates.length > 1) {
          const withoutCurrent = candidates.filter((a) => a.id !== state.activeAccountId);
          if (withoutCurrent.length > 0) candidates = withoutCurrent;
        }
        chosen = candidates[Math.floor(Math.random() * candidates.length)];
      }

      try {
        await apiRequest('/accounts/active', {
          method: 'PUT',
          body: JSON.stringify({ accountId: chosen.id }),
        });
        state.activeAccountId = chosen.id;
        renderPagoMovilSection();
        showToast(`Sugerida: ${chosen.bank} (${chosen.phone})`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
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

  async function handleTenantSubmit(e) {
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

    try {
      if (id) {
        await apiRequest(`/tenants/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify({ name, room, dueDay, rentUsd }),
        });
        showToast('Inquilino actualizado', 'success');
      } else {
        await apiRequest('/tenants', {
          method: 'POST',
          body: JSON.stringify({ name, room, dueDay, rentUsd }),
        });
        showToast('Inquilino agregado', 'success');
      }
      closeTenantModal();
      await syncFromServer();
    } catch (err) {
      showToast(err.message, 'error');
    }
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

  async function handlePaymentSubmit(e) {
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

    let accountLabel = 'Efectivo / Otro';
    if (accountId && accountId !== 'efectivo') {
      const acc = state.accounts.find((a) => a.id === accountId);
      if (acc) accountLabel = `${acc.bank} (${acc.phone})`;
    }

    try {
      await apiRequest('/payments', {
        method: 'POST',
        body: JSON.stringify({
          tenantId,
          monthKey: getCurrentMonthKey(),
          usd,
          bs,
          rate,
          accountId,
          accountLabel,
          note,
        }),
      });
      closePaymentModal();
      await syncFromServer();
      showToast('¡Pago registrado con éxito!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
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

  async function handleAddPagoMovil(e) {
    e.preventDefault();
    const bank = document.getElementById('pmBankInput').value.trim();
    const phone = document.getElementById('pmPhoneInput').value.trim();
    const docId = document.getElementById('pmIdInput').value.trim();
    const holder = document.getElementById('pmHolderInput').value.trim();

    if (!bank || !phone || !docId) {
      showToast('Completa banco, teléfono y cédula/RIF', 'error');
      return;
    }

    try {
      await apiRequest('/accounts', {
        method: 'POST',
        body: JSON.stringify({ bank, phone, docId, holder }),
      });
      e.target.reset();
      await syncFromServer();
      renderPagoMovilModalList();
      showToast('Cuenta Pago Móvil agregada', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
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

    document.getElementById('pagoMovilList').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-delete-pm]');
      if (!btn) return;
      const pmId = btn.dataset.deletePm;
      try {
        await apiRequest(`/accounts/${encodeURIComponent(pmId)}`, { method: 'DELETE' });
        await syncFromServer();
        renderPagoMovilModalList();
        showToast('Cuenta eliminada', 'info');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('btnSortearPM').addEventListener('click', sortearPagoMovil);
    document.getElementById('pmQuickSelect').addEventListener('change', async (e) => {
      const accountId = e.target.value;
      try {
        await apiRequest('/accounts/active', {
          method: 'PUT',
          body: JSON.stringify({ accountId }),
        });
        state.activeAccountId = accountId;
        renderPagoMovilSection();
      } catch (err) {
        showToast(err.message, 'error');
      }
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

    document.getElementById('tenantsList').addEventListener('click', async (e) => {
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
        try {
          await apiRequest(`/payments/tenant/${encodeURIComponent(id)}/month/${getCurrentMonthKey()}`, {
            method: 'DELETE',
          });
          await syncFromServer();
          showToast('Pago del mes anulado', 'info');
        } catch (err) {
          showToast(err.message, 'error');
        }
      } else if (action === 'delete') {
        const tenant = state.tenants.find((t) => t.id === id);
        if (!tenant) return;
        if (!confirm(`¿Eliminar al inquilino ${tenant.name}?`)) return;
        try {
          await apiRequest(`/tenants/${encodeURIComponent(id)}`, { method: 'DELETE' });
          await syncFromServer();
          showToast('Inquilino eliminado', 'info');
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    });
  }

  bindEvents();
  renderAll();
  syncFromServer();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('Service Worker no registrado:', err);
      });
    });
  }
})();
