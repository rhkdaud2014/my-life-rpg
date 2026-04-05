// 1. Firebase 설정 (본인의 값으로 교체 필수!)
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

// 2. 로그인 감시 및 데이터 로드
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

// 3. 서버 저장 및 불러오기
async function saveData() {
    if (!currentUser) return;
    await db.collection("users").doc(currentUser.uid).set(state);
}

async function loadData() {
    const doc = await db.collection("users").doc(currentUser.uid).get();
    if (doc.exists) state = doc.data();
    updateUI();
}

// 4. 게임 핵심 로직
function updateUI() {
    document.getElementById('p-name').innerText = "👤 " + state.name;
    document.getElementById('p-bio').innerText = state.bio;
    document.getElementById('lv').innerText = state.lv;
    document.getElementById('gold').innerText = state.gold;
    document.getElementById('exp-bar').style.width = state.exp + '%';
    renderQuests();
    renderShop();
    updateRankDisplay();
    checkIfRanker(); // 1위 체크
}

// 실시간 1위 체크 (황금 아우라)
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
    } catch (e) { console.log("순위 확인 중..."); }
}

function addQuest() {
    const input = document.getElementById('q-input');
    if (!input.value.trim()) return;
    const diff = document.getElementById('q-diff').value;
    let r = { exp: diff==='어려움'?100:diff==='보통'?30:10, gold: diff==='어려움'?200:diff==='보통'?60:20 };
    state.quests.push({ id: Date.now(), text: input.value, diff, tab: state.currentTab, ...r });
    input.value = ""; saveData(); updateUI();
}

function completeQuest(id, exp, gold) {
    state.quests = state.quests.filter(q => q.id !== id);
    state.exp += exp; state.gold += gold;
    while (state.exp >= 100) { state.lv++; state.exp -= 100; alert("LEVEL UP! 🎉"); }
    saveData(); updateUI();
}

// 5. 🏆 랭킹 시스템
async function showRanking() {
    const modal = document.getElementById('ranking-modal');
    const list = document.getElementById('ranking-list');
    modal.style.display = 'flex';
    list.innerHTML = "<p style='text-align:center;'>순위 집계 중...</p>";

    try {
        const snapshot = await db.collection("users").orderBy("lv", "desc").limit(10).get();
        let html = "";
        let rank = 1;

        snapshot.forEach(doc => {
            const data = doc.data();
            const isMe = currentUser && doc.id === currentUser.uid;
            const medal = rank === 1 ? `<span class="rank-badge badge-1">TOP 1</span>` : 
                          rank === 2 ? `<span class="rank-badge badge-2">TOP 2</span>` : 
                          rank === 3 ? `<span class="rank-badge badge-3">TOP 3</span>` : 
                          `<span style="margin-right:12px; font-size:11px; color:#8b949e;">${rank}위</span>`;
            
            html += `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #30363d; ${isMe ? 'background:rgba(88,166,255,0.1); border-radius:8px;' : ''}">
                    <div style="display:flex; align-items:center;">
                        ${medal}
                        <span style="font-size:14px; ${isMe ? 'color:var(--accent); font-weight:bold;' : ''}">${data.name || '무명 용사'}</span>
                    </div>
                    <div style="text-align:right;">
                        <div style="color:var(--gold); font-size:13px; font-weight:bold;">Lv.${data.lv}</div>
                        <div style="color:#555; font-size:9px;">${rank === 1 ? '전설의 시작' : rank <= 3 ? '고급 모험가' : '평범한 시민'}</div>
                    </div>
                </div>`;
            rank++;
        });
        list.innerHTML = html || "<p>랭커가 없습니다.</p>";
    } catch (err) { list.innerHTML = "<p>에러 발생!</p>"; }
}

function closeRanking() { document.getElementById('ranking-modal').style.display = 'none'; }

// 6. 🎲 랜덤 보상 추천 (다양한 품목 버전)
function suggestReward() {
    const rewardSuggestions = [
        // --- 📱 디지털 & 휴식 ---
        { name: "📱 쇼츠/릴스/틱톡 30분 시청", price: 200 },
        { name: "🎮 빡겜 모드 (롤/발로란트 2판)", price: 400 },
        { name: "💤 마법의 낮잠 1시간 (알람 끄기)", price: 500 },
        { name: "📺 넷플릭스/유튜브 영상 1편 시청", price: 300 },
        { name: "🛌 아무것도 안 하기 (멍때리기 30분)", price: 100 },
        { name: "📖 웹툰 유료분 5화 소장", price: 400 },

        // --- 🍔 먹거리 & 간식 ---
        { name: "🍕 [치팅데이] 오늘 저녁 배달 음식!", price: 1500 },
        { name: "🍗 고생한 나에게 주는 치킨 선물", price: 2000 },
        { name: "☕ 시원한 아이스 아메리카노 한 잔", price: 150 },
        { name: "🍦 베스킨라빈스 파인트 컵", price: 800 },
        { name: "🍫 편의점 최애 과자 쇼핑", price: 250 },
        { name: "🧋 타피오카 추가한 버블티", price: 450 },

        // --- 🛍️ 쇼핑 & 나를 위한 선물 ---
        { name: "🎁 장바구니에 담아둔 물건 결제", price: 5000 },
        { name: "👕 갖고 싶던 새 옷 한 벌 사기", price: 3500 },
        { name: "👟 운동화/패션 아이템 쇼핑", price: 7000 },
        { name: "🖱️ 게이밍 기어/IT 기기 구매", price: 8000 },

        // --- ✨ 특별한 보상 ---
        { name: "🎞️ 영화관에서 최신 영화 관람", price: 1800 },
        { name: "🎤 코인 노래방 1시간 열창", price: 400 },
        { name: "🛀 뜨끈한 입욕제 반신욕", price: 600 },
        { name: "💆‍♂️ 나를 위한 전신 마사지", price: 4500 }
    ];
    const r = rewardSuggestions[Math.floor(Math.random() * rewardSuggestions.length)];
    document.getElementById('s-input').value = r.name;
    document.getElementById('s-price').value = r.price;
}

// 렌더링 함수들
function renderQuests() {
    const list = document.getElementById('q-list');
    const filtered = state.quests.filter(q => q.tab === state.currentTab);
    list.innerHTML = filtered.map(q => `
        <div class="item-row">
            <div onclick="completeQuest(${q.id}, ${q.exp}, ${q.gold})">
                [${q.diff}] ${q.text} <span style="color:var(--gold); font-size:11px;">+${q.gold}G</span>
            </div>
            <button onclick="deleteQuest(${q.id})" style="background:none; border:none; color:#555; cursor:pointer;">×</button>
        </div>`).join('') || `<p style="text-align:center; font-size:12px; color:#555;">퀘스트가 없습니다.</p>`;
}

function renderShop() {
    const list = document.getElementById('s-list');
    list.innerHTML = state.shopItems.map(item => `
        <div class="item-row">
            <span>${item.name} (${item.price}G)</span>
            <button onclick="buyItem(${item.id}, ${item.price})" class="buy-btn" ${state.gold < item.price ? 'disabled' : ''} style="background:var(--gold); border:none; border-radius:4px; padding:3px 8px; cursor:pointer;">구매</button>
        </div>`).join('');
}

function updateRankDisplay() {
    const r = document.getElementById('p-rank');
    if (state.lv < 10) r.innerText = "RANK: F";
    else if (state.lv < 30) r.innerText = "RANK: D";
    else if (state.lv < 60) r.innerText = "RANK: B";
    else r.innerText = "RANK: S";
}

function setTab(tab, e) {
    state.currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    renderQuests();
}

function toggleProfileEdit() {
    const v = document.getElementById('profile-view'), e = document.getElementById('profile-edit');
    v.style.display = v.style.display==='none'?'block':'none';
    e.style.display = e.style.display==='none'?'block':'none';
}

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

function deleteQuest(id) { if(confirm("삭제?")) { state.quests=state.quests.filter(q=>q.id!==id); saveData(); updateUI(); } }
function resetGame() { if(confirm("초기화?")) { state={...state, lv:1, exp:0, gold:0, quests:[], shopItems:[]}; saveData(); updateUI(); } }
