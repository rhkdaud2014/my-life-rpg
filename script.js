const STORAGE_KEY = "lifeRPG_v4";
const LEGACY_STORAGE_KEYS = ["lifeRPG_v3"];
const MAX_LEVEL = 999;
const MAX_GOLD = 9999999;
const MAX_TEXT_LENGTH = 80;
const TAB_LABELS = {
    daily: "일간",
    weekly: "주간",
    monthly: "월간"
};
const DIFFICULTY_CONFIG = {
    easy: { label: "쉬움", exp: 10, gold: 20 },
    normal: { label: "보통", exp: 30, gold: 60 },
    hard: { label: "어려움", exp: 100, gold: 200 }
};
const rewardSuggestions = [
    { name: "🚶 30분 산책", price: 200 },
    { name: "🥤 좋아하는 음료 한 잔", price: 150 },
    { name: "🍰 작은 디저트", price: 100 },
    { name: "🎮 게임 자유 시간 3시간", price: 400 },
    { name: "😴 낮잠 1시간", price: 500 },
    { name: "🍽️ 맛있는 외식", price: 2000 },
    { name: "🛵 배달 음식", price: 1200 },
    { name: "🎬 보고 싶던 영화 보기", price: 1000 },
    { name: "🛒 장바구니 아이템 결제", price: 5000 },
    { name: "☕ 카페 디저트", price: 350 },
    { name: "🛌 하루 종일 푹 쉬기", price: 3000 },
    { name: "🎨 취미 용품 구매", price: 250 }
];

let state = createDefaultState();

window.addEventListener("DOMContentLoaded", () => {
    loadState();
    bindEvents();
    updateUI();
});

function createDefaultState() {
    return {
        name: "플레이어",
        bio: "인생 RPG 시작!",
        lv: 1,
        exp: 0,
        gold: 0,
        quests: [],
        shopItems: [],
        currentTab: "daily"
    };
}

function bindEvents() {
    document.getElementById("reset-btn").addEventListener("click", resetGame);
    document.getElementById("profile-edit-toggle").addEventListener("click", toggleProfileEdit);
    document.getElementById("profile-save-btn").addEventListener("click", saveProfile);
    document.getElementById("add-quest-btn").addEventListener("click", addQuest);
    document.getElementById("suggest-reward-btn").addEventListener("click", suggestReward);
    document.getElementById("add-shop-btn").addEventListener("click", addShopItem);
    document.getElementById("q-input").addEventListener("keydown", handleQuestInputKeydown);
    document.getElementById("s-price").addEventListener("keydown", handleShopInputKeydown);
    document.querySelectorAll(".tab-btn").forEach((button) => {
        button.addEventListener("click", () => setTab(button.dataset.tab));
    });
    document.getElementById("q-list").addEventListener("click", handleQuestListClick);
    document.getElementById("s-list").addEventListener("click", handleShopListClick);
}

function handleQuestInputKeydown(event) {
    if (event.key === "Enter") {
        addQuest();
    }
}

function handleShopInputKeydown(event) {
    if (event.key === "Enter") {
        addShopItem();
    }
}

function handleQuestListClick(event) {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
        return;
    }

    const questId = Number.parseInt(actionTarget.dataset.id, 10);
    if (!Number.isSafeInteger(questId)) {
        return;
    }

    if (actionTarget.dataset.action === "complete") {
        completeQuest(questId);
        return;
    }

    if (actionTarget.dataset.action === "delete") {
        deleteQuest(questId);
    }
}

function handleShopListClick(event) {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
        return;
    }

    const itemId = Number.parseInt(actionTarget.dataset.id, 10);
    if (!Number.isSafeInteger(itemId)) {
        return;
    }

    if (actionTarget.dataset.action === "buy") {
        buyItem(itemId);
        return;
    }

    if (actionTarget.dataset.action === "delete") {
        deleteShopItem(itemId);
    }
}

function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY) ?? getLegacySavedState();
    if (!saved) {
        return;
    }

    try {
        const parsed = JSON.parse(saved);
        state = sanitizeState(parsed);
        save();
    } catch (error) {
        console.warn("저장된 데이터를 읽지 못해 기본 상태로 복구합니다.", error);
        state = createDefaultState();
        save();
    }
}

function getLegacySavedState() {
    for (const key of LEGACY_STORAGE_KEYS) {
        const saved = localStorage.getItem(key);
        if (saved) {
            return saved;
        }
    }

    return null;
}

function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function sanitizeState(raw) {
    const base = createDefaultState();
    if (!raw || typeof raw !== "object") {
        return base;
    }

    return {
        name: sanitizeText(raw.name, 24, base.name),
        bio: sanitizeText(raw.bio, MAX_TEXT_LENGTH, base.bio),
        lv: clampInteger(raw.lv, 1, MAX_LEVEL, base.lv),
        exp: clampInteger(raw.exp, 0, 99, base.exp),
        gold: clampInteger(raw.gold, 0, MAX_GOLD, base.gold),
        quests: sanitizeQuestList(raw.quests),
        shopItems: sanitizeShopItems(raw.shopItems),
        currentTab: TAB_LABELS[raw.currentTab] ? raw.currentTab : base.currentTab
    };
}

function sanitizeQuestList(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw
        .map((quest) => {
            if (!quest || typeof quest !== "object") {
                return null;
            }

            const difficulty = DIFFICULTY_CONFIG[quest.diff] ? quest.diff : "easy";
            return {
                id: normalizeId(quest.id),
                text: sanitizeText(quest.text, MAX_TEXT_LENGTH, ""),
                diff: difficulty,
                tab: TAB_LABELS[quest.tab] ? quest.tab : "daily",
                exp: DIFFICULTY_CONFIG[difficulty].exp,
                gold: DIFFICULTY_CONFIG[difficulty].gold
            };
        })
        .filter((quest) => quest && quest.text);
}

function sanitizeShopItems(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw
        .map((item) => {
            if (!item || typeof item !== "object") {
                return null;
            }

            return {
                id: normalizeId(item.id),
                name: sanitizeText(item.name, MAX_TEXT_LENGTH, ""),
                price: clampInteger(item.price, 1, MAX_GOLD, 1)
            };
        })
        .filter((item) => item && item.name);
}

function normalizeId(value) {
    const candidate = Number.parseInt(value, 10);
    if (Number.isSafeInteger(candidate) && candidate > 0) {
        return candidate;
    }

    return Date.now() + Math.floor(Math.random() * 1000);
}

function sanitizeText(value, maxLength, fallback = "") {
    if (typeof value !== "string") {
        return fallback;
    }

    const compact = value.replace(/\s+/g, " ").trim();
    if (!compact) {
        return fallback;
    }

    return compact.slice(0, maxLength);
}

function clampInteger(value, min, max, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.min(max, Math.max(min, parsed));
}

function updateUI() {
    document.getElementById("p-name").innerText = `Lv. ${state.name}`;
    document.getElementById("p-bio").innerText = state.bio;
    document.getElementById("edit-name").value = state.name;
    document.getElementById("edit-bio").value = state.bio;
    document.getElementById("lv").innerText = String(state.lv);
    document.getElementById("gold").innerText = String(state.gold);
    document.getElementById("exp-bar").style.width = `${state.exp}%`;
    updateTabButtons();
    renderQuests();
    renderShop();
    updateRankDisplay();
}

function updateTabButtons() {
    document.querySelectorAll(".tab-btn").forEach((button) => {
        const isActive = button.dataset.tab === state.currentTab;
        button.classList.toggle("active", isActive);
    });
}

function suggestReward() {
    const random = rewardSuggestions[Math.floor(Math.random() * rewardSuggestions.length)];
    document.getElementById("s-input").value = random.name;
    document.getElementById("s-price").value = String(random.price);
}

function toggleProfileEdit() {
    const view = document.getElementById("profile-view");
    const edit = document.getElementById("profile-edit");
    const shouldEdit = edit.style.display === "none";

    view.style.display = shouldEdit ? "none" : "block";
    edit.style.display = shouldEdit ? "block" : "none";
}

function saveProfile() {
    const nextName = sanitizeText(document.getElementById("edit-name").value, 24, state.name);
    const nextBio = sanitizeText(document.getElementById("edit-bio").value, MAX_TEXT_LENGTH, state.bio);

    state.name = nextName;
    state.bio = nextBio;
    save();
    updateUI();
    toggleProfileEdit();
}

function setTab(tab) {
    if (!TAB_LABELS[tab]) {
        return;
    }

    state.currentTab = tab;
    save();
    updateUI();
}

function addQuest() {
    const input = document.getElementById("q-input");
    const diff = document.getElementById("q-diff").value;
    const text = sanitizeText(input.value, MAX_TEXT_LENGTH);
    if (!text || !DIFFICULTY_CONFIG[diff]) {
        return;
    }

    const reward = DIFFICULTY_CONFIG[diff];
    state.quests.push({
        id: Date.now(),
        text,
        diff,
        tab: state.currentTab,
        exp: reward.exp,
        gold: reward.gold
    });

    input.value = "";
    save();
    updateUI();
}

function renderQuests() {
    const list = document.getElementById("q-list");
    list.replaceChildren();

    const filtered = state.quests.filter((quest) => quest.tab === state.currentTab);
    if (!filtered.length) {
        list.appendChild(createEmptyMessage("퀘스트가 없습니다."));
        return;
    }

    filtered.forEach((quest) => {
        const row = document.createElement("div");
        row.className = "item-row";

        const content = document.createElement("div");
        content.className = "quest-item-content";

        const textGroup = document.createElement("button");
        textGroup.type = "button";
        textGroup.className = "quest-text-group";
        textGroup.dataset.action = "complete";
        textGroup.dataset.id = String(quest.id);
        textGroup.style.background = "none";
        textGroup.style.border = "none";
        textGroup.style.color = "inherit";
        textGroup.style.padding = "0";
        textGroup.style.textAlign = "left";

        const label = document.createElement("span");
        label.textContent = `[${DIFFICULTY_CONFIG[quest.diff].label}] ${quest.text}`;

        const reward = document.createElement("span");
        reward.textContent = `+${quest.gold}G`;
        reward.style.color = "var(--gold)";
        reward.style.fontSize = "11px";
        reward.style.marginLeft = "8px";

        textGroup.append(label, reward);

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "q-del-btn";
        deleteButton.dataset.action = "delete";
        deleteButton.dataset.id = String(quest.id);
        deleteButton.textContent = "×";
        deleteButton.setAttribute("aria-label", "퀘스트 삭제");

        content.append(textGroup, deleteButton);
        row.appendChild(content);
        list.appendChild(row);
    });
}

function completeQuest(id) {
    const quest = state.quests.find((item) => item.id === id);
    if (!quest) {
        return;
    }

    state.quests = state.quests.filter((item) => item.id !== id);
    state.exp += quest.exp;
    state.gold = clampInteger(state.gold + quest.gold, 0, MAX_GOLD, state.gold);

    while (state.exp >= 100 && state.lv < MAX_LEVEL) {
        state.lv += 1;
        state.exp -= 100;
        alert("LEVEL UP!");
    }

    if (state.lv >= MAX_LEVEL) {
        state.exp = Math.min(state.exp, 99);
    }

    save();
    updateUI();
}

function deleteQuest(id) {
    const exists = state.quests.some((quest) => quest.id === id);
    if (!exists) {
        return;
    }

    if (confirm("이 퀘스트를 삭제할까요?")) {
        state.quests = state.quests.filter((quest) => quest.id !== id);
        save();
        updateUI();
    }
}

function addShopItem() {
    const nameInput = document.getElementById("s-input");
    const priceInput = document.getElementById("s-price");
    const name = sanitizeText(nameInput.value, MAX_TEXT_LENGTH);
    const price = clampInteger(priceInput.value, 1, MAX_GOLD, Number.NaN);

    if (!name || Number.isNaN(price)) {
        return;
    }

    state.shopItems.push({ id: Date.now(), name, price });
    nameInput.value = "";
    priceInput.value = "";
    save();
    updateUI();
}

function renderShop() {
    const list = document.getElementById("s-list");
    list.replaceChildren();

    if (!state.shopItems.length) {
        list.appendChild(createEmptyMessage("보상을 등록해 주세요."));
        return;
    }

    state.shopItems.forEach((item) => {
        const row = document.createElement("div");
        row.className = "item-row";
        row.style.cursor = "default";

        const label = document.createElement("span");
        label.textContent = `${item.name} (${item.price}G)`;

        const actions = document.createElement("div");

        const buyButton = document.createElement("button");
        buyButton.type = "button";
        buyButton.className = "buy-btn";
        buyButton.dataset.action = "buy";
        buyButton.dataset.id = String(item.id);
        buyButton.disabled = state.gold < item.price;
        buyButton.textContent = "구매";

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "q-del-btn";
        deleteButton.dataset.action = "delete";
        deleteButton.dataset.id = String(item.id);
        deleteButton.textContent = "×";
        deleteButton.setAttribute("aria-label", "보상 삭제");

        actions.append(buyButton, deleteButton);
        row.append(label, actions);
        list.appendChild(row);
    });
}

function buyItem(id) {
    const item = state.shopItems.find((entry) => entry.id === id);
    if (!item || state.gold < item.price) {
        return;
    }

    state.gold -= item.price;
    alert(`[${item.price}G] 사용! 보상을 획득했습니다.`);
    save();
    updateUI();
}

function deleteShopItem(id) {
    const exists = state.shopItems.some((item) => item.id === id);
    if (!exists) {
        return;
    }

    state.shopItems = state.shopItems.filter((item) => item.id !== id);
    save();
    updateUI();
}

function updateRankDisplay() {
    const container = document.getElementById("container");
    const rank = document.getElementById("p-rank");
    container.className = "game-container";

    if (state.lv < 10) {
        container.classList.add("rank-f");
        rank.innerText = "RANK: F";
        return;
    }

    if (state.lv < 30) {
        container.classList.add("rank-d");
        rank.innerText = "RANK: D";
        return;
    }

    if (state.lv < 60) {
        container.classList.add("rank-b");
        rank.innerText = "RANK: B";
        return;
    }

    container.classList.add("rank-s");
    rank.innerText = "RANK: S";
}

function resetGame() {
    if (confirm("데이터를 초기화할까요?")) {
        localStorage.removeItem(STORAGE_KEY);
        LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
        state = createDefaultState();
        updateUI();
        toggleProfileEditIfNeeded();
    }
}

function toggleProfileEditIfNeeded() {
    const edit = document.getElementById("profile-edit");
    if (edit.style.display !== "none") {
        toggleProfileEdit();
    }
}

function createEmptyMessage(message) {
    const empty = document.createElement("p");
    empty.textContent = message;
    empty.style.textAlign = "center";
    empty.style.fontSize = "12px";
    empty.style.color = "#555";
    return empty;
}
