const firebaseConfig = {
    apiKey: "AIzaSyCaZuvX6w6mNTllo8V9RZobN7yJkfWOvUE",
    authDomain: "my-life-rpg-35d7a.web.app",
    projectId: "my-life-rpg-35d7a",
    storageBucket: "my-life-rpg-35d7a.firebasestorage.app",
    messagingSenderId: "394166677930",
    appId: "1:394166677930:web:6e74c380b63659e3947bd3"
};

const TABS = { daily: "일간", weekly: "주/월", yearly: "연간" };

const DIFFICULTY_BY_TAB = {
    [TABS.daily]: { label: "쉬움", exp: 10, gold: 50 },
    [TABS.weekly]: { label: "보통", exp: 50, gold: 350 },
    [TABS.yearly]: { label: "어려움", exp: 200, gold: 2000 }
};

const APP_TAB_TITLES = {
    quests: "퀘스트",
    expenses: "지출",
    shop: "보상 상점",
    history: "내역",
    profile: "설정"
};

const RANK_TIERS = [
    { minLv: 1,   maxLv: 9,    name: "브론즈",   icon: "🥉", className: "tier-bronze" },
    { minLv: 10,  maxLv: 24,   name: "실버",     icon: "🥈", className: "tier-silver" },
    { minLv: 25,  maxLv: 39,   name: "골드",     icon: "🥇", className: "tier-gold" },
    { minLv: 40,  maxLv: 59,   name: "플래티넘", icon: "💠", className: "tier-platinum" },
    { minLv: 60,  maxLv: 79,   name: "다이아",   icon: "💎", className: "tier-diamond" },
    { minLv: 80,  maxLv: 99,   name: "마스터",   icon: "👑", className: "tier-master" },
    { minLv: 100, maxLv: null, name: "챌린저",   icon: "🔥", className: "tier-challenger" }
];

const DEFAULT_NAME = "플레이어";
const DEFAULT_BIO = "나의 일상을 퀘스트로!";
const $ = id => document.getElementById(id);

let auth = null;
let db = null;
let currentUser = null;
let isGuestMode = false;
let isMigratingGuest = false;
let isRepeatMode = false;
let currentHistoryTab = 'activity';
let currentExpenseTab = 'buy';
let currentAppTab = 'quests';
let toastTimer = null;
let pickerAmPm = 'PM';
let state = createDefaultState();

initDeadlinePickerOptions();
initUIListeners();
initFirebase();

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function triggerHaptic(type = "light") {
    try {
        if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Haptics) {
            if (type === "heavy") {
                Capacitor.Plugins.Haptics.notification({ type: "SUCCESS" });
            } else {
                Capacitor.Plugins.Haptics.impact({ style: "LIGHT" });
            }
            return;
        }
        if (navigator.vibrate) {
            navigator.vibrate(type === "heavy" ? [120, 60, 120] : 12);
        }
    } catch (_) {}
}

function showToast(message, variant = "default") {
    const toast = $("ios-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = "ios-toast";
    if (variant === "gold") toast.classList.add("toast-gold");
    if (variant === "red") toast.classList.add("toast-red");

    // Force reflow for repeated toasts
    void toast.offsetWidth;
    toast.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2200);
}

/* =========================================
   iOS Native-Style Alert / Confirm / Prompt
   ========================================= */
function openIosDialog({ title = "알림", message = "", buttons = [], input = null }) {
    return new Promise(resolve => {
        const backdrop = $("ios-dialog-backdrop");
        const titleEl = $("ios-dialog-title");
        const msgEl = $("ios-dialog-message");
        const inputEl = $("ios-dialog-input");
        const actionsEl = $("ios-dialog-actions");

        titleEl.textContent = title;
        msgEl.textContent = message;
        msgEl.style.display = message ? "block" : "none";

        if (input) {
            inputEl.style.display = "block";
            inputEl.value = input.defaultValue || "";
            inputEl.placeholder = input.placeholder || "";
        } else {
            inputEl.style.display = "none";
            inputEl.value = "";
        }

        actionsEl.innerHTML = "";
        const close = (val) => {
            backdrop.style.display = "none";
            inputEl.onkeydown = null;
            resolve(val);
        };

        buttons.forEach(btn => {
            const el = document.createElement("button");
            el.type = "button";
            el.className = "ios-dialog-btn";
            if (btn.role === "primary") el.classList.add("primary");
            if (btn.role === "destructive") el.classList.add("destructive");
            el.textContent = btn.text;
            el.addEventListener("click", () => {
                const value = typeof btn.value === "function" ? btn.value(inputEl.value) : btn.value;
                close(value);
            });
            actionsEl.appendChild(el);
        });

        if (input) {
            inputEl.onkeydown = (e) => {
                if (e.key === "Enter") {
                    const confirmBtn = buttons[buttons.length - 1];
                    const value = typeof confirmBtn.value === "function" ? confirmBtn.value(inputEl.value) : inputEl.value;
                    close(value);
                }
            };
        }

        backdrop.style.display = "flex";
        if (input) setTimeout(() => inputEl.focus(), 60);
    });
}

function iosAlert(message, title = "Life RPG") {
    return openIosDialog({
        title,
        message,
        buttons: [{ text: "확인", role: "primary", value: true }]
    });
}

function iosConfirm(message, { title = "확인", confirmText = "확인", cancelText = "취소", destructive = false } = {}) {
    return openIosDialog({
        title,
        message,
        buttons: [
            { text: cancelText, role: "cancel", value: false },
            { text: confirmText, role: destructive ? "destructive" : "primary", value: true }
        ]
    });
}

function iosPrompt(message, { title = "입력", placeholder = "", confirmText = "확인", cancelText = "취소", destructive = false } = {}) {
    return openIosDialog({
        title,
        message,
        input: { placeholder },
        buttons: [
            { text: cancelText, role: "cancel", value: null },
            { text: confirmText, role: destructive ? "destructive" : "primary", value: val => val }
        ]
    });
}

/* =========================================
   UI Listeners & iOS Navigation
   ========================================= */
function initUIListeners() {
    const scrollView = $("app-scroll-view");
    const navbar = document.querySelector(".ios-navbar");

    if (scrollView && navbar) {
        scrollView.addEventListener("scroll", () => {
            navbar.classList.toggle("scrolled", scrollView.scrollTop > 24);
        }, { passive: true });
    }

    const qInput = $("q-input");
    if (qInput) {
        qInput.addEventListener("keydown", e => {
            if (e.key === "Enter") addQuest();
        });
    }

    const sPrice = $("s-price");
    if (sPrice) {
        sPrice.addEventListener("keydown", e => {
            if (e.key === "Enter") addShopItem();
        });
    }

    const buyName = $("buy-name-input");
    const buyPrice = $("buy-price-input");
    if (buyName) buyName.addEventListener("keydown", e => { if (e.key === "Enter") addBuyItem(); });
    if (buyPrice) buyPrice.addEventListener("keydown", e => { if (e.key === "Enter") addBuyItem(); });

    const fixedAmount = $("fixed-amount-input");
    const fixedDay = $("fixed-day-input");
    if (fixedAmount) fixedAmount.addEventListener("keydown", e => { if (e.key === "Enter") addFixedExpense(); });
    if (fixedDay) fixedDay.addEventListener("keydown", e => { if (e.key === "Enter") addFixedExpense(); });
}

function switchAppTab(tabKey) {
    if (!APP_TAB_TITLES[tabKey]) return;
    currentAppTab = tabKey;
    triggerHaptic("light");

    document.querySelectorAll(".app-view").forEach(view => {
        view.classList.toggle("active", view.id === `view-${tabKey}`);
    });

    document.querySelectorAll(".ios-tab-item").forEach(item => {
        item.classList.toggle("active", item.getAttribute("data-app-tab") === tabKey);
    });

    if ($("nav-title")) $("nav-title").textContent = APP_TAB_TITLES[tabKey];

    const scrollView = $("app-scroll-view");
    const navbar = document.querySelector(".ios-navbar");
    if (scrollView) scrollView.scrollTop = 0;
    if (navbar) navbar.classList.remove("scrolled");

    if (tabKey === "history") {
        renderHistoryContent();
    }
}

function openProfileTabForEdit() {
    switchAppTab("profile");
    if ($("profile-edit") && $("profile-edit").style.display === "none") {
        toggleProfileEdit();
    }
}

/* =========================================
   State & Firebase Initialization
   ========================================= */
function createDefaultState() {
    return {
        name: DEFAULT_NAME, bio: DEFAULT_BIO,
        lv: 1, exp: 0, gold: 0, streak: 0,
        quests: [], shopItems: [],
        buyList: [], fixedExpenses: [],
        history: [], goldHistory: [],
        currentTab: TABS.daily,
        lastLogin: new Date().toDateString()
    };
}

function syncGuestModeUI() {
    if ($("guest-notice")) $("guest-notice").style.display = isGuestMode ? "flex" : "none";
    if ($("settings-convert-guest-row")) $("settings-convert-guest-row").style.display = isGuestMode ? "flex" : "none";
    if ($("settings-convert-sep")) $("settings-convert-sep").style.display = isGuestMode ? "block" : "none";
}

function initFirebase() {
    const savedGuest = localStorage.getItem('lifeRpgIsGuest') === 'true';

    if (window.firebase) {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        db.enablePersistence().catch(() => console.warn("오프라인 모드 실패"));

        auth.onAuthStateChanged(user => {
            if (isMigratingGuest) return;
            if (!user && isGuestMode) return;

            $("loading-screen").style.display = "none";
            currentUser = user;

            if (user) {
                $("container").style.display = "block";
                isGuestMode = false;
                localStorage.removeItem('lifeRpgIsGuest');
                $("auth-section").style.display = "none";
                $("main-game").style.display = "flex";
                syncGuestModeUI();
                loadData();
            } else {
                $("container").style.display = "block";
                state = createDefaultState();
                $("auth-section").style.display = "flex";
                $("main-game").style.display = "none";
                syncGuestModeUI();
            }
        });
    } else if (!savedGuest) {
        $("loading-screen").style.display = "none";
        $("container").style.display = "block";
        $("auth-section").style.display = "flex";
        $("main-game").style.display = "none";
        showAuthMessage("오프라인 상태입니다. 게스트 모드로 체험할 수 있어요.");
        return;
    }

    if (savedGuest) {
        startGuestMode();
    }
}

async function signInWithGoogleProvider() {
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        const googleUser = await Capacitor.Plugins.GoogleAuth.signIn();
        const credential = firebase.auth.GoogleAuthProvider.credential(googleUser.authentication.idToken);
        return await firebase.auth().signInWithCredential(credential);
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return await firebase.auth().signInWithPopup(provider);
}

async function loginWithGoogle() {
    if (!window.firebase || !auth) {
        await iosAlert("네트워크 연결을 확인해 주세요.", "로그인 불가");
        return;
    }
    try {
        await signInWithGoogleProvider();
    } catch (error) {
        console.error(error);
        await iosAlert("로그인 실패: " + error.message, "로그인 오류");
    }
}

async function convertGuestToGoogle() {
    if (!isGuestMode) {
        showToast("이미 Google 계정으로 로그인되어 있습니다");
        return;
    }
    if (!window.firebase || !auth || !db) {
        await iosAlert("네트워크 연결을 확인한 뒤 다시 시도해 주세요.", "연동 불가");
        return;
    }

    const ok = await iosConfirm("Google 계정으로 전환합니다. 신규 계정이면 현재 게스트 데이터가 이전되며, 이미 사용 중인 계정이 있으면 그대로 로그인됩니다.", {
        title: "Google 계정 전환 로그인",
        confirmText: "Google로 계속",
        cancelText: "취소"
    });
    if (!ok) return;

    const guestSnapshot = normalizeState(state);
    isMigratingGuest = true;

    try {
        const result = await signInWithGoogleProvider();
        const user = (result && result.user) || auth.currentUser;
        if (!user) throw new Error("계정 정보를 가져오지 못했습니다.");

        const docRef = db.collection("users").doc(user.uid);
        const existingDoc = await docRef.get();
        let finalState = guestSnapshot;
        let successMsg = "게스트 데이터가 Google 계정에 연동되었습니다";

        if (existingDoc.exists) {
            finalState = normalizeState(existingDoc.data());
            successMsg = "기존 Google 계정으로 로그인되었습니다";
        } else {
            await docRef.set({ ...guestSnapshot, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }

        currentUser = user;
        isGuestMode = false;
        localStorage.removeItem('lifeRpgIsGuest');
        localStorage.removeItem('lifeRpgGuestData');

        state = finalState;
        $("auth-section").style.display = "none";
        $("main-game").style.display = "flex";
        syncGuestModeUI();
        checkAndResetQuests();
        updateUI();

        triggerHaptic("heavy");
        showToast(successMsg, "gold");
    } catch (error) {
        console.error(error);
        const code = error && error.code ? error.code : "";
        if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
            await iosAlert("계정 전환에 실패했습니다. 게스트 데이터는 그대로 유지됩니다.\n(" + (error.message || "오류") + ")", "연동 실패");
        }
    } finally {
        isMigratingGuest = false;
    }
}

function showAuthMessage(msg) {
    const m = $("auth-msg");
    if (m) m.innerText = msg;
}

async function startGuestModeWithWarning() {
    const ok = await iosConfirm("게스트 모드는 앱 삭제 시 데이터가 초기화됩니다. 나중에 설정에서 Google 계정으로 전환해 데이터를 보관할 수 있습니다.", {
        title: "게스트로 체험하기",
        confirmText: "시작하기",
        cancelText: "취소"
    });
    if (ok) startGuestMode();
}

function startGuestMode() {
    isGuestMode = true;
    currentUser = null;
    localStorage.setItem('lifeRpgIsGuest', 'true');
    $("loading-screen").style.display = "none";
    $("container").style.display = "block";
    $("auth-section").style.display = "none";
    $("main-game").style.display = "flex";
    syncGuestModeUI();
    loadData();
}

async function logout() {
    const msg = isGuestMode
        ? "게스트 모드를 종료하고 로그인 화면으로 돌아갈까요? 데이터를 유지하려면 먼저 'Google 계정 전환 로그인'을 이용해 주세요."
        : "현재 계정에서 로그아웃할까요?";

    const ok = await iosConfirm(msg, {
        title: "로그아웃",
        confirmText: "로그아웃",
        cancelText: "취소"
    });
    if (!ok) return;

    isGuestMode = false;
    localStorage.removeItem('lifeRpgIsGuest');
    state = createDefaultState();
    switchAppTab("quests");
    syncGuestModeUI();
    if (auth && currentUser) { auth.signOut(); return; }
    $("auth-section").style.display = "flex";
    $("main-game").style.display = "none";
}

async function saveData() {
    if (isGuestMode) {
        localStorage.setItem('lifeRpgGuestData', JSON.stringify(state));
        return;
    }
    if (!currentUser || !db) return;
    try {
        await db.collection("users").doc(currentUser.uid).set(
            { ...state, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
            { merge: true }
        );
    } catch (_) {}
}

async function loadData() {
    if (isGuestMode) {
        try { state = normalizeState(JSON.parse(localStorage.getItem('lifeRpgGuestData'))); }
        catch (_) { state = createDefaultState(); }
        checkAndResetQuests(); updateUI(); return;
    }
    if (!currentUser || !db) return;
    try {
        const doc = await db.collection("users").doc(currentUser.uid).get();
        state = doc.exists ? normalizeState(doc.data()) : createDefaultState();
        checkAndResetQuests(); updateUI();
        if (!doc.exists) await saveData();
    } catch (_) { updateUI(); }
}

function checkAndResetQuests() {
    const today = new Date().toDateString();
    let isChanged = false;

    if (state.lastLogin !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        if (state.lastLogin === yesterday.toDateString()) state.streak = (state.streak || 0) + 1;
        else state.streak = 1;

        const currentDay = new Date().getDay();
        const currentDate = new Date().getDate();

        state.quests = state.quests.filter(q => {
            if (!q.isCompleted) return true;
            if (q.isRepeat) {
                if (q.tab === TABS.daily) { q.isCompleted = false; isChanged = true; return true; }
                if (q.tab === TABS.weekly && (currentDay === 1 || currentDate === 1)) { q.isCompleted = false; isChanged = true; return true; }
                if (q.tab === TABS.yearly && new Date().getMonth() === 0 && currentDate === 1) { q.isCompleted = false; isChanged = true; return true; }
                return true;
            } else {
                if (q.tab === TABS.daily) { isChanged = true; return false; }
                return true;
            }
        });

        state.lastLogin = today;
        if (isChanged || state.streak > 0) saveData();
    }
}

function normalizeState(data) {
    const next = { ...createDefaultState(), ...(data || {}) };
    next.lv = Math.max(1, parseInt(next.lv) || 1);
    next.exp = Math.min(Math.max(parseInt(next.exp) || 0, 0), 99);
    next.streak = parseInt(next.streak) || 0;

    if (typeof next.gold === 'object' && next.gold !== null) {
        next.gold = (next.gold['일상'] || 0) + (next.gold['운동'] || 0) + (next.gold['공부'] || 0);
    } else {
        next.gold = parseInt(next.gold) || 0;
    }

    next.currentTab = next.currentTab || TABS.daily;
    next.quests = Array.isArray(next.quests) ? next.quests.map(normalizeQuest).filter(Boolean) : [];
    next.shopItems = Array.isArray(next.shopItems) ? next.shopItems.map(normalizeShopItem).filter(Boolean) : [];
    next.buyList = Array.isArray(next.buyList) ? next.buyList.map(normalizeBuyItem).filter(Boolean) : [];
    next.fixedExpenses = Array.isArray(next.fixedExpenses) ? next.fixedExpenses.map(normalizeFixedExpense).filter(Boolean) : [];

    next.history = Array.isArray(next.history) ? next.history : [];
    next.goldHistory = Array.isArray(next.goldHistory) ? next.goldHistory : [];
    return next;
}

function normalizeBuyItem(item) {
    if (!item || !item.name) return null;
    return {
        id: item.id || createId(),
        name: String(item.name).trim(),
        price: Math.max(0, parseInt(item.price) || 0),
        isChecked: !!item.isChecked
    };
}

function normalizeFixedExpense(item) {
    if (!item || !item.name) return null;
    const amount = Math.max(0, parseInt(item.amount) || 0);
    if (amount <= 0) return null;
    const parsedDay = parseInt(item.day);
    const day = (parsedDay >= 1 && parsedDay <= 31) ? parsedDay : null;
    return {
        id: item.id || createId(),
        name: String(item.name).trim(),
        amount,
        day,
        lastPaidMonth: item.lastPaidMonth || null
    };
}

function normalizeQuest(quest) {
    if (!quest || !quest.text) return null;
    const tab = quest.tab || TABS.daily;
    const reward = DIFFICULTY_BY_TAB[tab] || DIFFICULTY_BY_TAB[TABS.daily];
    return {
        id: quest.id || createId(),
        text: String(quest.text).trim(),
        diff: quest.diff || reward.label,
        tab,
        exp: Math.max(0, parseInt(quest.exp) || reward.exp),
        gold: Math.max(0, parseInt(quest.gold) || reward.gold),
        isCompleted: !!quest.isCompleted,
        isRepeat: !!quest.isRepeat,
        deadline: quest.deadline || null
    };
}

function normalizeShopItem(item) {
    if (!item || !item.name || !item.price) return null;
    return { id: item.id || createId(), name: String(item.name).trim(), price: parseInt(item.price) };
}

function getRankInfo(lv) {
    const level = Math.max(1, parseInt(lv) || 1);
    let idx = 0;
    for (let i = 0; i < RANK_TIERS.length; i++) {
        if (level >= RANK_TIERS[i].minLv) idx = i;
    }
    const current = RANK_TIERS[idx];
    const next = RANK_TIERS[idx + 1] || null;
    return {
        ...current,
        label: `${current.icon} ${current.name}`,
        nextLv: next ? next.minLv : null,
        nextName: next ? next.name : null,
        nextIcon: next ? next.icon : null
    };
}

function getRankText(lv) {
    return getRankInfo(lv).label;
}

function updateUI() {
    state = normalizeState(state);

    const avatarChar = (state.name || DEFAULT_NAME).trim().charAt(0).toUpperCase() || "P";
    const rankText = getRankText(state.lv);

    if ($("p-name")) $("p-name").textContent = state.name;
    if ($("p-bio")) $("p-bio").textContent = state.bio;
    if ($("hero-avatar")) $("hero-avatar").textContent = avatarChar;
    if ($("lv")) $("lv").textContent = state.lv;
    if ($("gold")) $("gold").textContent = state.gold.toLocaleString();
    if ($("shop-gold")) $("shop-gold").textContent = state.gold.toLocaleString();
    if ($("streak-display")) $("streak-display").textContent = `🔥 ${state.streak}일`;

    if ($("exp-bar")) $("exp-bar").style.width = `${state.exp}%`;
    if ($("exp-text")) $("exp-text").textContent = `${state.exp}% (${state.exp}/100)`;

    if ($("settings-avatar")) $("settings-avatar").textContent = avatarChar;
    if ($("settings-name")) $("settings-name").textContent = state.name;
    if ($("settings-bio")) $("settings-bio").textContent = state.bio;
    if ($("settings-meta")) $("settings-meta").textContent = `LV ${state.lv} · ${rankText} · 🔥 ${state.streak}일`;

    if ($("timer-ui-container")) {
        $("timer-ui-container").style.display = (state.currentTab === TABS.daily) ? "flex" : "none";
    }

    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.textContent.trim() === state.currentTab);
    });

    renderQuests();
    renderShop();
    renderBuyList();
    renderFixedExpenses();
    updateRankDisplay();
    if (currentAppTab === "history") renderHistoryContent();
}

function getFormattedDate() {
    const d = new Date();
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function getFormattedTime() {
    const d = new Date();
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function addActivityHistory(msg, tabName, expAmount = 0) {
    state.history.unshift({ date: getFormattedDate(), time: getFormattedTime(), msg, tab: tabName, exp: expAmount });
    if (state.history.length > 200) state.history.pop();
}

function addGoldHistory(amount, desc) {
    state.goldHistory.unshift({ date: getFormattedDate(), time: getFormattedTime(), amount, desc });
    if (state.goldHistory.length > 200) state.goldHistory.pop();
}

function toggleRepeat() {
    isRepeatMode = !isRepeatMode;
    triggerHaptic("light");
    const btn = $("q-repeat-btn");
    if (!btn) return;
    btn.classList.toggle("active", isRepeatMode);
    btn.innerHTML = isRepeatMode ? "<span>🔁 반복</span>" : "<span>1회성</span>";
}

async function addQuest() {
    const text = $("q-input").value.trim();
    if (!text) return;

    let deadline = null;
    if (state.currentTab === TABS.daily && $("q-time").value) {
        const timeVal = $("q-time").value;
        const [hour, minute] = timeVal.split(':');
        const targetDate = new Date();
        targetDate.setHours(parseInt(hour), parseInt(minute), 0, 0);

        if (targetDate.getTime() < Date.now()) {
            const ok = await iosConfirm("이미 지난 마감 시간입니다. 그래도 추가할까요?", {
                title: "마감 시간 확인",
                confirmText: "추가",
                cancelText: "취소"
            });
            if (!ok) return;
        }
        deadline = targetDate.getTime();
    }

    const reward = DIFFICULTY_BY_TAB[state.currentTab];
    state.quests.push({
        id: createId(), text, diff: reward.label, tab: state.currentTab,
        exp: reward.exp, gold: reward.gold, isCompleted: false, isRepeat: isRepeatMode, deadline
    });

    isRepeatMode = false;
    const repeatBtn = $("q-repeat-btn");
    if (repeatBtn) {
        repeatBtn.classList.remove("active");
        repeatBtn.innerHTML = "<span>1회성</span>";
    }
    $("q-input").value = "";
    clearDeadlineTime(true);

    triggerHaptic("light");
    updateUI();
    saveData();
    showToast("새 퀘스트가 등록되었습니다");
}

function completeQuest(id) {
    const quest = state.quests.find(q => String(q.id) === String(id));
    if (!quest || quest.isCompleted) return;

    let earnedExp = quest.exp;
    let earnedGold = quest.gold;
    let isBonus = false;

    if (quest.deadline && quest.tab === TABS.daily && Date.now() <= quest.deadline) {
        earnedExp *= 2;
        earnedGold *= 2;
        isBonus = true;
        addActivityHistory(`${quest.text} (⏰마감 성공!)`, quest.tab, earnedExp);
        addGoldHistory(earnedGold, `[마감 2배] ${quest.text}`);
    } else {
        addActivityHistory(quest.text, quest.tab, earnedExp);
        addGoldHistory(earnedGold, quest.text);
    }

    quest.isCompleted = true;
    state.exp += earnedExp;
    state.gold += earnedGold;

    const prevLv = state.lv;
    let isLeveledUp = false;
    while (state.exp >= 100) {
        state.lv += 1;
        state.exp -= 100;
        addActivityHistory(`🎉 레벨업! Lv.${state.lv} 달성!`, "시스템", 0);
        isLeveledUp = true;
    }

    if (!quest.isRepeat) {
        state.quests = state.quests.filter(q => String(q.id) !== String(id));
    }

    triggerHaptic(isLeveledUp ? "heavy" : "light");
    updateUI();
    saveData();

    if (isLeveledUp) {
        showLevelUpUI(prevLv, state.lv);
    } else if (isBonus) {
        showToast(`⏰ 마감 2배 보너스! +${earnedGold}G · +${earnedExp} EXP`, "gold");
    } else {
        showToast(`퀘스트 완료! +${earnedGold}G · +${earnedExp} EXP`, "gold");
    }
}

function showLevelUpUI(prevLevel, newLevel) {
    triggerHaptic("heavy");
    const overlay = $("levelup-overlay");
    if (!overlay) return;

    const prevRank = getRankText(prevLevel);
    const newRank = getRankText(newLevel);

    if ($("levelup-lv")) $("levelup-lv").textContent = `Lv. ${newLevel}`;
    if ($("levelup-transition")) $("levelup-transition").textContent = `Lv. ${prevLevel} → Lv. ${newLevel}`;
    if ($("levelup-rank")) $("levelup-rank").textContent = newRank;
    if ($("levelup-gold")) $("levelup-gold").textContent = `${state.gold.toLocaleString()}G`;

    const rankupEl = $("levelup-rankup");
    if (rankupEl) {
        if (prevRank !== newRank) {
            rankupEl.textContent = `✨ 티어 승급! ${newRank} 달성`;
            rankupEl.style.display = "inline-flex";
        } else {
            rankupEl.style.display = "none";
        }
    }

    const particlesWrap = $("levelup-particles");
    if (particlesWrap) {
        particlesWrap.innerHTML = "";
        const colors = ["#ffd60a", "#ff9f0a", "#0a84ff", "#bf5af2", "#30d158", "#ffffff"];
        const count = 24;
        for (let i = 0; i < count; i++) {
            const p = document.createElement("span");
            p.className = "lu-particle";
            const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
            const dist = 95 + Math.random() * 130;
            const tx = Math.round(Math.cos(angle) * dist);
            const ty = Math.round(Math.sin(angle) * dist - 20);
            const size = (5 + Math.random() * 5).toFixed(1);
            p.style.setProperty("--tx", `${tx}px`);
            p.style.setProperty("--ty", `${ty}px`);
            p.style.setProperty("--size", `${size}px`);
            p.style.setProperty("--radius", i % 3 === 0 ? "2px" : "50%");
            p.style.setProperty("--color", colors[i % colors.length]);
            p.style.setProperty("--dur", `${(0.95 + Math.random() * 0.65).toFixed(2)}s`);
            p.style.setProperty("--delay", `${(Math.random() * 0.14).toFixed(2)}s`);
            p.style.setProperty("--rot", `${Math.round(120 + Math.random() * 240)}deg`);
            particlesWrap.appendChild(p);
        }
    }

    overlay.style.display = "flex";
}

function closeLevelUpUI() {
    const overlay = $("levelup-overlay");
    if (overlay) overlay.style.display = "none";
    triggerHaptic("light");
}

async function deleteQuest(id) {
    const ok = await iosConfirm("이 퀘스트를 삭제할까요?", {
        title: "퀘스트 삭제",
        confirmText: "삭제",
        cancelText: "취소",
        destructive: true
    });
    if (!ok) return;
    state.quests = state.quests.filter(q => String(q.id) !== String(id));
    triggerHaptic("light");
    updateUI();
    saveData();
}

function renderQuests() {
    const list = $("q-list");
    if (!list) return;
    const filtered = state.quests.filter(q => q.tab === state.currentTab);
    if ($("quest-count-badge")) $("quest-count-badge").textContent = `${filtered.length}개`;

    list.innerHTML = "";

    if (!filtered.length) {
        list.innerHTML = `
            <div class="ios-empty-state">
                <div class="ios-empty-icon">📝</div>
                <div>등록된 ${escapeHtml(state.currentTab)} 퀘스트가 없습니다.<br>위에서 새 할 일을 추가해 보세요.</div>
            </div>`;
        return;
    }

    filtered.forEach(quest => {
        const row = document.createElement("div");
        row.className = "quest-row" + (quest.isCompleted ? " completed" : "");

        const checkBtn = document.createElement("button");
        checkBtn.type = "button";
        checkBtn.className = "ios-check-circle";
        checkBtn.setAttribute("aria-label", "퀘스트 완료");
        checkBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        checkBtn.addEventListener("click", () => { if (!quest.isCompleted) completeQuest(quest.id); });

        const body = document.createElement("div");
        body.className = "quest-body";
        body.addEventListener("click", () => { if (!quest.isCompleted) completeQuest(quest.id); });

        const titleLine = document.createElement("div");
        titleLine.className = "quest-title-line";
        titleLine.innerHTML = `<span>${escapeHtml(quest.text)}${quest.isRepeat ? ' 🔁' : ''}</span><span class="diff-badge diff-${escapeHtml(quest.diff)}">${escapeHtml(quest.diff)}</span>`;
        body.appendChild(titleLine);

        let displayGold = quest.gold;
        let goldBadgeHtml = "";

        if (quest.deadline && quest.tab === TABS.daily) {
            const subLine = document.createElement("div");
            subLine.className = "quest-sub-line";
            if (!quest.isCompleted) {
                subLine.innerHTML = `<span class="quest-timer" data-deadline="${quest.deadline}">⏱️ 계산 중...</span>`;
                if (Date.now() <= quest.deadline) {
                    displayGold = quest.gold * 2;
                    goldBadgeHtml = `<span class="bonus-2x-tag">2배</span>`;
                }
            } else {
                subLine.innerHTML = `<span class="quest-done-tag">✅ 달성 완료</span>`;
            }
            body.appendChild(subLine);
        }

        const right = document.createElement("div");
        right.className = "quest-right";

        const rewardPill = document.createElement("span");
        rewardPill.className = "gold-reward-pill";
        rewardPill.innerHTML = `${goldBadgeHtml}+${displayGold}G`;

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "ios-row-del-btn";
        delBtn.setAttribute("aria-label", "퀘스트 삭제");
        delBtn.textContent = "×";
        delBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            deleteQuest(quest.id);
        });

        right.append(rewardPill, delBtn);
        row.append(checkBtn, body, right);
        list.appendChild(row);
    });
}

async function addShopItem() {
    const name = $("s-input").value.trim();
    const price = parseInt($("s-price").value) || 0;
    if (!name || price <= 0) {
        await iosAlert("보상 이름과 1G 이상의 가격을 입력해 주세요.", "입력 확인");
        return;
    }
    state.shopItems.push({ id: createId(), name, price });
    $("s-input").value = "";
    $("s-price").value = "";
    triggerHaptic("light");
    updateUI();
    saveData();
    showToast("새 보상이 상점에 등록되었습니다");
}

async function buyItem(id) {
    const item = state.shopItems.find(i => String(i.id) === String(id));
    if (!item) return;
    if (state.gold < item.price) {
        showToast("골드가 부족합니다", "red");
        return;
    }

    const ok = await iosConfirm(`${item.price.toLocaleString()}G를 사용해 '${item.name}' 보상을 획득할까요?`, {
        title: "보상 구매",
        confirmText: "구매하기",
        cancelText: "취소"
    });
    if (!ok) return;

    state.gold -= item.price;
    addGoldHistory(-item.price, `[보상 구매] ${item.name}`);
    state.shopItems = state.shopItems.filter(i => String(i.id) !== String(id));
    triggerHaptic("heavy");
    updateUI();
    saveData();
    showToast(`🎁 '${item.name}' 획득 완료!`, "gold");
}

function deleteShopItem(id) {
    state.shopItems = state.shopItems.filter(item => String(item.id) !== String(id));
    triggerHaptic("light");
    updateUI();
    saveData();
}

function renderShop() {
    const list = $("s-list");
    if (!list) return;
    if ($("shop-count-badge")) $("shop-count-badge").textContent = `${state.shopItems.length}개`;
    list.replaceChildren();

    if (!state.shopItems.length) {
        list.innerHTML = `
            <div class="ios-empty-state">
                <div class="ios-empty-icon">🎁</div>
                <div>등록된 보상이 없습니다.<br>랜덤 추천이나 직접 입력으로 보상을 만들어 보세요.</div>
            </div>`;
        return;
    }

    state.shopItems.forEach(item => {
        const row = document.createElement("div");
        row.className = "shop-row";

        const info = document.createElement("div");
        info.className = "shop-info";
        info.innerHTML = `
            <div class="shop-name">${escapeHtml(item.name)}</div>
            <div class="shop-price">${item.price.toLocaleString()}G</div>
        `;

        const actions = document.createElement("div");
        actions.className = "shop-actions";

        const buyBtn = document.createElement("button");
        buyBtn.type = "button";
        buyBtn.className = "ios-buy-btn";
        buyBtn.disabled = state.gold < item.price;
        buyBtn.textContent = "구매";
        buyBtn.addEventListener("click", () => buyItem(item.id));

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "ios-row-del-btn";
        delBtn.setAttribute("aria-label", "보상 삭제");
        delBtn.textContent = "×";
        delBtn.addEventListener("click", () => deleteShopItem(item.id));

        actions.append(buyBtn, delBtn);
        row.append(info, actions);
        list.appendChild(row);
    });
}

function showHistory() {
    switchAppTab("history");
    switchHistoryTab('activity');
}
function closeHistory() {
    switchAppTab("quests");
}

function switchHistoryTab(tabName) {
    currentHistoryTab = tabName;
    triggerHaptic("light");
    if ($("btn-hist-act")) $("btn-hist-act").classList.toggle('active', tabName === 'activity');
    if ($("btn-hist-gold")) $("btn-hist-gold").classList.toggle('active', tabName === 'gold');
    if ($("btn-hist-stats")) $("btn-hist-stats").classList.toggle('active', tabName === 'stats');
    renderHistoryContent();
}

function renderHistoryContent() {
    const list = $("history-list");
    if (!list) return;
    list.innerHTML = "";

    if (currentHistoryTab === 'stats') {
        const statsMap = {};
        state.goldHistory.forEach(h => {
            if (h.amount > 0) {
                let cleanDesc = String(h.desc || "").replace(/\[.*?\]\s*/g, '');
                statsMap[cleanDesc] = (statsMap[cleanDesc] || 0) + h.amount;
            }
        });

        const sortedStats = Object.entries(statsMap).sort((a, b) => b[1] - a[1]);

        if (sortedStats.length === 0) {
            list.innerHTML = `<div class="ios-list-group"><div class="ios-empty-state"><div class="ios-empty-icon">📊</div><div>아직 누적된 골드 기록이 없습니다.</div></div></div>`;
            return;
        }

        const group = document.createElement("div");
        group.className = "ios-list-group";

        let rank = 1;
        sortedStats.forEach(([name, totalGold]) => {
            const rankClass = rank <= 3 ? `stat-rank-${rank}` : '';
            const row = document.createElement("div");
            row.className = "stat-row";
            row.innerHTML = `
                <div class="stat-name"><span class="stat-rank ${rankClass}">${rank}위</span><span>${escapeHtml(name)}</span></div>
                <div class="stat-gold">+${totalGold.toLocaleString()}G</div>
            `;
            group.appendChild(row);
            rank++;
        });
        list.appendChild(group);
        return;
    }

    const sourceData = currentHistoryTab === 'gold' ? state.goldHistory : state.history;
    const normalizedData = sourceData.map(h => {
        if (typeof h === 'string') return { date: "이전 기록", time: "", msg: h, tab: "", exp: 0, amount: 0, desc: h };
        if (!h.date) return { date: "이전 기록", time: h.time || "", msg: h.msg || "", tab: h.tab || "", exp: h.exp || 0, amount: h.amount || 0, desc: h.desc || "" };
        return h;
    });

    if (!normalizedData || normalizedData.length === 0) {
        list.innerHTML = `<div class="ios-list-group"><div class="ios-empty-state"><div class="ios-empty-icon">📜</div><div>아직 기록이 없습니다.</div></div></div>`;
        return;
    }

    const groups = {};
    normalizedData.forEach(item => {
        if (!groups[item.date]) groups[item.date] = [];
        groups[item.date].push(item);
    });

    for (const date in groups) {
        const dateHeader = document.createElement("div");
        dateHeader.className = "h-date-header";
        dateHeader.textContent = date;
        list.appendChild(dateHeader);

        const card = document.createElement("div");
        card.className = "h-group-card";

        groups[date].forEach(item => {
            const row = document.createElement("div");
            row.className = "h-item";

            if (currentHistoryTab === 'gold') {
                const isGain = item.amount > 0;
                const color = isGain ? "var(--ios-gold)" : "var(--ios-red)";
                const sign = isGain ? "+" : "";
                row.innerHTML = `
                    <span class="h-time">${escapeHtml(item.time)}</span>
                    <span class="h-msg">${escapeHtml(item.desc)}</span>
                    <span class="h-gold" style="color:${color};">${sign}${Number(item.amount).toLocaleString()}G</span>
                `;
            } else {
                const badgeHtml = item.tab && item.tab !== "시스템" ? `<span class="h-tab-badge">${escapeHtml(item.tab)}</span>` : "";
                const expHtml = item.exp ? `<span class="h-exp">+${item.exp} EXP</span>` : "";
                const safeMsg = escapeHtml(item.msg);
                const highlightMsg = item.msg && item.msg.includes("레벨업") ? `<b style="color:var(--ios-gold);">${safeMsg}</b>` : safeMsg;
                row.innerHTML = `
                    <span class="h-time">${escapeHtml(item.time)}</span>
                    ${badgeHtml}
                    <span class="h-msg">${highlightMsg}</span>
                    ${expHtml}
                `;
            }
            card.appendChild(row);
        });
        list.appendChild(card);
    }
}

function setTab(tab) {
    state.currentTab = tab;
    triggerHaptic("light");
    updateUI();
}

function toggleProfileEdit() {
    const editEl = $("profile-edit");
    const viewEl = $("profile-view");
    if (!editEl || !viewEl) return;

    const isEditing = editEl.style.display === "none";
    if (isEditing) {
        $("edit-name").value = state.name;
        $("edit-bio").value = state.bio;
    }
    viewEl.style.display = isEditing ? "none" : "flex";
    editEl.style.display = isEditing ? "block" : "none";
}

function saveProfile() {
    state.name = $("edit-name").value.trim() || state.name;
    state.bio = $("edit-bio").value.trim() || state.bio;
    triggerHaptic("light");
    updateUI();
    toggleProfileEdit();
    saveData();
    showToast("프로필이 저장되었습니다");
}

async function resetGame() {
    const ok = await iosConfirm("레벨, 골드, 퀘스트 및 모든 활동 기록이 초기화됩니다.", {
        title: "데이터 초기화",
        confirmText: "초기화",
        cancelText: "취소",
        destructive: true
    });
    if (!ok) return;

    state = {
        ...state,
        lv: 1, exp: 0, gold: 0, streak: 0,
        quests: [], shopItems: [], buyList: [], fixedExpenses: [], history: [], goldHistory: []
    };
    triggerHaptic("heavy");
    updateUI();
    saveData();
    showToast("데이터가 초기화되었습니다");
}

function suggestReward() {
    const rewards = [
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
    const r = rewards[Math.floor(Math.random() * rewards.length)];
    $("s-input").value = r.name;
    $("s-price").value = r.price;
    triggerHaptic("light");
    showToast("추천 보상을 입력했어요");
}

function createId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

setInterval(() => {
    const timers = document.querySelectorAll('.quest-timer');
    const now = Date.now();
    timers.forEach(el => {
        const deadline = parseInt(el.getAttribute('data-deadline'));
        const timeLeft = deadline - now;
        if (timeLeft <= 0) {
            el.textContent = "⏳ 시간 초과 (기본 보상 적용)";
            el.style.color = "var(--ios-red)";
        } else {
            const hours = Math.floor(timeLeft / (1000 * 60 * 60));
            const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
            const padM = minutes.toString().padStart(2, '0');
            const padS = seconds.toString().padStart(2, '0');
            el.textContent = hours > 0 ? `⏱️ ${hours}시간 ${padM}분 남음` : `⏱️ ${padM}분 ${padS}초 남음`;
        }
    });
}, 1000);

async function showRanking() {
    if (isGuestMode) {
        const goConvert = await iosConfirm("명예의 전당은 Google 로그인 후 이용할 수 있습니다. 현재 데이터를 유지한 채 Google 계정으로 전환할까요?", {
            title: "명예의 전당",
            confirmText: "계정 전환",
            cancelText: "닫기"
        });
        if (goConvert) convertGuestToGoogle();
        return;
    }
    $("ranking-modal").style.display = "flex";
    $("ranking-list").innerHTML = `<div class="ios-empty-state">랭킹을 불러오는 중...</div>`;
    if (!db) {
        $("ranking-list").innerHTML = `<div class="ios-empty-state">네트워크 연결을 확인해 주세요.</div>`;
        return;
    }
    try {
        const snap = await db.collection("users").orderBy("lv", "desc").limit(10).get();
        $("ranking-list").replaceChildren();
        let r = 1;
        snap.forEach(doc => {
            const data = normalizeState(doc.data());
            const row = document.createElement("div");
            row.className = "rank-row" + (currentUser && doc.id === currentUser.uid ? " is-me" : "");
            const rankClass = r <= 3 ? `stat-rank-${r}` : "";
            const tier = getRankInfo(data.lv);
            row.innerHTML = `
                <div class="rank-left">
                    <span class="stat-rank ${rankClass}">${r}</span>
                    <span>${escapeHtml(data.name)}</span>
                </div>
                <span class="rank-lv">${tier.icon} Lv.${data.lv}</span>
            `;
            $("ranking-list").appendChild(row);
            r++;
        });
        if (snap.empty) {
            $("ranking-list").innerHTML = `<div class="ios-empty-state">아직 등록된 랭킹이 없습니다.</div>`;
        }
    } catch (_) {
        $("ranking-list").innerHTML = `<div class="ios-empty-state">랭킹을 불러오지 못했습니다.</div>`;
    }
}

function closeRanking() {
    $("ranking-modal").style.display = "none";
}

function updateRankDisplay() {
    const info = getRankInfo(state.lv);
    const chip = $("p-rank");
    if (chip) {
        chip.className = `ios-rank-chip ${info.className}`;
        chip.textContent = `${info.label} ›`;
    }
    const hint = $("next-tier-hint");
    if (hint) {
        if (info.nextLv) {
            const left = info.nextLv - state.lv;
            hint.textContent = `다음 승급 ${info.nextIcon} ${info.nextName}까지 ${left}Lv`;
        } else {
            hint.textContent = `최고 등급 달성 🔥`;
        }
    }
}

function openTierModal() {
    const list = $("tier-list");
    if (list) {
        list.innerHTML = "";
        const currentInfo = getRankInfo(state.lv);
        RANK_TIERS.forEach(tier => {
            const isCurrent = tier.name === currentInfo.name;
            const isPassed = state.lv > (tier.maxLv || Infinity);
            const rangeText = tier.maxLv ? `Lv. ${tier.minLv} ~ ${tier.maxLv}` : `Lv. ${tier.minLv} 이상`;
            let badgeHtml = `<span class="tier-lock-tag">Lv.${tier.minLv} 달성 시</span>`;
            if (isCurrent) badgeHtml = `<span class="tier-current-tag">현재 등급</span>`;
            else if (isPassed) badgeHtml = `<span class="tier-done-tag">달성 ✓</span>`;

            const row = document.createElement("div");
            row.className = "tier-row" + (isCurrent ? " current" : "");
            row.innerHTML = `
                <div class="tier-row-left">
                    <span class="tier-row-icon">${tier.icon}</span>
                    <div>
                        <div class="tier-row-name">${tier.name}</div>
                        <div class="tier-row-range">${rangeText}</div>
                    </div>
                </div>
                ${badgeHtml}
            `;
            list.appendChild(row);
        });
    }
    if ($("tier-modal")) $("tier-modal").style.display = "flex";
    triggerHaptic("light");
}

function closeTierModal() {
    if ($("tier-modal")) $("tier-modal").style.display = "none";
}

/* =========================================
   iOS Deadline Time Picker Sheet
   ========================================= */
function initDeadlinePickerOptions() {
    const hourSel = $("dp-hour");
    const minSel = $("dp-minute");
    if (hourSel && !hourSel.options.length) {
        for (let h = 1; h <= 12; h++) {
            const opt = document.createElement("option");
            opt.value = String(h);
            opt.textContent = `${h}시`;
            hourSel.appendChild(opt);
        }
    }
    if (minSel && !minSel.options.length) {
        for (let m = 0; m < 60; m++) {
            const opt = document.createElement("option");
            opt.value = String(m);
            opt.textContent = `${String(m).padStart(2, '0')}분`;
            minSel.appendChild(opt);
        }
    }
}

function formatKoreanTime(h24, m) {
    const isPm = h24 >= 12;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${isPm ? "오후" : "오전"} ${h12}:${String(m).padStart(2, '0')}`;
}

function setPickerFrom24h(h24, m) {
    pickerAmPm = h24 >= 12 ? "PM" : "AM";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    if ($("dp-am")) $("dp-am").classList.toggle("active", pickerAmPm === "AM");
    if ($("dp-pm")) $("dp-pm").classList.toggle("active", pickerAmPm === "PM");
    if ($("dp-hour")) $("dp-hour").value = String(h12);
    if ($("dp-minute")) $("dp-minute").value = String(m);
    updateDeadlinePreview();
}

function getPicker24h() {
    const h12 = parseInt($("dp-hour")?.value) || 12;
    const m = parseInt($("dp-minute")?.value) || 0;
    let h24 = h12 % 12;
    if (pickerAmPm === "PM") h24 += 12;
    return { h24, m };
}

function updateDeadlinePreview() {
    const { h24, m } = getPicker24h();
    if ($("deadline-preview-text")) {
        $("deadline-preview-text").textContent = formatKoreanTime(h24, m);
    }
}

function openDeadlineModal() {
    initDeadlinePickerOptions();
    const existing = $("q-time")?.value;
    if (existing && existing.includes(":")) {
        const [h, m] = existing.split(":").map(Number);
        setPickerFrom24h(h, m);
    } else {
        const d = new Date(Date.now() + 60 * 60 * 1000);
        const now = new Date();
        let h = d.getHours();
        let m = Math.ceil(d.getMinutes() / 5) * 5;
        if (m >= 60) { m = 0; h += 1; }
        if (d.getDate() !== now.getDate() || h >= 24) { h = 23; m = 59; }
        setPickerFrom24h(h, m);
    }
    if ($("deadline-modal")) $("deadline-modal").style.display = "flex";
    triggerHaptic("light");
}

function closeDeadlineModal() {
    if ($("deadline-modal")) $("deadline-modal").style.display = "none";
}

function setPickerAmPm(val) {
    pickerAmPm = val;
    if ($("dp-am")) $("dp-am").classList.toggle("active", val === "AM");
    if ($("dp-pm")) $("dp-pm").classList.toggle("active", val === "PM");
    triggerHaptic("light");
    updateDeadlinePreview();
}

function stepPickerHour(delta) {
    const hourSel = $("dp-hour");
    if (!hourSel) return;
    let h = (parseInt(hourSel.value) || 12) + delta;
    if (h > 12) h = 1;
    if (h < 1) h = 12;
    hourSel.value = String(h);
    triggerHaptic("light");
    updateDeadlinePreview();
}

function stepPickerMinute(delta) {
    const minSel = $("dp-minute");
    if (!minSel) return;
    let m = (parseInt(minSel.value) || 0) + delta;
    if (m >= 60) m = m % 60;
    if (m < 0) m = (60 + (m % 60)) % 60;
    minSel.value = String(m);
    triggerHaptic("light");
    updateDeadlinePreview();
}

function onPickerSelectChange() {
    updateDeadlinePreview();
}

function commitDeadline24h(h24, m) {
    const val = `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if ($("q-time")) $("q-time").value = val;
    const btn = $("deadline-trigger-btn");
    if (btn) {
        btn.classList.add("has-value");
        btn.innerHTML = `<span>⏰ ${formatKoreanTime(h24, m)}</span>`;
    }
    if ($("deadline-clear-btn")) $("deadline-clear-btn").style.display = "inline-flex";
    closeDeadlineModal();
    triggerHaptic("light");
}

function applyQuickDeadlineMinutes(mins) {
    const now = new Date();
    const target = new Date(now.getTime() + mins * 60 * 1000);
    if (target.getDate() !== now.getDate()) {
        commitDeadline24h(23, 59);
    } else {
        commitDeadline24h(target.getHours(), target.getMinutes());
    }
}

function applyFixedClockDeadline(h24, m) {
    commitDeadline24h(h24, m);
}

function confirmDeadlineTime() {
    const { h24, m } = getPicker24h();
    commitDeadline24h(h24, m);
}

function clearDeadlineTime(silent = false) {
    if ($("q-time")) $("q-time").value = "";
    const btn = $("deadline-trigger-btn");
    if (btn) {
        btn.classList.remove("has-value");
        btn.innerHTML = `<span>⏰ 마감 설정</span>`;
    }
    if ($("deadline-clear-btn")) $("deadline-clear-btn").style.display = "none";
    if (!silent) triggerHaptic("light");
}

function clearDeadlineFromModal() {
    clearDeadlineTime();
    closeDeadlineModal();
}

async function deleteAccount() {
    if (!currentUser) {
        const ok = await iosConfirm("게스트 데이터를 모두 삭제하고 처음 화면으로 돌아갈까요?", {
            title: "게스트 데이터 삭제",
            confirmText: "삭제",
            cancelText: "취소",
            destructive: true
        });
        if (ok) { localStorage.clear(); location.reload(); }
        return;
    }

    const ok = await iosConfirm("계정과 모든 게임 데이터가 영구 삭제되며 복구할 수 없습니다.", {
        title: "계정 영구 삭제",
        confirmText: "계속",
        cancelText: "취소",
        destructive: true
    });
    if (!ok) return;

    const typed = await iosPrompt("확인을 위해 아래에 '삭제'를 입력해 주세요.", {
        title: "최종 확인",
        placeholder: "삭제",
        confirmText: "영구 삭제",
        cancelText: "취소",
        destructive: true
    });
    if (typed !== "삭제") return;

    try {
        await db.collection("users").doc(currentUser.uid).delete();
        await currentUser.delete();
        await iosAlert("계정이 영구 삭제되었습니다.", "삭제 완료");
        location.reload();
    } catch (_) {
        await iosAlert("보안을 위해 다시 로그인한 후 시도해 주세요.", "재로그인 필요");
        auth.signOut();
    }
}

function openNoticeModal() {
    const noticeModal = $("notice-modal");
    if (noticeModal) noticeModal.style.display = "flex";
}

function closeNotice() {
    const noticeModal = $("notice-modal");
    if (noticeModal) noticeModal.style.display = "none";
}

/* =========================================
   Expenses Tab: Things to Buy & Fixed Expenses
   ========================================= */
function getCurrentYearMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function switchExpenseTab(subTab) {
    currentExpenseTab = subTab;
    triggerHaptic("light");
    if ($("btn-exp-buy")) $("btn-exp-buy").classList.toggle("active", subTab === "buy");
    if ($("btn-exp-fixed")) $("btn-exp-fixed").classList.toggle("active", subTab === "fixed");
    if ($("expense-panel-buy")) $("expense-panel-buy").style.display = subTab === "buy" ? "block" : "none";
    if ($("expense-panel-fixed")) $("expense-panel-fixed").style.display = subTab === "fixed" ? "block" : "none";
}

function addBuyItem() {
    const name = $("buy-name-input").value.trim();
    const price = Math.max(0, parseInt($("buy-price-input").value) || 0);
    if (!name) return;

    state.buyList.unshift({
        id: createId(),
        name,
        price,
        isChecked: false
    });
    $("buy-name-input").value = "";
    $("buy-price-input").value = "";
    triggerHaptic("light");
    updateUI();
    saveData();
    showToast("사야 할 목록에 추가했습니다");
}

function toggleBuyItem(id) {
    const item = state.buyList.find(i => String(i.id) === String(id));
    if (!item) return;
    item.isChecked = !item.isChecked;
    triggerHaptic("light");
    updateUI();
    saveData();
}

function deleteBuyItem(id) {
    state.buyList = state.buyList.filter(i => String(i.id) !== String(id));
    triggerHaptic("light");
    updateUI();
    saveData();
}

async function clearCompletedBuyItems() {
    const doneCount = state.buyList.filter(i => i.isChecked).length;
    if (!doneCount) return;

    const ok = await iosConfirm(`구매 완료된 ${doneCount}개 항목을 목록에서 삭제할까요?`, {
        title: "완료 항목 정리",
        confirmText: "삭제",
        cancelText: "취소",
        destructive: true
    });
    if (!ok) return;

    state.buyList = state.buyList.filter(i => !i.isChecked);
    triggerHaptic("light");
    updateUI();
    saveData();
    showToast("완료된 구매 항목을 정리했습니다");
}

function renderBuyList() {
    const list = $("buy-list");
    if (!list) return;

    const remaining = state.buyList.filter(i => !i.isChecked);
    const completed = state.buyList.filter(i => i.isChecked);
    const remainingTotal = remaining.reduce((sum, i) => sum + (i.price || 0), 0);

    if ($("buy-remaining-count")) $("buy-remaining-count").textContent = remaining.length;
    if ($("buy-total-amount")) $("buy-total-amount").textContent = remainingTotal.toLocaleString();
    if ($("buy-count-badge")) $("buy-count-badge").textContent = `${state.buyList.length}개`;
    if ($("buy-clear-done-btn")) $("buy-clear-done-btn").style.display = completed.length > 0 ? "inline-block" : "none";

    list.replaceChildren();
    if (!state.buyList.length) {
        list.innerHTML = `
            <div class="ios-empty-state">
                <div class="ios-empty-icon">🛒</div>
                <div>사야 할 물건이 없습니다.<br>생필품이나 쇼핑 예정 항목을 적어 두세요.</div>
            </div>`;
        return;
    }

    const ordered = [...remaining, ...completed];
    ordered.forEach(item => {
        const row = document.createElement("div");
        row.className = "expense-row" + (item.isChecked ? " checked" : "");

        const checkBtn = document.createElement("button");
        checkBtn.type = "button";
        checkBtn.className = "ios-check-circle";
        checkBtn.setAttribute("aria-label", "구매 완료 체크");
        checkBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        checkBtn.addEventListener("click", () => toggleBuyItem(item.id));

        const body = document.createElement("div");
        body.className = "expense-body";
        body.addEventListener("click", () => toggleBuyItem(item.id));
        body.innerHTML = `<div class="expense-title">${escapeHtml(item.name)}</div>`;

        const right = document.createElement("div");
        right.className = "expense-right";

        if (item.price > 0) {
            const priceSpan = document.createElement("span");
            priceSpan.className = "expense-price-text";
            priceSpan.textContent = `${item.price.toLocaleString()}원`;
            right.appendChild(priceSpan);
        }

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "ios-row-del-btn";
        delBtn.setAttribute("aria-label", "항목 삭제");
        delBtn.textContent = "×";
        delBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            deleteBuyItem(item.id);
        });

        right.appendChild(delBtn);
        row.append(checkBtn, body, right);
        list.appendChild(row);
    });
}

async function addFixedExpense() {
    const name = $("fixed-name-input").value.trim();
    const amount = parseInt($("fixed-amount-input").value) || 0;
    const rawDay = $("fixed-day-input").value.trim();
    let day = null;

    if (!name || amount <= 0) {
        await iosAlert("고정지출 항목명과 월 금액을 입력해 주세요.", "입력 확인");
        return;
    }

    if (rawDay !== "") {
        const parsed = parseInt(rawDay);
        if (isNaN(parsed) || parsed < 1 || parsed > 31) {
            await iosAlert("결제일은 1일부터 31일 사이의 숫자로 입력해 주세요.", "결제일 확인");
            return;
        }
        day = parsed;
    }

    state.fixedExpenses.push({
        id: createId(),
        name,
        amount,
        day,
        lastPaidMonth: null
    });

    $("fixed-name-input").value = "";
    $("fixed-amount-input").value = "";
    $("fixed-day-input").value = "";

    triggerHaptic("light");
    updateUI();
    saveData();
    showToast("고정지출이 등록되었습니다");
}

function toggleFixedExpensePaid(id) {
    const item = state.fixedExpenses.find(i => String(i.id) === String(id));
    if (!item) return;
    const ym = getCurrentYearMonth();
    item.lastPaidMonth = item.lastPaidMonth === ym ? null : ym;
    triggerHaptic("light");
    updateUI();
    saveData();
}

async function deleteFixedExpense(id) {
    const ok = await iosConfirm("이 고정지출 항목을 삭제할까요?", {
        title: "고정지출 삭제",
        confirmText: "삭제",
        cancelText: "취소",
        destructive: true
    });
    if (!ok) return;

    state.fixedExpenses = state.fixedExpenses.filter(i => String(i.id) !== String(id));
    triggerHaptic("light");
    updateUI();
    saveData();
}

function renderFixedExpenses() {
    const list = $("fixed-list");
    if (!list) return;

    const ym = getCurrentYearMonth();
    const monthLabel = `${new Date().getMonth() + 1}월 기준`;

    const total = state.fixedExpenses.reduce((sum, i) => sum + i.amount, 0);
    const paid = state.fixedExpenses
        .filter(i => i.lastPaidMonth === ym)
        .reduce((sum, i) => sum + i.amount, 0);
    const unpaid = Math.max(0, total - paid);

    if ($("fixed-month-badge")) $("fixed-month-badge").textContent = monthLabel;
    if ($("fixed-total-amount")) $("fixed-total-amount").textContent = total.toLocaleString();
    if ($("fixed-paid-amount")) $("fixed-paid-amount").textContent = `${paid.toLocaleString()}원`;
    if ($("fixed-unpaid-amount")) $("fixed-unpaid-amount").textContent = `${unpaid.toLocaleString()}원`;
    if ($("fixed-count-badge")) $("fixed-count-badge").textContent = `${state.fixedExpenses.length}건`;

    list.replaceChildren();
    if (!state.fixedExpenses.length) {
        list.innerHTML = `
            <div class="ios-empty-state">
                <div class="ios-empty-icon">💳</div>
                <div>등록된 고정지출이 없습니다.<br>월세, 통신비, 구독료 등을 등록해 한눈에 관리하세요.</div>
            </div>`;
        return;
    }

    const sorted = [...state.fixedExpenses].sort((a, b) => {
        const da = a.day || 99;
        const dbDay = b.day || 99;
        return da - dbDay;
    });

    sorted.forEach(item => {
        const isPaid = item.lastPaidMonth === ym;
        const row = document.createElement("div");
        row.className = "expense-row" + (isPaid ? " checked" : "");

        const checkBtn = document.createElement("button");
        checkBtn.type = "button";
        checkBtn.className = "ios-check-circle";
        checkBtn.setAttribute("aria-label", "이번 달 납부 완료 체크");
        checkBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        checkBtn.addEventListener("click", () => toggleFixedExpensePaid(item.id));

        const body = document.createElement("div");
        body.className = "expense-body";
        body.addEventListener("click", () => toggleFixedExpensePaid(item.id));

        const dayLabel = item.day ? `매월 ${item.day}일` : "매월 정기";
        const paidBadge = isPaid ? `<span class="expense-paid-chip">납부 완료</span>` : "";
        body.innerHTML = `
            <div class="expense-title">${escapeHtml(item.name)}</div>
            <div class="expense-sub">
                <span class="expense-day-chip">${dayLabel}</span>
                ${paidBadge}
            </div>
        `;

        const right = document.createElement("div");
        right.className = "expense-right";

        const priceSpan = document.createElement("span");
        priceSpan.className = "expense-price-text";
        priceSpan.textContent = `${item.amount.toLocaleString()}원`;

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "ios-row-del-btn";
        delBtn.setAttribute("aria-label", "고정지출 삭제");
        delBtn.textContent = "×";
        delBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            deleteFixedExpense(item.id);
        });

        right.append(priceSpan, delBtn);
        row.append(checkBtn, body, right);
        list.appendChild(row);
    });
}
