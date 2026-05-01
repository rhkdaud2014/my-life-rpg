const firebaseConfig = {
    apiKey: "AIzaSyCaZuvX6w6mNTllo8V9RZobN7yJkfWOvUE",
    authDomain: "my-life-rpg-35d7a.firebaseapp.com",
    projectId: "my-life-rpg-35d7a",
    storageBucket: "my-life-rpg-35d7a.firebasestorage.app",
    messagingSenderId: "394166677930",
    appId: "1:394166677930:web:6e74c380b63659e3947bd3"
};

// 🌟 주/월 통합
const TABS = { daily: "일간", weekly: "주/월", yearly: "년간" };

const DIFFICULTY_BY_TAB = {
    [TABS.daily]: { label: "쉬움", exp: 10, gold: 50 },
    [TABS.weekly]: { label: "보통", exp: 50, gold: 350 },
    [TABS.yearly]: { label: "어려움", exp: 200, gold: 2000 }
};

const LEGACY_TABS = {
    "주간": TABS.weekly, "월간": TABS.weekly, "주/월": TABS.weekly,
    "daily": TABS.daily, "weekly": TABS.weekly, "yearly": TABS.yearly,
    "일간": TABS.daily, "년간": TABS.yearly
};

const DEFAULT_NAME = "플레이어";
const DEFAULT_BIO = "나의 일상을 퀘스트로!";
const AUTH_REDIRECT_PENDING_KEY = "lifeRpgAuthRedirectPending";

const $ = id => document.getElementById(id);

let auth = null;
let db = null;
let currentUser = null;
let isGuestMode = false;
let isRepeatMode = false;
let state = createDefaultState();

initFirebase();

function createDefaultState() {
    return {
        name: DEFAULT_NAME, bio: DEFAULT_BIO,
        lv: 1, exp: 0, gold: 0,
        quests: [], shopItems: [], history: [],
        currentTab: TABS.daily,
        lastLogin: new Date().toDateString()
    };
}

function initFirebase() {
    if (!window.firebase) { showAuthMessage("앱 초기화 실패"); return; }
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();

    handleRedirectResult();

    if (localStorage.getItem('lifeRpgIsGuest') === 'true') {
        startGuestMode(); return;
    }

    auth.onAuthStateChanged(user => {
        currentUser = user;
        if (user) {
            isGuestMode = false;
            $("auth-section").style.display = "none";
            $("main-game").style.display = "block";
            loadData();
        } else if (isGuestMode) {
            $("auth-section").style.display = "none";
            $("main-game").style.display = "block";
            updateUI();
        } else {
            state = createDefaultState();
            $("auth-section").style.display = "flex";
            $("main-game").style.display = "none";
        }
        updateGuestNotice();
    });
}

async function handleRedirectResult() {
    if (sessionStorage.getItem(AUTH_REDIRECT_PENDING_KEY) !== "1") return;
    try { await auth.getRedirectResult(); } catch (err) { } 
    finally { sessionStorage.removeItem(AUTH_REDIRECT_PENDING_KEY); }
}

function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        sessionStorage.setItem(AUTH_REDIRECT_PENDING_KEY, "1");
        firebase.auth().signInWithRedirect(provider);
    } else {
        firebase.auth().signInWithPopup(provider);
    }
}

function startGuestModeWithWarning() {
    if (confirm("⚠️ 게스트 모드는 앱 삭제시 데이터가 날아갑니다. 시작할까요?")) startGuestMode();
}

function startGuestMode() {
    isGuestMode = true; currentUser = null;
    localStorage.setItem('lifeRpgIsGuest', 'true');
    $("auth-section").style.display = "none";
    $("main-game").style.display = "block";
    loadData();
}

function logout() {
    isGuestMode = false; localStorage.removeItem('lifeRpgIsGuest');
    state = createDefaultState();
    if (auth && currentUser) { auth.signOut(); return; }
    $("auth-section").style.display = "flex"; $("main-game").style.display = "none";
}

async function saveData() {
    if (isGuestMode) {
        localStorage.setItem('lifeRpgGuestData', JSON.stringify({ ...state, updatedAt: new Date().toISOString() }));
        return;
    }
    if (!currentUser || !db) return;
    try { await db.collection("users").doc(currentUser.uid).set({ ...state, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); } 
    catch (err) { }
}

async function loadData() {
    if (isGuestMode) {
        try { state = normalizeState(JSON.parse(localStorage.getItem('lifeRpgGuestData'))); } 
        catch (err) { state = createDefaultState(); }
        checkAndResetQuests(); updateUI(); return;
    }
    if (!currentUser || !db) return;
    try {
        const doc = await db.collection("users").doc(currentUser.uid).get();
        state = doc.exists ? normalizeState(doc.data()) : createDefaultState();
        checkAndResetQuests(); updateUI();
        if (!doc.exists) await saveData();
    } catch (err) { updateUI(); }
}

// 🌟 주/월 통합 청소 로직
function checkAndResetQuests() {
    const today = new Date().toDateString();
    let isChanged = false;

    if (state.lastLogin !== today) {
        const currentDay = new Date().getDay(); // 0:일, 1:월
        const currentDate = new Date().getDate(); // 1~31일
        
        state.quests = state.quests.filter(q => {
            if (!q.isCompleted) return true; 

            if (q.isRepeat) {
                if (q.tab === TABS.daily) { q.isCompleted = false; isChanged = true; return true; }
                // 🌟 주/월: 월요일이거나 매월 1일일 때 초기화
                if (q.tab === TABS.weekly && (currentDay === 1 || currentDate === 1)) { q.isCompleted = false; isChanged = true; return true; }
                if (q.tab === TABS.yearly && new Date().getMonth() === 0 && currentDate === 1) { q.isCompleted = false; isChanged = true; return true; }
                return true; 
            } else {
                // 혹시 남아있는 과거의 1회성 퀘스트 찌꺼기 청소
                if (q.tab === TABS.daily) { isChanged = true; return false; } 
                if (q.tab === TABS.weekly && (currentDay === 1 || currentDate === 1)) { isChanged = true; return false; } 
                if (q.tab === TABS.yearly && new Date().getMonth() === 0 && currentDate === 1) { isChanged = true; return false; }
                return true;
            }
        });

        state.lastLogin = today;
        if (isChanged) saveData();
    }
}

function normalizeState(data) {
    const next = { ...createDefaultState(), ...(data || {}) };
    next.lv = Math.max(1, parseInt(next.lv) || 1);
    next.exp = Math.min(Math.max(parseInt(next.exp) || 0, 0), 99);
    next.gold = Math.max(0, parseInt(next.gold) || 0);
    next.currentTab = LEGACY_TABS[next.currentTab] || next.currentTab; // 레거시 탭 이름 보정
    next.quests = Array.isArray(next.quests) ? next.quests.map(normalizeQuest).filter(Boolean) : [];
    next.shopItems = Array.isArray(next.shopItems) ? next.shopItems.map(normalizeShopItem).filter(Boolean) : [];
    next.history = Array.isArray(next.history) ? next.history : [];
    return next;
}

function normalizeQuest(quest) {
    if (!quest || !quest.text) return null;
    const tab = LEGACY_TABS[quest.tab] || quest.tab || TABS.daily;
    const reward = DIFFICULTY_BY_TAB[tab] || DIFFICULTY_BY_TAB[TABS.daily];
    return {
        id: quest.id || createId(),
        text: String(quest.text).trim(),
        diff: quest.diff || reward.label,
        tab,
        exp: Math.max(0, parseInt(quest.exp) || reward.exp),
        gold: Math.max(0, parseInt(quest.gold) || reward.gold),
        isCompleted: !!quest.isCompleted,
        isRepeat: !!quest.isRepeat
    };
}

function normalizeShopItem(item) {
    if (!item || !item.name || !item.price) return null;
    return { id: item.id || createId(), name: String(item.name).trim(), price: parseInt(item.price) };
}

function updateUI() {
    state = normalizeState(state);
    $("p-name").innerText = state.name;
    $("p-bio").innerText = state.bio;
    $("lv").innerText = state.lv;
    $("gold").innerText = state.gold;
    $("exp-bar").style.width = `${state.exp}%`;
    $("exp-text").innerText = `${state.exp}% (${state.exp}/100)`; 
    $("q-diff").value = DIFFICULTY_BY_TAB[state.currentTab].label;

    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.toggle("active", btn.textContent.trim() === state.currentTab));
    updateGuestNotice();
    renderQuests();
    renderShop();
    updateRankDisplay();
    checkIfRanker();
}

function addHistory(msg) {
    const today = new Date();
    const timeStr = `${today.getMonth()+1}/${today.getDate()} ${today.getHours().toString().padStart(2,'0')}:${today.getMinutes().toString().padStart(2,'0')}`;
    state.history.unshift({ time: timeStr, msg: msg });
    if(state.history.length > 50) state.history.pop();
}

function toggleRepeat() {
    isRepeatMode = !isRepeatMode;
    const btn = $("q-repeat-btn");
    btn.innerText = isRepeatMode ? "🔁 반복" : "1회성";
    btn.style.color = isRepeatMode ? "var(--gold)" : "#a1a1aa";
    btn.style.borderColor = isRepeatMode ? "var(--gold)" : "var(--border)";
}

function addQuest() {
    const text = $("q-input").value.trim();
    if (!text) return;
    const reward = DIFFICULTY_BY_TAB[state.currentTab];
    state.quests.push({
        id: createId(), text, diff: reward.label, tab: state.currentTab,
        exp: reward.exp, gold: reward.gold, isCompleted: false, isRepeat: isRepeatMode
    });
    
    isRepeatMode = false;
    $("q-repeat-btn").innerText = "1회성";
    $("q-repeat-btn").style.cssText = "flex: 0 0 65px; background:transparent; border:1px solid var(--border); color:#a1a1aa; border-radius:12px; font-size:12px; padding:0; transition:0.2s;";
    
    $("q-input").value = "";
    updateUI(); saveData();
}

// 🌟 1회성 퀘스트 즉시 삭제 로직
function completeQuest(id) {
    const quest = state.quests.find(q => String(q.id) === String(id));
    if (!quest || quest.isCompleted) return;
    
    quest.isCompleted = true;
    state.exp += quest.exp; state.gold += quest.gold;
    addHistory(`[도전 성공] ${quest.text} (+${quest.exp}EXP, +${quest.gold}G)`);
    
    while (state.exp >= 100) {
        state.lv += 1; state.exp -= 100;
        addHistory(`🎉 레벨업! Lv.${state.lv} 달성!`);
        alert(`LEVEL UP! Lv.${state.lv}`);
    }

    // [1회성] 퀘스트라면 완료 즉시 배열에서 아예 지워버림
    if (!quest.isRepeat) {
        state.quests = state.quests.filter(q => String(q.id) !== String(id));
    }

    updateUI(); saveData();
}

function deleteQuest(id) {
    if (!confirm("목록에서 완전히 삭제할까요?")) return;
    state.quests = state.quests.filter(q => String(q.id) !== String(id));
    updateUI(); saveData();
}

function renderQuests() {
    const list = $("q-list");
    const filtered = state.quests.filter(q => q.tab === state.currentTab);
    list.replaceChildren();

    if (!filtered.length) {
        const empty = document.createElement("p");
        empty.style.cssText = "text-align:center; font-size:12px; color:#555;";
        empty.textContent = `등록된 ${state.currentTab} 할 일이 없습니다.`;
        list.appendChild(empty); return;
    }

    filtered.forEach(quest => {
        const row = document.createElement("div");
        row.className = "item-row";
        if (quest.isCompleted) { row.style.opacity = "0.4"; row.style.pointerEvents = "none"; }

        const content = document.createElement("div");
        content.style.cssText = "flex: 1; cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding-right: 15px;";
        content.addEventListener("click", () => { if(!quest.isCompleted) completeQuest(quest.id); });

        const textSpan = document.createElement("span");
        textSpan.textContent = `[${quest.diff}] ${quest.text} ${quest.isRepeat ? '🔁' : ''}`;
        if (quest.isCompleted) textSpan.style.textDecoration = "line-through";

        const rewardSpan = document.createElement("span");
        rewardSpan.style.cssText = "color:var(--gold); font-size:11px; white-space:nowrap;";
        rewardSpan.textContent = `+${quest.gold}G`;

        content.append(textSpan, rewardSpan);
        const delBtn = document.createElement("button");
        delBtn.style.cssText = "background:none; border:none; color:#555; cursor:pointer; font-size: 18px;";
        delBtn.textContent = "×";
        delBtn.addEventListener("click", (e) => { e.stopPropagation(); deleteQuest(quest.id); });

        row.append(content, delBtn); list.appendChild(row);
    });
}

function addShopItem() {
    const name = $("s-input").value.trim();
    const price = parseInt($("s-price").value) || 0;
    if (!name || price <= 0) { alert("보상 이름과 가격을 입력해 주세요."); return; }
    state.shopItems.push({ id: createId(), name, price });
    $("s-input").value = ""; $("s-price").value = "";
    updateUI(); saveData();
}

function buyItem(id) {
    const item = state.shopItems.find(i => String(i.id) === String(id));
    if (!item) return;
    if (state.gold < item.price) { alert("골드가 부족합니다."); return; }
    
    state.gold -= item.price;
    addHistory(`[보상 구매] ${item.name} (-${item.price}G)`);
    alert(`'${item.name}' 보상을 획득했습니다!`);
    state.shopItems = state.shopItems.filter(i => String(i.id) !== String(id));
    updateUI(); saveData();
}

function deleteShopItem(id) {
    state.shopItems = state.shopItems.filter(item => String(item.id) !== String(id));
    updateUI(); saveData();
}

function renderShop() {
    const list = $("s-list"); list.replaceChildren();
    state.shopItems.forEach(item => {
        const row = document.createElement("div"); row.className = "item-row";
        const name = document.createElement("span"); name.textContent = `${item.name} (${item.price}G)`;
        const actions = document.createElement("div");
        actions.style.cssText = "display:flex; align-items:center; gap:8px;";

        const buyBtn = document.createElement("button");
        buyBtn.style.cssText = "background:var(--gold); color: black; border:none; border-radius:6px; padding:6px 12px; cursor:pointer;";
        buyBtn.disabled = state.gold < item.price; buyBtn.textContent = "구매";
        buyBtn.addEventListener("click", () => buyItem(item.id));

        const delBtn = document.createElement("button");
        delBtn.style.cssText = "background:none; border:none; color:#555; cursor:pointer; font-size: 18px;";
        delBtn.textContent = "×";
        delBtn.addEventListener("click", () => deleteShopItem(item.id));

        actions.append(buyBtn, delBtn); row.append(name, actions); list.appendChild(row);
    });
}

function showHistory() {
    const list = $("history-list");
    list.replaceChildren();
    if (!state.history || state.history.length === 0) {
        list.textContent = "아직 완료한 퀘스트나 수령한 보상이 없습니다.";
    } else {
        state.history.forEach(h => {
            const div = document.createElement("div");
            div.style.cssText = "margin-bottom:6px; padding-bottom:6px; border-bottom:1px dashed #3f3f46;";
            div.innerHTML = `<span style="color:#555; margin-right:5px;">[${h.time}]</span> <span style="color:var(--text);">${h.msg}</span>`;
            list.appendChild(div);
        });
    }
    $("history-modal").style.display = "flex";
}

function closeHistory() { $("history-modal").style.display = "none"; }
function setTab(tab) { state.currentTab = tab; updateUI(); }
function toggleProfileEdit() { 
    const isEditing = $("profile-edit").style.display === "none";
    if (isEditing) { $("edit-name").value = state.name; $("edit-bio").value = state.bio; }
    $("profile-view").style.display = isEditing ? "none" : "block";
    $("profile-edit").style.display = isEditing ? "block" : "none";
}
function saveProfile() {
    state.name = $("edit-name").value.trim() || state.name;
    state.bio = $("edit-bio").value.trim() || state.bio;
    updateUI(); toggleProfileEdit(); saveData();
}
function resetGame() { if (confirm("초기화할까요?")) { state = { ...state, lv: 1, exp: 0, gold: 0, quests: [], shopItems: [], history: [] }; updateUI(); saveData(); } }

function suggestReward() {
    const rewardSuggestions = [
        { name: "📱 쇼츠/릴스 30분 시청", price: 150 },
        { name: "🎮 게임 2판 (빡겜 가능)", price: 300 },
        { name: "💤 마법의 낮잠 1시간", price: 400 },
        { name: "📺 넷플릭스 영화 1편", price: 600 },
        { name: "🛌 아무것도 안 하기 (멍때리기 30분)", price: 60 },
        { name: "🍗 오늘 저녁은 배달 음식!", price: 1500 },
        { name: "☕ 시원한 아메리카노", price: 60 },
        { name: "🍦 시원한 아이스크림", price: 80 },
        { name: "🎁 장바구니 물건 결제", price: 5000 },
        { name: "👕 새 옷 한 벌 사기", price: 3000 },
        { name: "👟 운동화/패션 아이템 쇼핑", price: 6000 },
        { name: "🖱️ 게이밍 기어/IT 기기 구매", price: 7000 },
        { name: "🎞️ 영화관에서 영화 관람", price: 1200 },
        { name: "🛀 입욕제 반신욕 힐링", price: 500 },
        { name: "🎤 코인 노래방 1시간 열창", price: 300 },
        { name: "💆‍♂️ 나를 위한 전신 마사지", price: 4000 }
    ];
    const r = rewardSuggestions[Math.floor(Math.random() * rewardSuggestions.length)];
    $("s-input").value = r.name; $("s-price").value = r.price;
}

function updateGuestNotice() { const n = $("guest-notice"); if(n) n.style.display = isGuestMode ? "block" : "none"; }
function showAuthMessage(msg) { const m = $("auth-msg"); if(m) m.innerText = msg; }
function createId() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
async function showRanking() {
    $("ranking-modal").style.display = "flex"; $("ranking-list").textContent = "집계 중...";
    if (!db) { $("ranking-list").textContent = "랭킹 불러오기 실패"; return; }
    try {
        const snap = await db.collection("users").orderBy("lv", "desc").limit(10).get();
        $("ranking-list").replaceChildren();
        let r = 1; snap.forEach(doc => {
            const data = normalizeState(doc.data()); const row = document.createElement("div"); row.className = "item-row";
            if (currentUser && doc.id === currentUser.uid) row.style.borderColor = "var(--accent)";
            row.textContent = `${r++}. ${data.name} (Lv.${data.lv})`; $("ranking-list").appendChild(row);
        });
        if(snap.empty) $("ranking-list").textContent = "랭킹 없음";
    } catch(e) { $("ranking-list").textContent = "랭킹 실패"; }
}
function closeRanking() { $("ranking-modal").style.display = "none"; }
async function checkIfRanker() {
    if(isGuestMode || !currentUser || !db) { $("container").classList.remove("ranker-aura"); return; }
    try {
        const snap = await db.collection("users").orderBy("lv", "desc").limit(1).get();
        const top = !snap.empty && snap.docs[0].id === currentUser.uid;
        $("container").classList.toggle("ranker-aura", top);
        if(top) $("p-rank").innerText = "랭킹 1위";
    } catch(e){}
}
function updateRankDisplay() { $("p-rank").innerText = state.lv < 10 ? "RANK: F" : state.lv < 30 ? "RANK: D" : state.lv < 60 ? "RANK: B" : "RANK: S"; }
async function deleteAccount() {
    if(!currentUser) { if(confirm("초기화할까요?")) { localStorage.clear(); location.reload(); } return; }
    if(!confirm("계정 영구 삭제?")) return; if(prompt("'삭제' 입력") !== "삭제") return;
    try { await db.collection("users").doc(currentUser.uid).delete(); await currentUser.delete(); alert("삭제 완료"); location.reload(); } 
    catch(e) { alert("보안을 위해 재로그인 후 시도하세요."); auth.signOut(); }
}
