const express  = require('express');
const cors     = require('cors');
const crypto   = require('crypto');
const path     = require('path');
const fs       = require('fs');
const http     = require('http');
const { WebSocketServer } = require('ws');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });
const PORT   = process.env.PORT || 3000;

// WebSocket broadcast helper
function broadcast(event, data) {
  const msg = JSON.stringify({ event, data });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

wss.on('connection', ws => {
  ws.on('error', () => {});
});
const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID || '1297471';
const YOOKASSA_SECRET  = process.env.YOOKASSA_SECRET  || 'live_HruyIJAB-UGfH7BrsNNu7fI2iyX_7cclcgOIk__2JGs';
const YOOKASSA_API     = 'https://api.yookassa.ru/v3';

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(__dirname, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

/* ── paths ─────────────────────────────────── */
const IS_VERCEL   = !!process.env.VERCEL;
const DATA_DIR = process.env.DATA_DIR || (IS_VERCEL ? '/tmp' : __dirname);
const MENU_FILE      = path.join(DATA_DIR, 'menu.json');
const ADDRESSES_FILE = path.join(DATA_DIR, 'addresses.json');
const ORDERS_FILE    = path.join(DATA_DIR, 'orders.json');
const UPLOADS_DIR    = path.join(DATA_DIR, 'uploads');
const ADMIN_PASSWORD  = process.env.ADMIN_PASSWORD  || 'admin123';
const YANDEX_GEO_KEY  = process.env.YANDEX_GEO_KEY  || '';
const BOT_TOKEN        = process.env.BOT_TOKEN        || '7621767388:AAEsY2d5jC1_cbbp5VJOTDog-sD6gGONN_';
const CLIENT_BOT_TOKEN = process.env.CLIENT_BOT_TOKEN || '8614340391:AAGpEyHQ949K6WGBu-2CCafnSOK6-ofGbBM';
const SPB_BOT_TOKEN    = process.env.SPB_BOT_TOKEN    || '8631935230:AAGYvjxYXepGH7wlnub-cULI-zqaM520F0E';
const VYBORG_CHAT_ID   = process.env.TG_CHAT_ID       || '-1001884949760';
const WEBHOOK_DOMAIN  = process.env.WEBHOOK_DOMAIN   || '10test10-production.up.railway.app';

/* ── delivery zones ────────────────────────── */
const DELIVERY_ZONES = {
  spb: {"minOrder": 0, "zones": [{"name": "Россия, Санкт-Петербург, набережная реки", "type": "normal", "polygon": [[59.967714996689075, 30.333665013112547], [59.97788996187352, 30.32400906065905], [59.980395576516486, 30.3225284812827], [59.991352284676815, 30.31007358160033], [59.997207225105356, 30.304375930161378], [59.998246604627774, 30.30322730521161], [59.99829496825551, 30.286930203237137], [60.00173397886354, 30.25452911833719], [59.988656786439634, 30.25222551645129], [59.9859330626455, 30.230303406514764], [59.981223570421065, 30.226333737172634], [59.978062027309, 30.212751030721325], [59.973179321403926, 30.207236408986603], [59.96947916887844, 30.21071255186982], [59.96345477747871, 30.233243107594987], [59.96031305158007, 30.246589779653135], [59.958892721245356, 30.2578765151879], [59.9576660231306, 30.264914631642934], [59.94963755806133, 30.286715626516003], [59.9473771823751, 30.301821827687853], [59.948733426356064, 30.31898796538324], [59.95467441037985, 30.33890068510972], [59.967714996689075, 30.333665013112547]], "pricing": [{"minCart": 0, "cost": 299, "label": "Доставка 299 ₽"}]}, {"name": "Россия, Санкт-Петербург, Лесной проспект", "type": "normal", "polygon": [[59.989515035668646, 30.312385169992748], [59.99824314891442, 30.30371627045662], [60.00245589406021, 30.328178016672563], [60.00271379973039, 30.360235778818513], [59.99966178645262, 30.372488109598514], [59.990762050432956, 30.405339805612957], [59.97433207576113, 30.405940620432297], [59.96592037599343, 30.33704003525777], [59.97846184443144, 30.323714820871775], [59.9840104072434, 30.318522064218914], [59.98706386928652, 30.315003005991386], [59.989515035668646, 30.312385169992748]], "pricing": [{"minCart": 0, "cost": 299, "label": "Доставка 299 ₽"}]}, {"name": "Россия, Санкт-Петербург, 2-я линия Васил", "type": "normal", "polygon": [[59.955908175841714, 30.18252333832665], [59.96739922586832, 30.210160820016004], [59.9587490321852, 30.249814598092193], [59.95666145699104, 30.264620391854386], [59.949838254849396, 30.279597846993628], [59.945295846823555, 30.30727824402737], [59.943336606070126, 30.310926048287712], [59.938337145660626, 30.298865794484584], [59.93058793953717, 30.273847190866075], [59.91766197561783, 30.26492079926399], [59.915593352496046, 30.25496443940125], [59.9302433127327, 30.184583274850034], [59.94385334019094, 30.174283592233298], [59.948470061616334, 30.17833004015551], [59.955908175841714, 30.18252333832665]], "pricing": [{"minCart": 0, "cost": 299, "label": "Доставка 299 ₽"}]}, {"name": "Россия, Санкт-Петербург, Промышленная ул", "type": "normal", "polygon": [[59.91176915380487, 30.261738206920963], [59.91515719298896, 30.261809657138148], [59.916303930841046, 30.2647993507636], [59.91259740382325, 30.26754593279482], [59.90492443553069, 30.282652133966696], [59.89733593088161, 30.27647232439642], [59.89354102610547, 30.275099033380798], [59.88486070259254, 30.26585077669741], [59.88517344940742, 30.264627689386653], [59.88548619326012, 30.263211483026794], [59.886230296093665, 30.260336154962815], [59.88716848887268, 30.256559604669814], [59.88837623812376, 30.253619903589414], [59.8922040810042, 30.24913525011652], [59.89347633642659, 30.246023887659277], [59.894134008632626, 30.242998355890556], [59.89837082940093, 30.245573276544857], [59.90604531715467, 30.256902927423756], [59.91176915380487, 30.261738206920963]], "pricing": [{"minCart": 0, "cost": 299, "label": "Доставка 299 ₽"}]}, {"name": "Россия, Санкт-Петербург, Боровая улица, ", "type": "normal", "polygon": [[59.92634768369171, 30.35802247524806], [59.93135485299515, 30.341900309447592], [59.92511885083099, 30.327094515685424], [59.91536398876956, 30.339504906162237], [59.91593772559156, 30.34212617547813], [59.916009105368275, 30.344746062130948], [59.91531213682029, 30.350833115285344], [59.920135060709995, 30.356391573446984], [59.92634768369171, 30.35802247524806]], "pricing": [{"minCart": 0, "cost": 299, "label": "Доставка 299 ₽"}]}, {"name": "Россия, Санкт-Петербург, набережная Обво", "type": "normal", "polygon": [[59.90222754179472, 30.2842135852747], [59.90158080935131, 30.282368225472446], [59.90134367095595, 30.28125242652222], [59.90102029768534, 30.280308288948937], [59.90106341430772, 30.279664558785438], [59.905590346780386, 30.28279737891489], [59.912681296153856, 30.267648262398776], [59.915784455462415, 30.31777338446903], [59.916280071983536, 30.32811598243039], [59.91319850956046, 30.332107109444625], [59.90983647771489, 30.33571199836068], [59.905741233865264, 30.329961342232743], [59.90147301940572, 30.319060844796184], [59.90222754179472, 30.2842135852747]], "pricing": [{"minCart": 0, "cost": 299, "label": "Доставка 299 ₽"}]}, {"name": "Россия, Санкт-Петербург, Садовая улица, ", "type": "normal", "polygon": [[59.91715795151287, 30.264464560060407], [59.91284572106973, 30.267089274394053], [59.915302400639014, 30.30777302073192], [59.92364082059122, 30.301507380473094], [59.928617015189616, 30.28777447031684], [59.92840161100835, 30.282538798319692], [59.925945904264424, 30.27309742258733], [59.91715795151287, 30.264464560060407]], "pricing": [{"minCart": 0, "cost": 299, "label": "Доставка 299 ₽"}]}, {"name": "Дальняк", "type": "far", "polygon": [[59.92120361224358, 30.526290161043004], [59.90792912027641, 30.52500270071583], [59.900168833991756, 30.525045616060094], [59.88878378891614, 30.522663814454873], [59.87118101749525, 30.53161166372855], [59.8621171209359, 30.52042915033518], [59.85477786533816, 30.5044401183871], [59.85330981925337, 30.481150741222525], [59.84722105218374, 30.457779896542473], [59.838757159499934, 30.452381411713784], [59.8306367755708, 30.442176408330493], [59.82562601750735, 30.431628082193257], [59.819791949857425, 30.408048312670644], [59.816377649406014, 30.382408606624622], [59.81521094960386, 30.357798868840305], [59.812033734855994, 30.341030804147373], [59.810272074740915, 30.330243512523552], [59.81872886265638, 30.30768372901636], [59.829179300630436, 30.288507413922908], [59.83457609933743, 30.280292547391788], [59.83457732328304, 30.267236331393608], [59.85150925666431, 30.23770559888281], [59.85185500969857, 30.221910264365693], [59.868259760542315, 30.150154564880562], [59.92687317138217, 30.199752631664637], [59.921930041475015, 30.222399862267075], [59.91755819787274, 30.244520037583406], [59.91553670704011, 30.254256451448427], [59.917354844020494, 30.26428790344608], [59.915078792802646, 30.261959736303], [59.9115270307461, 30.261482298239272], [59.90612996560367, 30.256437060652754], [59.89817083711697, 30.24498805025791], [59.89419055511277, 30.242525111222584], [59.892711282319034, 30.247100288642397], [59.89015588587816, 30.251692191603407], [59.887460110788666, 30.25452452657821], [59.88480725403029, 30.265167454204377], [59.89297007475379, 30.275123775195194], [59.897568188400186, 30.277012030905414], [59.900613481507314, 30.279930254877417], [59.901950106099314, 30.28507994069615], [59.9013896197852, 30.32009870610477], [59.90547891303223, 30.33038950853284], [59.90991124583968, 30.336742672600003], [59.916618163492075, 30.327829618588027], [59.91546406034682, 30.308630219548448], [59.92039588174787, 30.317781622885274], [59.92474280362375, 30.32681471520349], [59.91508013851695, 30.34024604266213], [59.91563036180807, 30.3421760578649], [59.91579270160484, 30.344449395821613], [59.91532007506816, 30.34959688655435], [59.914847441796965, 30.350109520109484], [59.92028321636478, 30.35696657288429], [59.926429251211815, 30.35838573688584], [59.931327746940894, 30.34142800645209], [59.9250252170085, 30.32687353529572], [59.91551973680013, 30.308064275600206], [59.92374280556356, 30.301773957503073], [59.92863920819925, 30.28859250648942], [59.928624649083076, 30.282722223081713], [59.925989342772034, 30.272491472857315], [59.92800695463348, 30.273247050757977], [59.93047647002145, 30.274896071344926], [59.93257208402087, 30.28574721310475], [59.95215223334405, 30.340182255847967], [59.96554554718163, 30.33681759088984], [59.974287470160675, 30.405550704252033], [59.97775437977345, 30.4061014247548], [59.99092560056225, 30.406326174649212], [59.99996500279139, 30.37256197190687], [60.00331787265377, 30.36037944021779], [60.00284505268017, 30.327677947908164], [59.9984174093909, 30.302787048250007], [59.99867534667243, 30.286822540193324], [60.001952867207386, 30.25474897410021], [59.98897930315876, 30.251857842089095], [59.98725917750478, 30.23816973523408], [59.98593676991544, 30.230032100926763], [59.98493955351404, 30.22930467829486], [59.984028324037745, 30.22853434031875], [59.981217038773444, 30.227427703767624], [59.97818454355695, 30.208974105745167], [59.979281435708195, 30.187773925691463], [59.989388333304035, 30.183825714021566], [60.05863392328823, 30.144000274568455], [60.063096382972184, 30.16631625357236], [60.07871022423931, 30.18931887808408], [60.08591411161027, 30.234294158845792], [60.094831022356864, 30.256610137849698], [60.098088520616166, 30.276522857576254], [60.09791708140361, 30.29780886831846], [60.093802271576266, 30.326647979646562], [60.09345934747676, 30.35068057241996], [60.08968694618108, 30.373339874177812], [60.05897721091466, 30.387759429841875], [60.05554417341489, 30.392909271150472], [60.04661659893049, 30.424151641755955], [60.040949766264454, 30.43651126089656], [60.02033487532733, 30.45402072134574], [60.0154369419576, 30.466895324617234], [60.010495306434805, 30.47333262625298], [60.00434945633906, 30.476336700349695], [59.99532200466969, 30.475993377595753], [59.98818426968481, 30.48423312368949], [59.981389086890914, 30.503287536531285], [59.980227744730726, 30.519681198030312], [59.9763132904723, 30.534358245759822], [59.972871628418204, 30.54517291250786], [59.96392162726202, 30.555987579255945], [59.94566987809625, 30.538993102937553], [59.93533422843574, 30.539078933626026], [59.928786644942555, 30.53367160025201], [59.92605047780107, 30.529804242532965], [59.92120361224358, 30.526290161043004]], "pricing": [{"minCart": 3000, "cost": 299, "label": "Доставка 299 ₽ (дальняя зона)"}]}]},
  vyborg: {
    minOrder: 500,
    zones: [{
      name: 'Выборг',
      polygon: [
        [60.665391, 28.870790],
        [60.674150, 28.876283],
        [60.679876, 28.865983],
        [60.706808, 28.846070],
        [60.726319, 28.841950],
        [60.745482, 28.816545],
        [60.745818, 28.787705],
        [60.763626, 28.765733],
        [60.771016, 28.747880],
        [60.788810, 28.723161],
        [60.789816, 28.703248],
        [60.787131, 28.680589],
        [60.773030, 28.647630],
        [60.759595, 28.631837],
        [60.751196, 28.628404],
        [60.754892, 28.619477],
        [60.753884, 28.605744],
        [60.753884, 28.595445],
        [60.748171, 28.589952],
        [60.731363, 28.580339],
        [60.723965, 28.607118],
        [60.709500, 28.650376],
        [60.662022, 28.745133],
        [60.653259, 28.768479],
        [60.635390, 28.790452],
        [60.665391, 28.870790],
      ],
      pricing: [
        { minCart: 2000, cost: 0,   label: 'Бесплатная доставка' },
        { minCart: 500,  cost: 299,  label: 'Доставка 299 ₽' },
      ]
    }]
  }
};

function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if (((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi))
      inside = !inside;
  }
  return inside;
}

/* ── geocode address via Yandex ────────────── */
app.get('/api/geocode', async (req, res) => {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: 'Нужен адрес' });
  if (!YANDEX_GEO_KEY) return res.status(503).json({ error: 'Яндекс API ключ не настроен' });
  try {
    const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_GEO_KEY}&geocode=${encodeURIComponent(geocodeQuery)}&format=json&results=1`;
    const r   = await fetch(url);
    const d   = await r.json();
    const pos = d?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject?.Point?.pos;
    if (!pos) return res.status(404).json({ error: 'Адрес не найден' });
    const [lngStr, latStr] = pos.split(' ');
    res.json({ lat: parseFloat(latStr), lng: parseFloat(lngStr) });
  } catch(e) {
    res.status(500).json({ error: 'Ошибка геокодирования' });
  }
});

/* ── check delivery zone ───────────────────── */
app.post('/api/delivery/check', async (req, res) => {
  const { cityId, address, cartTotal } = req.body;
  const cityZones = DELIVERY_ZONES[cityId];
  if (!cityZones) return res.json({ allowed: true, cost: 0, label: 'Доставка', noZones: true });

  // City bounding boxes for geocoder (ll + spn)
  const CITY_GEO = {
    vyborg: { ll: '28.74,60.70', spn: '0.3,0.15', prefix: 'Выборг' },
    spb:    { ll: '30.32,59.95', spn: '0.7,0.3',  prefix: 'Санкт-Петербург' },
  };
  const geo = CITY_GEO[cityId] || {};
  const geocodeQuery = geo.prefix ? (geo.prefix + ', ' + address) : address;

  // Получаем координаты адреса
  let lat, lng;
  try {
    let geoUrl = `https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_GEO_KEY}&geocode=${encodeURIComponent(geocodeQuery)}&format=json&results=1`;
    if (geo.ll) geoUrl += `&ll=${geo.ll}&spn=${geo.spn}&rspn=1`;
    const r   = await fetch(geoUrl);
    const d   = await r.json();
    const member = d?.response?.GeoObjectCollection?.featureMember?.[0];
    const pos = member?.GeoObject?.Point?.pos;
    if (!pos) return res.json({ allowed: false, reason: 'Адрес не найден. Проверьте правильность написания.' });
    const precision = member?.GeoObject?.metaDataProperty?.GeocoderMetaData?.precision;
    const kind = member?.GeoObject?.metaDataProperty?.GeocoderMetaData?.kind;
    if (!['exact','number','near','range'].includes(precision) || !['house','entrance','street'].includes(kind)) {
      return res.json({ allowed: false, reason: 'Адрес не распознан. Укажите улицу и номер дома, например: Ленина 9.' });
    }
    // Verify geocoded address belongs to the correct city
    const foundAddr = member?.GeoObject?.metaDataProperty?.GeocoderMetaData?.text || '';
    const CITY_NAMES = {
      vyborg: ['Выборг'],
      spb: ['Санкт-Петербург', 'Санкт Петербург', 'Saint Petersburg'],
    };
    const allowedNames = CITY_NAMES[cityId] || [];
    if (allowedNames.length && !allowedNames.some(n => foundAddr.includes(n))) {
      return res.json({ allowed: false, reason: 'Адрес не найден в выбранном городе. Проверьте правильность.' });
    }
    [lng, lat] = pos.split(' ').map(parseFloat);
  } catch(e) {
    return res.status(500).json({ error: 'Не удалось определить координаты адреса' });
  }

  // Проверяем попадание в зоны
  for (const zone of cityZones.zones) {
    if (pointInPolygon(lat, lng, zone.polygon)) {
      // Check per-zone minOrder (for far zones)
      const zonePricing = zone.pricing.find(p => cartTotal >= p.minCart);
      if (!zonePricing) {
        const minNeeded = zone.pricing[zone.pricing.length - 1].minCart;
        const zoneLabel = zone.type === 'far' ? '🚚 Дальняя зона' : zone.name;
        return res.json({ allowed: false, zone: zone.type, reason: `${zoneLabel}: минимальная сумма заказа ${minNeeded} ₽`, minOrder: minNeeded });
      }
      return res.json({ allowed: true, cost: zonePricing.cost, label: zonePricing.label, zone: zone.name, zoneType: zone.type, lat, lng });
    }
  }

  const cityName = cityId === 'spb' ? 'Санкт-Петербурге' : 'Выборге';
  res.json({ allowed: false, reason: `Адрес не входит в зону доставки в ${cityName}` });
});


try {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch (err) {
  console.error('Cannot initialize uploads dir:', err.message);
}



/* ── token auth ────────────────────────────── */
const tokens = new Set();

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !tokens.has(token)) return res.status(401).json({ error: 'Нет доступа' });
  next();
}

/* ── menu helpers ──────────────────────────── */
let memoryMenu = null;

function readMenu() {
  if (memoryMenu) return memoryMenu;
  if (!fs.existsSync(MENU_FILE)) return buildInitialMenu();
  try {
    const menu = JSON.parse(fs.readFileSync(MENU_FILE, 'utf8'));
    memoryMenu = menu;
    return menu;
  } catch {
    return buildInitialMenu();
  }
}

function writeMenu(menu) {
  memoryMenu = menu;
  try {
    fs.writeFileSync(MENU_FILE, JSON.stringify(menu, null, 2), 'utf8');
  } catch (err) {
    // On Vercel this can fail in read-only environments; keep data in memory for current instance.
    console.error('Cannot persist menu to filesystem:', err.message);
  }
}

function buildInitialMenu() {
  const menu = { categories: INITIAL_CATEGORIES, items: INITIAL_ITEMS };
  writeMenu(menu);
  return menu;
}

/* ── routes: public ────────────────────────── */
app.get('/api/menu', (req, res) => {
  const menu = readMenu();
  const city = req.query.city;
  // Добавляем список блюд убранных поваром на сегодня
  const kitchenUnavailable = Object.keys(getTodayAvailability());

  const base = city
    ? { ...menu, items: menu.items.filter(item => !(item.disabledCities || []).includes(city)) }
    : menu;

  res.json({ ...base, kitchenUnavailable });
});

/* ── routes: admin login ───────────────────── */
app.post('/api/admin/login', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Неверный пароль' });
  const token = crypto.randomBytes(32).toString('hex');
  tokens.add(token);
  res.json({ token });
});

app.post('/api/admin/logout', auth, (req, res) => {
  const token = (req.headers.authorization || '').slice(7);
  tokens.delete(token);
  res.json({ ok: true });
});

app.get('/api/admin/check', auth, (_, res) => res.json({ ok: true }));

/* ── routes: categories (admin) ────────────── */
app.get('/api/categories', auth, (_, res) => {
  res.json(readMenu().categories);
});

app.post('/api/categories', auth, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Нужно название' });
  const menu = readMenu();
  const cat = { id: 'cat-' + Date.now(), name, active: true };
  menu.categories.push(cat);
  writeMenu(menu);
  broadcast('menu', readMenu());
  res.json(cat);
});

app.put('/api/categories/:id', auth, (req, res) => {
  const menu = readMenu();
  const cat  = menu.categories.find(c => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: 'Категория не найдена' });
  if (req.body.name   !== undefined) cat.name   = req.body.name;
  if (req.body.active !== undefined) cat.active = req.body.active;
  writeMenu(menu);
  broadcast('menu', readMenu());
  res.json(cat);
});

app.delete('/api/categories/:id', auth, (req, res) => {
  const menu = readMenu();
  const idx  = menu.categories.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Категория не найдена' });
  menu.categories.splice(idx, 1);
  menu.items = menu.items.filter(i => i.categoryId !== req.params.id);
  writeMenu(menu);
  broadcast('menu', readMenu());
  res.json({ ok: true });
});

/* ── routes: items (admin) ─────────────────── */
app.post('/api/menu/item', auth, (req, res) => {
  const { name, categoryId, price, weight, emoji, imageBase64, description, composition, kcal, protein, fat, carbs } = req.body;
  if (!name || !categoryId) return res.status(400).json({ error: 'name, categoryId — обязательны' });
  const menu = readMenu();
  const item = {
    id:          'item-' + Date.now(),
    categoryId,
    name,
    price:       price !== undefined && price !== '' ? parseInt(price, 10) : 0,
    weight:      weight      || '',
    emoji:       emoji       || '🍽️',
    description: description || '',
    composition: composition  || '',
    kcal:        kcal    ?? null,
    protein:     protein ?? null,
    fat:         fat     ?? null,
    carbs:       carbs   ?? null,
    imageBase64: imageBase64 || null,
    active:      true,
  };
  menu.items.push(item);
  writeMenu(menu);
  broadcast('menu', readMenu());
  res.json(item);
});

app.put('/api/menu/item/:id', auth, (req, res) => {
  const menu = readMenu();
  const item = menu.items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Позиция не найдена' });

  const { name, categoryId, price, weight, emoji, active, imageBase64, description, composition, kcal, protein, fat, carbs } = req.body;
  if (name        !== undefined) item.name        = name;
  if (categoryId  !== undefined) item.categoryId  = categoryId;
  if (price       !== undefined) item.price       = parseInt(price, 10);
  if (weight      !== undefined) item.weight      = weight;
  if (emoji       !== undefined) item.emoji       = emoji;
  if (active      !== undefined) item.active      = active === 'true' || active === true;
  if (description !== undefined) item.description = description;
  if (composition !== undefined) item.composition  = composition;
  if (kcal        !== undefined) item.kcal         = kcal;
  if (protein     !== undefined) item.protein      = protein;
  if (fat         !== undefined) item.fat          = fat;
  if (carbs       !== undefined) item.carbs        = carbs;
  if (imageBase64 !== undefined) item.imageBase64 = imageBase64;
  if (req.body.cityPrices !== undefined) item.cityPrices = req.body.cityPrices;

  writeMenu(menu);
  broadcast('menu', readMenu());
  res.json(item);
});

app.patch('/api/menu/item/:id/toggle', auth, (req, res) => {
  const menu = readMenu();
  const item = menu.items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Позиция не найдена' });
  item.active = !item.active;
  writeMenu(menu);
  broadcast('menu', readMenu());
  res.json(item);
});

app.delete('/api/menu/item/:id', auth, (req, res) => {
  const menu = readMenu();
  const idx  = menu.items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Позиция не найдена' });
  menu.items.splice(idx, 1);
  writeMenu(menu);
  broadcast('menu', readMenu());
  res.json({ ok: true });
});

/* ── addresses API ─────────────────────────── */
const DEFAULT_ADDRESSES = [
  { id: 'vyborg',      name: 'Выборг',          list: [] },
  { id: 'iskitim',     name: 'Искитим',         list: ['КОМСОМОЛЬСКАЯ 40'] },
  { id: 'omsk',        name: 'Омск',            list: ['ВОКЗАЛЬНАЯ 16','ХОЛОДИЛЬНАЯ 31'] },
  { id: 'spb',         name: 'Санкт-Петербург', list: ['ЛЕСНОЙ ПРОСПЕКТ 77','НАБЕРЕЖНАЯ РЕКИ КАРПОВКИ 20'] },
  { id: 'novosibirsk', name: 'Новосибирск',     list: ['ВОСХОД 3','БОЛЬШЕВИТСКАЯ 22','ДИМИТРОВА 7','КРАСНЫЙ ПРОСПЕКТ 50','КРАСИНА 62','ЛЕНИНГРАДСКАЯ 100'] },
  { id: 'barnaul',     name: 'Барнаул',         list: [] },
];

function readAddresses() {
  try {
    if (fs.existsSync(ADDRESSES_FILE)) return JSON.parse(fs.readFileSync(ADDRESSES_FILE, 'utf8'));
  } catch(e) {}
  return DEFAULT_ADDRESSES;
}

function writeAddresses(data) {
  fs.writeFileSync(ADDRESSES_FILE, JSON.stringify(data, null, 2));
}

/* ── orders ─────────────────────────────────── */
let memoryOrders = null;

function readOrders() {
  if (memoryOrders) return memoryOrders;
  if (!fs.existsSync(ORDERS_FILE)) return [];
  try {
    memoryOrders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
    return memoryOrders;
  } catch { return []; }
}

function writeOrders(orders) {
  memoryOrders = orders;
  try { fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8'); } catch (e) {
    console.error('Cannot persist orders:', e.message);
  }
}

const ORDER_STATUSES = [
  { id: 'pending',    label: 'Ожидание',    color: '#9b59b6' },
  { id: 'assembling', label: 'Сборка',       color: '#e67e22' },
  { id: 'new',        label: 'Принят',      color: '#f5a623' },
  { id: 'cooking',    label: 'Готовится',   color: '#e67e22' },
  { id: 'ready',      label: 'Готов',       color: '#27ae60' },
  { id: 'delivering', label: 'Выдан',        color: '#2980b9' },
  { id: 'done',       label: 'Доставлен',   color: '#7f8c8d' },
  { id: 'cancelled',  label: 'Отменён',     color: '#e74c3c' },
];

/* ── yookassa helpers ──────────────────────── */
function yooAuth() {
  return 'Basic ' + Buffer.from(`${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET}`).toString('base64');
}

async function createYooPayment({ amount, description, paymentMethod, orderId, returnUrl, customerEmail, customerPhone, items, delivery }) {
  const cleanPhone = customerPhone
    ? '+' + customerPhone.replace(/\D/g, '').replace(/^8/, '7')
    : null;

  // Build receipt items including delivery
  // ЮКасса: amount = цена за 1 единицу, итог позиции = amount * quantity
  const rawItems = items && items.length ? items : null;

  let receiptItems = rawItems ? rawItems.map(i => ({
    description: (i.name || 'Товар').slice(0, 128),
    quantity:    parseFloat(i.qty || 1).toFixed(3),
    amount:      { value: parseFloat(i.price).toFixed(2), currency: 'RUB' },
    vat_code:    1,
    payment_mode: 'full_payment',
    payment_subject: 'commodity',
    _lineTotal: parseFloat(i.price) * parseFloat(i.qty || 1),
  })) : [{
    description:  description.slice(0, 128),
    quantity:     '1.000',
    amount:       { value: amount.toFixed(2), currency: 'RUB' },
    vat_code:     1,
    payment_mode: 'full_payment',
    payment_subject: 'commodity',
    _lineTotal: amount,
  }];

  if (delivery && delivery > 0) {
    receiptItems.push({
      description: 'Доставка',
      quantity:    '1.000',
      amount:      { value: parseFloat(delivery).toFixed(2), currency: 'RUB' },
      vat_code:    1,
      payment_mode: 'full_payment',
      payment_subject: 'service',
      _lineTotal: parseFloat(delivery),
    });
  }

  // Убираем служебное поле
  receiptItems = receiptItems.map(({ _lineTotal, ...i }) => i);

  const body = {
    amount: { value: amount.toFixed(2), currency: 'RUB' },
    description,
    metadata: { orderId },
    capture: true,
    receipt: {
      customer: customerEmail
        ? { email: customerEmail }
        : { phone: cleanPhone },
      items: receiptItems,
    },
  };

  if (paymentMethod === 'qr') {
    body.payment_method_data = { type: 'sbp' };
    body.confirmation = { type: 'qr' };
  } else {
    // bank card
    body.confirmation = { type: 'redirect', return_url: returnUrl };
  }

  console.log('Creating payment, body:', JSON.stringify(body));
  const r = await fetch(`${YOOKASSA_API}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': yooAuth(),
      'Idempotence-Key': orderId + '-' + Date.now(),
    },
    body: JSON.stringify(body),
  });
  return await r.json();
}

async function getYooPayment(paymentId) {
  const r = await fetch(`${YOOKASSA_API}/payments/${paymentId}`, {
    headers: { 'Authorization': yooAuth() },
  });
  return await r.json();
}

// Pending payments storage (in-memory + file)
const PENDING_PAYMENTS_FILE = path.join(DATA_DIR, 'pending_payments.json');
let pendingPayments = {};
try {
  if (fs.existsSync(PENDING_PAYMENTS_FILE))
    pendingPayments = JSON.parse(fs.readFileSync(PENDING_PAYMENTS_FILE, 'utf8'));
} catch(e) {}

function savePendingPayments() {
  try { fs.writeFileSync(PENDING_PAYMENTS_FILE, JSON.stringify(pendingPayments, null, 2)); } catch(e) {}
}

/* ── CREATE PAYMENT (public) ───────────────── */
app.post('/api/payments/create', async (req, res) => {
  const { orderData, paymentMethod } = req.body;
  if (!orderData || !orderData.total || !orderData.name) {
    return res.status(400).json({ error: 'Неверные данные заказа' });
  }

  // Check if payment is enabled for this city
  const addresses = readAddresses();
  const cityData = addresses.find(c => c.id === orderData.city);
  if (cityData && cityData.paymentEnabled === false) {
    return res.status(403).json({ error: 'Онлайн-оплата недоступна для этого города' });
  }

  const tempId = 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const returnUrl = `https://${WEBHOOK_DOMAIN}/?payment_success=1&orderId=${tempId}`;

  try {
    const payment = await createYooPayment({
      amount: orderData.total,
      description: `Заказ в «Солнечный день» для ${orderData.name}`,
      paymentMethod,
      orderId: tempId,
      returnUrl,
      customerEmail: orderData.email || null,
      customerPhone: orderData.phone || null,
      items: orderData.items || [],
      delivery: orderData.delivery || 0,
    });

    console.log('YooKassa response:', JSON.stringify(payment));

    if (payment.id) {
      // Save order data pending payment confirmation
      pendingPayments[payment.id] = { orderData, tempId, paymentMethod, createdAt: Date.now() };
      savePendingPayments();

      const response = { paymentId: payment.id, tempId, status: payment.status };
      if (paymentMethod === 'qr') {
        response.qrUrl = payment.confirmation?.confirmation_url;
      } else {
        response.redirectUrl = payment.confirmation?.confirmation_url;
      }

      res.json(response);
    } else {
      console.error('YooKassa error:', payment);
      res.status(500).json({ error: payment.description || 'Ошибка создания платежа' });
    }
  } catch(e) {
    console.error('Payment creation error:', e);
    res.status(500).json({ error: 'Ошибка соединения с платёжной системой' });
  }
});

/* ── CHECK PAYMENT STATUS (public polling) ─── */
app.get('/api/payments/:paymentId/status', async (req, res) => {
  const { paymentId } = req.params;
  try {
    const payment = await getYooPayment(paymentId);

    // Если оплата прошла но webhook ещё не сработал — создаём заказ сами
    if (payment.paid && payment.status === 'succeeded' && pendingPayments[paymentId]) {
      const pending = pendingPayments[paymentId];
      delete pendingPayments[paymentId];
      savePendingPayments();

      const orderData = pending.orderData;
      const orders = readOrders();
      const order = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        status: 'pending',
        paymentId: payment.id,
        paymentStatus: 'paid',
        ...orderData,
      };
      orders.unshift(order);
      writeOrders(orders);
      broadcast('order', order);
      notifyNewOrder(order).catch(() => {});
      broadcast('payment_confirmed', { tempId: pending.tempId, orderId: order.id });
    }

    res.json({ status: payment.status, paid: payment.paid });
  } catch(e) {
    res.status(500).json({ error: 'Ошибка проверки платежа' });
  }
});

/* ── YOOKASSA WEBHOOK ──────────────────────── */
app.post('/api/payments/webhook', async (req, res) => {
  res.sendStatus(200); // always respond fast
  const event = req.body;
  if (event?.event !== 'payment.succeeded') return;

  const payment = event.object;
  if (!payment?.id || !payment?.paid) return;

  const pending = pendingPayments[payment.id];
  if (!pending) return; // already processed or unknown

  // Remove from pending
  delete pendingPayments[payment.id];
  savePendingPayments();

  // Create the actual order
  const orderData = pending.orderData;
  const orders = readOrders();
  const order = {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    status: 'pending',
    paymentId: payment.id,
    paymentStatus: 'paid',
    ...orderData,
  };
  orders.unshift(order);
  writeOrders(orders);
  broadcast('order', order);
  notifyNewOrder(order).catch(() => {});
  // Notify client via broadcast with their tempId
  broadcast('payment_confirmed', { tempId: pending.tempId, orderId: order.id });
});

// Создать заказ (публичный)
/* ══════════════════════════════════════════════
   SPB DELIVERY ZONES (from KML)
══════════════════════════════════════════════ */



function checkSpbDeliveryZone(lat, lng) {
  // Find which zones contain this point
  const matchedZones = SPB_ZONES.filter(z =>
    z.type !== 'vyborg' && pointInPolygon(lat, lng, z.coords)
  );

  if (!matchedZones.length) {
    return { zone: 'none', zoneId: null, deliveryCost: 0, minOrder: 0 };
  }

  // Find nearest delivery point (stolova)
  const POINTS = {
    karpovki:  { lat: 59.969051, lng: 30.3056 },
    lesnoy:    { lat: 59.997500, lng: 30.345000 },
    vasiliev:  { lat: 59.940000, lng: 30.230000 },
    promyshl:  { lat: 59.896301, lng: 30.259355 },
    borovaya:  { lat: 59.920907, lng: 30.347363 },
    obvodniy:  { lat: 59.909233, lng: 30.314727 },
    sadovaya:  { lat: 59.917632, lng: 30.286655 },
  };

  function dist(p1lat, p1lng, p2lat, p2lng) {
    return Math.sqrt((p1lat - p2lat) ** 2 + (p1lng - p2lng) ** 2);
  }

  // Find nearest point
  let nearestId = null, nearestDist = Infinity;
  for (const [id, pt] of Object.entries(POINTS)) {
    const d = dist(lat, lng, pt.lat, pt.lng);
    if (d < nearestDist) { nearestDist = d; nearestId = id; }
  }

  // Is the point inside nearest point's own zone?
  const ownZone = matchedZones.find(z => z.id === nearestId);

  if (ownZone) {
    // In zone of nearest stolova — normal delivery
    return { zone: 'normal', zoneId: nearestId, deliveryCost: 299, minOrder: 0 };
  } else {
    // In zone of another stolova — far delivery
    const farZone = matchedZones.find(z => z.type === 'far') || matchedZones[0];
    return { zone: 'far', zoneId: farZone.id, deliveryCost: 299, minOrder: 3000 };
  }
}


app.post('/api/orders', async (req, res) => {
  const data = req.body;
  if (!data || !data.name || !data.phone) return res.status(400).json({ error: 'Неверные данные' });
  const orders = readOrders();
  const order = {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    status: 'pending',
    ...data,
  };
  orders.unshift(order);
  writeOrders(orders);
  broadcast('order', order);
  res.json({ ok: true, orderId: order.id });
  notifyNewOrder(order).catch(() => {});
});

// Получить заказы по телефону (публичный)
app.get('/api/orders/by-phone/:phone', (req, res) => {
  const phone = decodeURIComponent(req.params.phone).replace(/\D/g, '');
  const orders = readOrders().filter(o => o.phone.replace(/\D/g, '') === phone);
  res.json(orders);
});

// Получить все заказы (админ)
app.get('/api/admin/orders', auth, (req, res) => {
  res.json(readOrders());
});

// Сменить статус заказа (админ)
app.patch('/api/admin/orders/:id/status', auth, (req, res) => {
  const { status } = req.body;
  if (!ORDER_STATUSES.find(s => s.id === status)) return res.status(400).json({ error: 'Неверный статус' });
  const orders = readOrders();
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });
  order.status = status;
  writeOrders(orders);
  broadcast('order', order);
  res.json({ ok: true });
  updateOrderMessage(order).catch(() => {});
});

// Список статусов
app.get('/api/orders/statuses', (req, res) => res.json(ORDER_STATUSES));

/* ── telegram bot ───────────────────────────── */
async function spbBotApi(method, body) {
  if (!SPB_BOT_TOKEN) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${SPB_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await r.json();
  } catch (e) { return null; }
}

async function clientBotApi(method, body) {
  if (!CLIENT_BOT_TOKEN) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${CLIENT_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await r.json();
  } catch (e) { return null; }
}

async function tgApi(method, body) {
  if (!BOT_TOKEN) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await r.json();
  } catch(e) {
    console.error('TG API error:', e.message);
    return null;
  }
}

async function setSpbBotWebhook() {
  if (!SPB_BOT_TOKEN) return;
  const url = `https://${WEBHOOK_DOMAIN}/api/spb-bot/webhook`;
  const r = await spbBotApi('setWebhook', { url, drop_pending_updates: true });
  console.log('SPB bot webhook:', r?.ok ? '✅ ' + url : '❌ ' + JSON.stringify(r));
}

async function setClientBotWebhook() {
  if (!CLIENT_BOT_TOKEN) return;
  const url = `https://${WEBHOOK_DOMAIN}/api/client-bot/webhook`;
  const r = await clientBotApi('setWebhook', { url, drop_pending_updates: true });
  console.log('Client bot webhook:', r?.ok ? '✅ ' + url : '❌ ' + JSON.stringify(r));
}

async function setWebhook() {
  if (!BOT_TOKEN) return;
  const url = `https://${WEBHOOK_DOMAIN}/api/bot/webhook`;
  const res = await tgApi('setWebhook', { url, drop_pending_updates: true });
  console.log('Webhook set:', res?.ok ? 'OK' : res?.description);

  // Убираем кнопку меню — ставим стандартную
  await tgApi('setChatMenuButton', { menu_button: { type: 'default' } });
}

function buildOrderMessage(order) {
  const st = ORDER_STATUSES.find(s => s.id === order.status) || { label: order.status };
  const items = (order.items || []).map(i => `  • ${i.name} ×${i.qty} — ${i.price * i.qty} ₽`).join('\n');
  const date = new Date(order.createdAt).toLocaleString('ru', { timeZone: 'Asia/Novosibirsk' });
  return `🆕 *Новый заказ #${order.id.slice(-6)}*
` +
    `📅 ${date}
` +
    `👤 ${order.name} | 📞 ${order.phone}
` +
    `📍 ${order.cityName || ''} — ${order.address || ''}` +
    (order.entrance  ? `, подъезд ${order.entrance}` : '') +
    (order.intercom   ? `, домофон ${order.intercom}` : '') +
    (order.floor     ? `, этаж ${order.floor}` : '') +
    (order.apartment ? `, кв. ${order.apartment}` : '') +
    `
` +
    `🚚 ${order.mode === 'delivery' ? 'Доставка' : 'Самовывоз'}
` +
    `💳 ${order.payment === 'qr' ? 'QR-код' : order.payment === 'card' ? 'Банковская карта' : order.payment === 'cash' ? 'Наличные' : order.payment === 'card_on_delivery' ? 'Карта при получении' : 'QR-код'}

` +
    `${items}

` +
    `💰 Итого: *${order.total} ₽*
` +
    `🍽️ Статус: ${st.label}` +
    (order.status === 'assembling' ? `\n⏳ Ожидание подтверждения сборки` : '') +
    (order.assembler ? `\n👨‍🍳 Собрал: ${order.assembler}` : '') +
    (order.comment ? `\n💬 ${order.comment}` : '');
}

function buildStatusKeyboard(orderId, currentStatus, mode) {
  const chainPickup   = ['pending', 'new', 'assembling', 'ready'];
  const chainDelivery = ['pending', 'new', 'assembling', 'ready', 'delivering'];
  const chain = mode === 'delivery' ? chainDelivery : chainPickup;

  // If assembling — show non-clickable hint button
  if (currentStatus === 'assembling') {
    return { inline_keyboard: [[{ text: '⏳ Ожидание подписи сборщика', callback_data: 'noop_assembling' }]] };
  }

  const nextLabels = {
    pending:    '✅ Принять заказ',
    new:        '📦 Заказ собран',
    cooking:    '📦 Заказ собран',
    ready:      '🚚 Заказ передан',
    delivering: '🏠 Доставлен',
  };

  const currentIdx = chain.indexOf(currentStatus);
  const buttons = [];

  const nextStatus = chain[currentIdx + 1];
  // cooking -> ready triggers assembler input, use special callback
  if (currentStatus === 'cooking') {
    buttons.push([{ text: '📦 Заказ собран', callback_data: `assemble:${orderId}` }]);
  } else if (nextStatus && nextStatus !== 'delivering_skip') {
    buttons.push([{ text: nextLabels[currentStatus] || nextStatus, callback_data: `status:${orderId}:${nextStatus}` }]);
  } else if (nextStatus === 'delivering_skip') {
    // pickup: skip delivering, go straight to done
    buttons.push([{ text: '🏠 Выдан клиенту', callback_data: `status:${orderId}:done` }]);
  }

  return { inline_keyboard: buttons };
}

// Уведомление о новом заказе
async function notifyNewOrder(order) {
  const cityId   = (order.cityId || order.city || '').toLowerCase();
  const cityName = (order.cityName || '').toLowerCase();
  const isVyborg = cityId.includes('vyborg') || cityName.includes('выборг');
  const isSpb    = cityId.includes('spb')    || cityName.includes('петербург') || cityName.includes('петербург');

  console.log('notifyNewOrder:', { cityId, cityName, isVyborg, isSpb, hasBotToken: !!BOT_TOKEN, chatId: VYBORG_CHAT_ID });

  let botFn = null, chatId = null;
  if (isVyborg && BOT_TOKEN && VYBORG_CHAT_ID) {
    botFn = tgApi; chatId = VYBORG_CHAT_ID;
  } else if (isSpb && SPB_BOT_TOKEN && (SPB_CHAT_ID || process.env.SPB_CHAT_ID)) {
    botFn = spbBotApi; chatId = SPB_CHAT_ID || process.env.SPB_CHAT_ID;
  }
  if (!botFn || !chatId) {
    console.log('notifyNewOrder: no bot/chat configured for city:', cityId);
    return;
  }

  const text = buildOrderMessage(order);
  const keyboard = buildStatusKeyboard(order.id, order.status, order.mode);
  const res = await botFn('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown', reply_markup: keyboard });
  if (res?.ok && res.result?.message_id) {
    const orders = readOrders();
    const o = orders.find(x => x.id === order.id);
    if (o) { o.tgMessageId = res.result.message_id; o.tgChatId = chatId; writeOrders(orders); }
  }
}

// Обновление сообщения СПБ бота
async function updateOrderMessageSpb(order) {
  if (!SPB_BOT_TOKEN || !order.tgMessageId || !order.tgChatId) return;
  const text = buildOrderMessage(order);
  const keyboard = buildStatusKeyboard(order.id, order.status, order.mode);
  await spbBotApi('editMessageText', {
    chat_id: order.tgChatId,
    message_id: order.tgMessageId,
    text,
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

// Обновление сообщения при смене статуса
async function updateOrderMessage(order) {
  if (!order.tgMessageId || !order.tgChatId) return;
  const cityId = (order.cityId || order.city || '').toLowerCase();
  const isSpb  = cityId.includes('spb');
  if (isSpb) return updateOrderMessageSpb(order);
  if (!BOT_TOKEN) return;
  const text = buildOrderMessage(order);
  const keyboard = buildStatusKeyboard(order.id, order.status, order.mode);
  await tgApi('editMessageText', {
    chat_id: order.tgChatId,
    message_id: order.tgMessageId,
    text,
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

// Получить chat_id (для настройки)
app.get('/api/bot/me', auth, async (req, res) => {
  const updates = await tgApi('getUpdates', { limit: 5 });
  res.json(updates);
});

// Map to track orders waiting for assembler name
const pendingAssemblers = {};

// Webhook от Telegram
// СПБ бот — webhook (уведомления о заказах)
app.post('/api/spb-bot/webhook', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;

  // Ответ сборщика на запрос ФИО
  if (body?.message?.text) {
    const chatId = body.message.chat.id;
    const replyMsgId = body.message.reply_to_message?.message_id;
    if (!replyMsgId) return;
    const orders = readOrders();
    const order = orders.find(o =>
      o.status === 'assembling' &&
      String(o.tgChatId) === String(chatId) && (
        String(o.assemblerAskMsgId) === String(replyMsgId) ||
        String(o.tgMessageId) === String(replyMsgId)
      )
    );
    if (order) {
      order.assembler = body.message.text.trim();
      order.status = 'ready';
      writeOrders(orders);
      broadcast('order', order);
      if (order.assemblerAskMsgId) {
        await spbBotApi('deleteMessage', { chat_id: chatId, message_id: order.assemblerAskMsgId });
      }
      await spbBotApi('deleteMessage', { chat_id: chatId, message_id: body.message.message_id });
      await updateOrderMessageSpb(order);
    }
    return;
  }

  if (!body?.callback_query) return;
  const { id, data, message } = body.callback_query;
  if (data === 'noop_assembling') {
    await spbBotApi('answerCallbackQuery', { callback_query_id: id, text: 'Ответьте на сообщение выше', show_alert: true });
    return;
  }
  if (!data?.startsWith('status:') && !data?.startsWith('assemble:')) return;

  if (data.startsWith('assemble:')) {
    const orderId = data.split(':')[1];
    const orders = readOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) { await spbBotApi('answerCallbackQuery', { callback_query_id: id, text: 'Заказ не найден' }); return; }
    order.status = 'assembling';
    const askMsg = await spbBotApi('sendMessage', {
      chat_id: order.tgChatId,
      text: `✍️ Заказ #${orderId.slice(-6)} собран\. Введите ФИО ответственного за сборку:`,
      reply_markup: { force_reply: true, selective: true },
    });
    if (askMsg?.ok) {
      const orders2 = readOrders();
      const o2 = orders2.find(x => x.id === orderId);
      if (o2) { o2.status = 'assembling'; o2.assemblerAskMsgId = askMsg.result.message_id; writeOrders(orders2); broadcast('order', o2); }
    }
    await spbBotApi('answerCallbackQuery', { callback_query_id: id, text: 'Введите ФИО сборщика' });
    return;
  }

  const [, orderId, newStatus] = data.split(':');
  const orders = readOrders();
  const order = orders.find(o => o.id === orderId);
  if (!order) { await spbBotApi('answerCallbackQuery', { callback_query_id: id, text: 'Заказ не найден' }); return; }
  order.status = newStatus;
  if (newStatus === 'delivering') order.deliveryStartedAt = new Date().toISOString();
  writeOrders(orders);
  broadcast('order', order);
  const st = ORDER_STATUSES.find(s => s.id === newStatus) || { label: newStatus };
  await spbBotApi('answerCallbackQuery', { callback_query_id: id, text: `Статус: ${st.label}` });
  await updateOrderMessageSpb(order);
});

// Клиентский бот — webhook
app.post('/api/client-bot/webhook', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body?.message?.text === '/start') {
    const chatId = body.message.chat.id;
    await clientBotApi('sendMessage', {
      chat_id: chatId,
      text: `☀️ Добро пожаловать в «Солнечный день»!`,
      reply_markup: {
        inline_keyboard: [[{
          text: '🍽 Меню',
          web_app: { url: `https://${WEBHOOK_DOMAIN}/` }
        }]]
      }
    });
  }
});

app.post('/api/bot/webhook', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  const ALLOWED_CHAT = String(VYBORG_CHAT_ID);
  const incomingChat = String(body?.message?.chat?.id || body?.callback_query?.message?.chat?.id || '');

  // Разрешаем только сообщения из admin-чата (callback_query) или /start от любого пользователя
  const isAdminChat = incomingChat === ALLOWED_CHAT;
  const isStart = body?.message?.text === '/start';

  if (!isAdminChat && !isStart) return; // игнорируем всех остальных

  // Handle /start command
  if (isStart) {
    const chatId = body.message.chat.id;
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: '☀️ Добро пожаловать в «Солнечный день»!\n\nЗдесь вы можете быстро оформить заказ на доставку или самовывоз. Нажмите кнопку ниже, чтобы открыть меню и выбрать блюда.\n\nЖелаем вам солнечного настроения и приятного аппетита! 🍽',
      reply_markup: {
        inline_keyboard: [[{
          text: '🍽 Открыть меню',
          web_app: { url: `https://${WEBHOOK_DOMAIN}/` }
        }]]
      }
    });
    return;
  }

  // Handle text message for assembler name (persistent check via order status)
  if (body?.message?.text) {
    const chatId = body.message.chat.id;
    const replyMsgId = body.message.reply_to_message?.message_id;
    // Only accept reply messages
    if (!replyMsgId) return;
    const orders = readOrders();
    // Find assembling order — match by replied message (either ask msg or order msg)
    const order = orders.find(o =>
      o.status === 'assembling' &&
      String(o.tgChatId) === String(chatId) && (
        String(o.assemblerAskMsgId) === String(replyMsgId) ||
        String(o.tgMessageId) === String(replyMsgId)
      )
    );
    if (order) {
      order.assembler = body.message.text.trim();
      order.status = 'ready';
      writeOrders(orders);
      broadcast('order', order);
      delete pendingAssemblers[chatId];
      // Delete only the ask message (not the order message!) and assembler's reply
      if (order.assemblerAskMsgId) {
        await tgApi('deleteMessage', { chat_id: chatId, message_id: order.assemblerAskMsgId });
        delete pendingAssemblers[`msg:${order.assemblerAskMsgId}`];
      }
      await tgApi('deleteMessage', { chat_id: chatId, message_id: body.message.message_id });
      await updateOrderMessage(order);
    }
    return;
  }

  if (!body?.callback_query) return;
  const { id, data, message, from } = body.callback_query;
  if (data === 'noop_assembling') { await tgApi('answerCallbackQuery', { callback_query_id: id, text: 'Ответьте на сообщение с вопросом выше', show_alert: true }); return; }
  if (!data?.startsWith('status:') && !data?.startsWith('assemble:')) return;

  // Handle assembler input request
  if (data.startsWith('assemble:')) {
    const orderId = data.split(':')[1];
    const orders = readOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) { await tgApi('answerCallbackQuery', { callback_query_id: id, text: 'Заказ не найден' }); return; }
    // Статус остаётся cooking до ввода ФИО
    await tgApi('answerCallbackQuery', { callback_query_id: id, text: 'Введите ФИО сборщика для подтверждения' });
    // Убираем кнопки пока не введено ФИО
    await tgApi('editMessageReplyMarkup', {
      chat_id: order.tgChatId,
      message_id: order.tgMessageId,
      reply_markup: { inline_keyboard: [] },
    });
    // Запрашиваем ФИО
    const askMsg = await tgApi('sendMessage', {
      chat_id: message.chat.id,
      text: `✍️ Заказ #${order.id.slice(-6)}. Введите ФИО ответственного за сборку:`,
      reply_markup: { force_reply: true, selective: false },
    });
    // Save ask message_id in order so we can match the reply later
    if (askMsg?.result?.message_id) {
      const orders2 = readOrders();
      const o2 = orders2.find(x => x.id === orderId);
      if (o2) {
        o2.assemblerAskMsgId = askMsg.result.message_id;
        writeOrders(orders2);
        orders2.filter(o => o._justUpdated).forEach(o => { broadcast('order', o); delete o._justUpdated; });
      }
      pendingAssemblers[`msg:${askMsg.result.message_id}`] = orderId;
    }
    pendingAssemblers[message.chat.id] = orderId;
    return;
  }

  const [, orderId, newStatus] = data.split(':');
  const orders = readOrders();
  const order = orders.find(o => o.id === orderId);
  if (!order) { await tgApi('answerCallbackQuery', { callback_query_id: id, text: 'Заказ не найден' }); return; }

  order.status = newStatus;
  // Save delivery start time
  if (newStatus === 'delivering') {
    order.deliveryStartedAt = new Date().toISOString();
  }
  writeOrders(orders);
  broadcast('order', order);

  const st = ORDER_STATUSES.find(s => s.id === newStatus) || { label: newStatus };
  await tgApi('answerCallbackQuery', { callback_query_id: id, text: `Статус: ${st.label}` });
  await updateOrderMessage(order);
});

// Handle assembler name reply
app.post('/api/bot/assembler', async (req, res) => {
  // This is handled inside webhook
  res.json({ ok: true });
});

app.get('/api/orders/statuses', (req, res) => res.json(ORDER_STATUSES));

app.get('/api/addresses', (_req, res) => res.json(readAddresses()));

/* ── feedback ──────────────────────────────── */
app.post('/api/feedback', async (req, res) => {
  const { text, city } = req.body;
  if (!text) return res.status(400).json({ error: 'Нет текста' });

  const FEEDBACK_CHAT = '-5160909076';
  const cityLabel = city ? ` (${city})` : '';
  const msg = `💬 *Фидбэк${cityLabel}*\n\n${text}`;

  try {
    await tgApi('sendMessage', {
      chat_id: FEEDBACK_CHAT,
      text: msg,
      parse_mode: 'Markdown'
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Не удалось отправить' });
  }
});

app.put('/api/addresses', auth, (req, res) => {
  const data = req.body;
  if (!Array.isArray(data)) return res.status(400).json({ error: 'Нужен массив' });
  writeAddresses(data);
  broadcast('addresses', readAddresses());
  res.json({ ok: true });
});

/* ── category reorder ──────────────────────── */
app.post('/api/menu/categories/reorder', auth, (req, res) => {
  const { order } = req.body; // array of category ids
  if (!Array.isArray(order)) return res.status(400).json({ error: 'bad request' });
  const menu = readMenu();
  menu.categories = order.map(id => menu.categories.find(c => c.id === id)).filter(Boolean);
  writeMenu(menu);
  broadcast('menu', readMenu());
  res.json({ ok: true });
});

/* ── patch item (partial update) ───────────── */
app.patch('/api/menu/items/:id', auth, (req, res) => {
  const menu = readMenu();
  const item = menu.items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  Object.assign(item, req.body);
  writeMenu(menu);
  broadcast('menu', readMenu());
  res.json({ ok: true });
});

/* ── menu export/import ────────────────────── */
app.get('/api/admin/export/menu', auth, (req, res) => {
  const menu = readMenu();
  res.json(menu);
});

app.post('/api/admin/import/menu', auth, (req, res) => {
  const data = req.body;
  if (!data?.categories || !data?.items) return res.status(400).json({ error: 'Неверный формат' });
  writeMenu(data);
  broadcast('menu', readMenu());
  res.json({ ok: true, categories: data.categories.length, items: data.items.length });
});

/* ── admin panel route ─────────────────────── */
app.get('/admin', (_, res) => res.sendFile(path.join(__dirname, 'admin.html')));

/* ══════════════════════════════════════════════
   KITCHEN PANEL  — только toggle доступности
   Отдельный PIN, без доступа к редактированию
══════════════════════════════════════════════ */
const KITCHEN_PIN   = process.env.KITCHEN_PIN || '0818';
const kitchenTokens = new Set();

// Хранилище: itemId → { available: false, date: 'YYYY-MM-DD' }
// Запись актуальна только если date === сегодня, иначе блюдо считается доступным
let kitchenAvailability  = {};
const KITCHEN_AV_FILE    = path.join(DATA_DIR, 'kitchen_availability.json');
try {
  if (fs.existsSync(KITCHEN_AV_FILE))
    kitchenAvailability = JSON.parse(fs.readFileSync(KITCHEN_AV_FILE, 'utf8'));
} catch(e) {}

function saveKitchenAvailability() {
  try { fs.writeFileSync(KITCHEN_AV_FILE, JSON.stringify(kitchenAvailability, null, 2)); } catch(e) {}
}

// Получить сегодняшнюю дату в формате YYYY-MM-DD (Moscow/Novosibirsk — UTC+7)
function getTodayDate() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
}

// Вернуть объект availability только с актуальными на сегодня записями
// Если дата записи !== сегодня — блюдо считается доступным (не включаем в ответ)
function getTodayAvailability() {
  const today = getTodayDate();
  const result = {};
  for (const [id, rec] of Object.entries(kitchenAvailability)) {
    if (rec && rec.date === today && rec.available === false) {
      result[id] = false;
    }
  }
  return result;
}

function kitchenAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !kitchenTokens.has(token)) return res.status(401).json({ error: 'Нет доступа' });
  next();
}

app.get('/kitchen', (_, res) => res.sendFile(path.join(__dirname, 'kitchen.html')));

app.post('/api/kitchen/login', (req, res) => {
  if (String(req.body.pin) !== String(KITCHEN_PIN))
    return res.status(401).json({ error: 'Неверный PIN-код' });
  const token = crypto.randomBytes(24).toString('hex');
  kitchenTokens.add(token);
  res.json({ token });
});

app.get('/api/kitchen/check', kitchenAuth, (_, res) => res.json({ ok: true }));

// Текущая доступность — только сегодняшние отключения
app.get('/api/kitchen/availability', (_, res) => res.json(getTodayAvailability()));

// Переключить доступность блюда (только повара)
app.patch('/api/kitchen/availability/:itemId', kitchenAuth, (req, res) => {
  const { itemId } = req.params;
  const { available } = req.body;
  if (typeof available !== 'boolean')
    return res.status(400).json({ error: 'available должен быть boolean' });
  const menu = readMenu();
  const item = menu.items.find(i => i.id === itemId);
  if (!item) return res.status(404).json({ error: 'Блюдо не найдено' });

  const today = getTodayDate();
  if (available) {
    // Восстановить — удаляем запись
    delete kitchenAvailability[itemId];
  } else {
    // Убрать — сохраняем с сегодняшней датой
    kitchenAvailability[itemId] = { available: false, date: today };
  }
  saveKitchenAvailability();

  const todayAv = getTodayAvailability();
  broadcast('kitchen_availability', { itemId, available, date: today });
  res.json({ ok: true, itemId, available });
});

/* ── errors ────────────────────────────────── */
app.use((err, _req, res, _next) => {
  console.error('Unhandled route error:', err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

/* ── delivery auto-complete cron ───────────── */
function startDeliveryCron() {
  setInterval(async () => {
    try {
      const orders = readOrders();
      const now = Date.now();
      let changed = false;
      for (const order of orders) {
        if (order.status === 'delivering' && order.deliveryStartedAt) {
          const elapsed = now - new Date(order.deliveryStartedAt).getTime();
          if (elapsed >= 3 * 60 * 60 * 1000) {
            order.status = 'done';
            changed = true;
            updateOrderMessage(order).catch(() => {});
          }
        }
      }
      if (changed) writeOrders(orders);
    } catch(e) {
      console.error('Delivery cron error:', e.message);
    }
  }, 60 * 1000); // check every minute
}

/* ── start/export ──────────────────────────── */
if (require.main === module) {
  setWebhook();
setClientBotWebhook();
setSpbBotWebhook();
  startDeliveryCron();
  server.listen(PORT, () => {
    console.log(`\n☀️  Солнечный день — сервер запущен`);
    console.log(`   Мини-апп:    http://localhost:${PORT}/`);
    console.log(`   Админ-панель: http://localhost:${PORT}/admin`);
    console.log(`   Пароль:      ${ADMIN_PASSWORD}\n`);
  });
}

module.exports = app;

/* ══════════════════════════════════════════════
   INITIAL MENU DATA
══════════════════════════════════════════════ */
const INITIAL_CATEGORIES = [
  { id: 'lunches',   name: 'Комплексные обеды',        active: true },
  { id: 'breakfast', name: 'Завтраки',                  active: true },
  { id: 'soups',     name: 'Супы',                      active: true },
  { id: 'salads',    name: 'Салаты',                    active: true },
  { id: 'hot',       name: 'Горячее',                   active: true },
  { id: 'garnish',   name: 'Гарниры',                   active: true },
  { id: 'pancakes',  name: 'Блинчики',                  active: true },
  { id: 'sweet',     name: 'Сладкие добавки',           active: true },
  { id: 'additions', name: 'Добавки',                   active: true },
  { id: 'frozen',    name: 'Замороженные полуфабрикаты', active: true },
  { id: 'drinks',    name: 'Напитки',                   active: true },
  { id: 'sugar',     name: 'Сахар и приборы',           active: true },
];

const INITIAL_ITEMS = [
  // Комплексные обеды
  { id:'l1', categoryId:'lunches',   name:'Комплексный обед №1 (суп + горячее + салат + компот)', price:320, weight:'600г', emoji:'🍱', image:null, active:true },
  { id:'l2', categoryId:'lunches',   name:'Комплексный обед №2 (суп + горячее + хлеб)',           price:270, weight:'500г', emoji:'🥘', image:null, active:true },
  { id:'l3', categoryId:'lunches',   name:'Комплексный обед №3 (горячее + гарнир + салат)',       price:290, weight:'550г', emoji:'🍽️',image:null, active:true },
  { id:'l4', categoryId:'lunches',   name:'Бизнес-ланч (суп + горячее + гарнир + напиток)',       price:350, weight:'650г', emoji:'🍱', image:null, active:true },
  // Завтраки
  { id:'b1', categoryId:'breakfast', name:'Каша овсяная с маслом',    price:90,  weight:'250г', emoji:'🥣', image:null, active:true },
  { id:'b2', categoryId:'breakfast', name:'Омлет с сыром',            price:130, weight:'200г', emoji:'🍳', image:null, active:true },
  { id:'b3', categoryId:'breakfast', name:'Сырники со сметаной',      price:150, weight:'250г', emoji:'🥞', image:null, active:true },
  { id:'b4', categoryId:'breakfast', name:'Каша гречневая с маслом',  price:90,  weight:'250г', emoji:'🥣', image:null, active:true },
  { id:'b5', categoryId:'breakfast', name:'Творог со сметаной',       price:120, weight:'200г', emoji:'🥛', image:null, active:true },
  { id:'b6', categoryId:'breakfast', name:'Яйца вареные (2 шт)',      price:60,  weight:'120г', emoji:'🥚', image:null, active:true },
  // Супы
  { id:'s1', categoryId:'soups',     name:'Борщ со сметаной',                    price:140, weight:'300г', emoji:'🍲', image:null, active:true },
  { id:'s2', categoryId:'soups',     name:'Щи из свежей капусты',                price:120, weight:'300г', emoji:'🥣', image:null, active:true },
  { id:'s3', categoryId:'soups',     name:'Куриный суп с лапшой',                price:130, weight:'300г', emoji:'🍜', image:null, active:true },
  { id:'s4', categoryId:'soups',     name:'Солянка мясная',                      price:160, weight:'300г', emoji:'🍲', image:null, active:true },
  { id:'s5', categoryId:'soups',     name:'Уха рыбная',                          price:150, weight:'300г', emoji:'🐟', image:null, active:true },
  { id:'s6', categoryId:'soups',     name:'Гороховый суп с копчёностями',        price:135, weight:'300г', emoji:'🫛', image:null, active:true },
  // Салаты
  { id:'sa1',categoryId:'salads',    name:'Салат «Оливье»',                      price:120, weight:'200г', emoji:'🥗', image:null, active:true },
  { id:'sa2',categoryId:'salads',    name:'Салат «Цезарь» с курицей',            price:180, weight:'220г', emoji:'🥗', image:null, active:true },
  { id:'sa3',categoryId:'salads',    name:'Салат «Греческий»',                   price:160, weight:'200г', emoji:'🫒', image:null, active:true },
  { id:'sa4',categoryId:'salads',    name:'Салат из свежих овощей',              price:100, weight:'200г', emoji:'🥦', image:null, active:true },
  { id:'sa5',categoryId:'salads',    name:'Свекольный салат с чесноком',         price:90,  weight:'180г', emoji:'🥗', image:null, active:true },
  { id:'sa6',categoryId:'salads',    name:'Салат «Мимоза»',                      price:130, weight:'200г', emoji:'🥗', image:null, active:true },
  // Горячее
  { id:'h1', categoryId:'hot',       name:'Котлета мясная (2 шт)',               price:160, weight:'180г', emoji:'🍖', image:null, active:true },
  { id:'h2', categoryId:'hot',       name:'Куриная грудка запечённая',           price:190, weight:'200г', emoji:'🍗', image:null, active:true },
  { id:'h3', categoryId:'hot',       name:'Рыба минтай жареная',                 price:170, weight:'200г', emoji:'🐟', image:null, active:true },
  { id:'h4', categoryId:'hot',       name:'Голубцы с мясом (2 шт)',              price:200, weight:'300г', emoji:'🫑', image:null, active:true },
  { id:'h5', categoryId:'hot',       name:'Пельмени домашние',                   price:180, weight:'300г', emoji:'🥟', image:null, active:true },
  { id:'h6', categoryId:'hot',       name:'Картофельные зразы с мясом',         price:150, weight:'250г', emoji:'🥔', image:null, active:true },
  { id:'h7', categoryId:'hot',       name:'Тефтели в томатном соусе',            price:175, weight:'280г', emoji:'🍝', image:null, active:true },
  // Гарниры
  { id:'g1', categoryId:'garnish',   name:'Картофельное пюре',                   price:80,  weight:'200г', emoji:'🥔', image:null, active:true },
  { id:'g2', categoryId:'garnish',   name:'Гречка отварная',                     price:70,  weight:'200г', emoji:'🌾', image:null, active:true },
  { id:'g3', categoryId:'garnish',   name:'Рис отварной',                        price:70,  weight:'200г', emoji:'🍚', image:null, active:true },
  { id:'g4', categoryId:'garnish',   name:'Макароны отварные',                   price:70,  weight:'200г', emoji:'🍝', image:null, active:true },
  { id:'g5', categoryId:'garnish',   name:'Капуста тушёная',                     price:80,  weight:'200г', emoji:'🥬', image:null, active:true },
  { id:'g6', categoryId:'garnish',   name:'Перловка с маслом',                   price:65,  weight:'200г', emoji:'🌾', image:null, active:true },
  // Блинчики
  { id:'p1', categoryId:'pancakes',  name:'Блинчики с творогом (3 шт)',          price:130, weight:'250г', emoji:'🥞', image:null, active:true },
  { id:'p2', categoryId:'pancakes',  name:'Блинчики с мясом (3 шт)',             price:150, weight:'270г', emoji:'🥞', image:null, active:true },
  { id:'p3', categoryId:'pancakes',  name:'Блинчики с вареньем (3 шт)',          price:110, weight:'230г', emoji:'🫐', image:null, active:true },
  { id:'p4', categoryId:'pancakes',  name:'Блинчики с капустой (3 шт)',          price:120, weight:'250г', emoji:'🥞', image:null, active:true },
  // Сладкие добавки
  { id:'sw1',categoryId:'sweet',     name:'Компот домашний',                     price:60,  weight:'200мл',emoji:'🫙', image:null, active:true },
  { id:'sw2',categoryId:'sweet',     name:'Кисель ягодный',                      price:55,  weight:'200мл',emoji:'🫐', image:null, active:true },
  { id:'sw3',categoryId:'sweet',     name:'Пирожок с яблоком',                   price:65,  weight:'100г', emoji:'🥐', image:null, active:true },
  { id:'sw4',categoryId:'sweet',     name:'Пирожок с вишней',                    price:65,  weight:'100г', emoji:'🍒', image:null, active:true },
  { id:'sw5',categoryId:'sweet',     name:'Кекс шоколадный',                     price:80,  weight:'120г', emoji:'🧁', image:null, active:true },
  // Добавки
  { id:'ad1',categoryId:'additions', name:'Хлеб белый (2 куска)',                price:20,  weight:'60г',  emoji:'🍞', image:null, active:true },
  { id:'ad2',categoryId:'additions', name:'Хлеб чёрный (2 куска)',               price:20,  weight:'60г',  emoji:'🍞', image:null, active:true },
  { id:'ad3',categoryId:'additions', name:'Сметана (порция)',                    price:40,  weight:'50г',  emoji:'🥛', image:null, active:true },
  { id:'ad4',categoryId:'additions', name:'Масло сливочное (порция)',            price:30,  weight:'20г',  emoji:'🧈', image:null, active:true },
  // Замороженные
  { id:'fr1',categoryId:'frozen',    name:'Пельмени замороженные (0.5 кг)',      price:250, weight:'500г', emoji:'🥟', image:null, active:true },
  { id:'fr2',categoryId:'frozen',    name:'Голубцы замороженные (1 кг)',         price:380, weight:'1кг',  emoji:'🫑', image:null, active:true },
  { id:'fr3',categoryId:'frozen',    name:'Котлеты замороженные (0.5 кг)',       price:290, weight:'500г', emoji:'🍖', image:null, active:true },
  { id:'fr4',categoryId:'frozen',    name:'Блинчики с мясом замороженные (0.5 кг)',price:280,weight:'500г',emoji:'🥞', image:null, active:true },
  // Напитки
  { id:'d1', categoryId:'drinks',    name:'Чай чёрный',                          price:50,  weight:'200мл',emoji:'🍵', image:null, active:true },
  { id:'d2', categoryId:'drinks',    name:'Кофе чёрный',                         price:70,  weight:'150мл',emoji:'☕', image:null, active:true },
  { id:'d3', categoryId:'drinks',    name:'Морс ягодный',                        price:60,  weight:'200мл',emoji:'🫐', image:null, active:true },
  { id:'d4', categoryId:'drinks',    name:'Вода питьевая 0.5л',                  price:45,  weight:'500мл',emoji:'💧', image:null, active:true },
  { id:'d5', categoryId:'drinks',    name:'Сок в ассортименте 0.2л',             price:55,  weight:'200мл',emoji:'🧃', image:null, active:true },
  // Сахар и приборы
  { id:'su1',categoryId:'sugar',     name:'Сахар порционный (2 пакетика)',       price:9,   weight:'10г',  emoji:'🍬', image:null, active:true },
  { id:'su2',categoryId:'sugar',     name:'Вилка одноразовая',                   price:5,   weight:'',     emoji:'🍴', image:null, active:true },
  { id:'su3',categoryId:'sugar',     name:'Ложка одноразовая',                   price:5,   weight:'',     emoji:'🥄', image:null, active:true },
  { id:'su4',categoryId:'sugar',     name:'Нож одноразовый',                     price:5,   weight:'',     emoji:'🔪', image:null, active:true },
  { id:'su5',categoryId:'sugar',     name:'Салфетки (5 шт)',                     price:10,  weight:'',     emoji:'🧻', image:null, active:true },
  { id:'su6',categoryId:'sugar',     name:'Контейнер',                           price:9,   weight:'',     emoji:'📦', image:null, active:true },
];
