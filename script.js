/* ===== TELEGRAM WEB APP INIT ===== */
var deliveryZoneResult = null;
var zoneCheckTimer     = null;
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
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
  updateHeaderHeight();
  window.addEventListener('resize', updateHeaderHeight);
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

/* Возвращает цену блюда для текущего города.
   Цена берётся только из cityPrices[city] — базовой цены нет. */
function getItemPrice(item) {
  if (!item) return 0;
  const city = state.city;
  if (city && item.cityPrices) return item.cityPrices[city] ?? 0;
  // Fallback для старых записей без cityPrices
  return item.price || 0;
}

/* Блюдо показывается только если есть цена для текущего города */
function itemVisibleInCity(item) {
  const city = state.city;
  if (!city) return true;
  if ((item.disabledCities || []).includes(city)) return false;
  if (item.cityPrices) return item.cityPrices[city] !== undefined;
  // Старые записи без cityPrices — показываем
  return true;
}

/* Получить ID текущего дня недели для weeklySchedule */
var _cachedTodayDay = null;
var _cachedTodayDate = null;

function getTodayScheduleId() {
  const now = new Date();
  const dateStr = now.toDateString();
  // Сбрасываем кеш если наступил новый день
  if (_cachedTodayDate !== dateStr) {
    _cachedTodayDate = dateStr;
    const day = now.getDay(); // 0=вс,1=пн,...,6=сб
    if (day === 0 || day === 6) _cachedTodayDay = 'weekend';
    else _cachedTodayDay = { 1:'monday', 2:'tuesday', 3:'wednesday', 4:'thursday', 5:'friday' }[day];
    // Запланировать перерендер меню в полночь
    scheduleMidnightRefresh();
  }
  return _cachedTodayDay;
}

var _midnightTimer = null;
function scheduleMidnightRefresh() {
  if (_midnightTimer) clearTimeout(_midnightTimer);
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  const msUntilMidnight = midnight - now;
  _midnightTimer = setTimeout(() => {
    _cachedTodayDay = null;
    _cachedTodayDate = null;
    rerenderMenuAfterUpdate();
  }, msUntilMidnight);
}

/* Получить список ID блюд для текущего дня (или null если расписания нет) */
function getTodayItemIds() {
  const schedule = dynamicMenu?.weeklySchedule;
  if (!schedule) return null;
  const todayId = getTodayScheduleId();
  const day = schedule.days.find(d => d.id === todayId);
  return day?.itemIds || null;
}

/* Блюдо входит в расписание сегодняшнего дня */
function itemVisibleToday(item) {
  const todayIds = getTodayItemIds();
  if (!todayIds) return true; // нет расписания — показываем всё
  return todayIds.includes(item.id);
}

/* ── Kitchen availability (блюда убранные поварами на сегодня) ── */
let _kitchenUnavailable = new Set(); // Set<itemId>

function itemAvailableInKitchen(item) {
  return !_kitchenUnavailable.has(item.id);
}

function getItems(catId) {
  if (!dynamicMenu || menuLoadError) return [];
  return dynamicMenu.items.filter(i =>
    i.categoryId === catId && i.active !== false && itemVisibleInCity(i) && itemVisibleToday(i) && itemAvailableInKitchen(i)
  );
}

function getAllItems() {
  if (!dynamicMenu || menuLoadError) return [];
  return dynamicMenu.items.filter(i => i.active !== false && itemVisibleInCity(i) && itemVisibleToday(i) && itemAvailableInKitchen(i));
}

function findItemAny(id) {
  if (dynamicMenu) {
    if (dynamicMenu._halfItems && dynamicMenu._halfItems[id]) return dynamicMenu._halfItems[id];
    return dynamicMenu.items.find(i => i.id === id) || null;
  }
  return null;
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
    const cityParam = state.city ? '?city=' + encodeURIComponent(state.city) : '';
    const res = await fetch('/api/menu' + cityParam);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data.categories) || !Array.isArray(data.items)) throw new Error('Неверный формат данных');
    // Применяем список блюд убранных поварами
    if (Array.isArray(data.kitchenUnavailable)) {
      _kitchenUnavailable = new Set(data.kitchenUnavailable);
    }
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
  promoItemPrices: {},
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
    if (item) total += getItemPrice(item) * qty;
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
  // Если кеш пустой — подгрузить и перерендерить
  if (!_addressesCache) {
    list.innerHTML = '<li class="city-item" style="color:#aaa;pointer-events:none">Загрузка...</li>';
    loadAddressesCache().then(() => renderCityList());
    return;
  }
  const cities = getCitiesFromCache().filter(city => city.active !== false);
  cities.forEach(city => {
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
  document.getElementById('headerCityName').textContent = 'ПОДДЕРЖКА';
  closeModal('cityModal');
  loadMenuFromAPI().then(() => showMenu());
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

let _scrollSpyLocked = false;
let _scrollSpyTimer  = null;
let _scrollStopTimer = null;

function scrollToSection(catId) {
  const section = document.getElementById('section-' + catId);
  if (!section) return;

  // Lock scroll spy so observer doesn't override our selection
  _scrollSpyLocked = true;
  clearTimeout(_scrollSpyTimer);
  clearTimeout(_scrollStopTimer);

  window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY - 145, behavior: 'smooth' });

  // Watch for scroll stop, then unlock
  const unlockOnStop = () => {
    clearTimeout(_scrollStopTimer);
    _scrollStopTimer = setTimeout(() => {
      window.removeEventListener('scroll', unlockOnStop);
      _scrollSpyLocked = false;
    }, 150);
  };
  window.addEventListener('scroll', unlockOnStop, { passive: true });

  // Safety fallback after 2s
  _scrollSpyTimer = setTimeout(() => {
    window.removeEventListener('scroll', unlockOnStop);
    _scrollSpyLocked = false;
  }, 2000);
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

    // Если нечётное число карточек — последняя по центру
    if (items.length % 2 !== 0) {
      const last = grid.lastElementChild;
      if (last) {
        last.style.gridColumn  = '1 / -1';
        last.style.width       = '50%';
        last.style.marginLeft  = 'auto';
        last.style.marginRight = 'auto';
      }
    }

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
      ${item.weight ? `<div class="menu-card-weight">${item.weight.toString().replace('г','')}г</div>` : ''}
      ${(item.kcal || item.protein || item.fat || item.carbs) ? `<div class="menu-card-kbju">${item.kcal ? item.kcal+'ккал ' : ''}${item.protein ? 'Б'+item.protein+' ' : ''}${item.fat ? 'Ж'+item.fat+' ' : ''}${item.carbs ? 'У'+item.carbs : ''}</div>` : ''}
      <div class="menu-card-footer">
        <div class="menu-card-price">${getItemPrice(item) ? fmt(getItemPrice(item)) : ''}</div>
        <div class="card-actions" id="card-actions-${item.id}"></div>
      </div>
    </div>`;

  card.addEventListener('click', e => {
    if (!e.target.closest('.card-actions')) openItemModal(item);
  });
  // Directly find the actions wrap inside this card (avoids id lookup issues)
  const actionsWrap = card.querySelector('.card-actions');
  if (actionsWrap) {
    actionsWrap.innerHTML = `<button class="btn-add" aria-label="Добавить">+</button>`;
    actionsWrap.querySelector('.btn-add').addEventListener('click', e => { e.stopPropagation(); addToCart(item.id); });
  }
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

/* ── Категории требующие контейнера ── */
const CONTAINER_ITEM_ID   = 'su6';
const CONTAINER_CAT_IDS   = new Set(['salads', 'hot', 'garnish', 'sweet']);

function needsContainer(itemId) {
  const item = findItemAny(itemId);
  return item && CONTAINER_CAT_IDS.has(item.categoryId);
}

// Пересчитать количество контейнеров = сумма блюд из нужных категорий
function syncContainers() {
  let count = 0;
  for (const [id, qty] of Object.entries(state.cart)) {
    if (id === CONTAINER_ITEM_ID) continue;
    if (needsContainer(id)) count += qty;
  }
  if (count > 0) {
    state.cart[CONTAINER_ITEM_ID] = count;
  } else {
    delete state.cart[CONTAINER_ITEM_ID];
  }
}

function addToCart(id) {
  state.cart[id] = (state.cart[id] || 0) + 1;
  if (needsContainer(id)) syncContainers();
  saveCart(); recalcDeliveryZoneCost(); updateCardActions(id); updateCartFab(); updateCartSheet();
  tg?.HapticFeedback?.impactOccurred('light');
}

function decFromCart(id) {
  if (!state.cart[id]) return;
  if (--state.cart[id] === 0) delete state.cart[id];
  if (needsContainer(id)) syncContainers();
  saveCart(); recalcDeliveryZoneCost(); updateCardActions(id); updateCartFab(); updateCartSheet();
  tg?.HapticFeedback?.impactOccurred('light');
}

function setCartQty(id, qty) {
  if (qty <= 0) { delete state.cart[id]; } else { state.cart[id] = qty; }
  if (needsContainer(id)) syncContainers();
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
function recalcItemPromoDiscount() {
  if (!state.promo || !state.promoItemPrices || !Object.keys(state.promoItemPrices).length) return;
  let saved = 0;
  for (const [itemId, promoPrice] of Object.entries(state.promoItemPrices)) {
    const qty  = state.cart[itemId] || 0;
    const item = findItemAny(itemId);
    if (!item || !qty) continue;
    saved += (getItemPrice(item) - promoPrice) * qty;
  }
  state.promoDiscount = Math.max(0, saved);
}

function updateCartSheet() {
  recalcItemPromoDiscount(); // пересчитываем скидку при каждом обновлении корзины
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
    // Контейнер не показываем отдельной строкой
    if (id === CONTAINER_ITEM_ID) continue;

    const isPromoItem = state.promoItemPrices && state.promoItemPrices[id] !== undefined;
    const promoPrice  = isPromoItem ? state.promoItemPrices[id] : null;
    const displayPrice = isPromoItem ? promoPrice : getItemPrice(item);

    const src = itemImgSrc(item);
    const row = document.createElement('div');
    row.className = 'cart-item' + (isPromoItem ? ' cart-item-promo' : '');

    if (isPromoItem) {
      // Промо-блюдо — показываем без кнопок, с бейджем и зачёркнутой ценой
      const normalPrice = getItemPrice(item);
      row.innerHTML = `
        ${src
          ? `<img class="cart-item-thumb" src="${src}" alt="${item.name}" />`
          : `<div class="cart-item-emoji">${item.emoji}</div>`}
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name} <span class="promo-item-badge">🎟 промокод</span></div>
          <div class="cart-item-price">
            ${promoPrice > 0 ? `<span class="promo-price-new">${fmt(promoPrice * qty)}</span> <span class="promo-price-old">${fmt(normalPrice * qty)}</span>` : `<span class="promo-price-free">Бесплатно</span>`}
          </div>
        </div>
        <div class="cart-item-controls promo-locked">
          <span class="cart-qty-val">${qty}</span>
        </div>`;
    } else {
      row.innerHTML = `
        ${src
          ? `<img class="cart-item-thumb" src="${src}" alt="${item.name}" />`
          : `<div class="cart-item-emoji">${item.emoji}</div>`}
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">${fmt(displayPrice * qty)}</div>
        </div>
        <div class="cart-item-controls">
          <button class="cart-qty-btn ${qty === 1 ? 'remove' : ''}" data-action="dec">${qty === 1 ? '🗑' : '−'}</button>
          <span class="cart-qty-val">${qty}</span>
          <button class="cart-qty-btn" data-action="inc">+</button>
        </div>`;
      row.querySelector('[data-action="dec"]').addEventListener('click', () => decFromCart(id));
      row.querySelector('[data-action="inc"]').addEventListener('click', () => addToCart(id));
    }

    list.appendChild(row);
  }
  updateCartSummary();
}

function updateCartSummary() {
  const sub      = getSubtotal();          // сумма без скидки
  const delivery = getDeliveryPrice(sub);  // доставка считается от суммы БЕЗ скидки

  // 1. Сумма заказа (без скидки, включая контейнеры)
  document.getElementById('subtotalVal').textContent = fmt(sub);

  // 1a. Контейнеры — показываем сколько и сколько стоит
  const contQty = state.cart[CONTAINER_ITEM_ID] || 0;
  let contRow = document.getElementById('containerRow');
  if (contQty > 0) {
    const contItem = findItemAny(CONTAINER_ITEM_ID);
    const contPrice = contItem ? getItemPrice(contItem) : 9;
    if (!contRow) {
      contRow = document.createElement('div');
      contRow.className = 'cart-row container-row';
      contRow.id = 'containerRow';
      const subtotalEl = document.getElementById('subtotalVal').closest('.cart-row');
      subtotalEl.insertAdjacentElement('afterend', contRow);
    }
    contRow.innerHTML = `<span>📦 Контейнеры ×${contQty}</span><span>${fmt(contPrice * contQty)}</span>`;
    contRow.style.display = 'flex';
  } else if (contRow) {
    contRow.style.display = 'none';
  }

  // 2. Скидка по промокоду
  const promoRow = document.getElementById('promoRow');
  if (state.promoDiscount > 0) {
    promoRow.style.display = 'flex';
    document.getElementById('promoDiscount').textContent = '−' + fmt(state.promoDiscount);
  } else { promoRow.style.display = 'none'; }

  // 3. Доставка
  const deliveryRow = document.getElementById('deliveryRow');
  if (state.deliveryMode === 'pickup') {
    deliveryRow.style.display = 'none';
  } else {
    deliveryRow.style.display = 'flex';
    document.getElementById('deliveryVal').textContent = delivery === 0 ? 'Бесплатно' : fmt(delivery);
  }

  // 4. Итого
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
  // 1. Сумма заказа
  document.getElementById('checkoutSubtotal').textContent = fmt(sub);
  // 1a. Контейнеры
  const contQty = state.cart[CONTAINER_ITEM_ID] || 0;
  const contRow = document.getElementById('checkoutContainerRow');
  if (contRow) {
    if (contQty > 0) {
      const contItem  = findItemAny(CONTAINER_ITEM_ID);
      const contPrice = contItem ? getItemPrice(contItem) : 9;
      document.getElementById('checkoutContainerLabel').textContent = `📦 Контейнеры ×${contQty}`;
      document.getElementById('checkoutContainerVal').textContent   = fmt(contPrice * contQty);
      contRow.style.display = 'flex';
    } else { contRow.style.display = 'none'; }
  }
  // 2. Скидка
  const pr = document.getElementById('checkoutPromoRow');
  if (state.promoDiscount > 0) {
    pr.style.display = 'flex';
    document.getElementById('checkoutPromoDiscount').textContent = '−' + fmt(state.promoDiscount);
  } else { pr.style.display = 'none'; }
  // 3. Доставка
  const dr = document.getElementById('checkoutDeliveryRow');
  if (state.deliveryMode === 'pickup') { dr.style.display = 'none'; }
  else {
    dr.style.display = 'flex';
    document.getElementById('checkoutDelivery').textContent = delivery === 0 ? 'Бесплатно' : fmt(delivery);
  }
  // 4. Итого
  const total = fmt(getTotal());
  document.getElementById('checkoutTotal').textContent = total;
  const totalEl = document.getElementById('submitOrderTotal');
  if (totalEl) totalEl.textContent = total;
}

/* ===== ITEM MODAL (user view) ===== */
function openItemModal(item) {
  state.itemModal = { item, qty: state.cart[item.id] || 1, half: false };
  const src = itemImgSrc(item);
  const emojiEl = document.getElementById('itemModalEmoji');
  emojiEl.innerHTML = src
    ? `<img src="${src}" class="item-modal-photo" alt="${item.name}" />`
    : item.emoji;

  document.getElementById('itemModalTitle').textContent  = item.name;
  document.getElementById('itemModalName').textContent   = item.name;
  document.getElementById('itemModalWeight').textContent = item.weight ? (item.weight.toString().replace('г','') + 'г') : '';
  const compEl = document.getElementById('itemModalComposition');
  if (compEl) {
    compEl.textContent = item.composition || '';
    compEl.style.display = item.composition ? 'block' : 'none';
  }
  const kbjuEl = document.getElementById('itemModalKbju');
  if (kbjuEl) {
    const hasKbju = item.kcal || item.protein || item.fat || item.carbs;
    kbjuEl.style.display = hasKbju ? 'flex' : 'none';
    if (hasKbju) {
      kbjuEl.innerHTML = [
        item.kcal    ? `<span><b>${item.kcal}</b> ккал</span>` : '',
        item.protein ? `<span><b>${item.protein}</b>г белки</span>` : '',
        item.fat     ? `<span><b>${item.fat}</b>г жиры</span>` : '',
        item.carbs   ? `<span><b>${item.carbs}</b>г углев.</span>` : '',
      ].filter(Boolean).join('');
    }
  }

  // Полпорции
  const halfWrap = document.getElementById('halfPortionWrap');
  const hasHalf = !!(item.halfPrice && getHalfItemPrice(item));
  halfWrap.style.display = hasHalf ? 'flex' : 'none';
  if (hasHalf) {
    document.getElementById('halfBtnFull').classList.add('active');
    document.getElementById('halfBtnHalf').classList.remove('active');
    state.itemModal.half = false;
    // Обновляем вес при переключении
    document.getElementById('halfBtnFull').onclick = () => {
      state.itemModal.half = false;
      document.getElementById('halfBtnFull').classList.add('active');
      document.getElementById('halfBtnHalf').classList.remove('active');
      document.getElementById('itemModalWeight').textContent = item.weight ? item.weight + 'г' : '';
      updateModalPrice();
    };
    document.getElementById('halfBtnHalf').onclick = () => {
      state.itemModal.half = true;
      document.getElementById('halfBtnHalf').classList.add('active');
      document.getElementById('halfBtnFull').classList.remove('active');
      document.getElementById('itemModalWeight').textContent = item.halfWeight ? item.halfWeight + 'г' : '';
      updateModalPrice();
    };
  }

  updateModalPrice();
  document.getElementById('itemModalQty').textContent = state.itemModal.qty;
  openModal('itemModal');
  tg?.HapticFeedback?.impactOccurred('light');
}

function getHalfItemPrice(item) {
  const city = state.city;
  if (city && item.halfPriceCities) return item.halfPriceCities[city] ?? item.halfPrice ?? 0;
  return item.halfPrice ?? 0;
}

function getCurrentItemPrice() {
  const { item, half } = state.itemModal;
  if (!item) return 0;
  if (half && item.halfPrice) return getHalfItemPrice(item);
  return getItemPrice(item);
}

function updateModalPrice() {
  document.getElementById('itemModalPrice').textContent = fmt(getCurrentItemPrice() * state.itemModal.qty);
}

document.getElementById('itemModalMinus').addEventListener('click', () => {
  if (state.itemModal.qty > 1) {
    state.itemModal.qty--;
    document.getElementById('itemModalQty').textContent = state.itemModal.qty;
    updateModalPrice();
  }
});

document.getElementById('itemModalPlus').addEventListener('click', () => {
  state.itemModal.qty++;
  document.getElementById('itemModalQty').textContent = state.itemModal.qty;
  updateModalPrice();
});

document.getElementById('itemModalAdd').addEventListener('click', () => {
  const { item, qty, half } = state.itemModal;
  // Если полпорции — добавляем как отдельный "вариант" с суффиксом id
  const cartId = half ? item.id + '__half' : item.id;
  const cartItem = half
    ? { ...item, id: cartId, name: item.name + ' (½)', price: getHalfItemPrice(item), weight: item.halfWeight || '', cityPrices: item.halfPriceCities || {[state.city]: getHalfItemPrice(item)} }
    : item;
  // Кладём в корзину напрямую
  if (!dynamicMenu._halfItems) dynamicMenu._halfItems = {};
  if (half) dynamicMenu._halfItems[cartId] = cartItem;
  setCartQty(cartId, qty);
  closeModal('itemModal');
  tg?.HapticFeedback?.notificationOccurred('success');
});

/* ===== MODAL HELPERS ===== */
function openModal(id) { document.getElementById(id).style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; document.body.style.overflow = ''; }

/* ===== MODAL BINDINGS ===== */
document.getElementById('cityBtn').addEventListener('click', () => {
  if (state.city) {
    const city = (_addressesCache || []).find(c => c.id === state.city) || CITIES.find(c => c.id === state.city);
    if (city) {
      document.getElementById('supportCityName').textContent = city.name;
      const phone = city.phone || '+7 (xxx) xxx xx xx';
      const phoneEl = document.getElementById('supportPhone');
      phoneEl.textContent = phone;
      phoneEl.href = 'tel:' + phone.replace(/[^+\d]/g, '');
      openModal('supportOverlay');
      return;
    }
  }
  renderCityList(); openModal('cityModal');
});
document.getElementById('selectCityPromptBtn').addEventListener('click', () => { renderCityList(); openModal('cityModal'); });
document.getElementById('cityModalClose').addEventListener('click', () => closeModal('cityModal'));
document.getElementById('supportModalClose').addEventListener('click', () => closeModal('supportOverlay'));

/* ===== FEEDBACK ===== */
document.getElementById('feedbackSendBtn').addEventListener('click', async () => {
  const text = document.getElementById('feedbackText').value.trim();
  if (!text) return;

  const btn = document.getElementById('feedbackSendBtn');
  btn.textContent = 'Отправляем...';
  btn.disabled = true;

  try {
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, city: state.city || '' })
    });
    document.getElementById('feedbackText').value = '';
    document.getElementById('feedbackOk').style.display = 'block';
    document.querySelector('.support-feedback-wrap').style.display = 'none';
    setTimeout(() => {
      document.getElementById('feedbackOk').style.display = 'none';
      document.querySelector('.support-feedback-wrap').style.display = 'flex';
    }, 3000);
  } catch (e) {
    btn.textContent = 'Ошибка, попробуйте снова';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Отправить';
  }
});

/* ===== MY ORDERS ===== */
const ORDER_STATUS_MAP = {
  pending:    { label: 'Ожидание',   color: '#9b59b6', icon: '⏳' },
  new:        { label: 'Принят',     color: '#f5a623', icon: '✅' },
  assembling: { label: 'Сборка',      color: '#e67e22', icon: '👨‍🍳' },
  ready:      { label: 'Готов',      color: '#27ae60', icon: '🎉' },
  delivering: { label: 'Выдан',      color: '#2980b9', icon: '📦' },
  done:       { label: 'Доставлен',  color: '#7f8c8d', icon: '🏠' },
  cancelled:  { label: 'Отменён',    color: '#e74c3c', icon: '❌' },
};

async function loadAndRenderOrders() {
  const list = document.getElementById('ordersList');
  list.innerHTML = '<div class="orders-loading">Загружаем...</div>';

  const phone = localStorage.getItem('lastOrderPhone');
  let orders = [];

  if (phone) {
    try {
      const res = await fetch('/api/orders/by-phone/' + encodeURIComponent(phone));
      orders = await res.json();
    } catch {}
  }

  // Также берём из localStorage если нет телефона
  if (!orders.length) {
    orders = JSON.parse(localStorage.getItem('myOrders') || '[]');
  }

  if (!orders.length) {
    list.innerHTML = '<div class="orders-empty"><div class="orders-empty-icon">📋</div><div>Заказов пока нет</div></div>';
    return;
  }

  list.innerHTML = orders.map(o => {
    const st = ORDER_STATUS_MAP[o.status] || { label: o.status, color: '#999', icon: '❓' };
    const date = new Date(o.createdAt).toLocaleString('ru', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    const items = (o.items || []).map(i => i.name + ' ×' + i.qty).join(', ');
    return `<div class="order-card">
      <div class="order-card-top">
        <span class="order-id">Заказ #${o.id.slice(-6)}</span>
        <span class="order-status-badge" style="background:${st.color}">${st.icon} ${st.label}</span>
      </div>
      <div class="order-date">${date}</div>
      <div class="order-items">${items}</div>
      <div class="order-total">${fmt(o.total)} ₽</div>
      ${o.status === 'done' || o.status === 'delivered' || o.status === 'delivering' ? `<a class="order-review-btn" href="https://2gis.ru/spb/geo/70000001064593602" target="_blank">Будем благодарны за ⭐⭐⭐⭐⭐🙏😊</a>` : ''}
    </div>`;
  }).join('');
}

document.getElementById('myOrdersBtn').addEventListener('click', () => {
  loadAndRenderOrders();
  openModal('ordersOverlay');
});
document.getElementById('ordersModalClose').addEventListener('click', () => closeModal('ordersOverlay'));

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
document.getElementById('showAddressesBtn')?.addEventListener('click', async () => { await loadAddressesCache(); renderAddressesList(); openModal('addressesModal'); });
document.getElementById('addressesModalClose').addEventListener('click', () => closeModal('addressesModal'));

document.getElementById('streetInput')?.addEventListener('input', function() {
  clearTimeout(zoneCheckTimer);
  zoneCheckTimer = setTimeout(function() {
    checkDeliveryZone(document.getElementById('streetInput').value);
  }, 700);
});

document.getElementById('detectAddressBtn')?.addEventListener('click', function() {
  const btn = this;
  if (!navigator.geolocation) {
    showZoneError('Геолокация не поддерживается вашим браузером');
    return;
  }
  btn.classList.add('loading');
  btn.textContent = '⏳';
  navigator.geolocation.getCurrentPosition(
    async function(pos) {
      try {
        const url = 'https://nominatim.openstreetmap.org/reverse?lat=' + pos.coords.latitude + '&lon=' + pos.coords.longitude + '&format=json&accept-language=ru';
        const r = await fetch(url);
        const d = await r.json();
        const addr = d.address || {};
        const road = addr.road || addr.pedestrian || addr.footway || '';
        const num  = addr.house_number || '';
        const parts = [road, num].filter(Boolean).join(' ');

        // Try to match city from geocoded address
        const cityName = (addr.city || addr.town || addr.village || addr.county || '').toLowerCase();
        const CITY_KEYWORDS = {
          'новосибирск': 'novosibirsk', 'novosibirsk': 'novosibirsk',
          'санкт-петербург': 'spb', 'санкт петербург': 'spb', 'saint petersburg': 'spb', 'петербург': 'spb', 'питер': 'spb',
          'искитим': 'iskitim', 'iskitim': 'iskitim',
          'омск': 'omsk', 'omsk': 'omsk',
          'барнаул': 'barnaul', 'barnaul': 'barnaul',
          'выборг': 'vyborg', 'vyborg': 'vyborg',
        };
        const activeCities = getCitiesFromCache().filter(c => c.active !== false);
        let matchedCity = null;
        for (const [keyword, cityId] of Object.entries(CITY_KEYWORDS)) {
          if (cityName.includes(keyword)) {
            matchedCity = activeCities.find(c => c.id === cityId);
            if (matchedCity) break;
          }
        }

        // Switch city if matched and different
        if (matchedCity && matchedCity.id !== state.city) {
          state.city = matchedCity.id;
          localStorage.setItem('selectedCity', matchedCity.id);
          // Update city selects
          const dSel = document.getElementById('deliveryCitySelect');
          const pSel = document.getElementById('pickupCitySelect');
          if (dSel) dSel.value = matchedCity.id;
          if (pSel) pSel.value = matchedCity.id;
          renderPaymentOptions();
        }

        if (parts) {
          document.getElementById('streetInput').value = parts;
          checkDeliveryZone(parts);
        } else {
          showZoneError('Не удалось определить адрес. Введите вручную.');
        }
      } catch(e) {
        showZoneError('Ошибка определения адреса. Попробуйте снова.');
      } finally {
        btn.classList.remove('loading');
        btn.textContent = '📍';
      }
    },
    function() {
      btn.classList.remove('loading');
      btn.textContent = '📍';
      showZoneError('Доступ к геолокации запрещён. Введите адрес вручную.');
    },
    { timeout: 8000 }
  );
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
document.getElementById('showBonusBtn')?.addEventListener('click', () => { renderBonusLevels(); openModal('bonusModal'); });
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
  renderPickupSelect(); renderDeliveryCitySelect(); renderPaymentOptions(); updateCheckoutSummary();
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

function renderPickupAddresses(cityId) {
  const sel = document.getElementById('pickupAddress');
  sel.innerHTML = '<option value="">— Выберите адрес —</option>';
  getCityAddresses(cityId).forEach(function(addr) {
    const opt = document.createElement('option');
    opt.value = addr; opt.textContent = addr;
    sel.appendChild(opt);
  });
}

function renderPickupSelect() {
  const sel = document.getElementById('pickupCitySelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Выберите город —</option>';
  getCitiesFromCache().filter(c => c.active !== false).forEach(function(city) {
    const opt = document.createElement('option');
    opt.value = city.id;
    opt.textContent = city.name;
    if (city.id === state.city) opt.selected = true;
    sel.appendChild(opt);
  });
  renderPickupAddresses(state.city);
  sel.addEventListener('change', function() {
    if (sel.value) {
      state.city = sel.value;
      localStorage.setItem('selectedCity', sel.value);
      document.getElementById('headerCityName').textContent = 'ПОДДЕРЖКА';
      renderPaymentOptions();
    }
    renderPickupAddresses(sel.value);
  });
}

function renderDeliveryCitySelect() {
  const sel = document.getElementById('deliveryCitySelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Выберите город —</option>';
  getCitiesFromCache().filter(c => c.active !== false).forEach(function(city) {
    const opt = document.createElement('option');
    opt.value = city.id;
    opt.textContent = city.name;
    if (city.id === state.city) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', function() {
    if (sel.value) {
      state.city = sel.value;
      localStorage.setItem('selectedCity', sel.value);
      document.getElementById('headerCityName').textContent = 'ПОДДЕРЖКА';
      deliveryZoneResult = null;
      const statusEl = document.getElementById('deliveryZoneStatus');
      if (statusEl) { statusEl.textContent = ''; statusEl.className = 'delivery-zone-status'; }
      renderPaymentOptions();
    }
  });
}

function renderPaymentOptions() {
  const city = getCitiesFromCache().find(c => c.id === state.city);
  const paymentEnabled = !city || city.paymentEnabled !== false;
  const wrap = document.querySelector('.payment-options');
  if (!wrap) return;
  if (paymentEnabled) {
    wrap.innerHTML = `
      <label class="payment-option active">
        <input type="radio" name="payment" value="card" checked />
        <span class="payment-label"><span class="payment-icon">💳</span>Оплата банковской картой</span>
      </label>`;
  } else {
    wrap.innerHTML = `
      <div style="padding:12px;background:#fff3d6;border-radius:10px;font-size:13px;color:#e0900f;font-weight:600;text-align:center">
        💳 Онлайн-оплата временно недоступна для этого города.<br>
        <span style="font-weight:400;color:#757575">Оплата при получении.</span>
      </div>`;
  }
}

/* ===== PROMO ===== */
document.getElementById('applyPromoBtn').addEventListener('click', applyPromo);
document.getElementById('promoInput').addEventListener('keydown', e => { if (e.key === 'Enter') applyPromo(); });

async function applyPromo() {
  const code     = document.getElementById('promoInput').value.trim().toUpperCase();
  const statusEl = document.getElementById('promoStatus');
  if (!code) { statusEl.className = 'promo-status error'; statusEl.textContent = 'Введите промокод'; return; }

  const btn = document.getElementById('applyPromoBtn');
  btn.disabled = true; btn.textContent = '...';

  try {
    const res  = await fetch('/api/promo/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, subtotal: getSubtotal(), mode: state.deliveryMode || 'delivery' }),
    });
    const data = await res.json();
    if (!res.ok) {
      state.promo = null; state.promoDiscount = 0; state.promoItemPrices = {};
      statusEl.className   = 'promo-status error';
      statusEl.textContent = data.error || '❌ Неверный промокод';
      updateCheckoutSummary(); return;
    }
    state.promo           = data.code;
    state.promoItemPrices = data.itemPrices || {};

    if (data.type === 'item') {
      // Добавляем блюда из промокода в корзину если их там нет
      let addedNames = [];
      for (const [itemId, promoPrice] of Object.entries(state.promoItemPrices)) {
        if (!state.cart[itemId]) {
          state.cart[itemId] = 1;
          const item = findItemAny(itemId);
          if (item) addedNames.push(item.name);
        }
      }
      saveCart();
      recalcDeliveryZoneCost();
      updateCartFab();
      updateCartSheet();
      rerenderMenuAfterUpdate(); // обновляем карточки меню

      // Считаем скидку уже с учётом добавленных блюд
      let saved = 0;
      for (const [itemId, promoPrice] of Object.entries(state.promoItemPrices)) {
        const qty  = state.cart[itemId] || 0;
        const item = findItemAny(itemId);
        if (!item || !qty) continue;
        const normalPrice = getItemPrice(item);
        saved += (normalPrice - promoPrice) * qty;
      }
      state.promoDiscount = Math.max(0, saved);
    } else {
      state.promoDiscount = data.discount;
    }
    // Формируем текст что даёт промокод
    let benefit = '';
    if (data.type === 'percent') {
      benefit = `−${data.discount_pct || ''}% от суммы`;
    } else if (data.type === 'fixed') {
      benefit = `−${data.discount} ₽`;
    } else if (data.type === 'item') {
      const cnt = Object.keys(data.itemPrices || {}).length;
      benefit = `спец. цена на ${cnt} ${cnt === 1 ? 'блюдо' : cnt < 5 ? 'блюда' : 'блюд'}`;
    }
    // Добавляем срок если есть
    let expiry = '';
    if (data.expiresAt) {
      const d = new Date(data.expiresAt);
      expiry = ` · до ${d.toLocaleDateString('ru')}`;
    }
    statusEl.className   = 'promo-status success';
    statusEl.textContent = '✅ ' + (benefit || data.label) + expiry;
    updateCheckoutSummary();
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch(e) {
    statusEl.className = 'promo-status error';
    statusEl.textContent = '❌ Ошибка соединения';
  } finally {
    btn.disabled = false; btn.textContent = 'Применить';
  }
}

/* ===== DELIVERY ZONE CHECK ===== */
const CITIES_WITH_ZONES = ['vyborg', 'spb'];

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
    const cityName = getCitiesFromCache().find(c => c.id === cityId)?.name || '';
    const fullAddress = cityName ? cityName + ', ' + address : address;
    const res  = await fetch('/api/delivery/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cityId, address: fullAddress, cartTotal: subtotal })
    });
    const data = await res.json();
    deliveryZoneResult = data;

    if (statusEl) {
      if (data.allowed) {
        const icon = data.zoneType === 'far' ? '🚚 ' : '✓ ';
        statusEl.textContent = icon + data.label;
        statusEl.className   = data.zoneType === 'far' ? 'delivery-zone-status far' : 'delivery-zone-status ok';
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
  if (state.deliveryMode === 'pickup') {
    const pickupTime = document.getElementById('pickupTimeInput');
    if (pickupTime && !pickupTime.value) {
      pickupTime.classList.add('error'); valid = false;
    } else if (pickupTime && pickupTime.value) {
      const [h, m] = pickupTime.value.split(':').map(Number);
      const totalMin = h * 60 + m;
      if (totalMin < 8 * 60 || totalMin > 20 * 60) {
        pickupTime.classList.add('error');
        showZoneError('Время самовывоза должно быть с 8:00 до 20:00');
        valid = false;
      }
    }
    const pickupAddr = document.getElementById('pickupAddress');
    if (pickupAddr && !pickupAddr.value) { pickupAddr.classList.add('error'); valid = false; }
  }
  // Проверка зоны доставки для городов с зонами
  if (state.deliveryMode === 'delivery' && cityHasZones(state.city)) {
    if (!deliveryZoneResult) {
      const statusEl = document.getElementById('deliveryZoneStatus');
      if (statusEl) { statusEl.textContent = 'Введите адрес для проверки зоны доставки'; statusEl.className = 'delivery-zone-status error'; }
      street.classList.add('error');
      valid = false;
    } else if (deliveryZoneResult && deliveryZoneResult.allowed === false) {
      street.classList.add('error');
      valid = false;
    }
  }
  return valid;
}

/* ===== SUBMIT ORDER ===== */
async function handleCheckoutSubmit(e) {
  if (e) e.preventDefault();
  const submitBtn = document.getElementById('submitOrderBtn');
  if (submitBtn.disabled) return; // prevent double call

  // Сразу меняем кнопку — до любых проверок
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span>⏳ Создаём платёж…</span>';

  if (!validateCheckoutForm()) {
    tg?.HapticFeedback?.notificationOccurred('error');
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>Заказать</span><span id="submitOrderTotal"></span>';
    return;
  }

  console.log('submit fired, mode:', state.deliveryMode, 'city:', state.city);

  const payment   = document.querySelector('input[name="payment"]:checked')?.value || 'qr';
  const orderData = {
    city:     state.city,
    cityName: getCitiesFromCache().find(c => c.id === state.city)?.name || '',
    mode:     state.deliveryMode,
    address:  state.deliveryMode === 'delivery'
      ? document.getElementById('streetInput').value
      : document.getElementById('pickupAddress').value,
    entrance:  document.getElementById('entranceInput')?.value.trim() || '',
    intercom:  document.getElementById('intercomInput')?.value.trim() || '',
    pickupTime: state.deliveryMode === 'pickup' ? (document.getElementById('pickupTimeInput')?.value || '') : '',
    floor:     document.getElementById('floorInput')?.value.trim() || '',
    apartment: document.getElementById('apartmentInput')?.value.trim() || '',
    name:     document.getElementById('nameInput').value.trim(),
    phone:    document.getElementById('phoneInput').value.trim(),
    comment:  document.getElementById('commentInput').value.trim(),
    email:    document.getElementById('emailInput')?.value.trim() || '',
    tgChatId: tg?.initDataUnsafe?.user?.id || null,
    payment,
    promo:    state.promo,
    promoType: state.promoItemPrices && Object.keys(state.promoItemPrices).length ? 'item' : null,
    subtotal: getSubtotal(),
    delivery: getDeliveryPrice(getSubtotal()),
    discount: state.promoDiscount,
    total:    getTotal(),
    items:    Object.entries(state.cart).map(([id, qty]) => {
      const item = findItemAny(id);
      // Если для этого блюда есть промо-цена — используем её
      const promoPrice = state.promoItemPrices?.[id];
      const price = (promoPrice !== undefined) ? promoPrice : getItemPrice(item);
      return { id, name: item?.name, price, qty, promoPrice: promoPrice !== undefined ? promoPrice : null };
    }),
  };

  try {
    const res = await fetch('/api/payments/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderData, paymentMethod: payment }),
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      showZoneError(data.error || 'Ошибка создания платежа');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Заказать</span><span id="submitOrderTotal"></span>';
      return;
    }

    localStorage.setItem('lastOrderPhone', orderData.phone);

    // Фиксируем использование промокода
    if (state.promo) {
      fetch('/api/promo/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: state.promo, mode: state.deliveryMode || 'delivery' }),
      }).catch(() => {});
    }

    if (payment === 'card' && data.redirectUrl) {
      showPaymentReadyButton(data.redirectUrl, data.paymentId, data.tempId, orderData);
    } else if (payment === 'qr' && data.qrUrl) {
      showQrPayment(data.qrUrl, data.paymentId, data.tempId, orderData);
    }
  } catch(err) {
    showZoneError('Ошибка соединения. Попробуйте снова.');
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>Заказать</span><span id="submitOrderTotal"></span>';
  }
}

document.getElementById('checkoutForm').addEventListener('submit', handleCheckoutSubmit);
document.getElementById('submitOrderBtn').addEventListener('click', function(e) {
  // On mobile Telegram the form submit may not fire — handle click directly
  e.preventDefault();
  handleCheckoutSubmit(e);
});

/* ── QR PAYMENT MODAL ───────────────────────── */
function showPaymentReadyButton(redirectUrl, paymentId, tempId, orderData) {
  // Сохраняем ссылку глобально для кнопки
  window._paymentRedirectUrl = redirectUrl;
  window._paymentId = paymentId;
  window._paymentOrderData = orderData;

  let modal = document.getElementById('payReadyModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'payReadyModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:flex-end;justify-content:center;padding:0';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="background:#fff;border-radius:24px 24px 0 0;padding:32px 24px 48px;width:100%;max-width:480px;text-align:center">
      <div style="font-size:48px;margin-bottom:12px">💳</div>
      <div style="font-size:20px;font-weight:800;margin-bottom:8px;color:#222">Платёж готов!</div>
      <div style="font-size:14px;color:#888;margin-bottom:20px;line-height:1.5">Нажмите кнопку — откроется страница оплаты.<br>После оплаты вернитесь сюда.</div>
      <div style="font-size:26px;font-weight:800;color:#f5a623;margin-bottom:24px">${orderData.total} ₽</div>
      <button id="payNowBtn" style="width:100%;padding:18px;background:linear-gradient(135deg,#f5a623,#e8920e);color:#fff;font-size:17px;font-weight:800;border-radius:14px;border:none;cursor:pointer;margin-bottom:12px;box-shadow:0 4px 16px rgba(245,166,35,.4)">
        💳 Перейти к оплате
      </button>
      <button id="payReadyCheckBtn" style="width:100%;padding:14px;background:#f5f5f5;border:none;border-radius:12px;font-size:15px;font-weight:600;color:#444;cursor:pointer;margin-bottom:12px">
        ✅ Я оплатил — проверить
      </button>
      <button id="payReadyCancelBtn" style="background:none;border:none;color:#bbb;font-size:13px;cursor:pointer">
        Отменить
      </button>
    </div>
  `;

  modal.style.display = 'flex';

  document.getElementById('payNowBtn').addEventListener('click', () => {
    if (tg?.openLink) {
      tg.openLink(window._paymentRedirectUrl, { try_instant_view: false });
    } else {
      window.open(window._paymentRedirectUrl, '_blank');
    }
  });

  document.getElementById('payReadyCheckBtn').addEventListener('click', async () => {
    const btn = document.getElementById('payReadyCheckBtn');
    btn.textContent = '⏳ Проверяем…';
    btn.disabled = true;
    try {
      const r = await fetch('/api/payments/' + window._paymentId + '/status');
      const d = await r.json();
      if (d.status === 'succeeded') {
        modal.style.display = 'none';
        handlePaymentSuccess(window._paymentOrderData);
      } else {
        btn.disabled = false;
        btn.textContent = '✅ Я оплатил — проверить';
        showZoneError('Оплата ещё не прошла. Попробуйте снова после оплаты.');
      }
    } catch(e) {
      btn.disabled = false;
      btn.textContent = '✅ Я оплатил — проверить';
    }
  });

  document.getElementById('payReadyCancelBtn').addEventListener('click', () => {
    modal.style.display = 'none';
    const submitBtn = document.getElementById('submitOrderBtn');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Заказать</span><span id="submitOrderTotal"></span>';
      updateCheckoutSummary();
    }
  });
}

function showQrPayment(qrUrl, paymentId, tempId, orderData) {
  closeModal('checkoutOverlay');

  let modal = document.getElementById('qrPaymentModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'qrPaymentModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:20px;padding:28px 24px;max-width:340px;width:90%;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,.2)">
        <div style="font-size:22px;font-weight:800;margin-bottom:6px">Оплата по QR</div>
        <div style="font-size:13px;color:#757575;margin-bottom:18px">Отсканируйте QR-код приложением банка</div>
        <img id="qrCodeImg" src="" alt="QR" style="width:220px;height:220px;border-radius:12px;border:1px solid #eee;margin-bottom:18px" />
        <div id="qrStatus" style="font-size:13px;color:#f5a623;font-weight:600;margin-bottom:16px">⏳ Ожидаем оплату…</div>
        <button id="qrCancelBtn" style="padding:10px 24px;border-radius:12px;border:none;background:#f5f5f5;color:#212121;font-size:14px;font-weight:600;cursor:pointer">Отмена</button>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById('qrCodeImg').src = qrUrl;
  document.getElementById('qrStatus').textContent = '⏳ Ожидаем оплату…';
  modal.style.display = 'flex';

  let pollInterval;
  document.getElementById('qrCancelBtn').onclick = () => {
    clearInterval(pollInterval);
    modal.style.display = 'none';
    const btn = document.getElementById('submitOrderBtn');
    if (btn) { btn.disabled = false; btn.innerHTML = '<span>Заказать</span><span id="submitOrderTotal"></span>'; }
  };

  let attempts = 0;
  pollInterval = setInterval(async () => {
    attempts++;
    if (attempts > 60) {
      clearInterval(pollInterval);
      document.getElementById('qrStatus').textContent = '⌛ Время ожидания истекло. Попробуйте снова.';
      return;
    }
    try {
      const r = await fetch('/api/payments/' + paymentId + '/status');
      const d = await r.json();
      if (d.paid || d.status === 'succeeded') {
        clearInterval(pollInterval);
        document.getElementById('qrStatus').textContent = '✅ Оплата прошла!';
        setTimeout(() => {
          modal.style.display = 'none';
          handlePaymentSuccess(orderData);
        }, 1200);
      }
    } catch(e) {}
  }, 3000);
}

function handlePaymentSuccess(orderData) {
  state.cart = {};
  saveCart();
  getAllItems().forEach(item => updateCardActions(item.id));
  updateCartFab();
  document.getElementById('checkoutForm').reset();
  state.promo = null; state.promoDiscount = 0;
  document.getElementById('successOverlay').style.display = 'flex';
  tg?.HapticFeedback?.notificationOccurred('success');
  const btn = document.getElementById('submitOrderBtn');
  if (btn) { btn.disabled = false; btn.innerHTML = '<span>Заказать</span><span id="submitOrderTotal"></span>'; }
}

(function checkCardReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('payment_success') === '1') {
    history.replaceState({}, '', '/');
    setTimeout(() => {
      document.getElementById('successOverlay').style.display = 'flex';
    }, 500);
  }
})();

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
['cityModal','bonusModal','addressesModal','itemModal','supportOverlay','ordersOverlay'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => { if (e.target === document.getElementById(id)) closeModal(id); });
});
document.getElementById('cartOverlay').addEventListener('click', e => { if (e.target === document.getElementById('cartOverlay')) closeModal('cartOverlay'); });
document.getElementById('checkoutOverlay').addEventListener('click', e => { if (e.target === document.getElementById('checkoutOverlay')) closeModal('checkoutOverlay'); });

/* ===== SCROLL SPY ===== */
function setupScrollSpy() {
  const observer = new IntersectionObserver(entries => {
    if (_scrollSpyLocked) return;

    // Collect all currently visible sections, pick the one closest to top
    const visible = [];
    document.querySelectorAll('.menu-section').forEach(sec => {
      const rect = sec.getBoundingClientRect();
      const top  = 150; // header offset
      if (rect.bottom > top && rect.top < window.innerHeight) {
        visible.push({ id: sec.id, top: rect.top });
      }
    });
    if (!visible.length) return;

    // Sort by proximity to header line
    visible.sort((a, b) => {
      const distA = Math.abs(a.top - 150);
      const distB = Math.abs(b.top - 150);
      // Prefer sections whose top is just above or at the header line
      const scoreA = a.top <= 150 ? distA : distA + 10000;
      const scoreB = b.top <= 150 ? distB : distB + 10000;
      return scoreA - scoreB;
    });

    const catId = visible[0].id.replace('section-', '');
    if (state.activeCategory !== catId) { state.activeCategory = catId; setActiveCatTab(catId); }
  }, { rootMargin: '-140px 0px -10% 0px', threshold: [0, 0.1, 0.5] });
  document.querySelectorAll('.menu-section').forEach(sec => observer.observe(sec));
}

/* ===== INIT ===== */
function updateHeaderHeight() {
  const h = document.getElementById('appHeader');
  const infoBar = document.querySelector('.work-hours-bar') || document.querySelector('.info-bar');
  if (h) {
    const hh = h.offsetHeight;
    document.documentElement.style.setProperty('--header-h', hh + 'px');
    const infoH = infoBar ? infoBar.offsetHeight : 36;
    document.documentElement.style.setProperty('--sticky-cats-top', (hh + infoH) + 'px');
    document.documentElement.style.setProperty('--sticky-section-top', (hh + infoH + 40) + 'px');
  }
}

async function init() {
  if (tg?.themeParams) {
    const tp = tg.themeParams;
    if (tp.bg_color)   document.body.style.setProperty('--tg-bg',   tp.bg_color);
    if (tp.text_color) document.body.style.setProperty('--tg-text', tp.text_color);
  }

  await Promise.all([loadMenuFromAPI(), loadAddressesCache()]);

  // Синхронизируем контейнеры при старте (корзина могла загрузиться без них)
  syncContainers();
  saveCart();

  if (state.city) {
    const cityObj = getCitiesFromCache().find(c => c.id === state.city && c.active !== false);
    if (cityObj) {
      document.getElementById('headerCityName').textContent = 'ПОДДЕРЖКА';
      showMenu();
      renderAddressesList();
      updateCartFab();
      updateCartSheet();
      return;
    } else {
      // City was disabled — reset
      state.city = null;
      localStorage.removeItem('selectedCity');
    }
  }

  // Auto-detect city by geolocation
  autoDetectCity();
  updateCartFab();
  updateCartSheet();
}

function autoDetectCity() {
  const cities = getCitiesFromCache().filter(c => c.active !== false);
  if (!cities.length) return;

  // City name keywords mapped to city ids
  const CITY_KEYWORDS = {
    'новосибирск': 'novosibirsk',
    'novosibirsk': 'novosibirsk',
    'санкт-петербург': 'spb',
    'санкт петербург': 'spb',
    'saint petersburg': 'spb',
    'st. petersburg': 'spb',
    'петербург': 'spb',
    'питер': 'spb',
    'искитим': 'iskitim',
    'iskitim': 'iskitim',
    'омск': 'omsk',
    'omsk': 'omsk',
    'барнаул': 'barnaul',
    'barnaul': 'barnaul',
    'выборг': 'vyborg',
    'vyborg': 'vyborg',
  };

  // Show loading state on prompt
  const promptText = document.getElementById('cityPrompt')?.querySelector('.city-prompt-text');
  if (promptText) promptText.textContent = '📍 Определяем ваш город…';

  if (!navigator.geolocation) {
    showCityPromptWithList(cities);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=ru`;
        const r = await fetch(url);
        const d = await r.json();

        const cityName = (
          d.address?.city ||
          d.address?.town ||
          d.address?.village ||
          d.address?.county ||
          ''
        ).toLowerCase();

        // Try to match to available city
        let matchedId = null;
        for (const [keyword, cityId] of Object.entries(CITY_KEYWORDS)) {
          if (cityName.includes(keyword)) {
            // Check if this city is in our active list
            const found = cities.find(c => c.id === cityId);
            if (found) { matchedId = cityId; break; }
          }
        }

        if (matchedId) {
          const city = cities.find(c => c.id === matchedId);
          showCityAutoDetected(city, cities);
        } else {
          showCityPromptWithList(cities, cityName);
        }
      } catch(e) {
        showCityPromptWithList(cities);
      }
    },
    () => {
      // Permission denied or error
      showCityPromptWithList(cities);
    },
    { timeout: 6000 }
  );
}

function showCityAutoDetected(city, allCities) {
  const prompt = document.getElementById('cityPrompt');
  if (!prompt) return;
  prompt.innerHTML = `
    <div class="city-detect-icon">📍</div>
    <div class="city-prompt-text">Ваш город</div>
    <div class="city-detected-name">${city.name}</div>
    <button class="btn-primary" id="confirmDetectedCity">Верно, продолжить</button>
    <button class="btn-city-change" id="changeDetectedCity">Выбрать другой город</button>
  `;
  document.getElementById('confirmDetectedCity').addEventListener('click', () => {
    selectCity(city.id, city.name);
  });
  document.getElementById('changeDetectedCity').addEventListener('click', () => {
    renderCityList();
    openModal('cityModal');
  });
}

function showCityPromptWithList(cities, detectedName) {
  const prompt = document.getElementById('cityPrompt');
  if (!prompt) return;
  const msg = detectedName
    ? `Не нашли «${detectedName}» среди наших городов`
    : 'Выберите ваш город';
  prompt.innerHTML = `
    <div class="city-detect-icon">🏙️</div>
    <div class="city-prompt-text">${msg}</div>
    <div class="city-quick-list" id="cityQuickList"></div>
  `;
  const list = document.getElementById('cityQuickList');
  cities.forEach(city => {
    const btn = document.createElement('button');
    btn.className = 'city-quick-btn';
    btn.textContent = city.name;
    btn.addEventListener('click', () => selectCity(city.id, city.name));
    list.appendChild(btn);
  });
}

/* ===== ZONE ERROR MODAL ===== */
function showZoneError(msg) {
  let el = document.getElementById('zoneErrorModal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'zoneErrorModal';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px';
    el.innerHTML = `<div style="background:#fff;border-radius:16px;padding:24px;max-width:320px;width:100%;text-align:center">
      <div style="font-size:32px;margin-bottom:12px">🚚</div>
      <div id="zoneErrorMsg" style="font-size:15px;line-height:1.5;color:#333;margin-bottom:20px"></div>
      <button onclick="document.getElementById('zoneErrorModal').remove()" style="background:linear-gradient(135deg,#f5a623,#e8961a);color:#fff;border:none;border-radius:24px;padding:12px 32px;font-size:15px;font-weight:600;cursor:pointer;width:100%">Понятно</button>
    </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) el.remove(); });
  }
  document.getElementById('zoneErrorMsg').textContent = msg;
  el.style.display = 'flex';
}

/* ===== STATUS TOAST ===== */
function showStatusToast(msg) {
  let el = document.getElementById('statusToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'statusToast';
    el.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#323232;color:#fff;padding:10px 18px;border-radius:24px;font-size:14px;font-weight:500;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.3);transition:opacity .3s;white-space:nowrap;max-width:90vw;text-align:center';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 3500);
}

/* ===== LIVE UPDATE via WebSocket ===== */
function connectLiveUpdates() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);

  ws.onmessage = ({ data }) => {
    try {
      const { event, data: payload } = JSON.parse(data);
      if (event === 'promos') {
        // Промокоды обновились — если текущий промокод изменился, пересчитываем
        if (state.promo) {
          const updated = payload.find(p => p.code === state.promo);
          if (!updated || !updated.active || (updated.maxUses !== null && updated.usedCount >= updated.maxUses)) {
            state.promo = null; state.promoDiscount = 0; state.promoItemPrices = {};
            const statusEl = document.getElementById('promoStatus');
            if (statusEl) { statusEl.className = 'promo-status error'; statusEl.textContent = '❌ Промокод больше не действует'; }
            updateCheckoutSummary();
          }
        }
      }
      if (event === 'kitchen_availability') {
        if (available === false) {
          _kitchenUnavailable.add(itemId);
        } else {
          _kitchenUnavailable.delete(itemId);
        }
        // Убираем из корзины если блюдо пропало
        if (!available && state.cart[itemId]) {
          delete state.cart[itemId];
          saveCart();
        }
        rerenderMenuAfterUpdate();
      }
      if (event === 'menu') {
        dynamicMenu = payload;
        saveMenuCache(dynamicMenu);
        _cachedTodayDay = null; // invalidate day cache
        rerenderMenuAfterUpdate();
      }
      if (event === 'addresses') {
        _addressesCache = payload;
        renderAddressesList();

        // Если текущий город стал неактивным — сбросить
        if (state.city) {
          const currentCity = _addressesCache.find(c => c.id === state.city);
          if (currentCity && currentCity.active === false) {
            state.city = null;
            localStorage.removeItem('selectedCity');
            document.getElementById('menuWrapper').style.display = 'none';
            document.getElementById('cityPrompt').style.display  = 'flex';
          }
        }

        // Обновить список городов если модалка открыта
        if (document.getElementById('cityModal')?.style.display !== 'none') {
          renderCityList();
        }

        // Обновить чекаут если открыт — перестроить селекты городов и оплату
        const checkoutEl = document.getElementById('checkoutOverlay');
        if (checkoutEl && checkoutEl.style.display === 'flex') {
          renderPickupSelect();
          renderDeliveryCitySelect();
          renderPaymentOptions();
        }
      }
      if (event === 'order') {
        // Update in localStorage
        const saved = JSON.parse(localStorage.getItem('myOrders') || '[]');
        const idx = saved.findIndex(o => o.id === payload.id);
        const isMyOrder = idx !== -1;
        if (isMyOrder) {
          saved[idx] = { ...saved[idx], ...payload };
          localStorage.setItem('myOrders', JSON.stringify(saved));
        }
        // Re-render if orders screen is open (regardless of localStorage match)
        const overlay = document.getElementById('ordersOverlay');
        if (overlay && overlay.style.display !== 'none') {
          loadAndRenderOrders();
        }
        // Toast notification for known orders
        if (isMyOrder) {
          const st = ORDER_STATUS_MAP[payload.status];
          if (st) showStatusToast(`Заказ #${payload.id.slice(-6)}: ${st.icon} ${st.label}`);
        }
      }
    } catch (e) {}
  };

  ws.onclose = () => setTimeout(connectLiveUpdates, 3000);
  ws.onerror = () => ws.close();
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  connectLiveUpdates();
  // Also listen for Telegram expand/collapse events
  if (tg) {
  }

  // Phone input — digits only, auto-format +7 (XXX) XXX-XX-XX
  const phoneEl = document.getElementById('phoneInput');
  if (phoneEl) {
    phoneEl.addEventListener('input', e => {
      let digits = e.target.value.replace(/\D/g, '');
      if (digits.startsWith('8')) digits = '7' + digits.slice(1);
      if (digits.startsWith('7')) {
        const d = digits.slice(1);
        let fmt = '+7';
        if (d.length > 0) fmt += ' (' + d.slice(0,3);
        if (d.length >= 3) fmt += ') ' + d.slice(3,6);
        if (d.length >= 6) fmt += '-' + d.slice(6,8);
        if (d.length >= 8) fmt += '-' + d.slice(8,10);
        e.target.value = fmt;
      } else if (digits.length > 0) {
        e.target.value = '+' + digits.slice(0,15);
      } else {
        e.target.value = '';
      }
    });
    phoneEl.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && phoneEl.value === '+7 (') {
        phoneEl.value = '';
      }
    });
  }
});
