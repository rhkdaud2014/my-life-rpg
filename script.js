let state = {
    name: "플레이어", bio: "인생 RPG 시작!",
    lv: 1, exp: 0, gold: 0,
    quests: [], shopItems: [], currentTab: '일간'
};

// 랜덤 보상 추천 데이터
const rewardSuggestions = [
    { name: "📱 쇼츠/릴스 30분 시청", price: 200 },
    { name: "☕ 식후 아이스 아메리카노", price: 150 },
    { name: "🍫 편의점 최애 초콜릿", price: 100 },
    { name: "🎮 게임 집중 모드 (3판)", price: 400 },
    { name: "💤 꿀맛 같은 낮잠 1시간", price: 500 },
    { name: "🍗 고생했어! 치킨 파티", price: 2000 },
    { name: "🍕 오늘 저녁은 배달 음식", price: 1200 },
    { name: "🎞️ 보고 싶던 영화 관람", price: 1000 },
    { name: "🎁 장바구니 위시리스트 결제", price: 5000 },
    { name: "🍦 시원한 베라 싱글컵", price: 350 },
    { name: "🛌 하루 종일 뒹굴거리기", price: 3000 },
    { name: "📖 웹툰 유료분 소장 (3화)", price: 250 }
];

window.onload = () => {
    // 데이터를 불러오는 로직 (이전 버전 데이터까지 싹다 뒤져서 가져옵니다)
window.onload = () => {
    // 1. 순서대로 예전 저장소 이름들을 확인합니다.
    const v5 = localStorage.getItem('lifeRPG_v5'); // 최신 앱 버전
    const v3 = localStorage.getItem('lifeRPG_v3'); // 0.3~0.4 버전
    const old = localStorage.getItem('lifeRPG_data'); // 초기 버전

    // 2. 데이터가 있다면 가장 최신 것을 먼저, 없으면 예전 것을 가져옵니다.
    const savedData = v5 || v3 || old;

    if (savedData) {
        state = JSON.parse(savedData);
        console.log("데이터 복구 완료!");
    }
    
    updateUI(); // 화면 갱신
};

// 데이터를 저장할 때 (이제부터는 v5라는 이름으로 통일해서 저장합니다)
function save() { 
    localStorage.setItem('lifeRPG_v5', JSON.stringify(state)); 
}
};

function save() { localStorage.setItem('lifeRPG_v3', JSON.stringify(state)); }

function updateUI() {
    document.getElementById('p-name').innerText = "👤 " + state.name;
    document.getElementById('p-bio').innerText = state.bio;
    document.getElementById('lv').innerText = state.lv;
    document.getElementById('gold').innerText = state.gold;
    document.getElementById('exp-bar').style.width = state.exp + '%';
    renderQuests();
    renderShop();
    updateRankDisplay();
}

// 랜덤 추천 기능
function suggestReward() {
    const random = rewardSuggestions[Math.floor(Math.random() * rewardSuggestions.length)];
    document.getElementById('s-input').value = random.name;
    document.getElementById('s-price').value = random.price;
}

function toggleProfileEdit() {
    const v = document.getElementById('profile-view');
    const e = document.getElementById('profile-edit');
    v.style.display = (v.style.display === 'none') ? 'block' : 'none';
    e.style.display = (e.style.display === 'none') ? 'block' : 'none';
}

function saveProfile() {
    state.name = document.getElementById('edit-name').value || state.name;
    state.bio = document.getElementById('edit-bio').value || state.bio;
    save(); updateUI(); toggleProfileEdit();
}

function setTab(tab, e) {
    state.currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    renderQuests();
}

function addQuest() {
    const input = document.getElementById('q-input');
    if (!input.value.trim()) return;
    const diff = document.getElementById('q-diff').value;
    let r = { exp: 10, gold: 20 };
    if (diff === '보통') r = { exp: 30, gold: 60 };
    if (diff === '어려움') r = { exp: 100, gold: 200 };
    state.quests.push({ id: Date.now(), text: input.value, diff, tab: state.currentTab, ...r });
    input.value = ""; save(); updateUI();
}

function renderQuests() {
    const list = document.getElementById('q-list');
    const filtered = state.quests.filter(q => q.tab === state.currentTab);
    list.innerHTML = filtered.map(q => `
        <div class="item-row">
            <div class="quest-item-content">
                <div class="quest-text-group" onclick="completeQuest(${q.id}, ${q.exp}, ${q.gold})">
                    <span>[${q.diff}] ${q.text}</span>
                    <span style="color:var(--gold); font-size:11px; margin-left:8px;">+${q.gold}G</span>
                </div>
                <button class="q-del-btn" onclick="deleteQuest(${q.id})">×</button>
            </div>
        </div>
    `).join('') || `<p style="text-align:center; font-size:12px; color:#555;">퀘스트가 없습니다.</p>`;
}

function completeQuest(id, exp, gold) {
    state.quests = state.quests.filter(q => q.id !== id);
    state.exp += exp; state.gold += gold;
    while (state.exp >= 100) { state.lv++; state.exp -= 100; alert("LEVEL UP! 🎉"); }
    save(); updateUI();
}

function deleteQuest(id) {
    if (confirm("이 퀘스트를 삭제하시겠습니까?")) {
        state.quests = state.quests.filter(q => q.id !== id);
        save(); updateUI();
    }
}

function addShopItem() {
    const n = document.getElementById('s-input');
    const p = document.getElementById('s-price');
    const name = n.value.trim();
    const price = parseInt(p.value);
    if (!name || isNaN(price)) return;
    state.shopItems.push({ id: Date.now(), name, price });
    n.value = ""; p.value = ""; save(); updateUI();
}

function renderShop() {
    const list = document.getElementById('s-list');
    list.innerHTML = state.shopItems.map(item => `
        <div class="item-row" style="cursor:default;">
            <span>${item.name} (${item.price}G)</span>
            <div>
                <button class="buy-btn" onclick="buyItem(${item.id}, ${item.price})" ${state.gold < item.price ? 'disabled' : ''}>구매</button>
                <button class="q-del-btn" onclick="deleteShopItem(${item.id})">×</button>
            </div>
        </div>
    `).join('') || `<p style="text-align:center; font-size:12px; color:#555;">보상을 등록하세요.</p>`;
}

function buyItem(id, price) {
    if (state.gold < price) return;
    state.gold -= price; alert(`[${price}G] 소모! 보상을 획득했습니다. 축하합니다!`);
    save(); updateUI();
}

function deleteShopItem(id) {
    state.shopItems = state.shopItems.filter(i => i.id !== id);
    save(); updateUI();
}

function updateRankDisplay() {
    const c = document.getElementById('container');
    const r = document.getElementById('p-rank');
    c.className = "game-container";
    if (state.lv < 10) { c.classList.add('rank-f'); r.innerText = "RANK: F"; }
    else if (state.lv < 30) { c.classList.add('rank-d'); r.innerText = "RANK: D"; }
    else if (state.lv < 60) { c.classList.add('rank-b'); r.innerText = "RANK: B"; }
    else { c.classList.add('rank-s'); r.innerText = "RANK: S"; }
}

function resetGame() {
    if (confirm("데이터를 초기화하시겠습니까?")) {
        localStorage.removeItem('lifeRPG_v3'); location.reload();
    }
}
