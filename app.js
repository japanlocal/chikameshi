// 画面の制御と、おすすめ度のスコアリング

const API_KEY_STORAGE = 'chikameshi.hotpepperApiKey';
const DEFAULT_CENTER = [35.681236, 139.767125]; // 東京駅 (GPS取得前の表示用)
const MAX_RESULTS = 30;

const state = {
  position: null, // { lat, lng, manual }
  vibe: VIBES[0].id,
  foods: new Set(),
};

const $ = (sel) => document.querySelector(sel);

// ---------- 設定 (APIキー) ----------

function getApiKey() {
  try { return localStorage.getItem(API_KEY_STORAGE) || ''; } catch { return ''; }
}

function setApiKey(key) {
  try { localStorage.setItem(API_KEY_STORAGE, key); } catch { /* プライベートモード等 */ }
}

// ---------- 地図 ----------

const map = L.map('map', { zoomControl: false }).setView(DEFAULT_CENTER, 15);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const hereIcon = L.divIcon({ className: 'here-marker', iconSize: [18, 18] });
let hereMarker = null;
let radiusCircle = null;
const shopLayer = L.layerGroup().addTo(map);
const shopMarkers = new Map();

function setPosition(lat, lng, manual) {
  state.position = { lat, lng, manual };
  if (!hereMarker) hereMarker = L.marker([lat, lng], { icon: hereIcon, zIndexOffset: 1000 }).addTo(map);
  hereMarker.setLatLng([lat, lng]);
  drawRadius();
  $('#location-status').textContent = manual ? '📍 地図で指定した地点' : '📍 現在地を取得しました';
}

function drawRadius() {
  if (!state.position) return;
  const radius = Number($('#radius').value);
  const center = [state.position.lat, state.position.lng];
  if (!radiusCircle) {
    radiusCircle = L.circle(center, { radius, color: '#e8590c', weight: 1, fillOpacity: 0.06 }).addTo(map);
  } else {
    radiusCircle.setLatLng(center).setRadius(radius);
  }
}

function locate() {
  if (!navigator.geolocation) {
    $('#location-status').textContent = '⚠️ この端末では位置情報が使えません。地図をタップして指定してください';
    return Promise.resolve(false);
  }
  $('#location-status').textContent = '📡 現在地を取得中…';
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition(pos.coords.latitude, pos.coords.longitude, false);
        map.setView([pos.coords.latitude, pos.coords.longitude], 15);
        resolve(true);
      },
      (err) => {
        const reason = err.code === err.PERMISSION_DENIED ? '位置情報の利用が許可されていません' : '現在地を取得できませんでした';
        $('#location-status').textContent = `⚠️ ${reason}。地図をタップして指定してください`;
        resolve(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

map.on('click', (e) => setPosition(e.latlng.lat, e.latlng.lng, true));

// ---------- 入力フォーム ----------

function renderChips() {
  $('#vibe-chips').innerHTML = VIBES.map((v) => `
    <button type="button" class="chip" role="radio" data-vibe="${v.id}" aria-checked="${v.id === state.vibe}">
      ${v.emoji} ${v.label}
    </button>`).join('');

  $('#food-chips').innerHTML = FOODS.map((f) => `
    <button type="button" class="chip" data-food="${f.id}" aria-pressed="${state.foods.has(f.id)}">
      ${f.emoji} ${f.label}
    </button>`).join('');

  $('#budget').innerHTML = BUDGETS.map((b) => `<option value="${b.value}">${b.label}</option>`).join('');
  $('#budget').value = '4000';
}

$('#vibe-chips').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-vibe]');
  if (!chip) return;
  state.vibe = chip.dataset.vibe;
  document.querySelectorAll('[data-vibe]').forEach((c) => c.setAttribute('aria-checked', c === chip));
});

$('#food-chips').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-food]');
  if (!chip) return;
  const id = chip.dataset.food;
  if (state.foods.has(id)) state.foods.delete(id); else state.foods.add(id);
  chip.setAttribute('aria-pressed', state.foods.has(id));
});

document.querySelectorAll('.stepper [data-step]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = $('#people');
    const next = Math.min(50, Math.max(1, (Number(input.value) || 1) + Number(btn.dataset.step)));
    input.value = next;
  });
});

$('#radius').addEventListener('change', drawRadius);
$('#locate-btn').addEventListener('click', locate);

$('#settings-btn').addEventListener('click', () => {
  $('#api-key').value = getApiKey();
  $('#settings-dialog').showModal();
});

$('#settings-dialog').addEventListener('close', () => {
  if ($('#settings-dialog').returnValue === 'save') {
    setApiKey($('#api-key').value.trim());
    updateCredit();
  }
});

function updateCredit(usedHotPepper = Boolean(getApiKey())) {
  $('#credit').innerHTML = usedHotPepper
    ? '<a href="http://webservice.recruit.co.jp/" target="_blank" rel="noopener">Powered by ホットペッパーグルメ Webサービス</a>'
    : '店舗データ: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>';
}

// ---------- スコアリング ----------

function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function matchesFood(shop, food) {
  if (shop.source === 'hotpepper') {
    return food.hp.some((g) => shop.genreCodes.includes(g));
  }
  return (food.osmAmenities || []).includes(shop.amenity)
    || (food.osmCuisines || []).some((c) => shop.cuisines.includes(c));
}

const FEATURE_LABELS = {
  private_room: '個室あり', free_drink: '飲み放題あり', free_food: '食べ放題あり', course: 'コースあり',
  card: 'カード可', non_smoking: '禁煙', charter: '貸切可', horigotatsu: '掘りごたつ', tatami: '座敷あり',
  child: '子連れOK', parking: '駐車場あり', karaoke: 'カラオケ', sommelier: 'ソムリエ在籍',
  lunch: 'ランチあり', midnight: '深夜営業', wifi: 'Wi-Fi',
};

// 条件に合わない店は null を返して除外する
function scoreShop(shop, criteria) {
  const { origin, people, vibe, foods, keyword, budget, radius } = criteria;
  const distance = distanceMeters(origin, shop);
  if (distance > radius * 1.1) return null;

  let score = 0;
  const reasons = [];

  // 近さ (最大20点)
  score += Math.max(0, 1 - distance / radius) * 20;

  // 食べたいもの
  if (foods.length > 0) {
    const matched = foods.find((f) => matchesFood(shop, f));
    if (!matched) return null;
    score += 30;
    reasons.push(`${matched.emoji} ${matched.label}`);
  }
  if (keyword) {
    const text = `${shop.name} ${shop.genreName} ${shop.catchText}`.toLowerCase();
    const hit = keyword.toLowerCase().split(/\s+/).some((w) => w && text.includes(w));
    if (hit) { score += 20; reasons.push(`「${keyword}」に一致`); }
    else if (shop.source === 'osm') score -= 5; // OSM はキーワード検索できないので軽く減点のみ
  }

  // 人数
  if (shop.capacity && shop.capacity < people) return null;
  if (shop.capacity && shop.capacity >= people) {
    score += 5;
    if (people >= 6) reasons.push(`${shop.capacity}席まで対応`);
  }
  if (people >= 6) {
    if (shop.features.private_room) score += 6;
    if (shop.features.charter && people >= 15) { score += 8; reasons.push('貸切可'); }
    if (['fast_food', 'cafe'].includes(shop.amenity)) score -= 12;
  }

  // 予算
  if (budget > 0 && shop.priceMin != null) {
    if (shop.priceMin > budget) {
      if (!shop.priceEstimated) return null;
      score -= 15; // 推定値なので除外はしない
    } else {
      score += 10;
      if (vibe.preferHighBudget) score += (shop.priceMax / budget) * 8; // 予算いっぱい使える店を優先
      if (vibe.preferLowBudget) score += (1 - shop.priceMin / budget) * 8;
    }
  }

  // 空気感
  if (shop.source === 'hotpepper') {
    if (vibe.hpGenres.some((g) => shop.genreCodes.includes(g))) score += 15;
    for (const [key, weight] of Object.entries(vibe.hpFeatures)) {
      if (shop.features[key]) {
        score += weight * 4;
        if (weight >= 2 && FEATURE_LABELS[key]) reasons.push(FEATURE_LABELS[key]);
      }
    }
  } else {
    if (vibe.osmAmenities.includes(shop.amenity)) score += 10;
    if (vibe.osmCuisines.some((c) => shop.cuisines.includes(c))) score += 12;
    if (shop.cuisines.length === 0) score -= 4; // 情報が少ない店は控えめに
  }
  if (vibe.largeGroupBonus && shop.capacity >= Math.max(people, 20)) score += 5;

  return { shop, score, distance, reasons: [...new Set(reasons)] };
}

// ---------- 検索と結果表示 ----------

$('#search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.position) {
    const ok = await locate();
    if (!ok) return;
  }
  await search();
});

async function search() {
  const btn = $('#search-btn');
  btn.disabled = true;
  btn.textContent = '探しています…';

  const criteria = {
    origin: state.position,
    people: Math.max(1, Number($('#people').value) || 1),
    vibe: VIBES.find((v) => v.id === state.vibe),
    foods: FOODS.filter((f) => state.foods.has(f.id)),
    keyword: $('#keyword').value.trim(),
    budget: Number($('#budget').value),
    radius: Number($('#radius').value),
  };

  const apiKey = getApiKey();
  try {
    const shops = apiKey
      ? await fetchHotPepper({ apiKey, lat: criteria.origin.lat, lng: criteria.origin.lng, ...criteria })
      : await fetchOverpass({ lat: criteria.origin.lat, lng: criteria.origin.lng, radius: criteria.radius });

    const ranked = shops
      .map((s) => scoreShop(s, criteria))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.distance - b.distance)
      .slice(0, MAX_RESULTS);

    renderResults(ranked, criteria, apiKey ? 'hotpepper' : 'osm');
  } catch (err) {
    renderError(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'おすすめを探す';
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDistance(m) {
  const walk = Math.max(1, Math.round(m / 80));
  return `${m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`}・徒歩${walk}分`;
}

function renderResults(ranked, criteria, source) {
  const section = $('#results-section');
  section.hidden = false;
  updateCredit(source === 'hotpepper');

  $('#source-badge').textContent = source === 'hotpepper' ? 'ホットペッパー' : 'OpenStreetMap';
  $('#results-title').textContent = `${criteria.vibe.emoji} ${criteria.people}人で${criteria.vibe.label}`;
  $('#results-note').textContent = source === 'osm'
    ? '※ APIキー未設定のため OpenStreetMap のデータで検索しています。予算は業態からの推定です（⚙️ から設定できます）'
    : '';

  shopLayer.clearLayers();
  shopMarkers.clear();

  const list = $('#results');
  if (ranked.length === 0) {
    list.innerHTML = '<li class="empty">条件に合うお店が見つかりませんでした。範囲を広げるか条件をゆるめてみてください。</li>';
    section.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  list.innerHTML = ranked.map(({ shop, distance, reasons }, i) => {
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${shop.name} ${shop.lat},${shop.lng}`)}`;
    return `
      <li class="result" data-id="${escapeHtml(shop.id)}">
        <span class="rank">${i + 1}</span>
        ${shop.photo ? `<img class="photo" src="${escapeHtml(shop.photo)}" alt="" loading="lazy">` : ''}
        <div class="body">
          <h3>${escapeHtml(shop.name)}</h3>
          <p class="meta">${escapeHtml(shop.genreName)}｜${formatDistance(distance)}</p>
          ${shop.priceLabel ? `<p class="meta">💴 ${escapeHtml(shop.priceLabel)}</p>` : ''}
          ${reasons.length ? `<p class="tags">${reasons.map((r) => `<span>${escapeHtml(r)}</span>`).join('')}</p>` : ''}
          ${shop.catchText ? `<p class="catch">${escapeHtml(shop.catchText)}</p>` : ''}
          ${shop.open ? `<details><summary>営業時間</summary>${escapeHtml(shop.open)}</details>` : ''}
          <div class="actions">
            <a href="${mapsUrl}" target="_blank" rel="noopener">🗺️ 道順</a>
            ${shop.url ? `<a href="${escapeHtml(shop.url)}" target="_blank" rel="noopener">詳細・予約</a>` : ''}
          </div>
        </div>
      </li>`;
  }).join('');

  const bounds = L.latLngBounds([[criteria.origin.lat, criteria.origin.lng]]);
  ranked.forEach(({ shop }, i) => {
    const icon = L.divIcon({ className: 'shop-marker', html: `<span>${i + 1}</span>`, iconSize: [26, 26] });
    const marker = L.marker([shop.lat, shop.lng], { icon })
      .bindPopup(`<b>${i + 1}. ${escapeHtml(shop.name)}</b><br>${escapeHtml(shop.genreName)}`)
      .on('click', () => highlight(shop.id))
      .addTo(shopLayer);
    shopMarkers.set(shop.id, marker);
    bounds.extend([shop.lat, shop.lng]);
  });
  map.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 });
  section.scrollIntoView({ behavior: 'smooth' });
}

function highlight(id) {
  document.querySelectorAll('.result').forEach((el) => el.classList.toggle('active', el.dataset.id === id));
  document.querySelector(`.result[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('#results').addEventListener('click', (e) => {
  if (e.target.closest('a, details')) return;
  const item = e.target.closest('.result');
  const marker = item && shopMarkers.get(item.dataset.id);
  if (!marker) return;
  highlight(item.dataset.id);
  map.setView(marker.getLatLng(), 17);
  marker.openPopup();
  $('#location-card').scrollIntoView({ behavior: 'smooth' });
});

function renderError(err) {
  const message = navigator.onLine ? err.message : 'オフラインのため検索できません';
  $('#results-section').hidden = false;
  $('#source-badge').textContent = '';
  $('#results-title').textContent = 'エラー';
  $('#results-note').textContent = '';
  $('#results').innerHTML = `<li class="empty">⚠️ ${escapeHtml(message)}<br>電波の良い場所で再度お試しください。</li>`;
}

// ---------- PWA (ホーム画面に追加) ----------

const IOS_HINT_STORAGE = 'chikameshi.iosHintDismissed';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function setupPwa() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service Worker の登録に失敗:', e));
  }
  if (isStandalone()) return;

  // Android / PC の Chrome・Edge: インストールボタンを出す
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $('#install-btn').hidden = false;
  });
  $('#install-btn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $('#install-btn').hidden = true;
  });
  window.addEventListener('appinstalled', () => { $('#install-btn').hidden = true; });

  // iPhone / iPad の Safari: インストールAPIが無いので手順を案内する
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let dismissed = false;
  try { dismissed = localStorage.getItem(IOS_HINT_STORAGE) === '1'; } catch { /* noop */ }
  if (isIos && !dismissed) $('#ios-install-hint').hidden = false;
  $('#ios-install-close').addEventListener('click', () => {
    $('#ios-install-hint').hidden = true;
    try { localStorage.setItem(IOS_HINT_STORAGE, '1'); } catch { /* noop */ }
  });
}

// ---------- 初期化 ----------

renderChips();
updateCredit();
setupPwa();
locate();
