// 店舗データの取得。どのソースも同じ形 (Shop) に正規化して返す
//
// Shop = {
//   id, name, lat, lng, source, genreName, genreCodes[], amenity, cuisines[],
//   priceMin, priceMax, priceLabel, priceEstimated, capacity, features{},
//   catchText, access, open, url, photo
// }

const HP_ENDPOINT = 'https://webservice.recruit.co.jp/hotpepper/gourmet/v1/';
const HP_RANGE_CODES = { 300: 1, 500: 2, 1000: 3, 2000: 4, 3000: 5 };
const HP_FEATURE_KEYS = [
  'private_room', 'free_drink', 'free_food', 'course', 'card', 'non_smoking', 'charter',
  'horigotatsu', 'tatami', 'child', 'parking', 'karaoke', 'sommelier', 'lunch', 'midnight', 'wifi',
];
// 「あり」「利用可」「全面禁煙」「営業している」「お子様連れ歓迎」などを肯定とみなす
const HP_POSITIVE_VALUE = /^(あり|利用可|可|全面禁煙|営業している|お子様連れ(歓迎|OK))/;

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// Hot Pepper API は CORS 非対応のため JSONP で呼ぶ
function jsonp(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const cb = `__hp_cb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const script = document.createElement('script');
    const timer = setTimeout(() => { cleanup(); reject(new Error('タイムアウトしました')); }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      delete window[cb];
      script.remove();
    }
    window[cb] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('通信に失敗しました')); };
    script.src = `${url}&callback=${cb}`;
    document.head.appendChild(script);
  });
}

async function fetchHotPepper({ apiKey, lat, lng, radius, foods, keyword }) {
  const base = new URLSearchParams({
    key: apiKey, lat, lng, range: HP_RANGE_CODES[radius] || 3, count: 100, format: 'jsonp',
  });

  // 料理ごとに検索して結合する (ジャンル指定なしの100件だと近場の候補が埋もれるため)
  const queries = [];
  if (foods.length === 0) {
    queries.push({ keyword });
  } else {
    for (const food of foods) {
      for (const genre of food.hp) {
        queries.push({ genre, keyword: [food.hpKeyword, keyword].filter(Boolean).join(' ') });
      }
    }
  }

  const responses = await Promise.all(queries.map((q) => {
    const params = new URLSearchParams(base);
    if (q.genre) params.set('genre', q.genre);
    if (q.keyword) params.set('keyword', q.keyword);
    return jsonp(`${HP_ENDPOINT}?${params}`);
  }));

  const shops = new Map();
  for (const res of responses) {
    const results = res.results || {};
    if (results.error) {
      const msg = results.error[0]?.message || 'APIエラー';
      throw new Error(`ホットペッパーAPI: ${msg}`);
    }
    for (const s of results.shop || []) {
      if (!shops.has(s.id)) shops.set(s.id, normalizeHotPepperShop(s));
    }
  }
  return [...shops.values()];
}

function normalizeHotPepperShop(s) {
  const range = HP_BUDGET_RANGES[s.budget?.code];
  const features = {};
  for (const key of HP_FEATURE_KEYS) {
    const v = s[key];
    features[key] = typeof v === 'string' && HP_POSITIVE_VALUE.test(v);
  }
  return {
    id: `hp-${s.id}`,
    source: 'hotpepper',
    name: s.name,
    lat: Number(s.lat),
    lng: Number(s.lng),
    genreName: s.genre?.name || '',
    genreCodes: [s.genre?.code, s.sub_genre?.code].filter(Boolean),
    amenity: null,
    cuisines: [],
    priceMin: range ? range[0] : null,
    priceMax: range ? range[1] : null,
    priceLabel: s.budget?.average || s.budget?.name || '',
    priceEstimated: false,
    capacity: Math.max(Number(s.party_capacity) || 0, Number(s.capacity) || 0) || null,
    features,
    catchText: [s.genre?.catch, s.catch].filter(Boolean).join(' / '),
    access: s.mobile_access || s.access || '',
    open: s.open || '',
    url: s.urls?.pc || '',
    photo: s.photo?.mobile?.l || s.photo?.pc?.l || '',
  };
}

async function fetchOverpass({ lat, lng, radius }) {
  const query = `
    [out:json][timeout:25];
    nwr["amenity"~"^(restaurant|cafe|fast_food|bar|pub|izakaya|food_court)$"]["name"](around:${radius},${lat},${lng});
    out center tags 400;`;

  let lastError;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.elements.map(normalizeOsmElement).filter((s) => s.lat && s.lng);
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`OpenStreetMap の取得に失敗しました (${lastError?.message})`);
}

function normalizeOsmElement(el) {
  const t = el.tags || {};
  const cuisines = (t.cuisine || '').split(/[;,]/).map((c) => c.trim().toLowerCase()).filter(Boolean);
  const price = estimateOsmPrice(t.amenity, cuisines);
  const name = t['name:ja'] || t.name;
  return {
    id: `osm-${el.type}-${el.id}`,
    source: 'osm',
    name,
    lat: el.lat ?? el.center?.lat,
    lng: el.lon ?? el.center?.lon,
    genreName: describeOsmGenre(t.amenity, cuisines),
    genreCodes: [],
    amenity: t.amenity,
    cuisines,
    priceMin: Math.round(price * 0.6),
    priceMax: Math.round(price * 1.4),
    priceLabel: `目安 ${price.toLocaleString()}円前後`,
    priceEstimated: true,
    capacity: Number(t.capacity) || null,
    features: {
      non_smoking: t.smoking === 'no',
      card: /yes/.test(t['payment:credit_cards'] || ''),
      wifi: t.internet_access === 'wlan' || t.internet_access === 'yes',
      child: t.kids_area === 'yes' || t.highchair === 'yes',
    },
    catchText: '',
    access: [t['addr:city'], t['addr:quarter'], t['addr:neighbourhood'], t['addr:block_number'] || t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '),
    open: t.opening_hours || '',
    url: t.website || t['contact:website'] || '',
    photo: '',
  };
}

function estimateOsmPrice(amenity, cuisines) {
  for (const c of cuisines) {
    if (OSM_PRICE_ESTIMATE.cuisine[c]) return OSM_PRICE_ESTIMATE.cuisine[c];
  }
  return OSM_PRICE_ESTIMATE.amenity[amenity] || 2500;
}

const OSM_LABELS = {
  restaurant: 'レストラン', cafe: 'カフェ', fast_food: 'ファストフード', bar: 'バー',
  pub: '居酒屋・パブ', izakaya: '居酒屋', food_court: 'フードコート',
  japanese: '和食', sushi: '寿司', ramen: 'ラーメン', noodle: '麺類', udon: 'うどん', soba: 'そば',
  yakiniku: '焼肉', korean: '韓国料理', chinese: '中華', italian: 'イタリアン', french: 'フレンチ',
  pizza: 'ピザ', curry: 'カレー', indian: 'インド料理', thai: 'タイ料理', vietnamese: 'ベトナム料理',
  burger: 'ハンバーガー', coffee_shop: 'コーヒー', tempura: '天ぷら', tonkatsu: 'とんかつ',
  okonomiyaki: 'お好み焼き', yakitori: '焼き鳥', steak_house: 'ステーキ', western: '洋食', donburi: '丼',
};

function describeOsmGenre(amenity, cuisines) {
  const named = cuisines.map((c) => OSM_LABELS[c]).filter(Boolean);
  // 居酒屋・バーは料理より業態のほうが分かりやすい
  if (['pub', 'izakaya', 'bar'].includes(amenity)) named.unshift(OSM_LABELS[amenity]);
  return named.length ? [...new Set(named)].slice(0, 2).join('・') : (OSM_LABELS[amenity] || '飲食店');
}
