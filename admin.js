let authToken = localStorage.getItem('adminToken') || null;

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (authToken) opts.headers['Authorization'] = 'Bearer ' + authToken;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (res.status === 401) { logout(); throw new Error('Нет доступа'); }
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Ошибка сервера'); }
  return res.json();
}

function showAdminApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminApp').classList.remove('hidden');
  initDayFilter();
  loadMenu();
  if (typeof fetchAddresses === 'function') fetchAddresses();
  initAdminWS();
}

/* ══════════════════════════════════════════════
   WEBSOCKET — Live-индикатор Online/Offline
══════════════════════════════════════════════ */
let _adminWS         = null;
let _adminWSTimer    = null;
let _adminWSRetry    = 1000; // начальная задержка реконнекта (мс)
const _adminWSMaxRetry = 30000;

function setLiveBadge(online) {
  const badge = document.getElementById('adminLiveBadge');
  if (!badge) return;
  if (online) {
    badge.textContent = '🟢 Online';
    badge.style.color = '#27ae60';
  } else {
    badge.textContent = '🔴 Offline';
    badge.style.color = '#e74c3c';
  }
}

function initAdminWS() {
  if (_adminWS && (_adminWS.readyState === WebSocket.OPEN || _adminWS.readyState === WebSocket.CONNECTING)) return;

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}`);
  _adminWS = ws;

  ws.addEventListener('open', () => {
    setLiveBadge(true);
    _adminWSRetry = 1000; // сброс задержки при успехе
  });

  ws.addEventListener('message', e => {
    try {
      const msg = JSON.parse(e.data);
      // Обновляем меню при изменениях с других вкладок/устройств
      if (msg.event === 'menu' && msg.data) {
        S.menu = msg.data;
        renderSidebar();
        if (S.activeCatId) renderItems(S.activeCatId);
      }
      // Обновляем заказы если открыта вкладка заказов
      if (msg.event === 'order') {
        if (document.getElementById('ordersSection').style.display === 'block') {
          loadOrders();
        }
      }
    } catch {}
  });

  ws.addEventListener('close', () => {
    setLiveBadge(false);
    _adminWS = null;
    // Авто-реконнект с экспоненциальной задержкой
    clearTimeout(_adminWSTimer);
    _adminWSTimer = setTimeout(() => {
      _adminWSRetry = Math.min(_adminWSRetry * 2, _adminWSMaxRetry);
      initAdminWS();
    }, _adminWSRetry);
  });

  ws.addEventListener('error', () => {
    ws.close();
  });
}

/* ══════════════════════════════════════════════
   FIREBASE INIT  (no Storage – images stored as base64 in Firestore)
══════════════════════════════════════════════ */
const ADMIN_MENU_CACHE_KEY = 'adminMenuCacheV1';

/* ══════════════════════════════════════════════
   IMAGE COMPRESSION  (canvas → base64 JPEG, ≈ 30-60 KB per image)
══════════════════════════════════════════════ */
function compressImage(file, maxPx = 480, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload  = ev => {
      const img = new Image();
      img.onerror = reject;
      img.onload  = () => {
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          if (width >= height) { height = Math.round(height * maxPx / width);  width  = maxPx; }
          else                 { width  = Math.round(width  * maxPx / height); height = maxPx; }
        }
        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
const S = {
  menu:        { categories: [], items: [] },
  activeCatId: null,
  activeCity:  null,
  editingItem: null,
  pendingImage: null,
  currentEmoji: '🍽️',
  confirmCallback: null,
  dayFilter:   { auto: true, day: null },
};

/* ── Day filter helpers ── */
function getTodayDayId() {
  const d = new Date().getDay();
  if (d === 0 || d === 6) return 'weekend';
  return ['','monday','tuesday','wednesday','thursday','friday'][d];
}
const DAY_NAMES = {
  monday:'Понедельник', tuesday:'Вторник', wednesday:'Среда',
  thursday:'Четверг', friday:'Пятница', weekend:'Сб — Вс'
};
function getActiveDayId() {
  return S.dayFilter.auto ? getTodayDayId() : S.dayFilter.day;
}
function getDayItemIds() {
  const schedule = S.menu.weeklySchedule;
  if (!schedule) return null;
  const dayId = getActiveDayId();
  const day = schedule.days.find(d => d.id === dayId);
  return day ? day.itemIds : null;
}
function initDayFilter() {
  const autoBtn = document.getElementById('dayAutoBtn');
  const sel = document.getElementById('daySelect');
  if (!autoBtn || !sel) return;

  // Set select to today
  S.dayFilter.day = getTodayDayId();
  sel.value = S.dayFilter.day;

  autoBtn.addEventListener('click', () => {
    S.dayFilter.auto = !S.dayFilter.auto;
    autoBtn.classList.toggle('active', S.dayFilter.auto);
    sel.disabled = S.dayFilter.auto;
    if (S.dayFilter.auto) {
      S.dayFilter.day = getTodayDayId();
      sel.value = S.dayFilter.day;
    }
    if (S.activeCatId) renderItems(S.activeCatId);
  });

  sel.addEventListener('change', () => {
    S.dayFilter.day = sel.value;
    if (S.activeCatId) renderItems(S.activeCatId);
  });
}

const EMOJI_LIST = [
  '🍱','🥘','🍽️','🍲','🥣','🍳','🥞','🥗','🫒','🥦','🍖','🍗','🐟',
  '🫑','🥟','🥔','🍝','🌾','🍚','🥬','🫙','🫐','🥐','🍒','🧁','🍞',
  '🧈','🍅','🥛','🍵','☕','💧','🧃','📦','🧻','🔪','🥄','🍴','🍬',
  '🧆','🌮','🌯','🥙','🫔','🥚','🧀','🥩','🍔','🍟','🌭',
];

/* helper: prefer base64 stored in Firestore, fall back to legacy URL */
function itemImg(item) { return item?.imageBase64 || item?.imageUrl || null; }

function isPermissionError(err) {
  return err?.code === 'permission-denied' || err?.code === 'unauthenticated';
}

function explainError(err, fallback = 'Ошибка операции') {
  if (isPermissionError(err)) {
    return 'Нет доступа к Firestore. Проверьте Firestore Rules и авторизацию.';
  }
  return err?.message || fallback;
}

function saveMenuCache() {
  try { localStorage.setItem(ADMIN_MENU_CACHE_KEY, JSON.stringify(S.menu)); } catch {}
}

function loadMenuCache() {
  try {
    const raw = localStorage.getItem(ADMIN_MENU_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.categories) || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════ */
function toast(msg, type = 'default') {
  const wrap = document.getElementById('toastWrap');
  const el   = document.createElement('div');
  el.className   = 'toast ' + type;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut .3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

/* ══════════════════════════════════════════════
   CONFIRM
══════════════════════════════════════════════ */
function showConfirm(text, cb) {
  S.confirmCallback = cb;
  document.getElementById('confirmText').textContent = text;
  openModal('confirmModal');
}
document.getElementById('confirmOk').addEventListener('click',        () => { closeModal('confirmModal'); S.confirmCallback?.(); });
document.getElementById('confirmCancel').addEventListener('click',    () => closeModal('confirmModal'));
document.getElementById('confirmModalClose').addEventListener('click',() => closeModal('confirmModal'));

/* ══════════════════════════════════════════════
   MODAL HELPERS
══════════════════════════════════════════════ */
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden');    }
document.querySelectorAll('.modal-overlay').forEach(ov => {
  ov.addEventListener('click', e => { if (e.target === ov) closeModal(ov.id); });
});

/* ══════════════════════════════════════════════
   LOGIN
══════════════════════════════════════════════ */
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginError');
  btn.textContent = 'Вход...';
  btn.disabled    = true;
  err.textContent = '';
  const password = document.getElementById('loginPassword').value;
  try {
    const res  = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    const data = await res.json();
    if (!data.token) throw new Error(data.error || 'Неверный пароль');
    authToken = data.token;
    localStorage.setItem('adminToken', authToken);
    showAdminApp();
  } catch (ex) {
    err.textContent = ex.message;
    btn.disabled    = false;
    btn.textContent = 'Войти';
  }
});


document.getElementById('logoutBtn').addEventListener('click', logout);

document.getElementById('exportAddressesBtn')?.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/addresses');
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'addresses.json';
    a.click();
    URL.revokeObjectURL(url);
  } catch(e) {
    alert('Ошибка экспорта: ' + e.message);
  }
});

document.getElementById('importAddressesInput')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const res = await api('PUT', '/api/addresses', data);
    if (res.ok) {
      showToast('✅ Адреса импортированы!');
      if (typeof fetchAddresses === 'function') fetchAddresses();
    } else {
      showToast('❌ Ошибка импорта', 'error');
    }
  } catch(e) {
    showToast('❌ Неверный файл: ' + e.message, 'error');
  }
  e.target.value = '';
});

document.getElementById('importMenuInput')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const res = await api('POST', '/api/admin/import/menu', data);
    if (res.ok) {
      showToast(`✅ Импортировано: ${res.categories} категорий, ${res.items} позиций`);
      location.reload();
    } else {
      showToast('❌ Ошибка импорта', 'error');
    }
  } catch(e) {
    showToast('❌ Неверный файл: ' + e.message, 'error');
  }
  e.target.value = '';
});

document.getElementById('exportMenuBtn')?.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/menu');
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'menu.json';
    a.click();
    URL.revokeObjectURL(url);
  } catch(e) {
    alert('Ошибка экспорта: ' + e.message);
  }
});

function logout() {
  if (authToken) fetch('/api/admin/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + authToken } }).catch(() => {});
  authToken = null;
  localStorage.removeItem('adminToken');
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('adminApp').classList.add('hidden');
  document.getElementById('loginPassword').value = '';
}


/* ══════════════════════════════════════════════
   LOAD MENU FROM FIRESTORE  (initial load only)
   After initial load, all mutations update S.menu
   locally — no extra round-trips to Firestore.
══════════════════════════════════════════════ */
async function loadMenu() {
  try {
    const menu = await api('GET', '/api/menu');
    S.menu.categories     = menu.categories     || [];
    S.menu.items          = menu.items          || [];
    S.menu.weeklySchedule = menu.weeklySchedule || S.menu.weeklySchedule || null;
    saveMenuCache();
    renderCityTabs();
    renderSidebar();
    if (S.activeCatId) renderItems(S.activeCatId);
    if (S.menu.categories.length === 0) showInitPrompt();
  } catch (e) {
    const cached = loadMenuCache();
    if (cached) {
      S.menu = cached;
      renderCityTabs();
      renderSidebar();
      if (!S.activeCatId && S.menu.categories.length) S.activeCatId = S.menu.categories[0].id;
      if (S.activeCatId) renderItems(S.activeCatId);
    }
    toast('Ошибка загрузки: ' + e.message, 'error');
  }
}

/* Fast local re-render — no Firestore round-trip */
function refreshUI() {
  saveMenuCache();
  renderSidebar();
  if (S.activeCatId) renderItems(S.activeCatId);
}

/* ══════════════════════════════════════════════
   INIT DEFAULT MENU
══════════════════════════════════════════════ */
function showInitPrompt() {
  const banner = document.getElementById('initBanner');
  if (banner) banner.style.display = 'flex';
}

document.getElementById('initMenuBtn')?.addEventListener('click', async () => {
  document.getElementById('initBanner').style.display = 'none';
  await uploadInitialMenu();
});

async function uploadInitialMenu() {
  toast('Загрузка стартового меню...', 'default');
  try {
    for (const cat of INITIAL_CATEGORIES) { await api('POST', '/api/categories', { name: cat.name }); }
    await loadMenu();
    toast('Стартовое меню загружено', 'success');
  } catch (e) {
    toast('Ошибка: ' + e.message, 'error');
  }
}

function renderCityTabs() {
  const wrap = document.getElementById('cityTabs');
  if (!wrap) return;
  const cities = (Array.isArray(addrData) ? addrData : []).filter(c => c.active !== false);
  if (!S.activeCity && cities.length) S.activeCity = cities[0].id;
  wrap.innerHTML = '';
  cities.forEach(city => {
    const btn = document.createElement('button');
    btn.className = 'city-tab-btn' + (S.activeCity === city.id ? ' active' : '');
    btn.textContent = city.name;
    btn.addEventListener('click', () => {
      S.activeCity = city.id;
      S.activeCatId = null;
      renderCityTabs();
      renderSidebar();
      document.getElementById('itemsGrid').innerHTML = '';
      document.getElementById('welcomeState').classList.remove('hidden');
    });
    wrap.appendChild(btn);
  });
}


function renderSidebar() {
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = '';
  S.menu.categories.forEach(cat => {
    const allItems  = S.menu.items.filter(i => i.categoryId === cat.id);
    const items     = S.activeCity
      ? allItems.filter(i => !(i.disabledCities || []).includes(S.activeCity))
      : allItems;
    const active = items.filter(i => i.active).length;
    const li     = document.createElement('div');
    li.className  = 'sidebar-cat-item' + (S.activeCatId === cat.id ? ' active' : '');
    li.dataset.catId = cat.id;
    li.draggable = true;
    li.innerHTML = `
      <span class="drag-handle" style="cursor:grab;padding:0 4px;color:#aaa;font-size:14px;">⠿</span>
      <span class="sidebar-cat-dot ${cat.active ? 'on' : 'off'}"></span>
      <span class="sidebar-cat-name">${cat.name}</span>
      <span class="sidebar-cat-count">${active}/${items.length}</span>
      <div class="sidebar-cat-actions">
        <button class="sidebar-icon-btn red" data-action="del-cat" data-id="${cat.id}" title="Удалить">🗑</button>
      </div>`;
    li.addEventListener('click', e => {
      if (e.target.closest('[data-action]') || e.target.closest('.drag-handle')) return;
      selectCategory(cat.id);
    });
    li.querySelector('[data-action="del-cat"]').addEventListener('click', e => {
      e.stopPropagation();
      showConfirm(`Удалить категорию «${cat.name}» и все её позиции?`, () => deleteCategory(cat.id));
    });
    // Drag events
    li.addEventListener('dragstart', e => {
      catDrag.fromId = cat.id;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));
    li.addEventListener('dragover', e => {
      e.preventDefault();
      const over = e.currentTarget.dataset.catId;
      if (over === catDrag.fromId) return;
      const cats = S.menu.categories;
      const fromIdx = cats.findIndex(c => c.id === catDrag.fromId);
      const toIdx   = cats.findIndex(c => c.id === over);
      if (fromIdx < 0 || toIdx < 0) return;
      const moved = cats.splice(fromIdx, 1)[0];
      cats.splice(toIdx, 0, moved);
      renderSidebar();
    });
    li.addEventListener('drop', async e => {
      e.preventDefault();
      // Save new order to server
      const order = S.menu.categories.map(c => c.id);
      await api('POST', '/api/menu/categories/reorder', { order });
    });
    nav.appendChild(li);
  });
}
const catDrag = { fromId: null };

function selectCategory(catId) {
  S.activeCatId = catId;
  renderSidebar();
  renderItems(catId);
  document.getElementById('welcomeState').classList.add('hidden');
  closeSidebarMobile();
}

/* ══════════════════════════════════════════════
   ITEMS RENDER
══════════════════════════════════════════════ */
function renderItems(catId) {
  const cat      = S.menu.categories.find(c => c.id === catId);
  const allItems = S.menu.items.filter(i => i.categoryId === catId);
  const cityFiltered = S.activeCity
    ? allItems.filter(i => !(i.disabledCities || []).includes(S.activeCity))
    : allItems;

  // Расписание: определяем какие блюда сегодня в расписании
  const schedule = S.menu.weeklySchedule;
  const todayId  = getTodayDayId();
  const schedDay = schedule?.enabled && schedule.days?.find(d => d.id === todayId);
  const schedIds = schedDay ? new Set(schedDay.itemIds) : null; // null = расписание выключено

  const grid  = document.getElementById('itemsGrid');
  const empty = document.getElementById('emptyState');

  document.getElementById('topbarTitle').textContent = cat ? cat.name : '';
  document.getElementById('statTotal').textContent   = cityFiltered.length;
  // Активных = active:true И входит в расписание сегодня (или расписание выключено)
  const activeCount = cityFiltered.filter(i => {
    if (!i.active) return false;
    if (!schedIds) return true;
    return schedIds.has(i.id);
  }).length;
  document.getElementById('statActive').textContent  = activeCount;
  document.getElementById('statHidden').textContent  = cityFiltered.length - activeCount;

  // Сортировка: активные сегодня → не в расписании → скрытые
  const sorted = [...cityFiltered].sort((a, b) => {
    const scoreOf = item => {
      if (!item.active) return 2;                          // скрыто
      if (schedIds && !schedIds.has(item.id)) return 1;   // не сегодня
      return 0;                                            // активно
    };
    return scoreOf(a) - scoreOf(b);
  });

  grid.innerHTML = '';
  if (!sorted.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  sorted.forEach(item => grid.appendChild(createItemCard(item, schedIds)));
}

function createItemCard(item, schedIds) {
  const card     = document.createElement('div');
  const inSched  = !schedIds || schedIds.has(item.id); // null = расписание выкл = все активны
  card.className = 'item-card' + (item.active ? '' : ' inactive') + (inSched ? '' : ' not-in-schedule');
  card.id        = 'card-' + item.id;

  const src       = itemImg(item);
  const mediaPart = src
    ? `<img class="item-card-img" src="${src}" alt="${item.name}" loading="lazy" />`
    : `<span class="item-card-emoji-big">${item.emoji}</span>`;

  // Три состояния бейджа:
  // 1. item.active = false → «Скрыто» (вручную выключено)
  // 2. item.active = true, расписание включено, блюда нет в сегодня → «Не сегодня»
  // 3. item.active = true, в расписании (или расписание выкл) → «Активно»
  let badgeClass, badgeText;
  if (!item.active) {
    badgeClass = 'inactive';
    badgeText  = 'Скрыто';
  } else if (schedIds && !inSched) {
    badgeClass = 'not-today';
    badgeText  = 'Не сегодня';
  } else {
    badgeClass = 'active';
    badgeText  = 'Активно';
  }
  const toggleText = item.active ? '🙈 Скрыть' : '👁 Показать';
  // schedBadge скрываем — информация уже в основном бейдже
  const schedBadge = '';

  card.innerHTML = `
    <div class="item-card-media">
      ${mediaPart}
      <span class="item-card-badge ${badgeClass}">${badgeText}</span>
      ${schedBadge}
    </div>
    <div class="item-card-body">
      <div class="item-card-name">${item.name}</div>
      <div class="item-card-meta">
        <span class="item-card-price">${item.price} ₽</span>
        <span class="item-card-weight">${item.weight || ''}</span>
      </div>
      <div class="item-card-actions">
        <button class="card-btn card-btn-edit"   data-action="edit"   data-id="${item.id}">✏️ Изменить</button>
        <button class="card-btn card-btn-toggle" data-action="toggle" data-id="${item.id}">${toggleText}</button>
        <button class="card-btn card-btn-delete" data-action="delete" data-id="${item.id}">🗑</button>
      </div>
    </div>`;

  card.querySelector('[data-action="edit"]').addEventListener('click',   () => openItemEdit(item.id));
  card.querySelector('[data-action="toggle"]').addEventListener('click', () => toggleItem(item.id));
  card.querySelector('[data-action="delete"]').addEventListener('click', () => {
    showConfirm(`Удалить «${item.name}»?`, () => deleteItem(item.id));
  });
  return card;
}

/* ══════════════════════════════════════════════
   CITY TOGGLE MODAL
══════════════════════════════════════════════ */
function openCityToggleModal(itemId) {
  const item = S.menu.items.find(i => i.id === itemId);
  if (!item) return;
  const disabled = item.disabledCities || [];
  const cities = addrData.length ? addrData : [];

  const html = `
    <div class="modal-overlay" id="cityToggleModal" style="display:flex;background:rgba(0,0,0,0.55);position:fixed;inset:0;z-index:9999;align-items:center;justify-content:center">
      <div class="modal-box" style="max-width:360px;width:100%;background:#fff;border-radius:16px;">
        <div class="modal-header">
          <h2 class="modal-title">Города — ${item.name}</h2>
          <button class="modal-close" id="cityToggleClose">✕</button>
        </div>
        <div style="padding:16px">
          <p style="font-size:13px;color:#888;margin-bottom:12px">Снимите галочку, чтобы скрыть позицию в этом городе</p>
          ${cities.map(city => `
            <label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0f0;cursor:pointer">
              <input type="checkbox" data-city="${city.id}" ${disabled.includes(city.id) ? '' : 'checked'}
                style="width:16px;height:16px;accent-color:var(--primary)" />
              <span style="font-size:14px">${city.name}</span>
            </label>`).join('')}
        </div>
        <div class="modal-footer">
          <button class="btn-primary" id="cityToggleSave">Сохранить</button>
        </div>
      </div>
    </div>`;

  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);

  el.querySelector('#cityToggleClose').addEventListener('click', () => el.remove());
  el.querySelector('#cityToggleSave').addEventListener('click', async () => {
    const checked = [...el.querySelectorAll('input[data-city]')];
    const newDisabled = checked.filter(c => !c.checked).map(c => c.dataset.city);
    await api('PATCH', '/api/menu/items/' + itemId, { disabledCities: newDisabled });
    const i = S.menu.items.find(x => x.id === itemId);
    if (i) i.disabledCities = newDisabled;
    el.remove();
    toast('Сохранено', 'success');
  });
}

/* ══════════════════════════════════════════════
   ITEM MODAL
══════════════════════════════════════════════ */
document.getElementById('addItemBtn').addEventListener('click', () => {
  if (!S.activeCatId) { toast('Сначала выберите категорию', 'error'); return; }
  openItemModal(null);
});

function openItemModal(item) {
  S.editingItem  = item;
  S.pendingImage = null;
  S.currentEmoji = item?.emoji || '🍽️';

  // Безопасная установка значения — не падает если элемент не найден
  function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  }
  function removeClass(id, cls) {
    const el = document.getElementById(id);
    if (el) el.classList.remove(cls);
  }

  const titleEl = document.getElementById('itemModalTitle');
  if (titleEl) titleEl.textContent = item ? 'Редактировать' : 'Добавить позицию';

  setVal('editItemId',      item?.id);
  setVal('itemName',        item?.name);
  setVal('itemPrice',       item?.price);
  setVal('itemWeight',      item?.weight);
  setVal('itemDescription', item?.description);
  setVal('itemComposition', item?.composition);
  setVal('itemKcal',        item?.kcal);
  setVal('itemProtein',     item?.protein);
  setVal('itemFat',         item?.fat);
  setVal('itemCarbs',       item?.carbs);
  setVal('emojiCustom',     item?.emoji || '🍽️');
  setVal('imageInput',      '');

  removeClass('itemName',  'error');
  removeClass('itemPrice', 'error');

  populateCategorySelect(item?.categoryId || S.activeCatId);
  renderEmojiGrid();
  updatePhotoPreview(itemImg(item));
  openModal('itemModal');
}

function openItemEdit(id) {
  const item = S.menu.items.find(i => i.id === id);
  if (!item) { toast('Блюдо не найдено, попробуйте перезагрузить меню', 'error'); return; }
  openItemModal(item);
}

function populateCategorySelect(selectedId) {
  const sel = document.getElementById('itemCategory');
  sel.innerHTML = '';
  S.menu.categories.forEach(cat => {
    const opt       = document.createElement('option');
    opt.value       = cat.id;
    opt.textContent = cat.name;
    if (cat.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function renderEmojiGrid() {
  const grid = document.getElementById('emojiGrid');
  grid.innerHTML = '';
  EMOJI_LIST.forEach(em => {
    const btn       = document.createElement('button');
    btn.type        = 'button';
    btn.className   = 'emoji-btn' + (em === S.currentEmoji ? ' active' : '');
    btn.textContent = em;
    btn.addEventListener('click', () => {
      S.currentEmoji = em;
      document.getElementById('emojiCustom').value        = em;
      document.getElementById('previewEmoji').textContent = em;
      grid.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    grid.appendChild(btn);
  });
}

function updatePhotoPreview(src) {
  const emoji = document.getElementById('previewEmoji');
  const img   = document.getElementById('previewImg');
  const rmBtn = document.getElementById('removePhotoBtn');
  if (src) {
    emoji.classList.add('hidden');
    img.src = src;
    img.classList.remove('hidden');
    rmBtn.classList.remove('hidden');
  } else {
    img.classList.add('hidden');
    img.src = '';
    emoji.classList.remove('hidden');
    emoji.textContent = S.currentEmoji;
    rmBtn.classList.add('hidden');
  }
}

document.getElementById('imageInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;

  // Validate size before compressing
  if (file.size > 20 * 1024 * 1024) {
    toast('Файл слишком большой (максимум 20 МБ)', 'error');
    e.target.value = '';
    return;
  }

  const btn = document.getElementById('itemFormSubmit');
  const originalText = btn.textContent;
  btn.textContent = 'Сжимаем фото...';
  btn.disabled    = true;

  try {
    const base64 = await compressImage(file);
    S.pendingImage = base64;          // store compressed base64, not the File
    updatePhotoPreview(base64);
    const kb = Math.round(base64.length * 0.75 / 1024);
    toast(`Фото готово (${kb} КБ) ✓`, 'success');
  } catch {
    toast('Не удалось обработать фото', 'error');
    e.target.value = '';
  } finally {
    btn.textContent = originalText;
    btn.disabled    = false;
  }
});

document.getElementById('removePhotoBtn').addEventListener('click', () => {
  S.pendingImage = null;
  document.getElementById('imageInput').value = '';
  if (S.editingItem) S.editingItem._removeImage = true;
  updatePhotoPreview(null);
});

document.getElementById('emojiCustom').addEventListener('input', e => {
  const v = e.target.value;
  if (v) {
    S.currentEmoji = v;
    document.getElementById('previewEmoji').textContent = v;
  }
});

document.getElementById('itemModalClose').addEventListener('click',  () => closeModal('itemModal'));
document.getElementById('itemModalCancel').addEventListener('click', () => closeModal('itemModal'));

/* ── Submit ─────────────────────────────────────── */
document.getElementById('itemForm').addEventListener('submit', async e => {
  e.preventDefault();

  const name  = document.getElementById('itemName').value.trim();
  const price = document.getElementById('itemPrice').value;
  let valid   = true;
  document.getElementById('itemName').classList.remove('error');
  document.getElementById('itemPrice').classList.remove('error');
  if (!name)  { document.getElementById('itemName').classList.add('error');  valid = false; }
  if (!price) { document.getElementById('itemPrice').classList.add('error'); valid = false; }
  if (!valid) return;

  const btn = document.getElementById('itemFormSubmit');
  btn.textContent = 'Сохранение...';
  btn.disabled    = true;

  try {
    const editId     = document.getElementById('editItemId').value;
    const categoryId = document.getElementById('itemCategory').value;
    const emoji      = document.getElementById('emojiCustom').value.trim() || S.currentEmoji;

    let imageBase64 = S.editingItem?.imageBase64 || null;
    if (S.editingItem?._removeImage) imageBase64 = null;
    if (S.pendingImage !== null)     imageBase64 = S.pendingImage;

    const data = {
      name,
      price:       parseInt(price, 10),
      weight:      document.getElementById('itemWeight').value.trim(),
      emoji,
      categoryId,
      description: document.getElementById('itemDescription').value.trim(),
      composition: document.getElementById('itemComposition').value.trim(),
      kcal:    document.getElementById('itemKcal').value    ? Number(document.getElementById('itemKcal').value)    : null,
      protein: document.getElementById('itemProtein').value ? Number(document.getElementById('itemProtein').value) : null,
      fat:     document.getElementById('itemFat').value     ? Number(document.getElementById('itemFat').value)     : null,
      carbs:   document.getElementById('itemCarbs').value   ? Number(document.getElementById('itemCarbs').value)   : null,
      imageBase64,
    };

    if (editId) {
      const updated = await api('PUT', '/api/menu/item/' + editId, data);
      // Update local state instantly — no reload
      const idx = S.menu.items.findIndex(i => i.id === editId);
      if (idx !== -1) S.menu.items[idx] = { ...S.menu.items[idx], ...updated };
      toast('Позиция обновлена ✓', 'success');
    } else {
      const created = await api('POST', '/api/menu/item', { ...data });
      // Add to local state instantly — no reload
      S.menu.items.push(created);
      toast('Позиция добавлена ✓', 'success');
    }

    closeModal('itemModal');
    refreshUI();
  } catch (err) {
    toast('Ошибка: ' + explainError(err), 'error');
  } finally {
    btn.textContent = 'Сохранить';
    btn.disabled    = false;
  }
});

/* ══════════════════════════════════════════════
   TOGGLE / DELETE ITEM
══════════════════════════════════════════════ */
async function toggleItem(id) {
  try {
    const item = S.menu.items.find(i => i.id === id);
    if (!item) return;
    const newActive = !item.active;
    // Optimistic local update — instant UI response
    item.active = newActive;
    refreshUI();
    await api('PATCH', '/api/menu/item/' + id + '/toggle');
    toast(newActive ? 'Показано' : 'Скрыто', 'success');
  } catch (e) {
    // Rollback on error
    const item = S.menu.items.find(i => i.id === id);
    if (item) item.active = !item.active;
    refreshUI();
    toast('Ошибка: ' + explainError(e), 'error');
  }
}

async function deleteItem(id) {
  try {
    // Remove from local state instantly
    S.menu.items = S.menu.items.filter(i => i.id !== id);
    refreshUI();
    await api('DELETE', '/api/menu/item/' + id);
    toast('Позиция удалена', 'success');
  } catch (e) {
    toast('Ошибка: ' + explainError(e), 'error');
    await loadMenu(); // reload on error to restore correct state
  }
}

/* ══════════════════════════════════════════════
   CATEGORY CRUD
══════════════════════════════════════════════ */
document.getElementById('addCategoryBtn').addEventListener('click', () => {
  document.getElementById('catName').value = '';
  openModal('catModal');
});
document.getElementById('catModalClose').addEventListener('click',  () => closeModal('catModal'));
document.getElementById('catModalCancel').addEventListener('click', () => closeModal('catModal'));

document.getElementById('catForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('catName').value.trim();
  if (!name) return;
  const btn = e.target.querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    const cat = await api('POST', '/api/categories', { name });
    S.menu.categories.push(cat);
    refreshUI();
    closeModal('catModal');
    selectCategory(cat.id);
    toast('Категория «' + name + '» создана', 'success');
  } catch (err) {
    toast('Ошибка: ' + explainError(err), 'error');
    await loadMenu(); // reload on error
  } finally {
    btn.disabled = false;
  }
});

async function deleteCategory(id) {
  try {
    const itemsInCat = S.menu.items.filter(i => i.categoryId === id);
    // Remove from local state instantly
    S.menu.categories = S.menu.categories.filter(c => c.id !== id);
    S.menu.items      = S.menu.items.filter(i => i.categoryId !== id);
    if (S.activeCatId === id) {
      S.activeCatId = S.menu.categories[0]?.id || null;
      if (!S.activeCatId) {
        document.getElementById('topbarTitle').textContent = 'Выберите категорию';
        document.getElementById('itemsGrid').innerHTML     = '';
        document.getElementById('emptyState').classList.add('hidden');
        document.getElementById('welcomeState').classList.remove('hidden');
      }
    }
    refreshUI();
    toast('Категория удалена', 'success');
    await api('DELETE', '/api/categories/' + id);
  } catch (e) {
    toast('Ошибка: ' + explainError(e), 'error');
    await loadMenu(); // reload on error
  }
}

/* ══════════════════════════════════════════════
   SIDEBAR MOBILE
══════════════════════════════════════════════ */
const sidebarOverlay = document.createElement('div');
sidebarOverlay.className = 'sidebar-overlay';
document.body.appendChild(sidebarOverlay);

document.getElementById('sidebarToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
  sidebarOverlay.style.display =
    document.getElementById('sidebar').classList.contains('open') ? 'block' : 'none';
});
sidebarOverlay.addEventListener('click', closeSidebarMobile);
function closeSidebarMobile() {
  document.getElementById('sidebar').classList.remove('open');
  sidebarOverlay.style.display = 'none';
}

/* ══════════════════════════════════════════════
   SCHEDULE MANAGEMENT
══════════════════════════════════════════════ */
const SCHEDULE_DAYS = [
  { id: 'monday',    name: 'Понедельник' },
  { id: 'tuesday',   name: 'Вторник'     },
  { id: 'wednesday', name: 'Среда'       },
  { id: 'thursday',  name: 'Четверг'     },
  { id: 'friday',    name: 'Пятница'     },
  { id: 'weekend',   name: 'Сб — Вс'    },
];

// Рабочая копия расписания пока модал открыт
let _schedDraft = null;

document.addEventListener('DOMContentLoaded', function initScheduleListeners() {
  const btn = document.getElementById('scheduleBtn');
  if (btn) btn.addEventListener('click', openScheduleModal);

  document.getElementById('scheduleModalClose')?.addEventListener('click',  () => closeModal('scheduleModal'));
  document.getElementById('scheduleModalCancel')?.addEventListener('click', () => closeModal('scheduleModal'));

  document.getElementById('scheduleModalSave')?.addEventListener('click', async () => {
    _schedDraft.days = SCHEDULE_DAYS.map(d => {
      const body = document.getElementById('sched-day-' + d.id);
      if (!body) return { id: d.id, itemIds: [] };
      const checked = [...body.querySelectorAll('input[type=checkbox][data-item-id]:checked')];
      return { id: d.id, itemIds: checked.map(c => c.dataset.itemId) };
    });
    _schedDraft.enabled = document.getElementById('scheduleEnabled').checked;
    try {
      await api('POST', '/api/admin/import/menu', { ...S.menu, weeklySchedule: _schedDraft });
      S.menu.weeklySchedule = _schedDraft;
      saveMenuCache();
      refreshUI();
      closeModal('scheduleModal');
      toast('Расписание сохранено ✓', 'success');
    } catch (e) {
      toast('Ошибка сохранения: ' + e.message, 'error');
    }
  });

  document.getElementById('scheduleExportBtn')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(S.menu, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'menu.json';
    a.click();
  });

  document.getElementById('scheduleImportFile')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.categories || !data.items) { toast('Неверный формат файла', 'error'); return; }
      await api('POST', '/api/admin/import/menu', data);
      S.menu = data;
      saveMenuCache();
      refreshUI();
      closeModal('scheduleModal');
      toast('Меню импортировано ✓', 'success');
    } catch (e) {
      toast('Ошибка импорта: ' + e.message, 'error');
    }
    e.target.value = '';
  });

  document.getElementById('copyScheduleBtn')?.addEventListener('click', () => {
    const firstBody = document.getElementById('sched-day-monday');
    if (!firstBody) return;
    const firstIds = new Set(
      [...firstBody.querySelectorAll('input[data-item-id]:checked')].map(c => c.dataset.itemId)
    );
    SCHEDULE_DAYS.forEach(d => {
      const body = document.getElementById('sched-day-' + d.id);
      if (!body) return;
      body.querySelectorAll('input[data-item-id]').forEach(cb => {
        cb.checked = firstIds.has(cb.dataset.itemId);
      });
      const section = body.closest('.sched-day-section');
      const countEl = section?.querySelector('.sched-day-count');
      if (countEl) countEl.textContent = firstIds.size + ' / ' + body.querySelectorAll('input[data-item-id]').length;
    });
    toast('Понедельник скопирован на всю неделю', 'success');
  });
});

function openScheduleModal() {
  const sched = S.menu.weeklySchedule || { enabled: false, days: [] };
  // Делаем глубокую копию чтобы не мутировать S.menu при отмене
  _schedDraft = JSON.parse(JSON.stringify(sched));

  document.getElementById('scheduleEnabled').checked = !!_schedDraft.enabled;
  renderScheduleDays();
  openModal('scheduleModal');
}

function renderScheduleDays() {
  const wrap = document.getElementById('scheduleDaysWrap');
  if (!wrap) return;

  const allItems = S.menu.items.filter(i => i.active !== false);
  const todayId  = getTodayDayId();

  wrap.innerHTML = '';
  SCHEDULE_DAYS.forEach((d, idx) => {
    const dayData   = (_schedDraft.days || []).find(x => x.id === d.id) || { id: d.id, itemIds: [] };
    const checkedIds = new Set(dayData.itemIds || []);
    const isToday   = d.id === todayId;
    const isOpen    = isToday || idx === 0; // сегодня и первый день открыты по умолчанию

    const section = document.createElement('div');
    section.className = 'sched-day-section' + (isOpen ? ' open' : '');

    // Подсчёт выбранных для бейджа
    const totalActive = allItems.length;
    const countEl = document.createElement('span');
    countEl.className = 'sched-day-count';

    const updateCount = () => {
      const checked = section.querySelectorAll('input[data-item-id]:checked').length;
      countEl.textContent = checked + ' / ' + totalActive;
    };

    // Заголовок-кнопка
    const header = document.createElement('div');
    header.className = 'sched-day-header';
    header.innerHTML = `
      <div class="sched-day-left">
        <span class="sched-day-arrow">▶</span>
        <span class="sched-day-title">${d.name}</span>
        ${isToday ? '<span class="sched-today-badge">сегодня</span>' : ''}
      </div>
      <div class="sched-day-right">
        <span class="sched-day-count"></span>
        <div class="sched-day-btns">
          <button type="button" class="btn-sched-all">Все</button>
          <button type="button" class="btn-sched-none">Сбросить</button>
        </div>
      </div>`;

    // Заменяем span count на живой элемент
    header.querySelector('.sched-day-count').replaceWith(countEl);

    header.querySelector('.sched-day-left').addEventListener('click', () => {
      section.classList.toggle('open');
    });

    header.querySelector('.btn-sched-all').addEventListener('click', e => {
      e.stopPropagation();
      section.querySelectorAll('input[data-item-id]').forEach(cb => cb.checked = true);
      updateCount();
    });
    header.querySelector('.btn-sched-none').addEventListener('click', e => {
      e.stopPropagation();
      section.querySelectorAll('input[data-item-id]').forEach(cb => cb.checked = false);
      updateCount();
    });

    // Тело — список блюд
    const body = document.createElement('div');
    body.className = 'sched-day-body';
    body.id = 'sched-day-' + d.id;

    S.menu.categories.filter(c => c.active !== false).forEach(cat => {
      const catItems = allItems.filter(i => i.categoryId === cat.id);
      if (!catItems.length) return;

      const catLabel = document.createElement('div');
      catLabel.className = 'sched-cat-label';
      catLabel.textContent = cat.name;
      body.appendChild(catLabel);

      catItems.forEach(item => {
        const row = document.createElement('label');
        row.className = 'sched-item-row';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.itemId = item.id;
        cb.checked = checkedIds.has(item.id);
        cb.addEventListener('change', updateCount);
        const name = document.createElement('span');
        name.textContent = (item.emoji || '') + ' ' + item.name;
        row.appendChild(cb);
        row.appendChild(name);
        body.appendChild(row);
      });
    });

    section.appendChild(header);
    section.appendChild(body);
    wrap.appendChild(section);
    updateCount();
  });
}

/* ══════════════════════════════════════════════
   INITIAL DATA
══════════════════════════════════════════════ */
const INITIAL_CATEGORIES = [
  { id:'lunches',   name:'Комплексные обеды',         active:true },
  { id:'breakfast', name:'Завтраки',                   active:true },
  { id:'soups',     name:'Супы',                       active:true },
  { id:'salads',    name:'Салаты',                     active:true },
  { id:'hot',       name:'Горячее',                    active:true },
  { id:'garnish',   name:'Гарниры',                    active:true },
  { id:'pancakes',  name:'Блинчики',                   active:true },
  { id:'sweet',     name:'Сладкие добавки',            active:true },
  { id:'additions', name:'Добавки',                    active:true },
  { id:'frozen',    name:'Замороженные полуфабрикаты', active:true },
  { id:'drinks',    name:'Напитки',                    active:true },
  { id:'sugar',     name:'Сахар и приборы',            active:true },
];

const INITIAL_ITEMS = [
  {id:'l1', categoryId:'lunches',   name:'Комплексный обед №1 (суп+горячее+салат+компот)', price:320, weight:'600г', emoji:'🍱', active:true},
  {id:'l2', categoryId:'lunches',   name:'Комплексный обед №2 (суп+горячее+хлеб)',         price:270, weight:'500г', emoji:'🥘', active:true},
  {id:'l3', categoryId:'lunches',   name:'Комплексный обед №3 (горячее+гарнир+салат)',     price:290, weight:'550г', emoji:'🍽️',active:true},
  {id:'l4', categoryId:'lunches',   name:'Бизнес-ланч (суп+горячее+гарнир+напиток)',       price:350, weight:'650г', emoji:'🍱', active:true},
  {id:'b1', categoryId:'breakfast', name:'Каша овсяная с маслом',   price:90,  weight:'250г', emoji:'🥣', active:true},
  {id:'b2', categoryId:'breakfast', name:'Омлет с сыром',           price:130, weight:'200г', emoji:'🍳', active:true},
  {id:'b3', categoryId:'breakfast', name:'Сырники со сметаной',     price:150, weight:'250г', emoji:'🥞', active:true},
  {id:'b4', categoryId:'breakfast', name:'Каша гречневая с маслом', price:90,  weight:'250г', emoji:'🥣', active:true},
  {id:'b5', categoryId:'breakfast', name:'Творог со сметаной',      price:120, weight:'200г', emoji:'🥛', active:true},
  {id:'b6', categoryId:'breakfast', name:'Яйца вареные (2 шт)',     price:60,  weight:'120г', emoji:'🥚', active:true},
  {id:'s1', categoryId:'soups',     name:'Борщ со сметаной',             price:140, weight:'300г', emoji:'🍲', active:true},
  {id:'s2', categoryId:'soups',     name:'Щи из свежей капусты',         price:120, weight:'300г', emoji:'🥣', active:true},
  {id:'s3', categoryId:'soups',     name:'Куриный суп с лапшой',         price:130, weight:'300г', emoji:'🍜', active:true},
  {id:'s4', categoryId:'soups',     name:'Солянка мясная',               price:160, weight:'300г', emoji:'🍲', active:true},
  {id:'s5', categoryId:'soups',     name:'Уха рыбная',                   price:150, weight:'300г', emoji:'🐟', active:true},
  {id:'s6', categoryId:'soups',     name:'Гороховый суп с копчёностями', price:135, weight:'300г', emoji:'🫛', active:true},
  {id:'sa1',categoryId:'salads',    name:'Салат «Оливье»',           price:120, weight:'200г', emoji:'🥗', active:true},
  {id:'sa2',categoryId:'salads',    name:'Салат «Цезарь» с курицей', price:180, weight:'220г', emoji:'🥗', active:true},
  {id:'sa3',categoryId:'salads',    name:'Салат «Греческий»',        price:160, weight:'200г', emoji:'🫒', active:true},
  {id:'sa4',categoryId:'salads',    name:'Салат из свежих овощей',   price:100, weight:'200г', emoji:'🥦', active:true},
  {id:'sa5',categoryId:'salads',    name:'Свекольный с чесноком',    price:90,  weight:'180г', emoji:'🥗', active:true},
  {id:'sa6',categoryId:'salads',    name:'Салат «Мимоза»',           price:130, weight:'200г', emoji:'🥗', active:true},
  {id:'h1', categoryId:'hot',       name:'Котлета мясная (2 шт)',         price:160, weight:'180г', emoji:'🍖', active:true},
  {id:'h2', categoryId:'hot',       name:'Куриная грудка запечённая',     price:190, weight:'200г', emoji:'🍗', active:true},
  {id:'h3', categoryId:'hot',       name:'Рыба минтай жареная',           price:170, weight:'200г', emoji:'🐟', active:true},
  {id:'h4', categoryId:'hot',       name:'Голубцы с мясом (2 шт)',        price:200, weight:'300г', emoji:'🫑', active:true},
  {id:'h5', categoryId:'hot',       name:'Пельмени домашние',             price:180, weight:'300г', emoji:'🥟', active:true},
  {id:'h6', categoryId:'hot',       name:'Картофельные зразы с мясом',   price:150, weight:'250г', emoji:'🥔', active:true},
  {id:'h7', categoryId:'hot',       name:'Тефтели в томатном соусе',      price:175, weight:'280г', emoji:'🍝', active:true},
  {id:'g1', categoryId:'garnish',   name:'Картофельное пюре', price:80, weight:'200г', emoji:'🥔', active:true},
  {id:'g2', categoryId:'garnish',   name:'Гречка отварная',   price:70, weight:'200г', emoji:'🌾', active:true},
  {id:'g3', categoryId:'garnish',   name:'Рис отварной',      price:70, weight:'200г', emoji:'🍚', active:true},
  {id:'g4', categoryId:'garnish',   name:'Макароны отварные', price:70, weight:'200г', emoji:'🍝', active:true},
  {id:'g5', categoryId:'garnish',   name:'Капуста тушёная',   price:80, weight:'200г', emoji:'🥬', active:true},
  {id:'g6', categoryId:'garnish',   name:'Перловка с маслом', price:65, weight:'200г', emoji:'🌾', active:true},
  {id:'p1', categoryId:'pancakes',  name:'Блинчики с творогом (3 шт)', price:130, weight:'250г', emoji:'🥞', active:true},
  {id:'p2', categoryId:'pancakes',  name:'Блинчики с мясом (3 шт)',    price:150, weight:'270г', emoji:'🥞', active:true},
  {id:'p3', categoryId:'pancakes',  name:'Блинчики с вареньем (3 шт)', price:110, weight:'230г', emoji:'🫐', active:true},
  {id:'p4', categoryId:'pancakes',  name:'Блинчики с капустой (3 шт)', price:120, weight:'250г', emoji:'🥞', active:true},
  {id:'sw1',categoryId:'sweet',     name:'Компот домашний',   price:60, weight:'200мл',emoji:'🫙', active:true},
  {id:'sw2',categoryId:'sweet',     name:'Кисель ягодный',    price:55, weight:'200мл',emoji:'🫐', active:true},
  {id:'sw3',categoryId:'sweet',     name:'Пирожок с яблоком', price:65, weight:'100г', emoji:'🥐', active:true},
  {id:'sw4',categoryId:'sweet',     name:'Пирожок с вишней',  price:65, weight:'100г', emoji:'🍒', active:true},
  {id:'sw5',categoryId:'sweet',     name:'Кекс шоколадный',   price:80, weight:'120г', emoji:'🧁', active:true},
  {id:'ad1',categoryId:'additions', name:'Хлеб белый (2 куска)',    price:20, weight:'60г', emoji:'🍞', active:true},
  {id:'ad2',categoryId:'additions', name:'Хлеб чёрный (2 куска)',   price:20, weight:'60г', emoji:'🍞', active:true},
  {id:'ad3',categoryId:'additions', name:'Сметана (порция)',         price:40, weight:'50г', emoji:'🥛', active:true},
  {id:'ad4',categoryId:'additions', name:'Масло сливочное (порция)', price:30, weight:'20г', emoji:'🧈', active:true},
  {id:'fr1',categoryId:'frozen',    name:'Пельмени замороженные 0.5 кг',         price:250, weight:'500г', emoji:'🥟', active:true},
  {id:'fr2',categoryId:'frozen',    name:'Голубцы замороженные 1 кг',            price:380, weight:'1кг',  emoji:'🫑', active:true},
  {id:'fr3',categoryId:'frozen',    name:'Котлеты замороженные 0.5 кг',          price:290, weight:'500г', emoji:'🍖', active:true},
  {id:'fr4',categoryId:'frozen',    name:'Блинчики с мясом замороженные 0.5 кг', price:280, weight:'500г', emoji:'🥞', active:true},
  {id:'d1', categoryId:'drinks',    name:'Чай чёрный',             price:50, weight:'200мл',emoji:'🍵', active:true},
  {id:'d2', categoryId:'drinks',    name:'Кофе чёрный',            price:70, weight:'150мл',emoji:'☕', active:true},
  {id:'d3', categoryId:'drinks',    name:'Морс ягодный',           price:60, weight:'200мл',emoji:'🫐', active:true},
  {id:'d4', categoryId:'drinks',    name:'Вода питьевая 0.5л',     price:45, weight:'500мл',emoji:'💧', active:true},
  {id:'d5', categoryId:'drinks',    name:'Сок в ассортименте 0.2л',price:55, weight:'200мл',emoji:'🧃', active:true},
  {id:'su1',categoryId:'sugar',     name:'Сахар порционный (2 пак.)', price:9,  weight:'10г', emoji:'🍬', active:true},
  {id:'su2',categoryId:'sugar',     name:'Вилка одноразовая',         price:5,  weight:'',    emoji:'🍴', active:true},
  {id:'su3',categoryId:'sugar',     name:'Ложка одноразовая',         price:5,  weight:'',    emoji:'🥄', active:true},
  {id:'su4',categoryId:'sugar',     name:'Нож одноразовый',           price:5,  weight:'',    emoji:'🔪', active:true},
  {id:'su5',categoryId:'sugar',     name:'Салфетки (5 шт)',           price:10, weight:'',    emoji:'🧻', active:true},
  {id:'su6',categoryId:'sugar',     name:'Контейнер',                 price:9,  weight:'',    emoji:'📦', active:true},
];

(async function initAdmin() {
  if (authToken) {
    try { await api('GET', '/api/admin/check'); showAdminApp(); }
    catch(e) { authToken = null; localStorage.removeItem('adminToken'); }
  }
})();

/* ══════════════════════════════════════════════
   ADDRESSES MANAGEMENT  (с drag-and-drop)
══════════════════════════════════════════════ */

function loadAddresses() {
  return [];
}

function saveAddresses(data) {
  addrData = data;
  if (typeof api === 'function') {
    api('PUT', '/api/addresses', data).catch(function(e) { console.error('Ошибка сохранения адресов:', e); });
  }
}

async function fetchAddresses() {
  try {
    var res  = await fetch('/api/addresses');
    addrData = await res.json();
    var wasAddresses = document.getElementById('addressesSection').style.display === 'block';
    if (wasAddresses) renderAddressesPanel(getOpenCities());
    renderCityTabs();
    renderSidebar();
  } catch(e) { console.error('Ошибка загрузки адресов:', e); }
}

var addrData = loadAddresses();

function getAddressesByCityId(cityId) {
  var city = addrData.find(function(c) { return c.id === cityId; });
  return city ? city.list : [];
}

/* ══════════════════════════════════════════════
   DRAG-AND-DROP
══════════════════════════════════════════════ */
var dragState = { type: null, cityId: null, fromIdx: null, el: null, placeholder: null };

function makePlaceholder(height) {
  var ph = document.createElement('div');
  ph.className = 'drag-placeholder';
  ph.style.height = (height || 40) + 'px';
  return ph;
}

function getOpenCities() {
  var open = [];
  document.querySelectorAll('.addr-city-block.open').forEach(function(b) { open.push(b.dataset.cityId); });
  return open;
}

/* Drag городов */
function initCityDrag(handle, block, cityId) {
  handle.setAttribute('draggable', 'true');
  handle.addEventListener('dragstart', function(e) {
    dragState.type        = 'city';
    dragState.cityId      = cityId;
    dragState.el          = block;
    dragState.placeholder = makePlaceholder(block.offsetHeight);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(function() { block.classList.add('dragging'); }, 0);
  });
  handle.addEventListener('dragend', function() {
    block.classList.remove('dragging');
    if (dragState.placeholder && dragState.placeholder.parentNode) dragState.placeholder.parentNode.removeChild(dragState.placeholder);
    dragState.type = null;
  });
}

function initCityDropZone(wrap) {
  wrap.addEventListener('dragover', function(e) {
    if (dragState.type !== 'city') return;
    e.preventDefault();
    var after = getDragAfter(wrap, e.clientY, '.addr-city-block:not(.dragging)');
    after ? wrap.insertBefore(dragState.placeholder, after) : wrap.appendChild(dragState.placeholder);
  });
  wrap.addEventListener('drop', function(e) {
    if (dragState.type !== 'city') return;
    e.preventDefault();
    var openBefore = getOpenCities();
    var fromIdx = addrData.findIndex(function(c) { return c.id === dragState.cityId; });
    var city    = addrData.splice(fromIdx, 1)[0];
    var siblings = Array.from(wrap.children).filter(function(c) { return c !== dragState.el && !c.classList.contains('addr-city-block'); });
    var allCh    = Array.from(wrap.children).filter(function(c) { return c !== dragState.el; });
    var toIdx    = allCh.indexOf(dragState.placeholder);
    if (toIdx < 0) toIdx = addrData.length;
    addrData.splice(toIdx, 0, city);
    saveAddresses(addrData);
    renderAddressesPanel(openBefore);
  });
}

/* Drag адресов */
function initAddrDrag(handle, row, cityId, idx) {
  handle.setAttribute('draggable', 'true');
  handle.addEventListener('dragstart', function(e) {
    dragState.type        = 'addr';
    dragState.cityId      = cityId;
    dragState.fromIdx     = idx;
    dragState.el          = row;
    dragState.placeholder = makePlaceholder(row.offsetHeight);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(function() { row.classList.add('dragging'); }, 0);
  });
  handle.addEventListener('dragend', function() {
    row.classList.remove('dragging');
    if (dragState.placeholder && dragState.placeholder.parentNode) dragState.placeholder.parentNode.removeChild(dragState.placeholder);
    dragState.type = null;
  });
}

function initAddrDropZone(body, cityId) {
  body.addEventListener('dragover', function(e) {
    if (dragState.type !== 'addr' || dragState.cityId !== cityId) return;
    e.preventDefault();
    var after  = getDragAfter(body, e.clientY, '.addr-row:not(.dragging)');
    var addBtn = body.querySelector('.addr-add-row-btn');
    after ? body.insertBefore(dragState.placeholder, after) : body.insertBefore(dragState.placeholder, addBtn);
  });
  body.addEventListener('drop', function(e) {
    if (dragState.type !== 'addr' || dragState.cityId !== cityId) return;
    e.preventDefault();
    var city = addrData.find(function(c) { return c.id === cityId; });
    if (!city) return;
    var addr    = city.list.splice(dragState.fromIdx, 1)[0];
    var allRows = Array.from(body.children).filter(function(c) { return c.classList.contains('addr-row') && !c.classList.contains('dragging') || c === dragState.placeholder; });
    var toIdx   = allRows.indexOf(dragState.placeholder);
    if (toIdx < 0) toIdx = city.list.length;
    if (toIdx > dragState.fromIdx) toIdx--;
    city.list.splice(toIdx, 0, addr);
    var openBefore = getOpenCities();
    saveAddresses(addrData);
    renderAddressesPanel(openBefore);
  });
}

function getDragAfter(container, y, selector) {
  var els = Array.from(container.querySelectorAll(selector));
  return els.reduce(function(closest, el) {
    var box    = el.getBoundingClientRect();
    var offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset: offset, el: el };
    return closest;
  }, { offset: -Infinity }).el || null;
}

/* ── Tabs ── */
document.getElementById('tabMenu').addEventListener('click', function() {
  document.getElementById('tabMenu').classList.add('active');
  document.getElementById('tabAddresses').classList.remove('active');
  document.getElementById('tabOrders').classList.remove('active');
  document.getElementById('menuSection').style.display = 'block';
  document.getElementById('addressesSection').style.display = 'none';
  document.getElementById('ordersSection').style.display = 'none';
  document.getElementById('addItemBtn').style.display = 'flex';
  if (S.activeCatId) document.getElementById('statsRow').style.display = 'flex';
  document.getElementById('topbarTitle').textContent = S.activeCatId
    ? (S.menu.categories.find(function(c){ return c.id === S.activeCatId; }) || {}).name || 'Выберите категорию'
    : 'Выберите категорию';
});

document.getElementById('tabAddresses').addEventListener('click', function() {
  document.getElementById('tabAddresses').classList.add('active');
  document.getElementById('tabMenu').classList.remove('active');
  document.getElementById('tabOrders').classList.remove('active');
  document.getElementById('menuSection').style.display = 'none';
  document.getElementById('addressesSection').style.display = 'block';
  document.getElementById('ordersSection').style.display = 'none';
  document.getElementById('addItemBtn').style.display = 'none';
  document.getElementById('statsRow').style.display = 'none';
  document.getElementById('topbarTitle').textContent = 'Города и адреса';
  document.getElementById('itemsGrid').innerHTML = '';
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('welcomeState').classList.add('hidden');
  renderAddressesPanel();
});

/* ── Render ── */
function renderAddressesPanel(openCities) {
  var wrap = document.getElementById('sidebarAddresses');
  wrap.innerHTML = '';
  openCities = openCities || [];

  addrData.forEach(function(city) {
    var block = document.createElement('div');
    block.className = 'addr-city-block' + (openCities.indexOf(city.id) !== -1 ? ' open' : '');
    block.dataset.cityId = city.id;

    var hdr = document.createElement('div');
    hdr.className = 'addr-city-header';

    // Top row: drag + name + actions
    var topRow = document.createElement('div');
    topRow.className = 'addr-city-header-top';

    var dragHandle = document.createElement('span');
    dragHandle.className = 'addr-drag-handle';
    dragHandle.title     = 'Перетащить';
    dragHandle.innerHTML = '&#8942;&#8942;';

    var nameBtn = document.createElement('button');
    nameBtn.className = 'addr-city-toggle';
    nameBtn.innerHTML =
      '<span class="addr-city-arrow">&#9654;</span>' +
      '<span>' + city.name + '</span>' +
      '<span class="addr-city-count">' + city.list.length + '</span>';
    nameBtn.addEventListener('click', function() { block.classList.toggle('open'); });

    var actions = document.createElement('div');
    actions.className = 'addr-city-actions';
    actions.innerHTML =
      '<button class="addr-icon-btn" data-action="edit-city" data-id="' + city.id + '" title="Переименовать">&#9998;</button>' +
      '<button class="addr-icon-btn danger" data-action="del-city" data-id="' + city.id + '" title="Удалить">&#128465;</button>';

    topRow.appendChild(dragHandle);
    topRow.appendChild(nameBtn);
    topRow.appendChild(actions);

    // Toggles row
    var togglesRow = document.createElement('div');
    togglesRow.className = 'addr-city-toggles';

    // Active toggle
    var activeItem = document.createElement('div');
    activeItem.className = 'addr-toggle-item';
    var activeLabel = document.createElement('label');
    activeLabel.className = 'city-toggle-wrap';
    activeLabel.innerHTML =
      '<input type="checkbox" class="city-toggle-input" data-field="active" data-id="' + city.id + '" ' + (city.active !== false ? 'checked' : '') + ' />' +
      '<span class="city-toggle-slider"></span>';
    var activeTitle = document.createElement('span');
    activeTitle.className = 'addr-toggle-title';
    activeTitle.textContent = 'Город активен';
    activeItem.appendChild(activeLabel);
    activeItem.appendChild(activeTitle);

    // Payment toggle
    var payItem = document.createElement('div');
    payItem.className = 'addr-toggle-item';
    var payLabel = document.createElement('label');
    payLabel.className = 'city-toggle-wrap';
    payLabel.innerHTML =
      '<input type="checkbox" class="city-toggle-input" data-field="payment" data-id="' + city.id + '" ' + (city.paymentEnabled !== false ? 'checked' : '') + ' />' +
      '<span class="city-toggle-slider pay"></span>';
    var payTitle = document.createElement('span');
    payTitle.className = 'addr-toggle-title';
    payTitle.textContent = 'Онлайн-оплата';
    payItem.appendChild(payLabel);
    payItem.appendChild(payTitle);

    togglesRow.appendChild(activeItem);
    togglesRow.appendChild(payItem);

    hdr.appendChild(topRow);
    hdr.appendChild(togglesRow);

    // Toggle handlers
    activeLabel.querySelector('input').addEventListener('change', function(e) {
      var c = addrData.find(function(x){ return x.id === e.target.dataset.id; });
      if (c) {
        c.active = e.target.checked;
        activeTitle.textContent = c.active ? 'Город активен' : 'Город откл.';
        saveAddresses(addrData);
        toast(c.name + ': ' + (c.active ? 'включён' : 'отключён'), 'success');
      }
    });
    payLabel.querySelector('input').addEventListener('change', function(e) {
      var c = addrData.find(function(x){ return x.id === e.target.dataset.id; });
      if (c) {
        c.paymentEnabled = e.target.checked;
        payTitle.textContent = c.paymentEnabled ? 'Онлайн-оплата' : 'Оплата откл.';
        saveAddresses(addrData);
        toast(c.name + ': оплата ' + (c.paymentEnabled ? 'включена' : 'отключена'), 'success');
      }
    });
    block.appendChild(hdr);

    var body = document.createElement('div');
    body.className = 'addr-city-body';

    city.list.forEach(function(addr, idx) {
      var row = document.createElement('div');
      row.className = 'addr-row';

      var addrDrag = document.createElement('span');
      addrDrag.className = 'addr-drag-handle small';
      addrDrag.title     = 'Перетащить';
      addrDrag.innerHTML = '&#8942;&#8942;';

      var text = document.createElement('span');
      text.className   = 'addr-text';
      text.textContent = addr;

      var rowActions = document.createElement('div');
      rowActions.className = 'addr-row-actions';
      rowActions.innerHTML =
        '<button class="addr-icon-btn" data-action="edit-addr" data-city="' + city.id + '" data-idx="' + idx + '">&#9998;</button>' +
        '<button class="addr-icon-btn danger" data-action="del-addr" data-city="' + city.id + '" data-idx="' + idx + '">&#128465;</button>';

      row.appendChild(addrDrag);
      row.appendChild(text);
      row.appendChild(rowActions);
      body.appendChild(row);
      initAddrDrag(addrDrag, row, city.id, idx);
    });

    var addBtn = document.createElement('button');
    addBtn.className      = 'addr-add-row-btn';
    addBtn.innerHTML      = '&#43; Добавить адрес';
    addBtn.dataset.action = 'add-addr';
    addBtn.dataset.city   = city.id;
    body.appendChild(addBtn);

    block.appendChild(body);

    block.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      var cId    = btn.dataset.city || btn.dataset.id;
      var idx    = btn.dataset.idx !== undefined ? parseInt(btn.dataset.idx) : null;
      if (action === 'edit-city') openCityModal(city.id);
      if (action === 'del-city')  showConfirm('Удалить город "' + city.name + '" и все адреса?', function() { deleteCity(city.id); });
      if (action === 'add-addr')  openAddressModal(cId, null);
      if (action === 'edit-addr') openAddressModal(cId, idx);
      if (action === 'del-addr')  showConfirm('Удалить адрес?', function() { deleteAddress(cId, idx); });
    });

    initAddrDropZone(body, city.id);
    initCityDrag(dragHandle, block, city.id);
    wrap.appendChild(block);
  });

  initCityDropZone(wrap);
}

/* ── City modal ── */
document.getElementById('addCityBtn').addEventListener('click', function() { openCityModal(null); });
document.getElementById('cityModalClose').addEventListener('click',   function() { closeModal('cityModal'); });
document.getElementById('cityModalCancel').addEventListener('click',  function() { closeModal('cityModal'); });

function openCityModal(cityId) {
  var city = cityId ? addrData.find(function(c){ return c.id === cityId; }) : null;
  document.getElementById('cityModalTitle').textContent = city ? 'Переименовать город' : 'Новый город';
  document.getElementById('editCityId').value = city ? city.id : '';
  document.getElementById('cityName').value   = city ? city.name : '';
  document.getElementById('cityPhone').value  = city ? (city.phone || '') : '';
  openModal('cityModal');
}

document.getElementById('cityForm').addEventListener('submit', function(e) {
  e.preventDefault();
  var name   = document.getElementById('cityName').value.trim();
  var editId = document.getElementById('editCityId').value;
  if (!name) return;
  var openBefore = getOpenCities();
  if (editId) {
    var city = addrData.find(function(c){ return c.id === editId; });
    if (city) {
      city.name  = name;
      city.phone = document.getElementById('cityPhone').value.trim() || city.phone || '';
    }
    toast('Город обновлён', 'success');
  } else {
    addrData.push({ id: 'city-' + Date.now(), name: name, phone: document.getElementById('cityPhone').value.trim(), list: [] });
    toast('Город добавлен', 'success');
  }
  saveAddresses(addrData);
  closeModal('cityModal');
  renderAddressesPanel(openBefore);
});

function deleteCity(cityId) {
  addrData = addrData.filter(function(c){ return c.id !== cityId; });
  saveAddresses(addrData);
  renderAddressesPanel();
  toast('Город удалён', 'success');
}

/* ── Address modal ── */
document.getElementById('addressModalClose').addEventListener('click',  function() { closeModal('addressModal'); });
document.getElementById('addressModalCancel').addEventListener('click', function() { closeModal('addressModal'); });

function openAddressModal(cityId, idx) {
  var city = addrData.find(function(c){ return c.id === cityId; });
  var addr = (idx !== null && city) ? city.list[idx] : null;
  document.getElementById('addressModalTitle').textContent = addr ? 'Редактировать адрес' : 'Новый адрес';
  document.getElementById('editAddressCityId').value = cityId;
  document.getElementById('editAddressIdx').value    = idx !== null ? idx : '';
  document.getElementById('addressValue').value      = addr || '';
  openModal('addressModal');
}

document.getElementById('addressForm').addEventListener('submit', function(e) {
  e.preventDefault();
  var value  = document.getElementById('addressValue').value.trim().toUpperCase();
  var cityId = document.getElementById('editAddressCityId').value;
  var idxRaw = document.getElementById('editAddressIdx').value;
  if (!value) return;
  var city = addrData.find(function(c){ return c.id === cityId; });
  if (!city) return;
  var openBefore = getOpenCities();
  if (idxRaw !== '') {
    city.list[parseInt(idxRaw)] = value;
    toast('Адрес обновлён', 'success');
  } else {
    city.list.push(value);
    toast('Адрес добавлен', 'success');
  }
  saveAddresses(addrData);
  closeModal('addressModal');
  renderAddressesPanel(openBefore);
});

function deleteAddress(cityId, idx) {
  var city = addrData.find(function(c){ return c.id === cityId; });
  if (!city) return;
  var openBefore = getOpenCities();
  city.list.splice(idx, 1);
  saveAddresses(addrData);
  renderAddressesPanel(openBefore);
  toast('Адрес удалён', 'success');
}


/* ===== ORDERS TAB ===== */
var ALL_STATUSES = [
  { id: 'pending',    label: 'Ожидание',  color: '#9b59b6' },
  { id: 'new',        label: 'Принят',    color: '#f5a623' },
  { id: 'assembling', label: 'Сборка',    color: '#e67e22' },
  { id: 'ready',      label: 'Готов',     color: '#27ae60' },
  { id: 'delivering', label: 'Выдан',     color: '#2980b9' },
  { id: 'done',       label: 'Доставлен', color: '#7f8c8d' },
  { id: 'cancelled',  label: 'Отменён',   color: '#e74c3c' },
];

document.getElementById('tabOrders').addEventListener('click', function() {
  document.getElementById('tabOrders').classList.add('active');
  document.getElementById('tabMenu').classList.remove('active');
  document.getElementById('tabAddresses').classList.remove('active');
  document.getElementById('menuSection').style.display = 'none';
  document.getElementById('addressesSection').style.display = 'none';
  document.getElementById('ordersSection').style.display = 'block';
  document.getElementById('addItemBtn').style.display = 'none';
  document.getElementById('statsRow').style.display = 'none';
  document.getElementById('topbarTitle').textContent = 'Заказы';
  document.getElementById('itemsGrid').innerHTML = '';
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('welcomeState').classList.add('hidden');
  loadOrders();
});

document.getElementById('orderStatusFilter').addEventListener('change', function() {
  renderOrders(window._allOrders || []);
});

async function loadOrders() {
  document.getElementById('ordersList').innerHTML = '<div style="padding:16px;text-align:center;color:#999">Загружаем...</div>';
  try {
    var res = await fetch('/api/admin/orders', { headers: { 'Authorization': 'Bearer ' + S.token } });
    var orders = await res.json();
    window._allOrders = orders;
    renderOrders(orders);
  } catch(e) {
    document.getElementById('ordersList').innerHTML = '<div style="padding:16px;color:red">Ошибка загрузки</div>';
  }
}

function renderOrders(orders) {
  var filter = document.getElementById('orderStatusFilter').value;
  var filtered = filter ? orders.filter(function(o){ return o.status === filter; }) : orders;
  var list = document.getElementById('ordersList');
  if (!filtered.length) {
    list.innerHTML = '<div style="padding:16px;text-align:center;color:#999">Заказов нет</div>';
    return;
  }
  list.innerHTML = filtered.map(function(o) {
    var st = ALL_STATUSES.find(function(s){ return s.id === o.status; }) || { label: o.status, color: '#999' };
    var date = new Date(o.createdAt).toLocaleString('ru', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    var items = (o.items || []).map(function(i){ return i.name + ' ×' + i.qty; }).join(', ');
    var statusOptions = ALL_STATUSES.map(function(s) {
      return '<option value="' + s.id + '"' + (s.id === o.status ? ' selected' : '') + '>' + s.label + '</option>';
    }).join('');
    return '<div style="background:#f8f8f8;border-radius:10px;padding:12px;margin:8px 12px;font-size:13px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
        '<strong>#' + o.id.slice(-6) + '</strong>' +
        '<span style="background:' + st.color + ';color:#fff;padding:2px 8px;border-radius:12px;font-size:11px">' + st.label + '</span>' +
      '</div>' +
      '<div style="color:#666;margin-bottom:2px">' + date + ' · ' + (o.cityName || '') + '</div>' +
      '<div style="color:#333;margin-bottom:2px">' + o.name + ' · ' + o.phone + '</div>' +
      '<div style="color:#666;font-size:11px;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + items + '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-top:6px">' +
        '<strong style="color:#f5a623">' + (o.total || 0) + ' ₽</strong>' +
        '<select onchange="changeOrderStatus(\'' + o.id + '\', this.value)" style="flex:1;padding:4px 6px;border-radius:6px;border:1px solid #ddd;font-size:12px">' + statusOptions + '</select>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function changeOrderStatus(orderId, status) {
  try {
    await fetch('/api/admin/orders/' + orderId + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token },
      body: JSON.stringify({ status: status })
    });
    showToast('Статус обновлён');
    loadOrders();
  } catch(e) {
    showToast('Ошибка обновления');
  }
}

/* ══════════════════════════════════════════════
   PROMO CODES MANAGEMENT
══════════════════════════════════════════════ */
let _promos        = [];     // текущий список с сервера
let _promoEditMode = false;  // true = редактирование, false = создание
let _selectedItemPrices = {}; // { itemId: price } для type='item'

// Открываем модал
document.getElementById('promosBtn').addEventListener('click', openPromosModal);
document.getElementById('promosModalClose').addEventListener('click', () => closeModal('promosModal'));

async function openPromosModal() {
  await loadPromos();
  renderPromosList();
  hidePromoForm();
  openModal('promosModal');
}

async function loadPromos() {
  try {
    _promos = await api('GET', '/api/admin/promos');
  } catch(e) { _promos = []; }
}

/* ── Список ── */
function renderPromosList() {
  const list  = document.getElementById('promosList');
  const empty = document.getElementById('promosEmpty');
  if (!_promos.length) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  const today = new Date(); today.setHours(0,0,0,0);

  list.innerHTML = _promos.map(p => {
    const expired  = p.expiresAt && new Date(p.expiresAt) < today;
    const exhausted= p.maxUses !== null && p.usedCount >= p.maxUses;
    const inactive = !p.active || expired || exhausted;

    let statusText = '';
    let statusCls  = 'promo-tag green';
    if (!p.active)    { statusText = 'Выкл'; statusCls = 'promo-tag grey'; }
    else if (expired) { statusText = 'Истёк'; statusCls = 'promo-tag red'; }
    else if (exhausted){ statusText = 'Исчерпан'; statusCls = 'promo-tag red'; }
    else {
      const parts = [];
      if (p.maxUses !== null) parts.push(`осталось ${p.maxUses - p.usedCount} исп.`);
      if (p.expiresAt) {
        const diff = Math.ceil((new Date(p.expiresAt) - today) / 86400000);
        parts.push(`${diff} дн.`);
      }
      statusText = parts.length ? parts.join(' · ') : 'Активен';
    }

    let descr = '';
    if (p.type === 'percent') descr = `−${p.discount}%`;
    else if (p.type === 'fixed') descr = `−${p.discount} ₽`;
    else if (p.type === 'item') {
      const cnt = Object.keys(p.itemPrices || {}).length;
      descr = `${cnt} блюд по спец. цене`;
    }

    return `<div class="promo-row ${inactive ? 'inactive' : ''}" data-id="${p.id}">
      <div class="promo-row-left">
        <span class="promo-code-badge">${p.code}</span>
        <span class="promo-row-label">${p.label || ''}</span>
        <span class="promo-row-descr">${descr}</span>
      </div>
      <div class="promo-row-right">
        <span class="${statusCls}">${statusText}</span>
        <button class="card-btn card-btn-edit" data-action="edit-promo" data-id="${p.id}">✏️</button>
        <button class="card-btn card-btn-delete" data-action="del-promo" data-id="${p.id}">🗑</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('[data-action="edit-promo"]').forEach(btn => {
    btn.addEventListener('click', () => openPromoForm(_promos.find(p => p.id === btn.dataset.id)));
  });
  list.querySelectorAll('[data-action="del-promo"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = _promos.find(x => x.id === btn.dataset.id);
      showConfirm(`Удалить промокод «${p?.code}»?`, async () => {
        try {
          await api('DELETE', '/api/admin/promos/' + btn.dataset.id);
          await loadPromos(); renderPromosList();
          toast('Промокод удалён', 'success');
        } catch(e) { toast('Ошибка: ' + e.message, 'error'); }
      });
    });
  });
}

/* ── Форма ── */
document.getElementById('promoAddBtn').addEventListener('click', () => openPromoForm(null));
document.getElementById('promoFormCancel').addEventListener('click', hidePromoForm);

// Тип скидки
document.querySelectorAll('.promo-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.promo-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyPromoTypeUI(btn.dataset.type);
  });
});

function applyPromoTypeUI(type) {
  const discWrap  = document.getElementById('promoDiscountWrap');
  const itemWrap  = document.getElementById('promoItemPricesWrap');
  const discLabel = document.getElementById('promoDiscountLabel');
  if (type === 'item') {
    discWrap.classList.add('hidden');
    itemWrap.classList.remove('hidden');
  } else {
    discWrap.classList.remove('hidden');
    itemWrap.classList.add('hidden');
    discLabel.textContent = type === 'percent' ? 'Размер скидки (%)' : 'Скидка (₽)';
  }
}

// Поиск блюд для item-промокода
document.getElementById('promoItemSearch').addEventListener('input', function() {
  const q = this.value.trim().toLowerCase();
  renderPromoItemResults(q);
});

function renderPromoItemResults(q) {
  const res = document.getElementById('promoItemResults');
  if (!q) { res.innerHTML = ''; return; }
  const items = (S.menu.items || []).filter(i =>
    i.active !== false && i.name.toLowerCase().includes(q)
  ).slice(0, 8);
  if (!items.length) { res.innerHTML = '<div class="promo-no-results">Не найдено</div>'; return; }
  res.innerHTML = items.map(i => `
    <div class="promo-search-item" data-id="${i.id}" data-name="${i.name}" data-price="${getPromoItemPrice(i)}">
      <span>${i.emoji || '🍽️'} ${i.name}</span>
      <span class="promo-item-orig-price">${getPromoItemPrice(i)} ₽</span>
    </div>`).join('');
  res.querySelectorAll('.promo-search-item').forEach(row => {
    row.addEventListener('click', () => {
      const id    = row.dataset.id;
      const name  = row.dataset.name;
      const price = parseInt(row.dataset.price);
      if (!_selectedItemPrices[id]) _selectedItemPrices[id] = price;
      document.getElementById('promoItemSearch').value = '';
      renderPromoItemResults('');
      renderSelectedItemPrices();
    });
  });
}

function getPromoItemPrice(item) {
  if (S.activeCity && item.cityPrices) return item.cityPrices[S.activeCity] ?? item.price ?? 0;
  return item.price ?? 0;
}

function renderSelectedItemPrices() {
  const wrap = document.getElementById('promoSelectedItems');
  const ids  = Object.keys(_selectedItemPrices);
  if (!ids.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = ids.map(id => {
    const item = S.menu.items.find(i => i.id === id);
    if (!item) return '';
    const origPrice = getPromoItemPrice(item);
    return `<div class="promo-sel-item" data-id="${id}">
      <span class="promo-sel-name">${item.emoji || '🍽️'} ${item.name}</span>
      <span class="promo-sel-orig">обычно ${origPrice} ₽</span>
      <span class="promo-sel-arrow">→</span>
      <input type="number" class="promo-sel-price" data-id="${id}"
        value="${_selectedItemPrices[id]}" min="0" placeholder="цена" />
      <span class="promo-sel-rub">₽</span>
      <button class="promo-sel-del" data-id="${id}">✕</button>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.promo-sel-price').forEach(inp => {
    inp.addEventListener('input', () => {
      _selectedItemPrices[inp.dataset.id] = parseInt(inp.value) || 0;
    });
  });
  wrap.querySelectorAll('.promo-sel-del').forEach(btn => {
    btn.addEventListener('click', () => {
      delete _selectedItemPrices[btn.dataset.id];
      renderSelectedItemPrices();
    });
  });
}

function openPromoForm(promo) {
  _promoEditMode = !!promo;
  _selectedItemPrices = promo?.itemPrices ? { ...promo.itemPrices } : {};

  document.getElementById('promoFormTitle').textContent = promo ? 'Редактировать промокод' : 'Новый промокод';
  document.getElementById('promoEditId').value    = promo?.id    || '';
  document.getElementById('promoCode').value      = promo?.code  || '';
  document.getElementById('promoLabel').value     = promo?.label || '';
  document.getElementById('promoDiscount').value  = promo?.discount ?? '';
  document.getElementById('promoMaxUses').value   = promo?.maxUses  ?? '';
  document.getElementById('promoExpiresAt').value = promo?.expiresAt ? promo.expiresAt.slice(0,10) : '';

  const type = promo?.type || 'percent';
  document.querySelectorAll('.promo-type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type);
  });
  applyPromoTypeUI(type);
  renderSelectedItemPrices();

  document.getElementById('promoFormWrap').classList.remove('hidden');
  document.getElementById('promoFormWrap').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hidePromoForm() {
  document.getElementById('promoFormWrap').classList.add('hidden');
  _selectedItemPrices = {};
}

document.getElementById('promoFormSave').addEventListener('click', async () => {
  const id      = document.getElementById('promoEditId').value;
  const code    = document.getElementById('promoCode').value.trim().toUpperCase();
  const label   = document.getElementById('promoLabel').value.trim();
  const type    = document.querySelector('.promo-type-btn.active')?.dataset.type || 'percent';
  const discount= parseFloat(document.getElementById('promoDiscount').value) || 0;
  const maxUses = document.getElementById('promoMaxUses').value
    ? parseInt(document.getElementById('promoMaxUses').value) : null;
  const expiresRaw = document.getElementById('promoExpiresAt').value;
  const expiresAt  = expiresRaw ? new Date(expiresRaw + 'T23:59:59').toISOString() : null;

  if (!code) { toast('Введите код промокода', 'error'); return; }
  if (type !== 'item' && !discount) { toast('Укажите размер скидки', 'error'); return; }
  if (type === 'item' && !Object.keys(_selectedItemPrices).length) {
    toast('Добавьте хотя бы одно блюдо', 'error'); return;
  }

  const body = { code, label: label || code, type, discount, maxUses, expiresAt,
    itemPrices: type === 'item' ? _selectedItemPrices : {}, active: true };

  try {
    if (id) {
      await api('PUT', '/api/admin/promos/' + id, body);
      toast('Промокод обновлён ✓', 'success');
    } else {
      await api('POST', '/api/admin/promos', body);
      toast('Промокод создан ✓', 'success');
    }
    await loadPromos();
    renderPromosList();
    hidePromoForm();
  } catch(e) { toast('Ошибка: ' + e.message, 'error'); }
});

// WebSocket — обновляем список если промокоды изменились с другого устройства
const _origAdminWSMsg = _adminWS?.onmessage;
function patchAdminWSForPromos(ws) {
  if (!ws) return;
  const orig = ws.onmessage;
  ws.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.event === 'promos') {
        _promos = msg.data;
        if (document.getElementById('promosModal') &&
            !document.getElementById('promosModal').classList.contains('hidden')) {
          renderPromosList();
        }
      }
    } catch {}
    if (orig) orig.call(ws, e);
  };
}
