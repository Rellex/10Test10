let authToken = sessionStorage.getItem('adminToken') || null;

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
  loadMenu();
  if (typeof fetchAddresses === 'function') fetchAddresses();
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
  editingItem: null,
  pendingImage: null,
  currentEmoji: '🍽️',
  confirmCallback: null,
};

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
    sessionStorage.setItem('adminToken', authToken);
    showAdminApp();
  } catch (ex) {
    err.textContent = ex.message;
    btn.disabled    = false;
    btn.textContent = 'Войти';
  }
});


document.getElementById('logoutBtn').addEventListener('click', logout);

function logout() {
  if (authToken) fetch('/api/admin/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + authToken } }).catch(() => {});
  authToken = null;
  sessionStorage.removeItem('adminToken');
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
    S.menu.categories = menu.categories || [];
    S.menu.items      = menu.items      || [];
    saveMenuCache();
    renderSidebar();
    if (S.activeCatId) renderItems(S.activeCatId);
    if (S.menu.categories.length === 0) showInitPrompt();
  } catch (e) {
    const cached = loadMenuCache();
    if (cached) {
      S.menu = cached;
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

/* ══════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════ */
function renderSidebar() {
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = '';
  S.menu.categories.forEach(cat => {
    const items  = S.menu.items.filter(i => i.categoryId === cat.id);
    const active = items.filter(i => i.active).length;
    const li     = document.createElement('div');
    li.className  = 'sidebar-cat-item' + (S.activeCatId === cat.id ? ' active' : '');
    li.dataset.catId = cat.id;
    li.innerHTML = `
      <span class="sidebar-cat-dot ${cat.active ? 'on' : 'off'}"></span>
      <span class="sidebar-cat-name">${cat.name}</span>
      <span class="sidebar-cat-count">${active}/${items.length}</span>
      <div class="sidebar-cat-actions">
        <button class="sidebar-icon-btn red" data-action="del-cat" data-id="${cat.id}" title="Удалить">🗑</button>
      </div>`;
    li.addEventListener('click', e => {
      if (e.target.closest('[data-action]')) return;
      selectCategory(cat.id);
    });
    li.querySelector('[data-action="del-cat"]').addEventListener('click', e => {
      e.stopPropagation();
      showConfirm(`Удалить категорию «${cat.name}» и все её позиции?`, () => deleteCategory(cat.id));
    });
    nav.appendChild(li);
  });
}

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
  const cat   = S.menu.categories.find(c => c.id === catId);
  const items = S.menu.items.filter(i => i.categoryId === catId);
  const grid  = document.getElementById('itemsGrid');
  const empty = document.getElementById('emptyState');

  document.getElementById('topbarTitle').textContent = cat ? cat.name : '';
  document.getElementById('statTotal').textContent   = items.length;
  document.getElementById('statActive').textContent  = items.filter(i => i.active).length;
  document.getElementById('statHidden').textContent  = items.filter(i => !i.active).length;

  grid.innerHTML = '';
  if (!items.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  items.forEach(item => grid.appendChild(createItemCard(item)));
}

function createItemCard(item) {
  const card     = document.createElement('div');
  card.className = 'item-card' + (item.active ? '' : ' inactive');
  card.id        = 'card-' + item.id;

  const src       = itemImg(item);
  const mediaPart = src
    ? `<img class="item-card-img" src="${src}" alt="${item.name}" loading="lazy" />`
    : `<span class="item-card-emoji-big">${item.emoji}</span>`;

  const badgeClass = item.active ? 'active' : 'inactive';
  const badgeText  = item.active ? 'Активно' : 'Скрыто';
  const toggleText = item.active ? '🙈 Скрыть' : '👁 Показать';

  card.innerHTML = `
    <div class="item-card-media">
      ${mediaPart}
      <span class="item-card-badge ${badgeClass}">${badgeText}</span>
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

  document.getElementById('itemModalTitle').textContent = item ? 'Редактировать' : 'Добавить позицию';
  document.getElementById('editItemId').value           = item?.id          || '';
  document.getElementById('itemName').value             = item?.name        || '';
  document.getElementById('itemPrice').value            = item?.price       || '';
  document.getElementById('itemWeight').value           = item?.weight      || '';
  document.getElementById('itemDescription').value      = item?.description || '';
  document.getElementById('emojiCustom').value          = item?.emoji       || '🍽️';
  document.getElementById('itemName').classList.remove('error');
  document.getElementById('itemPrice').classList.remove('error');
  document.getElementById('imageInput').value           = '';

  populateCategorySelect(item?.categoryId || S.activeCatId);
  renderEmojiGrid();
  updatePhotoPreview(itemImg(item));
  openModal('itemModal');
}

function openItemEdit(id) {
  const item = S.menu.items.find(i => i.id === id);
  if (item) openItemModal(item);
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
    catch(e) { authToken = null; sessionStorage.removeItem('adminToken'); }
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
  document.getElementById('menuSection').style.display = 'block';
  document.getElementById('addressesSection').style.display = 'none';
  document.getElementById('addItemBtn').style.display = 'flex';
  if (S.activeCatId) document.getElementById('statsRow').style.display = 'flex';
  document.getElementById('topbarTitle').textContent = S.activeCatId
    ? (S.menu.categories.find(function(c){ return c.id === S.activeCatId; }) || {}).name || 'Выберите категорию'
    : 'Выберите категорию';
});

document.getElementById('tabAddresses').addEventListener('click', function() {
  document.getElementById('tabAddresses').classList.add('active');
  document.getElementById('tabMenu').classList.remove('active');
  document.getElementById('menuSection').style.display = 'none';
  document.getElementById('addressesSection').style.display = 'block';
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

    hdr.appendChild(dragHandle);
    hdr.appendChild(nameBtn);
    hdr.appendChild(actions);
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
    if (city) city.name = name;
    toast('Город обновлён', 'success');
  } else {
    addrData.push({ id: 'city-' + Date.now(), name: name, list: [] });
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
