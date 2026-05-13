const firebaseConfig = {
    apiKey: "AIzaSyCaZuvX6w6mNTllo8V9RZobN7yJkfWOvUE",
    authDomain: "my-life-rpg-35d7a.firebaseapp.com",
    projectId: "my-life-rpg-35d7a",
    storageBucket: "my-life-rpg-35d7a.firebasestorage.app",
    messagingSenderId: "394166677930",
    appId: "1:394166677930:web:6e74c380b63659e3947bd3"
};

// 🌟 주/월 통합
const TABS = { daily: "일간", weekly: "주/월", yearly: "연간" };

const DIFFICULTY_BY_TAB = {
    [TABS.daily]: { label: "쉬움", exp: 10, gold: 50 },
    [TABS.weekly]: { label: "보통", exp: 50, gold: 350 },
    [TABS.yearly]: { label: "어려움", exp: 200, gold: 2000 }
};

const LEGACY_TABS = {
    "주간": TABS.weekly, "월간": TABS.weekly, "주/월": TABS.weekly,
    "daily": TABS.daily, "weekly": TABS.weekly, "yearly": TABS.yearly,
    "일간": TABS.daily, "연간": TABS.yearly
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

    // 🔥 꿀팁 1: 오프라인 모드 활성화 (인터넷 끊겨도 작동하게 함)
    db.enablePersistence()
        .catch(function (err) {
            console.warn("오프라인 모드 활성화 실패 (인터넷 연결 시 자동 동기화됨):", err.code);
        });

    handleRedirectResult();

    if (localStorage.getItem('lifeRpgIsGuest') === 'true') {
        startGuestMode(); return;
    }

    auth.onAuthStateChanged(user => {
        currentUser = user;
        if (user) {
            // 🔥 꿀팁 2: 게스트 데이터가 있는지 확인하고 연동 프로세스 진행
            const isGuestToReal = localStorage.getItem('lifeRpgIsGuest') === 'true';
            const guestDataStr = localStorage.getItem('lifeRpgGuestData');

            isGuestMode = false;
            $("auth-section").style.display = "none";
            $("main-game").style.display = "block";

            // 게스트 데이터가 남아있다면 계정에 덮어씌울지 묻기
            if (isGuestToReal && guestDataStr) {
                if (confirm("게스트 모드에서 플레이한 데이터를 구글 계정에 연동하시겠습니까?\n(취소 시 기존 구글 계정 데이터를 불러옵니다.)")) {
                    try {
                        state = normalizeState(JSON.parse(guestDataStr));
                        saveData(); // 파이어베이스에 게스트 데이터 저장!
                        alert("데이터가 성공적으로 구글 계정에 연동되었습니다!");
                    } catch (e) { console.error(e); }
                }
                // 연동 여부와 상관없이 게스트 흔적은 지워줌
                localStorage.removeItem('lifeRpgIsGuest');
                localStorage.removeItem('lifeRpgGuestData');

                checkAndResetQuests(); updateUI(); return;
            }

            // 게스트 연동이 아니면 정상적으로 서버에서 내 데이터 불러오기
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
    // 🌟 아이폰 웹앱(PWA)에서 메모리가 날아가는 현상을 방지하기 위해 조건문 삭제!
    try {
        const result = await auth.getRedirectResult();
        if (result && result.user) {
            console.log("리다이렉트 로그인 성공!");
            // 결과가 성공적이면 onAuthStateChanged가 알아서 게임 화면으로 넘겨줍니다.
        }
    } catch (err) {
        console.error("리다이렉트 로그인 에러:", err);
        showAuthMessage("로그인 처리 중 에러가 발생했습니다.");
    }
}

function loginWithGoogle() {
    // 🌟 1. 버튼을 눌렀는지 알 수 있게 즉시 글씨를 띄워줍니다!
    showAuthMessage("구글 연결 중... 화면이 넘어갑니다 🚀");

    const isNative = typeof window !== 'undefined' && 
                     window.Capacitor && 
                     window.Capacitor.isNativePlatform && 
                     window.Capacitor.isNativePlatform();

    if (isNative) {
        // 네이티브 앱 환경 (비동기 허용됨)
        (async () => {
            try {
                await Capacitor.Plugins.GoogleAuth.initialize({
                    clientId: "394166677930-p5mc4l5d32ef7rf9hrergbjkl657inmm.apps.googleusercontent.com",
                    scopes: ['profile', 'email'],
                    grantOfflineAccess: true
                });
                const googleUser = await Capacitor.Plugins.GoogleAuth.signIn();
                const credential = firebase.auth.GoogleAuthProvider.credential(googleUser.authentication.idToken);
                await firebase.auth().signInWithCredential(credential);
            } catch (error) {
                showAuthMessage("로그인 실패: " + error.message);
            }
        })();
    } else {
        // 🌟 2. 웹 / 아이폰 웹앱 환경 (지연 없이 즉시 실행!)
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: "select_account" });

            const isMobileWeb = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

            if (isMobileWeb) {
                // 아이폰은 팝업 대신 무조건 페이지 이동! (await 없이 즉시 쏴버림)
                sessionStorage.setItem(AUTH_REDIRECT_PENDING_KEY, "1");
                firebase.auth().signInWithRedirect(provider);
            } else {
                // PC는 기존처럼 팝업
                firebase.auth().signInWithPopup(provider).catch(err => {
                    showAuthMessage("로그인 창 띄우기 실패: " + err.message);
                });
            }
        } catch (err) {
            showAuthMessage("에러 발생: " + err.message);
        }
    }
}

function startGuestModeWithWarning() {
    if (confirm("⚠️ 게스트 모드는 기기 변경/앱 삭제 시 데이터가 날아갑니다. (나중에 구글 로그인 시 연동 가능) 시작할까요?")) startGuestMode();
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
        isRepeat: !!quest.isRepeat,
        deadline: quest.deadline || null // 🌟 이 한 줄이 빠져서 타이머가 증발하고 있었습니다!
    };
}

function normalizeShopItem(item) {
    if (!item || !item.name || !item.price) return null;
    return { id: item.id || createId(), name: String(item.name).trim(), price: parseInt(item.price) };
}

function updateUI() {
    state = normalizeState(state);

    if ($("p-name")) $("p-name").innerText = state.name;
    if ($("p-bio")) $("p-bio").innerText = state.bio;
    if ($("lv")) $("lv").innerText = state.lv;
    if ($("gold")) $("gold").innerText = state.gold;
    if ($("exp-bar")) $("exp-bar").style.width = `${state.exp}%`;
    if ($("exp-text")) $("exp-text").innerText = `${state.exp}% (${state.exp}/100)`;
    if ($("q-diff")) $("q-diff").value = DIFFICULTY_BY_TAB[state.currentTab].label;

    // 🌟 주/월, 연간 탭에서 타이머 상자를 깔끔하게 숨겨주는 마법의 코드!
    if ($("timer-ui-container")) {
        $("timer-ui-container").style.display = (state.currentTab === TABS.daily) ? "flex" : "none";
    }

    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.toggle("active", btn.textContent.trim() === state.currentTab));
    updateGuestNotice();
    renderQuests();
    renderShop();
    updateRankDisplay();
    checkIfRanker();
}

function addHistory(msg) {
    const today = new Date();
    const timeStr = `${today.getMonth() + 1}/${today.getDate()} ${today.getHours().toString().padStart(2, '0')}:${today.getMinutes().toString().padStart(2, '0')}`;
    state.history.unshift({ time: timeStr, msg: msg });
    if (state.history.length > 50) state.history.pop();
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

    let deadline = null;

    // 🌟 현재 탭이 '일간'일 때만 마감 시간을 계산해서 넣습니다!
    if (state.currentTab === TABS.daily && $("q-ampm")) {
        const ampm = $("q-ampm").value;
        if (ampm) {
            let hour = parseInt($("q-hour").value);
            const minute = parseInt($("q-minute").value);

            if (ampm === "PM" && hour < 12) hour += 12;
            if (ampm === "AM" && hour === 12) hour = 0;

            const targetDate = new Date();
            targetDate.setHours(hour, minute, 0, 0);

            if (targetDate.getTime() < Date.now()) {
                if (!confirm("이미 지난 시간입니다. 그래도 추가할까요?")) return;
            }
            deadline = targetDate.getTime();
        }
    }

    const reward = DIFFICULTY_BY_TAB[state.currentTab];
    state.quests.push({
        id: createId(), text, diff: reward.label, tab: state.currentTab,
        exp: reward.exp, gold: reward.gold, isCompleted: false, isRepeat: isRepeatMode,
        deadline: deadline
    });

    isRepeatMode = false;
    $("q-repeat-btn").innerText = "1회성";
    $("q-repeat-btn").style.cssText = "flex: 0 0 65px; background:transparent; border:1px solid var(--border); color:#a1a1aa; border-radius:12px; font-size:12px; padding:0; transition:0.2s;";

    $("q-input").value = "";
    if ($("q-ampm")) { $("q-ampm").value = ""; toggleTimeSelects(); }

    updateUI(); saveData();
}

// 🌟 1회성 퀘스트 즉시 삭제 및 레벨업 로직
function completeQuest(id) {
    const quest = state.quests.find(q => String(q.id) === String(id));
    if (!quest || quest.isCompleted) return;

    quest.isCompleted = true;
    state.exp += quest.exp; state.gold += quest.gold;
    addHistory(`[도전 성공] ${quest.text} (+${quest.exp}EXP, +${quest.gold}G)`);

    let isLeveledUp = false; 

    while (state.exp >= 100) {
        state.lv += 1; state.exp -= 100;
        addHistory(`🎉 레벨업! Lv.${state.lv} 달성!`);
        isLeveledUp = true; 
        // 🗑️ 기존에 있던 alert(`LEVEL UP! Lv.${state.lv}`); 부분은 완전히 삭제되었습니다!
    }

    if (!quest.isRepeat) {
        state.quests = state.quests.filter(q => String(q.id) !== String(id));
    }

    updateUI(); saveData();

    // 🌟 경험치 적용 후 애니메이션 및 진동 팝업 실행
    if (isLeveledUp) {
        const lvElement = $("lv"); 
        if (lvElement) {
            lvElement.classList.add("level-up-anim"); 
            setTimeout(() => { lvElement.classList.remove("level-up-anim"); }, 800);
        }
        
        // 🌟 새로운 고급 팝업 호출!
        showLevelUpUI(state.lv);
    }
}

// 🌟 화면 정중앙에 화려한 레벨업 UI를 띄우고 진동을 울리는 함수
function showLevelUpUI(newLevel) {
    // 1. 스마트폰 진동 효과 (징- 징-)
    // 기기에서 진동 API를 지원하는 경우 200ms 진동 -> 100ms 대기 -> 200ms 진동
    if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
    }
    
    // 2. 화면 전체를 덮는 모달 생성
    let overlay = $("levelup-overlay");
    if (!overlay) {
        // HTML에 직접 쓰지 않아도 자바스크립트가 알아서 예쁜 화면을 뚝딱 만들어냅니다!
        overlay = document.createElement("div");
        overlay.id = "levelup-overlay";
        overlay.className = "levelup-bg";
        overlay.innerHTML = `
            <div class="levelup-content">
                <div style="font-size:70px; margin-bottom:5px; text-shadow: 0px 5px 15px rgba(0,0,0,0.5);">✨🏆✨</div>
                <h2 class="levelup-title">LEVEL UP!</h2>
                <div id="levelup-text" class="levelup-desc">Lv. ${newLevel} 달성</div>
            </div>
        `;
        document.body.appendChild(overlay);
    } else {
        $("levelup-text").innerText = `Lv. ${newLevel} 달성`;
    }
    
    overlay.style.display = "flex";

    // 3. 2.5초 뒤에 모달이 스르륵 사라지며 게임으로 복귀
    setTimeout(() => {
        overlay.style.display = "none";
    }, 2500);
}

function deleteQuest(id) {
    if (!confirm("목록에서 완전히 삭제할까요?")) return;
    state.quests = state.quests.filter(q => String(q.id) !== String(id));
    updateUI(); saveData();
}

function renderQuests() {
    const list = $("q-list");
    if (!list) return;

    const filtered = state.quests.filter(q => q.tab === state.currentTab);
    list.innerHTML = ""; 

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

        // 왼쪽: 퀘스트 내용과 타이머 묶음
        const content = document.createElement("div");
        content.style.cssText = "flex: 1; cursor: pointer; display: flex; flex-direction: column; justify-content: center; padding-right: 15px;";
        content.addEventListener("click", () => { if(!quest.isCompleted) completeQuest(quest.id); });

        // 1. 퀘스트 텍스트 & 난이도 뱃지
        const textDiv = document.createElement("div");
        textDiv.style.cssText = "display: flex; align-items: center; gap: 8px;";
        textDiv.innerHTML = `<span>${quest.text} ${quest.isRepeat ? '🔁' : ''}</span> <span class="diff-badge diff-${quest.diff}">${quest.diff}</span>`;
        if (quest.isCompleted) textDiv.style.textDecoration = "line-through";
        content.appendChild(textDiv);

        // 2. 타이머 텍스트 (일간 탭이고 마감시간이 있을 때만 생성)
        if (quest.deadline && quest.tab === TABS.daily) {
            const timerDiv = document.createElement("div");
            timerDiv.style.cssText = "margin-top: 4px;";
            if (!quest.isCompleted) {
                // 이 'quest-timer' 클래스가 있어야 아래 타이머 엔진이 작동합니다!
                timerDiv.innerHTML = `<span class="quest-timer" data-deadline="${quest.deadline}" style="font-size:11px; color:var(--accent); font-weight:bold;">⏱️ 계산 중...</span>`;
            } else {
                timerDiv.innerHTML = `<span style="font-size:11px; color:var(--green); font-weight:bold;">✅ 달성 완료!</span>`;
            }
            content.appendChild(timerDiv);
        }

        // 오른쪽: 골드 보상과 삭제 버튼 묶음
        const rightWrapper = document.createElement("div");
        rightWrapper.style.cssText = "display: flex; align-items: center;";

        const rewardSpan = document.createElement("span");
        rewardSpan.style.cssText = "color:var(--gold); font-size:12px; font-weight:bold;";
        rewardSpan.textContent = `+${quest.gold}G`;

        const delBtn = document.createElement("button");
        delBtn.style.cssText = "background:none; border:none; color:#555; cursor:pointer; font-size: 18px; margin-left: 10px;";
        delBtn.textContent = "×";
        delBtn.addEventListener("click", (e) => { e.stopPropagation(); deleteQuest(quest.id); });

        rightWrapper.appendChild(rewardSpan);
        rightWrapper.appendChild(delBtn);

        // 최종 조립
        row.appendChild(content);
        row.appendChild(rightWrapper);
        list.appendChild(row);
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
        { name: "🎤 코인 노래방 1시간 열창", price: 300 }
    ];
    const r = rewardSuggestions[Math.floor(Math.random() * rewardSuggestions.length)];
    $("s-input").value = r.name; $("s-price").value = r.price;
}

// 🔥 꿀팁 2-1: 게스트 연동 안내 UI 업데이트 함수 수정 (로그인 유도 버튼 추가)
function updateGuestNotice() {
    const n = $("guest-notice");
    if (n) {
        if (isGuestMode) {
            n.style.display = "block";
            // 기존 텍스트를 버튼 형태로 변경하여 로그인을 유도
            n.innerHTML = `<button onclick="loginWithGoogle()" style="width:100%; background:rgba(59, 130, 246, 0.1); border:1px solid var(--accent); color:var(--accent); padding:10px; border-radius:8px; font-size:13px; font-weight:bold; cursor:pointer;">⚠️ 현재 게스트 모드입니다.<br/>여기를 눌러 구글 로그인하고 데이터 보존하기!</button>`;
        } else {
            n.style.display = "none";
        }
    }
}

function showAuthMessage(msg) { const m = $("auth-msg"); if (m) m.innerText = msg; }
function createId() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
async function showRanking() {
    if (isGuestMode) {
        alert("🏆 랭킹 시스템은 구글 로그인 후 이용할 수 있습니다!\n로그인하고 다른 플레이어들과 레벨을 경쟁해 보세요.");
        return;
    }
    $("ranking-modal").style.display = "flex";
    $("ranking-list").textContent = "집계 중...";
    if (!db) { $("ranking-list").textContent = "랭킹 불러오기 실패"; return; }
    try {
        const snap = await db.collection("users").orderBy("lv", "desc").limit(10).get();
        $("ranking-list").replaceChildren();
        let r = 1; snap.forEach(doc => {
            const data = normalizeState(doc.data()); const row = document.createElement("div"); row.className = "item-row";
            if (currentUser && doc.id === currentUser.uid) row.style.borderColor = "var(--accent)";
            row.textContent = `${r++}. ${data.name} (Lv.${data.lv})`; $("ranking-list").appendChild(row);
        });
        if (snap.empty) $("ranking-list").textContent = "랭킹 없음";
    } catch (e) { $("ranking-list").textContent = "랭킹 실패"; }
}
function closeRanking() { $("ranking-modal").style.display = "none"; }
async function checkIfRanker() {
    if (isGuestMode || !currentUser || !db) { $("container").classList.remove("ranker-aura"); return; }
    try {
        const snap = await db.collection("users").orderBy("lv", "desc").limit(1).get();
        const top = !snap.empty && snap.docs[0].id === currentUser.uid;
        $("container").classList.toggle("ranker-aura", top);
        if (top) $("p-rank").innerText = "랭킹 1위";
    } catch (e) { }
}
function updateRankDisplay() { $("p-rank").innerText = state.lv < 10 ? "RANK: F" : state.lv < 30 ? "RANK: D" : state.lv < 60 ? "RANK: B" : "RANK: S"; }
async function deleteAccount() {
    if (!currentUser) { if (confirm("초기화할까요?")) { localStorage.clear(); location.reload(); } return; }
    if (!confirm("계정 영구 삭제?")) return; if (prompt("'삭제' 입력") !== "삭제") return;
    try { await db.collection("users").doc(currentUser.uid).delete(); await currentUser.delete(); alert("삭제 완료"); location.reload(); }
    catch (e) { alert("보안을 위해 재로그인 후 시도하세요."); auth.signOut(); }
}

// 1. 퀘스트 추가 시 타이머 설정 (예: 30분)
// 할 일 객체에 deadline 속성 추가: Date.now() + (30 * 60 * 1000)

// 2. 글로벌 타이머 실행 (1초마다 화면 업데이트)
// 🌟 1초마다 화면의 모든 타이머를 찾아내서 남은 시간을 계산하는 엔진
setInterval(() => {
    const timers = document.querySelectorAll('.quest-timer');
    const now = Date.now();

    timers.forEach(el => {
        const deadline = parseInt(el.getAttribute('data-deadline'));
        const timeLeft = deadline - now;

        if (timeLeft <= 0) {
            el.innerHTML = "⏳ 시간 초과!";
            el.style.color = "var(--red)";
        } else {
            // 시간, 분, 초 계산
            const hours = Math.floor(timeLeft / (1000 * 60 * 60));
            const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

            const paddedMins = minutes.toString().padStart(2, '0');
            const paddedSecs = seconds.toString().padStart(2, '0');

            // 1시간 이상 남았으면 시간+분 표시, 그 이하면 분+초 표시
            if (hours > 0) {
                el.innerHTML = `⏱️ ${hours}시간 ${paddedMins}분 남음`;
            } else {
                el.innerHTML = `⏱️ ${paddedMins}분 ${paddedSecs}초 남음`;
            }
        }
    });
}, 1000);
function toggleTimeSelects() {
    const ampm = $("q-ampm").value;
    // 오전이나 오후를 선택하면 시간/분 드롭다운을 보여줌
    $("q-hour").style.display = ampm ? "inline-block" : "none";
    $("q-minute").style.display = ampm ? "inline-block" : "none";
}
