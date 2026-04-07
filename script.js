// --- script.js 전체 교체 권장 ---

const firebaseConfig = {
    apiKey: "AIzaSyCaZuvX6w6mNTllo8V9RZobN7yJkfWOvUE",
    authDomain: "my-life-rpg-35d7a.firebaseapp.com",
    projectId: "my-life-rpg-35d7a",
    storageBucket: "my-life-rpg-35d7a.firebasestorage.app",
    messagingSenderId: "394166677930",
    appId: "1:394166677930:web:6e74c380b63659e3947bd3"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let state = { name: "플레이어", bio: "인생 RPG 시작!", lv: 1, exp: 0, gold: 0, quests: [], shopItems: [], currentTab: '일간' };
let currentUser = null;

auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('main-game').style.display = 'block';
        loadData();
    } else {
        document.getElementById('auth-section').style.display = 'flex';
        document.getElementById('main-game').style.display = 'none';
    }
});

async function handleAuth(type) {
    const email = document.getElementById('auth-email').value;
    const pw = document.getElementById('auth-pw').value;
    const msg = document.getElementById('auth-msg');
    try {
        if (type === 'signup') await auth.createUserWithEmailAndPassword(email, pw);
        else await auth.signInWithEmailAndPassword(email, pw);
    } catch (err) { msg.innerText = err.message; }
}

function logout() { auth.signOut(); }

async function saveData() {
    if (!currentUser) return;
    await db.collection("users").doc(currentUser.uid).set(state);
}

async function loadData() {
    const doc = await db.collection("users").doc(currentUser.uid).get();
    if (doc.exists) state = doc.data();
    updateUI();
}

function updateUI() {
    document.getElementById('p-name').innerText = "👤 " + state.name;
    document.getElementById('p-bio').innerText = state.bio;
    document.getElementById('lv').innerText = state.lv;
    document.getElementById('gold').innerText = state.gold;
    document.getElementById('exp-bar').style.width = state.exp + '%';

    // [v0.9.1] 탭에 따른 난이도 선택창 자동 변경 및 화살표 제거용 클래스
    const diffSelect = document.getElementById('q-diff');
    if (state.currentTab === '일간') diffSelect.value = '쉬움';
    else if (state.currentTab === '주간') diffSelect.value = '보통';
    else if (state.currentTab === '연간') diffSelect.value = '어려움';

    renderQuests();
    renderShop();
    updateRankDisplay();
    checkIfRanker();
}

async function checkIfRanker() {
    const container = document.getElementById('container');
    try {
        const topOne = await db.collection("users").orderBy("lv", "desc").limit(1).get();
        if (!topOne.empty && currentUser && topOne.docs[0].id === currentUser.uid) {
            container.classList.add('ranker-aura');
            document.getElementById('p-rank').innerText = "🏆 전 서버 1위: 절대자";
        } else {
            container.classList.remove('ranker-aura');
        }
    } catch (e) {}
}

function addQuest() {
    const input = document.getElementById('q-input');
    if (!input.value.trim()) return;

    // [v0.9.1] 탭에 따른 보상 및 난이도 고정 분배
    let diff = '쉬움';
    let r = { exp: 10, gold: 50 };

    if (state.currentTab === '주간') {
        diff = '보통';
        r = { exp: 50, gold: 350 };
    } else if (state.currentTab === '연간') {
        diff = '어려움';
        r = { exp: 200, gold: 2000 };
    }

    state.quests.push({ id: Date.now(), text: input.value, diff, tab: state.currentTab, ...r });
    input.value = ""; saveData(); updateUI();
}

function completeQuest(id, exp, gold) {
    state.quests = state.quests.filter(q => q.id !== id);
    state.exp += exp; state.gold += gold;
    while (state.exp >= 100) { state.lv++; state.exp -= 100; alert("LEVEL UP! 🎉"); }
    saveData(); updateUI();
}

function deleteQuest(id) { if(confirm("삭제할까요?")) { state.quests = state.quests.filter(q => q.id !== id); saveData(); updateUI(); } }

function addShopItem() {
    const n = document.getElementById('s-input'), p = document.getElementById('s-price');
    if (!n.value || !p.value) return;
    state.shopItems.push({ id: Date.now(), name: n.value, price: parseInt(p.value) });
    n.value = ""; p.value = ""; saveData(); updateUI();
}

function buyItem(id, price) {
    if (state.gold < price) return;
    state.gold -= price; alert("보상 획득!"); saveData(); updateUI();
}

function deleteShopItem(id) {
    if(confirm("이 보상을 삭제할까요?")) {
        state.shopItems = state.shopItems.filter(i => i.id !== id);
        saveData(); updateUI();
    }
}

// [v0.9.1] 추천 보상 버그 수정 및 적정 골드 분배
function suggestReward() {
    const rewardSuggestions = [
        { name: "📱 쇼츠/릴스 30분 시청", price: 100 },
        { name: "🎮 게임 2판 (빡겜 가능)", price: 300 },
        { name: "💤 마법의 낮잠 1시간", price: 400 },
        { name: "📺 넷플릭스 영화 1편", price: 500 },
        { name: "🛌 아무것도 안 하기 (멍때리기 30분)", price: 60 },
        { name: "🍗 오늘 저녁은 배달 음식!", price: 2000 },
        { name: "☕ 시원한 아메리카노", price: 70 },
        { name: "🍦 시원한 아이스크림", price: 100 },
        { name: "🎁 장바구니 물건 결제", price: 5000 },
        { name: "👕 새 옷 한 벌 사기", price: 3000 },
        { name: "👟 운동화/패션 아이템 쇼핑", price: 6000 },
        { name: "🖱️ 게이밍 기어/IT 기기 구매", price: 7000 },
        { name: "🎞️ 영화관에서 영화 관람", price: 1000 },
        { name: "🛀 입욕제 반신욕 힐링", price: 500 },
        { name: "🎤 코인 노래방 1시간 열창", price: 400 },
        { name: "💆‍♂️ 나를 위한 전신 마사지", price: 4000 }

    ];

    
    const random = rewardSuggestions[Math.floor(Math.random() * rewardSuggestions.length)];
    document.getElementById('s-input').value = random.name;
    document.getElementById('s-price').value = random.price;
}

async function showRanking() {
    const modal = document.getElementById('ranking-modal'), list = document.getElementById('ranking-list');
    modal.style.display = 'flex';
    list.innerHTML = "집계 중...";
    try {
        const snap = await db.collection("users").orderBy("lv", "desc").limit(10).get();
        let html = ""; let rank = 1;
        snap.forEach(doc => {
            const d = doc.data(), isMe = currentUser && doc.id === currentUser.uid;
            html += `<div class="item-row" style="${isMe?'border-color:var(--accent);':''}">
                <span>${rank}. ${d.name || '무명'} (Lv.${d.lv})</span>
            </div>`;
            rank++;
        });
        list.innerHTML = html;
    } catch (e) { list.innerHTML = "에러 발생"; }
}

function closeRanking() { document.getElementById('ranking-modal').style.display = 'none'; }

async function deleteAccount() {
    if (!currentUser || !confirm("영구 삭제하시겠습니까?") || prompt("'삭제'를 입력하세요") !== "삭제") return;
    try {
        await db.collection("users").doc(currentUser.uid).delete();
        await currentUser.delete();
        location.reload();
    } catch (e) { alert("다시 로그인 후 시도해주세요."); auth.signOut(); }
}

function renderQuests() {
    const list = document.getElementById('q-list');
    const filtered = state.quests.filter(q => q.tab === state.currentTab);
    list.innerHTML = filtered.map(q => `
        <div class="item-row">
            <div onclick="completeQuest(${q.id}, ${q.exp}, ${q.gold})" style="cursor:pointer;">
                [${q.diff}] ${q.text} <span style="color:var(--gold); font-size:11px;">+${q.gold}G</span>
            </div>
            <button onclick="deleteQuest(${q.id})" style="background:none; border:none; color:#555; cursor:pointer;">×</button>
        </div>`).join('') || `<p style="text-align:center; font-size:12px; color:#555;">${state.currentTab} 목표가 없습니다.</p>`;
}

function renderShop() {
    const list = document.getElementById('s-list');
    list.innerHTML = state.shopItems.map(i => `
        <div class="item-row">
            <span>${i.name} (${i.price}G)</span>
            <div>
                <button onclick="buyItem(${i.id}, ${i.price})" style="background:var(--gold); border:none; border-radius:4px; padding:3px 8px; cursor:pointer;" ${state.gold < i.price ? 'disabled' : ''}>구매</button>
                <button onclick="deleteShopItem(${i.id})" style="background:none; border:none; color:#555; cursor:pointer; margin-left:5px;">×</button>
            </div>
        </div>`).join('');
}

function updateRankDisplay() {
    const r = document.getElementById('p-rank');
    r.innerText = state.lv < 10 ? "RANK: F" : state.lv < 30 ? "RANK: D" : state.lv < 60 ? "RANK: B" : "RANK: S";
}

function setTab(tab, e) {
    state.currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    updateUI();
}

function toggleProfileEdit() {
    const v = document.getElementById('profile-view'), e = document.getElementById('profile-edit');
    v.style.display = v.style.display==='none'?'block':'none';
    e.style.display = e.style.display==='none'?'block':'none';
}

function saveProfile() {
    state.name = document.getElementById('edit-name').value || state.name;
    state.bio = document.getElementById('edit-bio').value || state.bio;
    saveData(); updateUI(); toggleProfileEdit();
}

function resetGame() { if(confirm("데이터 초기화?")) { state={...state, lv:1, exp:0, gold:0, quests:[], shopItems:[]}; saveData(); updateUI(); } }
