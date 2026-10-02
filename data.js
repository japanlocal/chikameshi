// 入力の選択肢と、各データソースへの対応表

// 空気感: Hot Pepper の設備情報 / ジャンル、OSM の業態から加点する
const VIBES = [
  {
    id: 'lively', label: 'ワイワイ盛り上がる', emoji: '🎉',
    hpGenres: ['G001', 'G002', 'G008', 'G011', 'G016'],
    hpFeatures: { free_drink: 3, course: 2, charter: 1, karaoke: 1 },
    osmAmenities: ['pub', 'izakaya', 'bar'],
    osmCuisines: ['izakaya', 'yakiniku', 'korean', 'okonomiyaki', 'yakitori', 'barbecue'],
    largeGroupBonus: true,
  },
  {
    id: 'calm', label: '落ち着いてゆっくり', emoji: '🍵',
    hpGenres: ['G004', 'G006', 'G012', 'G014'],
    hpFeatures: { private_room: 3, horigotatsu: 1, non_smoking: 1 },
    osmAmenities: ['cafe', 'restaurant'],
    osmCuisines: ['japanese', 'french', 'italian', 'coffee_shop', 'tea', 'kaiseki'],
  },
  {
    id: 'date', label: 'デート・記念日', emoji: '💕',
    hpGenres: ['G006', 'G002', 'G012', 'G003'],
    hpFeatures: { private_room: 2, sommelier: 2, non_smoking: 1, card: 1 },
    osmAmenities: ['restaurant', 'bar'],
    osmCuisines: ['italian', 'french', 'spanish', 'wine_bar', 'steak_house', 'sushi'],
  },
  {
    id: 'business', label: '接待・きちんと', emoji: '🤝',
    hpGenres: ['G004', 'G006', 'G003'],
    hpFeatures: { private_room: 4, card: 2, course: 1, non_smoking: 1 },
    osmAmenities: ['restaurant'],
    osmCuisines: ['japanese', 'sushi', 'kaiseki', 'french', 'tempura', 'steak_house'],
    preferHighBudget: true,
  },
  {
    id: 'casual', label: 'サクッと気軽に', emoji: '⚡',
    hpGenres: ['G013', 'G014', 'G015', 'G007', 'G005'],
    hpFeatures: { lunch: 1, midnight: 1 },
    osmAmenities: ['fast_food', 'cafe', 'food_court'],
    osmCuisines: ['ramen', 'noodle', 'burger', 'curry', 'udon', 'soba', 'donburi', 'sandwich'],
    preferLowBudget: true,
  },
  {
    id: 'family', label: '家族・子連れ', emoji: '👨‍👩‍👧',
    hpGenres: ['G005', 'G004', 'G016', 'G014'],
    hpFeatures: { child: 3, tatami: 1, horigotatsu: 1, non_smoking: 2, parking: 1 },
    osmAmenities: ['restaurant', 'fast_food', 'food_court'],
    osmCuisines: ['family', 'japanese', 'western', 'okonomiyaki', 'udon', 'pizza'],
  },
];

// 食べたいもの: Hot Pepper のジャンルコード(+キーワード) と OSM の amenity/cuisine タグ
const FOODS = [
  { id: 'izakaya', label: '居酒屋', emoji: '🍶', hp: ['G001'], osmAmenities: ['pub', 'izakaya'], osmCuisines: ['izakaya', 'yakitori'] },
  { id: 'washoku', label: '和食', emoji: '🍱', hp: ['G004'], osmCuisines: ['japanese', 'soba', 'udon', 'tempura', 'tonkatsu', 'unagi', 'kaiseki', 'donburi'] },
  { id: 'sushi', label: '寿司', emoji: '🍣', hp: ['G004'], hpKeyword: '寿司', osmCuisines: ['sushi'] },
  { id: 'ramen', label: 'ラーメン', emoji: '🍜', hp: ['G013'], osmCuisines: ['ramen', 'noodle'] },
  { id: 'yakiniku', label: '焼肉', emoji: '🥩', hp: ['G008'], osmCuisines: ['yakiniku', 'barbecue', 'korean_bbq'] },
  { id: 'italian', label: 'イタリアン・フレンチ', emoji: '🍝', hp: ['G006'], osmCuisines: ['italian', 'french', 'pizza', 'pasta'] },
  { id: 'chinese', label: '中華', emoji: '🥟', hp: ['G007'], osmCuisines: ['chinese', 'dumpling', 'gyoza'] },
  { id: 'korean', label: '韓国料理', emoji: '🌶️', hp: ['G017'], osmCuisines: ['korean'] },
  { id: 'asian', label: 'アジア・エスニック', emoji: '🍛', hp: ['G009', 'G010'], osmCuisines: ['thai', 'vietnamese', 'indian', 'curry', 'nepalese', 'asian', 'mexican', 'turkish'] },
  { id: 'western', label: '洋食', emoji: '🍔', hp: ['G005'], osmCuisines: ['western', 'steak_house', 'burger', 'american', 'hamburger'] },
  { id: 'okonomi', label: 'お好み焼き', emoji: '🥞', hp: ['G016'], osmCuisines: ['okonomiyaki', 'takoyaki', 'monja'] },
  { id: 'cafe', label: 'カフェ・スイーツ', emoji: '🍰', hp: ['G014'], osmAmenities: ['cafe'], osmCuisines: ['coffee_shop', 'cake', 'dessert', 'ice_cream', 'pancake'] },
  { id: 'bar', label: 'バー', emoji: '🍸', hp: ['G012', 'G002'], osmAmenities: ['bar'], osmCuisines: ['wine_bar'] },
];

// 予算 (1人あたりの上限, 円)
const BUDGETS = [
  { value: 0, label: 'こだわらない' },
  { value: 1000, label: '〜1,000円' },
  { value: 2000, label: '〜2,000円' },
  { value: 3000, label: '〜3,000円' },
  { value: 4000, label: '〜4,000円' },
  { value: 5000, label: '〜5,000円' },
  { value: 7000, label: '〜7,000円' },
  { value: 10000, label: '〜10,000円' },
  { value: 15000, label: '〜15,000円' },
  { value: 99999, label: '15,000円以上もOK' },
];

// Hot Pepper の予算コード -> [下限, 上限]
const HP_BUDGET_RANGES = {
  B009: [0, 500], B010: [501, 1000], B011: [1001, 1500], B001: [1501, 2000],
  B002: [2001, 3000], B003: [3001, 4000], B008: [4001, 5000], B004: [5001, 7000],
  B005: [7001, 10000], B006: [10001, 15000], B012: [15001, 20000],
  B013: [20001, 30000], B014: [30001, 50000],
};

// OSM には価格情報がほぼ無いため、業態・料理から目安を推定する
const OSM_PRICE_ESTIMATE = {
  amenity: { fast_food: 900, food_court: 1000, cafe: 1200, restaurant: 2500, pub: 3500, izakaya: 3500, bar: 4000 },
  cuisine: {
    ramen: 1000, noodle: 1000, udon: 900, soba: 1100, curry: 1100, burger: 1000, donburi: 900,
    sushi: 4500, kaiseki: 10000, yakiniku: 5000, french: 6000, steak_house: 5000, tempura: 4000,
    italian: 3000, chinese: 2000, korean: 3000, okonomiyaki: 2000, coffee_shop: 800, cake: 1000,
  },
};
