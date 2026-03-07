/* ===== TELEGRAM WEB APP INIT ===== */
var deliveryZoneResult = null;
var zoneCheckTimer     = null;
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.enableClosingConfirmation();
}

/* Адреса — загружаем с сервера при старте, кешируем */
var _addressesCache = null;

async function loadAddressesCache() {
  try {
    var res = await fetch('/api/addresses');
    _addressesCache = await res.json();
  } catch(e) { _addressesCache = null; }
}

function getCityAddresses(cityId) {
  if (_addressesCache) {
    var city = _addressesCache.find(function(c){ return c.id === cityId; });
    if (city) return city.list || [];
  }
  return ADDRESSES[cityId] || [];
}

/* ═══════════════════════════════════════════════════════
   DYNAMIC MENU  ─  загружается с /api/menu
═══════════════════════════════════════════════════════ */
let dynamicMenu = null;
let menuLoadError = null;
const MENU_CACHE_KEY = 'menuCacheV1';

function setMenuLoadError(message) {
  menuLoadError = message || null;
}

function reconcileCartWithMenu() {
  const available = new Set(getAllItems().map(i => i.id));
  let changed = false;
  for (const id of Object.keys(state.cart)) {
    if (!available.has(id)) {
      delete state.cart[id];
      changed = true;
    }
  }
  if (changed) saveCart();
}

function rerenderMenuAfterUpdate() {
  if (!state.city) return;
  const categories = getCategories();
  if (!categories.find(c => c.id === state.activeCategory)) {
    state.activeCategory = categories[0]?.id || null;
  }
  reconcileCartWithMenu();
  const wrapper = document.getElementById('menuWrapper');
  if (wrapper && wrapper.style.display !== 'block') {
    document.getElementById('cityPrompt').style.display = 'none';
    wrapper.style.display = 'block';
  }
  renderCategories();
  renderMenuContent();
  updateCartFab();
  updateCartSheet();
}

function saveMenuCache(menu) {
  try { localStorage.setItem(MENU_CACHE_KEY, JSON.stringify(menu)); } catch {}
}

function loadMenuCache() {
  try {
    const raw = localStorage.getItem(MENU_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.categories) || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getCategories() {
  if (!dynamicMenu || menuLoadError) return [];
  return dynamicMenu.categories.filter(c => c.active !== false);
}

function getItems(catId) {
  if (!dynamicMenu || menuLoadError) return [];
  return dynamicMenu.items.filter(i => i.categoryId === catId && i.active !== false);
}

function findItemAny(id) {
  if (dynamicMenu) return dynamicMenu.items.find(i => i.id === id) || null;
  return null;
}

function getAllItems() {
  if (!dynamicMenu || menuLoadError) return [];
  return dynamicMenu.items.filter(i => i.active !== false);
}

function itemImgSrc(item) {
  return item?.imageBase64 || item?.image || null;
}

async function loadMenuFromAPI() {
  // Сначала показываем кэш — чтобы не висело «Загружаем меню...»
  const cached = loadMenuCache();
  if (cached && cached.categories.length > 0) {
    dynamicMenu = cached;
    setMenuLoadError(null);
    rerenderMenuAfterUpdate();
  }

  try {
    const res = await fetch('/api/menu');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data.categories) || !Array.isArray(data.items)) throw new Error('Неверный формат данных');
    dynamicMenu = data;
    saveMenuCache(dynamicMenu);
    setMenuLoadError(null);
    rerenderMenuAfterUpdate();
  } catch (err) {
    console.error('Failed to load menu:', err);
    if (!dynamicMenu) {
      dynamicMenu = { categories: [], items: [] };
      setMenuLoadError('Не удалось загрузить меню. Проверьте подключение.');
    }
  }
}

/* ===== STATE ===== */
const state = {
  city:           localStorage.getItem('selectedCity') || null,
  cart:           JSON.parse(localStorage.getItem('cart') || '{}'),
  promo:          null,
  promoDiscount:  0,
  deliveryMode:   'delivery',
  activeCategory: null,
  itemModal:      { item: null, qty: 1 },
};

/* ===== HELPERS ===== */
function fmt(n) { return n.toLocaleString('ru-RU') + ' ₽'; }
function saveCart() { localStorage.setItem('cart', JSON.stringify(state.cart)); }
function getCartCount() { return Object.values(state.cart).reduce((s, v) => s + v, 0); }

function getSubtotal() {
  let total = 0;
  for (const [id, qty] of Object.entries(state.cart)) {
    const item = findItemAny(id);
    if (item) total += item.price * qty;
  }
  return total;
}

function getDeliveryPrice(subtotal) {
  if (state.deliveryMode === 'pickup') return 0;
  // Бесплатная доставка от порога — всегда проверяем независимо от зон
  if (subtotal >= DELIVERY_INFO.freeDeliveryFrom) return 0;
  // Если есть результат проверки зоны — используем его стоимость
  // Но игнорируем если сумма упала ниже порога (cost мог быть 0 при старой сумме)
  if (deliveryZoneResult && deliveryZoneResult.allowed) {
    return deliveryZoneResult.cost > 0 ? deliveryZoneResult.cost : DELIVERY_INFO.deliveryCost;
  }
  // Fallback: стандартная логика для городов без зон
  return DELIVERY_INFO.deliveryCost;
}

function getTotal() {
  const sub      = getSubtotal();
  const delivery = getDeliveryPrice(sub);
  return Math.max(0, sub + delivery - Math.min(state.promoDiscount, sub + delivery));
}

/* ===== RENDER CITY LIST ===== */
function getCitiesFromCache() {
  if (_addressesCache && _addressesCache.length) return _addressesCache;
  return CITIES;
}

function renderCityList() {
  const list = document.getElementById('cityList');
  list.innerHTML = '';
  getCitiesFromCache().forEach(city => {
    const li = document.createElement('li');
    li.className = 'city-item' + (state.city === city.id ? ' selected' : '');
    li.innerHTML = `<span class="city-item-icon">📍</span><span>${city.name}</span>`;
    li.addEventListener('click', () => selectCity(city.id, city.name));
    list.appendChild(li);
  });
}

function selectCity(id, name) {
  state.city = id;
  localStorage.setItem('selectedCity', id);
  document.getElementById('headerCityName').textContent = name;
  closeModal('cityModal');
  showMenu();
  renderAddressesList();
  tg?.HapticFeedback?.impactOccurred('light');
}

function showMenu() {
  document.getElementById('cityPrompt').style.display  = 'none';
  document.getElementById('menuWrapper').style.display = 'block';
  renderCategories();
  renderMenuContent();
}

function renderCategories() {
  const cats   = getCategories();
  const scroll = document.getElementById('categoriesScroll');
  scroll.innerHTML = '';
  if (!state.activeCategory && cats.length) state.activeCategory = cats[0].id;
  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className    = 'cat-tab' + (state.activeCategory === cat.id ? ' active' : '');
    btn.textContent  = cat.name;
    btn.dataset.catId = cat.id;
    btn.addEventListener('click', () => {
      state.activeCategory = cat.id;
      setActiveCatTab(cat.id);
      scrollToSection(cat.id);
    });
    scroll.appendChild(btn);
  });
}

function setActiveCatTab(catId) {
  document.querySelectorAll('.cat-tab').forEach(b => b.classList.toggle('active', b.dataset.catId === catId));
  document.querySelector(`.cat-tab[data-cat-id="${catId}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function scrollToSection(catId) {
  const section = document.getElementById('section-' + catId);
  if (!section) return;
  window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY - 145, behavior: 'smooth' });
}

function renderMenuContent() {
  const content = document.getElementById('menuContent');
  content.innerHTML = '';
  const cats = getCategories();
  if (!cats.length) {
    const empty = document.createElement('div');
    empty.style.padding    = '40px 16px';
    empty.style.textAlign  = 'center';
    empty.style.color      = '#757575';
    empty.style.fontSize   = '14px';
    if (menuLoadError) {
      empty.innerHTML = '<div style="font-size:32px;margin-bottom:12px">⚠️</div><div>' + menuLoadError + '</div>';
    } else if (!dynamicMenu) {
      empty.innerHTML = '<div style="font-size:32px;margin-bottom:12px">☀️</div><div>Загружаем меню...</div>';
    } else {
      empty.innerHTML = '<div style="font-size:32px;margin-bottom:12px">🍽️</div><div>Меню пока не заполнено</div>';
    }
    content.appendChild(empty);
    return;
  }

  cats.forEach(cat => {
    const items = getItems(cat.id);
    if (!items.length) return;

    const section     = document.createElement('section');
    section.className = 'menu-section fade-in';
    section.id        = 'section-' + cat.id;

    const title       = document.createElement('div');
    title.className   = 'menu-section-title';
    title.textContent = cat.name;
    section.appendChild(title);

    const grid     = document.createElement('div');
    grid.className = 'menu-items-grid';
    items.forEach(item => grid.appendChild(createMenuCard(item)));
    section.appendChild(grid);
    content.appendChild(section);
  });

  setupScrollSpy();
}

/* ===== CREATE MENU CARD ===== */
function createMenuCard(item) {
  const card     = document.createElement('div');
  card.className = 'menu-card';
  card.id        = 'card-' + item.id;

  const src = itemImgSrc(item);
  const mediaPart = src
    ? `<div class="menu-card-media"><img class="menu-card-photo" src="${src}" alt="${item.name}" loading="lazy" /></div>`
    : `<div class="menu-card-emoji">${item.emoji}</div>`;

  card.innerHTML = `
    ${mediaPart}
    <div class="menu-card-body">
      <div class="menu-card-name">${item.name}</div>
      ${item.weight ? `<div class="menu-card-weight">${item.weight}</div>` : ''}
      <div class="menu-card-footer">
        <div class="menu-card-price">${fmt(item.price)}</div>
        <div class="card-actions" id="card-actions-${item.id}"></div>
      </div>
    </div>`;

  card.addEventListener('click', e => {
    if (!e.target.closest('.card-actions')) openItemModal(item);
  });
  updateCardActions(item.id);
  return card;
}

function updateCardActions(itemId) {
  const wrap = document.getElementById('card-actions-' + itemId);
  if (!wrap) return;
  const qty  = state.cart[itemId] || 0;
  const card = document.getElementById('card-' + itemId);

  if (qty === 0) {
    card?.classList.remove('in-cart');
    wrap.innerHTML = `<button class="btn-add" data-id="${itemId}" aria-label="Добавить">+</button>`;
    wrap.querySelector('.btn-add').addEventListener('click', e => { e.stopPropagation(); addToCart(itemId); });
  } else {
    card?.classList.add('in-cart');
    wrap.innerHTML = `
      <div class="card-qty-controls">
        <button class="card-qty-btn" data-id="${itemId}" data-action="dec">−</button>
        <span class="card-qty-val">${qty}</span>
        <button class="card-qty-btn" data-id="${itemId}" data-action="inc">+</button>
      </div>`;
    wrap.querySelector('[data-action="dec"]').addEventListener('click', e => { e.stopPropagation(); decFromCart(itemId); });
    wrap.querySelector('[data-action="inc"]').addEventListener('click', e => { e.stopPropagation(); addToCart(itemId); });
  }
}

/* ===== CART LOGIC ===== */
function recalcDeliveryZoneCost() {
  if (!deliveryZoneResult || !deliveryZoneResult.allowed) return;
  const sub = getSubtotal();
  if (sub >= DELIVERY_INFO.freeDeliveryFrom) {
    deliveryZoneResult.cost = 0;
    deliveryZoneResult.label = 'Бесплатная доставка';
  } else {
    deliveryZoneResult.cost = DELIVERY_INFO.deliveryCost;
    deliveryZoneResult.label = 'Доставка ' + DELIVERY_INFO.deliveryCost + ' ₽';
  }
  // Обновляем статус под полем адреса
  const statusEl = document.getElementById('deliveryZoneStatus');
  if (statusEl) {
    statusEl.textContent = '✓ ' + deliveryZoneResult.label;
    statusEl.className = 'delivery-zone-status ok';
  }
}

function addToCart(id) {
  state.cart[id] = (state.cart[id] || 0) + 1;
  saveCart(); recalcDeliveryZoneCost(); updateCardActions(id); updateCartFab(); updateCartSheet();
  tg?.HapticFeedback?.impactOccurred('light');
}

function decFromCart(id) {
  if (!state.cart[id]) return;
  if (--state.cart[id] === 0) delete state.cart[id];
  saveCart(); recalcDeliveryZoneCost(); updateCardActions(id); updateCartFab(); updateCartSheet();
  tg?.HapticFeedback?.impactOccurred('light');
}

function setCartQty(id, qty) {
  if (qty <= 0) { delete state.cart[id]; } else { state.cart[id] = qty; }
  saveCart(); recalcDeliveryZoneCost(); updateCardActions(id); updateCartFab(); updateCartSheet();
}

/* ===== CART FAB ===== */
function updateCartFab() {
  const fab   = document.getElementById('cartFab');
  const count = getCartCount();
  if (count === 0) { fab.style.display = 'none'; return; }
  fab.style.display = 'flex';
  document.getElementById('cartFabCount').textContent = count;
  document.getElementById('cartFabTotal').textContent = fmt(getSubtotal());
}

/* ===== CART SHEET ===== */
function updateCartSheet() {
  const list      = document.getElementById('cartItemsList');
  const emptyEl   = document.getElementById('cartEmpty');
  const summaryEl = document.getElementById('cartSummary');
  const count     = getCartCount();

  if (count === 0) {
    list.innerHTML = '';
    list.style.display      = 'none';
    emptyEl.style.display   = 'flex';
    summaryEl.style.display = 'none';
    return;
  }

  emptyEl.style.display   = 'none';
  list.style.display      = 'block';
  summaryEl.style.display = 'block';
  list.innerHTML = '';

  for (const [id, qty] of Object.entries(state.cart)) {
    const item = findItemAny(id);
    if (!item) continue;
    const src = itemImgSrc(item);
    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      ${src
        ? `<img class="cart-item-thumb" src="${src}" alt="${item.name}" />`
        : `<div class="cart-item-emoji">${item.emoji}</div>`}
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${fmt(item.price * qty)}</div>
      </div>
      <div class="cart-item-controls">
        <button class="cart-qty-btn ${qty === 1 ? 'remove' : ''}" data-action="dec">${qty === 1 ? '🗑' : '−'}</button>
        <span class="cart-qty-val">${qty}</span>
        <button class="cart-qty-btn" data-action="inc">+</button>
      </div>`;
    row.querySelector('[data-action="dec"]').addEventListener('click', () => decFromCart(id));
    row.querySelector('[data-action="inc"]').addEventListener('click', () => addToCart(id));
    list.appendChild(row);
  }
  updateCartSummary();
}

function updateCartSummary() {
  const sub      = getSubtotal();
  const delivery = getDeliveryPrice(sub);
  document.getElementById('subtotalVal').textContent = fmt(sub);

  const deliveryRow = document.getElementById('deliveryRow');
  if (state.deliveryMode === 'pickup') {
    deliveryRow.style.display = 'none';
  } else {
    deliveryRow.style.display = 'flex';
    document.getElementById('deliveryVal').textContent = delivery === 0 ? 'Бесплатно' : fmt(delivery);
  }

  const promoRow = document.getElementById('promoRow');
  if (state.promoDiscount > 0) {
    promoRow.style.display = 'flex';
    document.getElementById('promoDiscount').textContent = '−' + fmt(state.promoDiscount);
  } else { promoRow.style.display = 'none'; }

  document.getElementById('totalVal').textContent = fmt(getTotal());

  const progressWrap = document.getElementById('deliveryProgressWrap');
  const progressText = document.getElementById('deliveryProgressText');
  const progressFill = document.getElementById('deliveryProgressFill');
  if (progressWrap && state.deliveryMode === 'delivery') {
    progressWrap.style.display = 'block';
    const target = DELIVERY_INFO.freeDeliveryFrom;
    const pct = Math.min(100, Math.round((sub / target) * 100));
    progressFill.style.width = pct + '%';
    if (sub === 0) {
      progressText.textContent = '';
      progressFill.style.width = '0%';
    } else if (sub < target) {
      const left = target - sub;
      progressText.textContent = `Добавьте ещё ${fmt(left)} до бесплатной доставки 🚚`;
    } else {
      progressText.textContent = '🎉 Доставка бесплатная!';
      progressFill.style.width = '100%';
    }
  } else if (progressWrap) {
    progressWrap.style.display = 'none';
  }
}

function updateCheckoutSummary() {
  const sub      = getSubtotal();
  const delivery = getDeliveryPrice(sub);
  document.getElementById('checkoutSubtotal').textContent = fmt(sub);

  const dr = document.getElementById('checkoutDeliveryRow');
  if (state.deliveryMode === 'pickup') { dr.style.display = 'none'; }
  else {
    dr.style.display = 'flex';
    document.getElementById('checkoutDelivery').textContent = delivery === 0 ? 'Бесплатно' : fmt(delivery);
  }

  const pr = document.getElementById('checkoutPromoRow');
  if (state.promoDiscount > 0) {
    pr.style.display = 'flex';
    document.getElementById('checkoutPromoDiscount').textContent = '−' + fmt(state.promoDiscount);
  } else { pr.style.display = 'none'; }

  const total = fmt(getTotal());
  document.getElementById('checkoutTotal').textContent    = total;
  document.getElementById('submitOrderTotal').textContent = total;
}

/* ===== ITEM MODAL (user view) ===== */
function openItemModal(item) {
  state.itemModal = { item, qty: state.cart[item.id] || 1 };
  const src = itemImgSrc(item);
  const emojiEl = document.getElementById('itemModalEmoji');
  emojiEl.innerHTML = src
    ? `<img src="${src}" class="item-modal-photo" alt="${item.name}" />`
    : item.emoji;

  document.getElementById('itemModalTitle').textContent  = item.name;
  document.getElementById('itemModalName').textContent   = item.name;
  document.getElementById('itemModalWeight').textContent = item.weight || '';
  document.getElementById('itemModalPrice').textContent  = fmt(item.price);
  document.getElementById('itemModalQty').textContent    = state.itemModal.qty;
  openModal('itemModal');
  tg?.HapticFeedback?.impactOccurred('light');
}

document.getElementById('itemModalMinus').addEventListener('click', () => {
  if (state.itemModal.qty > 1) {
    state.itemModal.qty--;
    document.getElementById('itemModalQty').textContent   = state.itemModal.qty;
    document.getElementById('itemModalPrice').textContent = fmt(state.itemModal.item.price * state.itemModal.qty);
  }
});

document.getElementById('itemModalPlus').addEventListener('click', () => {
  state.itemModal.qty++;
  document.getElementById('itemModalQty').textContent   = state.itemModal.qty;
  document.getElementById('itemModalPrice').textContent = fmt(state.itemModal.item.price * state.itemModal.qty);
});

document.getElementById('itemModalAdd').addEventListener('click', () => {
  setCartQty(state.itemModal.item.id, state.itemModal.qty);
  closeModal('itemModal');
  tg?.HapticFeedback?.notificationOccurred('success');
});

/* ===== MODAL HELPERS ===== */
function openModal(id) { document.getElementById(id).style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; document.body.style.overflow = ''; }

/* ===== MODAL BINDINGS ===== */
document.getElementById('cityBtn').addEventListener('click', () => { renderCityList(); openModal('cityModal'); });
document.getElementById('selectCityPromptBtn').addEventListener('click', () => { renderCityList(); openModal('cityModal'); });
document.getElementById('cityModalClose').addEventListener('click', () => closeModal('cityModal'));

function renderAddressesList() {
  const list  = document.getElementById('addressesList');
  list.innerHTML = '';
  const addrs = state.city ? getCityAddresses(state.city) : [];
  if (!addrs.length) {
    const li = document.createElement('li');
    li.className = 'address-item';
    li.innerHTML = '<span>Нет пунктов самовывоза в вашем городе</span>';
    list.appendChild(li);
    return;
  }
  addrs.forEach(addr => {
    const li = document.createElement('li');
    li.className = 'address-item';
    li.innerHTML = `<span class="address-item-icon">📍</span><span>${addr}</span>`;
    list.appendChild(li);
  });
}
document.getElementById('showAddressesBtn').addEventListener('click', async () => { await loadAddressesCache(); renderAddressesList(); openModal('addressesModal'); });
document.getElementById('addressesModalClose').addEventListener('click', () => closeModal('addressesModal'));

document.getElementById('streetInput')?.addEventListener('input', function() {
  clearTimeout(zoneCheckTimer);
  zoneCheckTimer = setTimeout(function() {
    checkDeliveryZone(document.getElementById('streetInput').value);
  }, 700);
});



function renderBonusLevels() {
  const wrap = document.getElementById('bonusLevels');
  wrap.innerHTML = '';
  BONUS_PROGRAM.forEach(lvl => {
    const card = document.createElement('div');
    card.className = 'bonus-level-card';
    card.style.background = lvl.color;
    card.innerHTML = `
      <div class="bonus-level-name">${lvl.level}</div>
      <div class="bonus-level-percent">${lvl.percent}%</div>
      <div class="bonus-level-min">${lvl.minAmount === 0 ? 'Базовый' : 'от ' + lvl.minAmount.toLocaleString('ru-RU') + ' ₽'}</div>`;
    wrap.appendChild(card);
  });
}
document.getElementById('showBonusBtn').addEventListener('click', () => { renderBonusLevels(); openModal('bonusModal'); });
document.getElementById('bonusModalClose').addEventListener('click', () => closeModal('bonusModal'));
document.getElementById('itemModalClose').addEventListener('click', () => closeModal('itemModal'));

document.getElementById('cartFab').addEventListener('click', () => { updateCartSheet(); openModal('cartOverlay'); tg?.HapticFeedback?.impactOccurred('medium'); });

document.getElementById('clearCartBtn').addEventListener('click', () => {
  if (!getCartCount()) return;
  state.cart = {};
  saveCart();
  getAllItems().forEach(item => updateCardActions(item.id));
  updateCartFab(); updateCartSheet();
  tg?.HapticFeedback?.notificationOccurred('warning');
});

document.getElementById('goToCheckoutBtn').addEventListener('click', () => {
  if (!getCartCount()) return;
  closeModal('cartOverlay');
  recalcDeliveryZoneCost();
  renderPickupSelect(); updateCheckoutSummary();
  openModal('checkoutOverlay');
  tg?.HapticFeedback?.impactOccurred('medium');
});

document.getElementById('backToCartBtn').addEventListener('click', () => { closeModal('checkoutOverlay'); updateCartSheet(); openModal('cartOverlay'); });

document.getElementById('tabDelivery').addEventListener('click', () => {
  state.deliveryMode = 'delivery';
  deliveryZoneResult = null;
  document.getElementById('tabDelivery').classList.add('active');
  document.getElementById('tabPickup').classList.remove('active');
  document.getElementById('deliverySection').style.display = 'block';
  document.getElementById('pickupSection').style.display   = 'none';
  document.getElementById('checkoutDeliveryRow').style.display = 'flex';
  updateCheckoutSummary(); updateCartSummary();
});

document.getElementById('tabPickup').addEventListener('click', () => {
  state.deliveryMode = 'pickup';
  deliveryZoneResult = null;
  document.getElementById('tabPickup').classList.add('active');
  document.getElementById('tabDelivery').classList.remove('active');
  document.getElementById('deliverySection').style.display = 'none';
  document.getElementById('pickupSection').style.display   = 'block';
  updateCheckoutSummary(); updateCartSummary();
});

function renderPickupSelect() {
  const sel = document.getElementById('pickupAddress');
  sel.innerHTML = '<option value="">— Выберите адрес —</option>';
  getCityAddresses(state.city).forEach(function(addr) {
    const opt = document.createElement('option');
    opt.value = addr; opt.textContent = addr;
    sel.appendChild(opt);
  });
}

/* ===== PROMO ===== */
document.getElementById('applyPromoBtn').addEventListener('click', applyPromo);
document.getElementById('promoInput').addEventListener('keydown', e => { if (e.key === 'Enter') applyPromo(); });

function applyPromo() {
  const code     = document.getElementById('promoInput').value.trim().toUpperCase();
  const statusEl = document.getElementById('promoStatus');
  if (!code) { statusEl.className = 'promo-status error'; statusEl.textContent = 'Введите промокод'; return; }

  const promo = PROMO_CODES[code];
  if (!promo) {
    state.promo = null; state.promoDiscount = 0;
    statusEl.className   = 'promo-status error';
    statusEl.textContent = '❌ Неверный промокод';
    updateCheckoutSummary(); return;
  }

  state.promo = code;
  const sub   = getSubtotal();
  state.promoDiscount = promo.type === 'percent' ? Math.round(sub * promo.discount / 100) : promo.discount;
  statusEl.className   = 'promo-status success';
  statusEl.textContent = '✅ ' + promo.label;
  updateCheckoutSummary();
  tg?.HapticFeedback?.notificationOccurred('success');
}

/* ===== DELIVERY ZONE CHECK ===== */
const CITIES_WITH_ZONES = ['vyborg'];

function cityHasZones(cityId) {
  return CITIES_WITH_ZONES.includes(cityId);
}

async function checkDeliveryZone(address) {
  const cityId   = state.city;
  const subtotal = getSubtotal();
  const statusEl = document.getElementById('deliveryZoneStatus');

  if (!cityHasZones(cityId)) {
    deliveryZoneResult = null;
    if (statusEl) statusEl.textContent = '';
    return;
  }

  if (!address.trim()) {
    deliveryZoneResult = null;
    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'delivery-zone-status'; }
    updateCartSheet();
    updateCheckoutSummary();
    return;
  }

  if (statusEl) { statusEl.textContent = 'Проверяем адрес...'; statusEl.className = 'delivery-zone-status checking'; }

  try {
    const fullAddress = 'Выборг, ' + address;
    const res  = await fetch('/api/delivery/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cityId, address: fullAddress, cartTotal: subtotal })
    });
    const data = await res.json();
    deliveryZoneResult = data;

    if (statusEl) {
      if (data.allowed) {
        statusEl.textContent = data.cost === 0 ? '✓ ' + data.label : '✓ ' + data.label;
        statusEl.className   = 'delivery-zone-status ok';
      } else {
        statusEl.textContent = '✗ ' + (data.reason || 'Адрес не в зоне доставки');
        statusEl.className   = 'delivery-zone-status error';
      }
    }
  } catch(e) {
    deliveryZoneResult = null;
    if (statusEl) { statusEl.textContent = 'Не удалось проверить адрес'; statusEl.className = 'delivery-zone-status error'; }
  }

  updateCartSheet();
  updateCheckoutSummary();
}

/* ===== FORM VALIDATION ===== */
function validateCheckoutForm() {
  let valid = true;
  const name   = document.getElementById('nameInput');
  const phone  = document.getElementById('phoneInput');
  const street = document.getElementById('streetInput');
  [name, phone, street].forEach(el => el.classList.remove('error'));
  if (!name.value.trim())                                         { name.classList.add('error');   valid = false; }
  if (!phone.value.trim() || phone.value.trim().length < 6)      { phone.classList.add('error');  valid = false; }
  if (state.deliveryMode === 'delivery' && !street.value.trim()) { street.classList.add('error'); valid = false; }
  // Проверка зоны доставки для городов с зонами
  if (state.deliveryMode === 'delivery' && cityHasZones(state.city)) {
    if (!deliveryZoneResult) {
      const statusEl = document.getElementById('deliveryZoneStatus');
      if (statusEl) { statusEl.textContent = 'Введите адрес для проверки зоны доставки'; statusEl.className = 'delivery-zone-status error'; }
      street.classList.add('error');
      valid = false;
    } else if (!deliveryZoneResult.allowed) {
      street.classList.add('error');
      valid = false;
    }
  }
  return valid;
}

/* ===== SUBMIT ORDER ===== */
document.getElementById('checkoutForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!validateCheckoutForm()) { tg?.HapticFeedback?.notificationOccurred('error'); return; }

  const payment   = document.querySelector('input[name="payment"]:checked')?.value || 'online';
  const orderData = {
    city:     state.city,
    cityName: getCitiesFromCache().find(c => c.id === state.city)?.name || '',
    mode:     state.deliveryMode,
    address:  state.deliveryMode === 'delivery'
      ? [document.getElementById('streetInput').value, document.getElementById('entranceInput').value,
         document.getElementById('floorInput').value,  document.getElementById('apartmentInput').value].filter(Boolean).join(', ')
      : document.getElementById('pickupAddress').value,
    name:     document.getElementById('nameInput').value.trim(),
    phone:    document.getElementById('phoneInput').value.trim(),
    comment:  document.getElementById('commentInput').value.trim(),
    payment,
    promo:    state.promo,
    subtotal: getSubtotal(),
    delivery: getDeliveryPrice(getSubtotal()),
    discount: state.promoDiscount,
    total:    getTotal(),
    items:    Object.entries(state.cart).map(([id, qty]) => {
      const item = findItemAny(id);
      return { id, name: item?.name, price: item?.price, qty };
    }),
  };

  if (tg) tg.sendData(JSON.stringify(orderData));
  closeModal('checkoutOverlay');
  showSuccess();
});

function showSuccess() {
  state.cart = {};
  saveCart();
  getAllItems().forEach(item => updateCardActions(item.id));
  updateCartFab();
  document.getElementById('successOverlay').style.display = 'flex';
  tg?.HapticFeedback?.notificationOccurred('success');
}

document.getElementById('successBackBtn').addEventListener('click', () => {
  document.getElementById('successOverlay').style.display = 'none';
  document.getElementById('checkoutForm').reset();
  state.promo = null; state.promoDiscount = 0;
  document.getElementById('promoStatus').textContent = '';
  tg?.HapticFeedback?.impactOccurred('light');
});

/* ===== OVERLAY CLICK TO CLOSE ===== */
['cityModal','bonusModal','addressesModal','itemModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => { if (e.target === document.getElementById(id)) closeModal(id); });
});
document.getElementById('cartOverlay').addEventListener('click', e => { if (e.target === document.getElementById('cartOverlay')) closeModal('cartOverlay'); });
document.getElementById('checkoutOverlay').addEventListener('click', e => { if (e.target === document.getElementById('checkoutOverlay')) closeModal('checkoutOverlay'); });

/* ===== SCROLL SPY ===== */
function setupScrollSpy() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const catId = entry.target.id.replace('section-', '');
        if (state.activeCategory !== catId) { state.activeCategory = catId; setActiveCatTab(catId); }
      }
    });
  }, { rootMargin: '-140px 0px -55% 0px', threshold: 0 });
  document.querySelectorAll('.menu-section').forEach(sec => observer.observe(sec));
}

/* ===== INIT ===== */
async function init() {
  if (tg?.themeParams) {
    const tp = tg.themeParams;
    if (tp.bg_color)   document.body.style.setProperty('--tg-bg',   tp.bg_color);
    if (tp.text_color) document.body.style.setProperty('--tg-text', tp.text_color);
  }

  await Promise.all([loadMenuFromAPI(), loadAddressesCache()]);

  if (state.city) {
    const cityObj = getCitiesFromCache().find(c => c.id === state.city);
    if (cityObj) {
      document.getElementById('headerCityName').textContent = cityObj.name;
      showMenu();
      renderAddressesList();
    }
  }
  updateCartFab();
  updateCartSheet();
}

document.addEventListener('DOMContentLoaded', init);
