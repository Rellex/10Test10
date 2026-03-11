const CITIES = [
  { id: 'novosibirsk', name: 'Новосибирск',     phone: '+7 (xxx) xxx xx xx' },
  { id: 'spb',         name: 'Санкт-Петербург', phone: '+7 (xxx) xxx xx xx' },
  { id: 'iskitim',     name: 'Искитим',          phone: '+7 (xxx) xxx xx xx' },
  { id: 'omsk',        name: 'Омск',             phone: '+7 (xxx) xxx xx xx' },
  { id: 'barnaul',     name: 'Барнаул',          phone: '+7 (xxx) xxx xx xx' },
  { id: 'vyborg',      name: 'Выборг',           phone: '+7 (813) 990-03-33' },
];

const ADDRESSES = {
  novosibirsk: [
    'ВОСХОД 3',
    'БОЛЬШЕВИТСКАЯ 22',
    'ДИМИТРОВА 7',
    'КРАСНЫЙ ПРОСПЕКТ 50',
    'КРАСИНА 62',
    'ЛЕНИНГРАДСКАЯ 100',
    'НИКИТИНА 20',
    'НИКИТИНА 99',
    'НЕМИРОВИЧА-ДАНЧЕНКО 165',
    'БОГДАНА ХМЕЛЬНИЦКОГО 52',
    'КРАСНЫЙ ПРОСПЕКТ 17',
    'ДУСИ КОВАЛЬЧУК 260',
    'КРАСНЫЙ ПРОСПЕКТ 66',
    'ПЕРВОМАЙСКАЯ 168',
    'ФАБРИЧНАЯ 8',
    'ПИСАРЕВА 1',
    'ТРОЛЛЕЙНАЯ 130',
  ],
  spb: [
    'ЛЕСНОЙ ПРОСПЕКТ 77',
    'НАБЕРЕЖНАЯ РЕКИ КАРПОВКИ 20',
  ],
  iskitim: [
    'КОМСОМОЛЬСКАЯ 40',
  ],
  omsk: [
    'ВОКЗАЛЬНАЯ 16',
    'КРАСНЫЙ ПРОСПЕКТ 13',
    'ХОЛОДИЛЬНАЯ 31',
  ],
  barnaul: [],
  vyborg:  [],
};

const CATEGORIES = [
  { id: 'lunches',    name: 'Комплексные обеды' },
  { id: 'breakfast',  name: 'Завтраки' },
  { id: 'soups',      name: 'Супы' },
  { id: 'salads',     name: 'Салаты' },
  { id: 'hot',        name: 'Горячее' },
  { id: 'garnish',    name: 'Гарниры' },
  { id: 'pancakes',   name: 'Блинчики' },
  { id: 'sweet',      name: 'Сладкие добавки' },
  { id: 'additions',  name: 'Добавки' },
  { id: 'frozen',     name: 'Замороженные полуфабрикаты' },
  { id: 'drinks',     name: 'Напитки' },
  { id: 'sugar',      name: 'Сахар и приборы' },
];

const MENU = {
  lunches: [
    { id: 'l1', name: 'Комплексный обед №1 (суп + горячее + салат + компот)', price: 320, weight: '600г', emoji: '🍱' },
    { id: 'l2', name: 'Комплексный обед №2 (суп + горячее + хлеб)', price: 270, weight: '500г', emoji: '🥘' },
    { id: 'l3', name: 'Комплексный обед №3 (горячее + гарнир + салат)', price: 290, weight: '550г', emoji: '🍽️' },
    { id: 'l4', name: 'Бизнес-ланч (суп + горячее + гарнир + напиток)', price: 350, weight: '650г', emoji: '🍱' },
  ],
  breakfast: [
    { id: 'b1', name: 'Каша овсяная с маслом', price: 90,  weight: '250г', emoji: '🥣' },
    { id: 'b2', name: 'Омлет с сыром', price: 130, weight: '200г', emoji: '🍳' },
    { id: 'b3', name: 'Сырники со сметаной', price: 150, weight: '250г', emoji: '🥞' },
    { id: 'b4', name: 'Каша гречневая с маслом', price: 90,  weight: '250г', emoji: '🥣' },
    { id: 'b5', name: 'Творог со сметаной', price: 120, weight: '200г', emoji: '🥛' },
    { id: 'b6', name: 'Яйца вареные (2 шт)', price: 60,  weight: '120г', emoji: '🥚' },
  ],
  soups: [
    { id: 's1', name: 'Борщ со сметаной', price: 140, weight: '300г', emoji: '🍲' },
    { id: 's2', name: 'Щи из свежей капусты', price: 120, weight: '300г', emoji: '🥣' },
    { id: 's3', name: 'Куриный суп с лапшой', price: 130, weight: '300г', emoji: '🍜' },
    { id: 's4', name: 'Солянка мясная', price: 160, weight: '300г', emoji: '🍲' },
    { id: 's5', name: 'Уха рыбная', price: 150, weight: '300г', emoji: '🐟' },
    { id: 's6', name: 'Гороховый суп с копчёностями', price: 135, weight: '300г', emoji: '🫛' },
  ],
  salads: [
    { id: 'sa1', name: 'Салат «Оливье»', price: 120, weight: '200г', emoji: '🥗' },
    { id: 'sa2', name: 'Салат «Цезарь» с курицей', price: 180, weight: '220г', emoji: '🥗' },
    { id: 'sa3', name: 'Салат «Греческий»', price: 160, weight: '200г', emoji: '🫒' },
    { id: 'sa4', name: 'Салат из свежих овощей', price: 100, weight: '200г', emoji: '🥦' },
    { id: 'sa5', name: 'Свекольный салат с чесноком', price: 90,  weight: '180г', emoji: '🥗' },
    { id: 'sa6', name: 'Салат «Мимоза»', price: 130, weight: '200г', emoji: '🥗' },
  ],
  hot: [
    { id: 'h1', name: 'Котлета мясная (2 шт)', price: 160, weight: '180г', emoji: '🍖' },
    { id: 'h2', name: 'Куриная грудка запечённая', price: 190, weight: '200г', emoji: '🍗' },
    { id: 'h3', name: 'Рыба минтай жареная', price: 170, weight: '200г', emoji: '🐟' },
    { id: 'h4', name: 'Голубцы с мясом (2 шт)', price: 200, weight: '300г', emoji: '🫑' },
    { id: 'h5', name: 'Пельмени домашние', price: 180, weight: '300г', emoji: '🥟' },
    { id: 'h6', name: 'Картофельные зразы с мясом', price: 150, weight: '250г', emoji: '🥔' },
    { id: 'h7', name: 'Тефтели в томатном соусе', price: 175, weight: '280г', emoji: '🍝' },
  ],
  garnish: [
    { id: 'g1', name: 'Картофельное пюре', price: 80,  weight: '200г', emoji: '🥔' },
    { id: 'g2', name: 'Гречка отварная', price: 70,  weight: '200г', emoji: '🌾' },
    { id: 'g3', name: 'Рис отварной', price: 70,  weight: '200г', emoji: '🍚' },
    { id: 'g4', name: 'Макароны отварные', price: 70,  weight: '200г', emoji: '🍝' },
    { id: 'g5', name: 'Капуста тушёная', price: 80,  weight: '200г', emoji: '🥬' },
    { id: 'g6', name: 'Перловка с маслом', price: 65,  weight: '200г', emoji: '🌾' },
  ],
  pancakes: [
    { id: 'p1', name: 'Блинчики с творогом (3 шт)', price: 130, weight: '250г', emoji: '🥞' },
    { id: 'p2', name: 'Блинчики с мясом (3 шт)', price: 150, weight: '270г', emoji: '🥞' },
    { id: 'p3', name: 'Блинчики с вареньем (3 шт)', price: 110, weight: '230г', emoji: '🫐' },
    { id: 'p4', name: 'Блинчики с капустой (3 шт)', price: 120, weight: '250г', emoji: '🥞' },
    { id: 'p5', name: 'Блинчики со сметаной (3 шт)', price: 120, weight: '240г', emoji: '🥞' },
  ],
  sweet: [
    { id: 'sw1', name: 'Компот домашний', price: 60,  weight: '200мл', emoji: '🫙' },
    { id: 'sw2', name: 'Кисель ягодный', price: 55,  weight: '200мл', emoji: '🫐' },
    { id: 'sw3', name: 'Пирожок с яблоком', price: 65,  weight: '100г', emoji: '🥐' },
    { id: 'sw4', name: 'Пирожок с вишней', price: 65,  weight: '100г', emoji: '🍒' },
    { id: 'sw5', name: 'Кекс шоколадный', price: 80,  weight: '120г', emoji: '🧁' },
    { id: 'sw6', name: 'Варенье (порция)', price: 30,  weight: '40г', emoji: '🍓' },
    { id: 'sw7', name: 'Мёд (порция)', price: 35,  weight: '30г', emoji: '🍯' },
  ],
  additions: [
    { id: 'ad1', name: 'Хлеб белый (2 куска)', price: 20,  weight: '60г', emoji: '🍞' },
    { id: 'ad2', name: 'Хлеб чёрный (2 куска)', price: 20,  weight: '60г', emoji: '🍞' },
    { id: 'ad3', name: 'Сметана (порция)', price: 40,  weight: '50г', emoji: '🥛' },
    { id: 'ad4', name: 'Масло сливочное (порция)', price: 30,  weight: '20г', emoji: '🧈' },
    { id: 'ad5', name: 'Соус томатный', price: 35,  weight: '50г', emoji: '🍅' },
    { id: 'ad6', name: 'Майонез (порция)', price: 25,  weight: '30г', emoji: '🥣' },
  ],
  frozen: [
    { id: 'fr1', name: 'Пельмени замороженные (0.5 кг)', price: 250, weight: '500г', emoji: '🥟' },
    { id: 'fr2', name: 'Голубцы замороженные (1 кг)', price: 380, weight: '1кг',  emoji: '🫑' },
    { id: 'fr3', name: 'Котлеты замороженные (0.5 кг)', price: 290, weight: '500г', emoji: '🍖' },
    { id: 'fr4', name: 'Блинчики с мясом замороженные (0.5 кг)', price: 280, weight: '500г', emoji: '🥞' },
    { id: 'fr5', name: 'Вареники с картошкой замороженные (0.5 кг)', price: 230, weight: '500г', emoji: '🥟' },
  ],
  drinks: [
    { id: 'd1', name: 'Чай чёрный', price: 50,  weight: '200мл', emoji: '🍵' },
    { id: 'd2', name: 'Кофе чёрный', price: 70,  weight: '150мл', emoji: '☕' },
    { id: 'd3', name: 'Морс ягодный', price: 60,  weight: '200мл', emoji: '🫐' },
    { id: 'd4', name: 'Вода питьевая 0.5л', price: 45,  weight: '500мл', emoji: '💧' },
    { id: 'd5', name: 'Сок в ассортименте 0.2л', price: 55,  weight: '200мл', emoji: '🧃' },
    { id: 'd6', name: 'Молоко (стакан)', price: 55,  weight: '200мл', emoji: '🥛' },
  ],
  sugar: [
    { id: 'su1', name: 'Сахар порционный (2 пакетика)', price: 9,   weight: '10г',  emoji: '🍬' },
    { id: 'su2', name: 'Вилка одноразовая', price: 5,   weight: '',    emoji: '🍴' },
    { id: 'su3', name: 'Ложка одноразовая', price: 5,   weight: '',    emoji: '🥄' },
    { id: 'su4', name: 'Нож одноразовый',   price: 5,   weight: '',    emoji: '🔪' },
    { id: 'su5', name: 'Салфетки (5 шт)',   price: 10,  weight: '',    emoji: '🧻' },
    { id: 'su6', name: 'Контейнер',         price: 9,   weight: '',    emoji: '📦' },
  ],
};

const DELIVERY_INFO = {
  minOrder: 500,
  deliveryCost: 299,
  freeDeliveryFrom: 2000,
  workHours: 'с 8:00 до 20:00',
  workDays: 'Пн–Вс',
  avgDeliveryTime: '90 минут',
  phone: '399 00 33',
};

const PROMO_CODES = {
  'SUNNY10': { discount: 10, type: 'percent', label: 'Скидка 10%' },
  'FREE99':  { discount: 99, type: 'fixed',   label: 'Бесплатная доставка' },
  'BONUS50': { discount: 50, type: 'fixed',   label: 'Скидка 50 рублей' },
};

const BONUS_PROGRAM = [
  { level: 'Серебряный', percent: 10, minAmount: 0,    color: '#9e9e9e' },
  { level: 'Золотой',    percent: 15, minAmount: 3500, color: '#f5a623' },
  { level: 'Платиновый', percent: 20, minAmount: 7001, color: '#a855f7' },
];
