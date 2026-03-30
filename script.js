let state = {
    name: "플레이어", bio: "인생 게임 모드 가동 중!",
    lv: 1, exp: 0, gold: 0,
    quests: [], shopItems: [], currentTab: '일간'
};

// 1. 데이터 로드
window.onload = () => {
    const saved = localStorage.getItem('lifeRPG_v3');
    if (saved) state = JSON.parse(saved);
    updateUI();
};

function save() { localStorage.setItem('lifeRPG_v3', JSON.stringify(state)); }

// 2. 화면 전체 업데이트
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

// --- 프로필 관리 ---
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

// --- 퀘스트 관리 ---
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
    
    let reward = { exp: 10, gold: 20 };
    if (diff === '보통') reward = { exp: 30, gold: 60 };
    if (diff === '어려움') reward = { exp: 100, gold: 200 };

    state.quests.push({ id: Date.now(), text: input.value, diff, tab: state.currentTab, ...reward });
    input.value = ""; save(); updateUI();
}

function renderQuests() {
    const list = document.getElementById('q-list');
    const filtered = state.quests.filter(q => q.tab === state.currentTab);
    list.innerHTML = filtered.map(q => `
        <div class="item-row" onclick="completeQuest(${q.id}, ${q.exp}, ${q.gold})">
            <span>[${q.diff}] ${q.text}</span>
            <span style="color:var(--gold)">+${q.gold}G</span>
        </div>
    `).join('') || `<p style="text-align:center; color:#555; font-size:12px;">등록된 ${state.currentTab} 퀘스트가 없습니다.</p>`;
}

function completeQuest(id, exp, gold) {
    state.quests = state.quests.filter(q => q.id !== id);
    state.exp += exp; state.gold += gold;
    while (state.exp >= 100) { state.lv++; state.exp -= 100; alert("LEVEL UP! 🎉 능력이 상승했습니다."); }
    save(); updateUI();
}

// --- 상점 관리 ---
function addShopItem() {
    const nInput = document.getElementById('s-input');
    const pInput = document.getElementById('s-price');
    const name = nInput.value.trim();
    const price = parseInt(pInput.value);

    if (!name || isNaN(price)) return;
    state.shopItems.push({ id: Date.now(), name, price });
    nInput.value = ""; pInput.value = "";
    save(); updateUI();
}

function renderShop() {
    const list = document.getElementById('s-list');
    list.innerHTML = state.shopItems.map(item => `
        <div class="item-row" style="cursor:default;">
            <span>${item.name} (${item.price}G)</span>
            <div>
                <button class="buy-btn" onclick="buyItem(${item.id}, ${item.price})" ${state.gold < item.price ? 'disabled' : ''}>구매</button>
                <button class="del-btn" onclick="deleteShopItem(${item.id})">×</button>
            </div>
        </div>
    `).join('') || `<p style="text-align:center; color:#555; font-size:12px;">나에게 줄 보상을 등록하세요.</p>`;
}

function buyItem(id, price) {
    if (state.gold < price) return;
    state.gold -= price;
    alert("보상 구매 완료! 축하합니다.");
    save(); updateUI();
}

function deleteShopItem(id) {
    state.shopItems = state.shopItems.filter(i => i.id !== id);
    save(); updateUI();
}

// --- 시각 효과 ---
function updateRankDisplay() {
    const c = document.getElementById('container');
    const r = document.getElementById('p-rank');
    c.className = "game-container";
    if (state.lv < 10) { c.classList.add('rank-f'); r.innerText = "RANK: F (입문자)"; }
    else if (state.lv < 30) { c.classList.add('rank-d'); r.innerText = "RANK: D (숙련자)"; }
    else if (state.lv < 60) { c.classList.add('rank-b'); r.innerText = "RANK: B (전문가)"; }
    else { c.classList.add('rank-s'); r.innerText = "RANK: S (마스터)"; }
}

function resetGame() {
    if (confirm("정말로 초기화하시겠습니까? 모든 기록이 삭제됩니다.")) {
        localStorage.removeItem('lifeRPG_v3');
        location.reload();
    }
}