
// 21 H00P L3G37Ds - game.js
// PART 1 — Core Engine, Rendering, Player Movement, Input, Highlight System

// =========================
// GLOBALS & CORE STATE
// =========================

let canvas, ctx;
let lastTime = 0;

// Camera settings
let camZoom = 260;
let camHeight = 160;

// Scores
let scoreA = 0;
let scoreB = 0;

// Highlight system
let highlightMode = false;
let highlightTimer = 0;
let highlightTarget = null;

// Progression
let playerCoins = 0;
let playerXP = 0;
let playerLevel = 1;

// Unlocks
let myUnlockedEmotes = [];
let myUnlockedOutfits = [];
let myUnlockedCourts = [];

// Shop
let currentShopTab = "emotes";

// Daily challenge
let dailyChallenge = {
    type: "score_threes",
    target: 5,
    progress: 0,
    rewardCoins: 50,
    rewardXP: 80,
    date: null
};

// Player build
let playerBuild = {
    name: "MyPlayer",
    appearance: {
        skinTone: 3,
        hairStyle: "short",
        height: 190,
        weight: 200
    },
    attributes: {
        speed: 80,
        shot3: 80,
        shot2: 80,
        dunk: 80,
        defense: 75,
        steal: 75,
        block: 75
    },
    badges: {
        ankleBreaker: 0,
        quickFirstStep: 0,
        rimProtector: 0,
        limitlessRange: 0,
        posterizer: 0,
        clamps: 0,
        deadeye: 0,
        pickPocket: 0,
        dimer: 0,
        greenMachine: 0
    }
};

// Input
let keys = {};
let playerFrozen = false;

// Online
let socket = null;
let myId = null;
let inLobby = false;
let isReady = false;
let remotePlayers = new Map();

// Emotes
let baseEmotes = ["Emote_Clap"]; // free default
let emotePool = []; // will be built from unlocks

// Placeholder player object for logic
let localPlayer = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    width: 30,
    height: 60
};

// =========================
// INITIALIZATION
// =========================

window.addEventListener("load", () => {
    canvas = document.getElementById("gameCanvas");
    ctx = canvas.getContext("2d");
    resizeCanvas();

    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    hookUI();
    loadProgress();
    loadDailyChallenge();
    buildEmotePool();

    // Start at main menu
    showMainMenu();

    // Start loop
    requestAnimationFrame(gameLoop);
});

// =========================
// CANVAS & LOOP
// =========================

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function gameLoop(timestamp) {
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    update(dt);
    render();

    requestAnimationFrame(gameLoop);
}

function update(dt) {
    if (!playerFrozen) {
        updatePlayer(dt);
    }

    if (highlightMode) {
        updateHighlight(dt);
    }
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Simple 2D placeholder court + player
    renderCourt();
    renderPlayers();
}

// =========================
// SIMPLE RENDERING (2D placeholder)
// =========================

function renderCourt() {
    ctx.fillStyle = "#0b3b0b";
    ctx.fillRect(0, canvas.height * 0.2, canvas.width, canvas.height * 0.6);

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.strokeRect(canvas.width * 0.1, canvas.height * 0.25, canvas.width * 0.8, canvas.height * 0.5);
}

function renderPlayers() {
    // Local player
    ctx.fillStyle = "#ffcc00";
    ctx.fillRect(
        canvas.width / 2 + localPlayer.x - localPlayer.width / 2,
        canvas.height / 2 + localPlayer.y - localPlayer.height,
        localPlayer.width,
        localPlayer.height
    );

    // Remote players (simple dots)
    ctx.fillStyle = "#00aaff";
    remotePlayers.forEach(p => {
        ctx.fillRect(
            canvas.width / 2 + p.x - 10,
            canvas.height / 2 + p.y - 20,
            20,
            40
        );
    });
}

// =========================
// PLAYER UPDATE
// =========================

function updatePlayer(dt) {
    const speed = playerBuild.attributes.speed * 0.5;

    let moveX = 0;
    let moveY = 0;

    if (keys["w"]) moveY -= 1;
    if (keys["s"]) moveY += 1;
    if (keys["a"]) moveX -= 1;
    if (keys["d"]) moveX += 1;

    const len = Math.hypot(moveX, moveY);
    if (len > 0) {
        moveX /= len;
        moveY /= len;
    }

    localPlayer.x += moveX * speed * dt;
    localPlayer.y += moveY * speed * dt;

    // Clamp to simple bounds
    localPlayer.x = Math.max(-200, Math.min(200, localPlayer.x));
    localPlayer.y = Math.max(-150, Math.min(150, localPlayer.y));

    // Send position online
    if (socket && myId) {
        socket.emit("move", {
            x: localPlayer.x,
            y: localPlayer.y
        });
    }
}

// =========================
// INPUT
// =========================

function onKeyDown(e) {
    keys[e.key.toLowerCase()] = true;

    // B = emote
    if (e.key.toLowerCase() === "b") {
        triggerManualEmote();
    }

    // Simple shoot / score test (space)
    if (e.key === " ") {
        const isThree = Math.random() < 0.5;
        const team = Math.random() < 0.5 ? "A" : "B";
        awardPoints(isThree, team, { id: myId || "local" });
    }
}

function onKeyUp(e) {
    keys[e.key.toLowerCase()] = false;
}

// =========================
// HIGHLIGHT SYSTEM
// =========================

function startHighlightMoment(scorerEntry) {
    highlightMode = true;
    highlightTimer = 10;
    highlightTarget = scorerEntry;
    playerFrozen = true;
}

function updateHighlight(dt) {
    highlightTimer -= dt;
    if (highlightTimer = 0) {
        highlightMode = false;
        playerFrozen = false;
        startNextPossession();
    }
}

// ======================================================
// PART 2 — UI FLOW, MENUS, PLAYER CREATOR, SETTINGS
// ======================================================

// =========================
// UI FLOW
// =========================

function hookUI() {
    const playNowBtn = document.getElementById("playNowBtn");
    const onlineBtn = document.getElementById("onlineBtn");
    const shopBtn = document.getElementById("shopBtn");
    const settingsBtn = document.getElementById("settingsBtn");

    const playBtn = document.getElementById("playBtn");
    const backToMenuFromCreator = document.getElementById("backToMenuFromCreator");

    const closeSettings = document.getElementById("closeSettings");
    const closeShopBtn = document.getElementById("closeShopBtn");

    const readyBtn = document.getElementById("readyBtn");
    const leaveLobbyBtn = document.getElementById("leaveLobbyBtn");

    if (playNowBtn) playNowBtn.onclick = () => showPlayerCreator();
    if (onlineBtn) onlineBtn.onclick = () => openLobby();
    if (shopBtn) shopBtn.onclick = () => openShop();
    if (settingsBtn) settingsBtn.onclick = () => openSettings();

    if (playBtn) playBtn.onclick = () => {
        readPlayerCreator();
        startGameOffline();
    };

    if (backToMenuFromCreator) backToMenuFromCreator.onclick = () => showMainMenu();

    if (closeSettings) closeSettings.onclick = () => {
        applySettingsFromUI();
        document.getElementById("settingsMenu").style.display = "none";
        document.getElementById("mainMenu").style.display = "flex";
    };

    if (closeShopBtn) closeShopBtn.onclick = () => {
        document.getElementById("shopMenu").style.display = "none";
        document.getElementById("mainMenu").style.display = "flex";
    };

    if (readyBtn) readyBtn.onclick = () => toggleReady();
    if (leaveLobbyBtn) leaveLobbyBtn.onclick = () => leaveLobby();
}

function hideAllMenus() {
    const ids = ["mainMenu", "playerCreator", "settingsMenu", "shopMenu", "lobbyMenu"];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });
}

function showMainMenu() {
    hideAllMenus();
    const mm = document.getElementById("mainMenu");
    if (mm) mm.style.display = "flex";
}

function showPlayerCreator() {
    hideAllMenus();
    const pc = document.getElementById("playerCreator");
    if (pc) pc.style.display = "flex";
}

function openSettings() {
    hideAllMenus();
    const sm = document.getElementById("settingsMenu");
    if (sm) sm.style.display = "flex";
}

function openShop() {
    hideAllMenus();
    const sh = document.getElementById("shopMenu");
    if (sh) sh.style.display = "flex";
    renderShop();
}

// =========================
// PLAYER CREATOR READ
// =========================

function readPlayerCreator() {
    const nameEl = document.getElementById("playerName");
    const skinTone = document.getElementById("skinTone");
    const hairStyle = document.getElementById("hairStyle");
    const height = document.getElementById("height");
    const weight = document.getElementById("weight");

    const attrSpeed = document.getElementById("attrSpeed");
    const attrShot3 = document.getElementById("attrShot3");
    const attrShot2 = document.getElementById("attrShot2");
    const attrDunk = document.getElementById("attrDunk");
    const attrDefense = document.getElementById("attrDefense");
    const attrSteal = document.getElementById("attrSteal");
    const attrBlock = document.getElementById("attrBlock");

    const ankleBreaker = document.getElementById("ankleBreaker");
    const quickFirstStep = document.getElementById("quickFirstStep");
    const rimProtector = document.getElementById("rimProtector");
    const limitlessRange = document.getElementById("limitlessRange");
    const posterizer = document.getElementById("posterizer");
    const clamps = document.getElementById("clamps");
    const deadeye = document.getElementById("deadeye");
    const pickPocket = document.getElementById("pickPocket");
    const dimer = document.getElementById("dimer");
    const greenMachine = document.getElementById("greenMachine");

    playerBuild.name = nameEl.value || "MyPlayer";
    playerBuild.appearance.skinTone = Number(skinTone.value);
    playerBuild.appearance.hairStyle = hairStyle.value;
    playerBuild.appearance.height = Number(height.value);
    playerBuild.appearance.weight = Number(weight.value);

    playerBuild.attributes.speed = Number(attrSpeed.value);
    playerBuild.attributes.shot3 = Number(attrShot3.value);
    playerBuild.attributes.shot2 = Number(attrShot2.value);
    playerBuild.attributes.dunk = Number(attrDunk.value);
    playerBuild.attributes.defense = Number(attrDefense.value);
    playerBuild.attributes.steal = Number(attrSteal.value);
    playerBuild.attributes.block = Number(attrBlock.value);

    playerBuild.badges.ankleBreaker = Number(ankleBreaker.value);
    playerBuild.badges.quickFirstStep = Number(quickFirstStep.value);
    playerBuild.badges.rimProtector = Number(rimProtector.value);
    playerBuild.badges.limitlessRange = Number(limitlessRange.value);
    playerBuild.badges.posterizer = Number(posterizer.value);
    playerBuild.badges.clamps = Number(clamps.value);
    playerBuild.badges.deadeye = Number(deadeye.value);
    playerBuild.badges.pickPocket = Number(pickPocket.value);
    playerBuild.badges.dimer = Number(dimer.value);
    playerBuild.badges.greenMachine = Number(greenMachine.value);
}

// =========================
// OFFLINE GAME START
// =========================

function startGameOffline() {
    hideAllMenus();
    console.log("Starting offline game with build:", playerBuild);
}

// =========================
// SETTINGS APPLY
// =========================

function applySettingsFromUI() {
    const camZoomEl = document.getElementById("camZoom");
    const camHeightEl = document.getElementById("camHeight");
    const graphicsQuality = document.getElementById("graphicsQuality");
    const volume = document.getElementById("volume");

    if (camZoomEl) camZoom = Number(camZoomEl.value);
    if (camHeightEl) camHeight = Number(camHeightEl.value);

    console.log("Graphics:", graphicsQuality.value, "Volume:", volume.value);
}

// ======================================================
// PART 3 — MULTIPLAYER, LOBBY, SHOP, XP, COINS, SAVING
// ======================================================

// =========================
// MULTIPLAYER CONNECTION
// =========================

function openLobby() {
    hideAllMenus();
    document.getElementById("lobbyMenu").style.display = "flex";

    if (!socket) {
        socket = io("https://hooplegends.fly.dev", {
            transports: ["websocket"]
        });

        socket.on("connect", () => {
            myId = socket.id;
            inLobby = true;
            socket.emit("joinLobby", playerBuild);
        });

        socket.on("lobbyPlayers", list => {
            updateLobbyList(list);
        });

        socket.on("playerMove", data => {
            if (!remotePlayers.has(data.id)) {
                remotePlayers.set(data.id, { x: 0, y: 0 });
            }
            const p = remotePlayers.get(data.id);
            p.x = data.x;
            p.y = data.y;
        });

        socket.on("playerLeft", id => {
            remotePlayers.delete(id);
        });

        socket.on("matchStart", () => {
            hideAllMenus();
        });

        socket.on("scoreEvent", data => {
            awardPoints(data.isThree, data.team, data.scorer);
        });

        socket.on("emoteEvent", data => {
            console.log("Player", data.id, "did emote:", data.emote);
        });
    }
}

function leaveLobby() {
    if (socket) {
        socket.emit("leaveLobby");
    }
    inLobby = false;
    showMainMenu();
}

function toggleReady() {
    isReady = !isReady;
    if (socket) {
        socket.emit("readyUp", isReady);
    }
}

function updateLobbyList(list) {
    const div = document.getElementById("playerList");
    div.innerHTML = "";
    list.forEach(p => {
        const el = document.createElement("div");
        el.textContent = p.name + (p.ready ? " ✔" : "");
        div.appendChild(el);
    });
}

// =========================
// SCORING + HIGHLIGHT
// =========================

function awardPoints(isThree, team, scorerEntry) {
    if (team === "A") {
        scoreA += isThree ? 3 : 2;
    } else {
        scoreB += isThree ? 3 : 2;
    }

    document.getElementById("scoreboard").textContent =
        `Team A: ${scoreA} — Team B: ${scoreB}`;

    if (scorerEntry.id === myId || scorerEntry.id === "local") {
        playerXP += isThree ? 15 : 10;
        playerCoins += isThree ? 5 : 3;

        dailyChallenge.progress += isThree ? 1 : 0;
        checkDailyChallenge();
    }

    startHighlightMoment(scorerEntry);
}

function startNextPossession() {
    console.log("Next possession begins.");
}

// =========================
// EMOTES
// =========================

function buildEmotePool() {
    emotePool = [...baseEmotes, ...myUnlockedEmotes];
}

function triggerManualEmote() {
    if (emotePool.length === 0) return;

    const chosen = emotePool[Math.floor(Math.random() * emotePool.length)];
    console.log("Local emote:", chosen);

    if (socket) {
        socket.emit("emote", chosen);
    }
}

// =========================
// SHOP SYSTEM
// =========================

function setShopTab(tab) {
    currentShopTab = tab;
    renderShop();
}

function renderShop() {
    const div = document.getElementById("shopItems");
    div.innerHTML = "";

    const items = getShopItemsForTab(currentShopTab);

    items.forEach(item => {
        const el = document.createElement("div");
        el.style.margin = "10px 0";
        el.style.padding = "10px";
        el.style.background = "#222";
        el.style.borderRadius = "8px";

        const owned = isItemOwned(item);

        el.innerHTML = `
            <strong>${item.name}</strong><br>
            Price: ${item.price} coins<br>
            ${owned ? "<em>Owned</em>" : `<button onclick="buyItem('${item.id}')">Buy</button>`}
        `;

        div.appendChild(el);
    });

    document.getElementById("coinDisplay").textContent =
        `Coins: ${playerCoins} | Level: ${playerLevel}`;
}

function getShopItemsForTab(tab) {
    if (tab === "emotes") {
        return [
            { id: "emote_wave", name: "Wave", price: 50 },
            { id: "emote_dance", name: "Dance", price: 100 }
        ];
    }
    if (tab === "outfits") {
        return [
            { id: "outfit_red", name: "Red Outfit", price: 200 },
            { id: "outfit_black", name: "Black Outfit", price: 250 }
        ];
    }
    if (tab === "courts") {
        return [
            { id: "court_night", name: "Night Court", price: 300 },
            { id: "court_gold", name: "Gold Court", price: 500 }
        ];
    }
    if (tab === "premium") {
        return [
            { id: "premium_dragon", name: "Dragon Aura", price: 1000 }
        ];
    }
    return [];
}

function isItemOwned(item) {
    return (
        myUnlockedEmotes.includes(item.id) ||
        myUnlockedOutfits.includes(item.id) ||
        myUnlockedCourts.includes(item.id)
    );
}

function buyItem(id) {
    const items = [
        ...getShopItemsForTab("emotes"),
        ...getShopItemsForTab("outfits"),
        ...getShopItemsForTab("courts"),
        ...getShopItemsForTab("premium")
    ];

    const item = items.find(i => i.id === id);
    if (!item) return;

    if (playerCoins < item.price) {
        alert("Not enough coins!");
        return;
    }

    playerCoins -= item.price;

    if (id.startsWith("emote_")) myUnlockedEmotes.push(id);
    if (id.startsWith("outfit_")) myUnlockedOutfits.push(id);
    if (id.startsWith("court_")) myUnlockedCourts.push(id);

    saveProgress();
    renderShop();
}

// =========================
// XP + LEVELING
// =========================

function addXP(amount) {
    playerXP += amount;
    const needed = playerLevel * 100;

    if (playerXP >= needed) {
        playerXP -= needed;
        playerLevel++;
        alert("LEVEL UP! You are now level " + playerLevel);
    }

    saveProgress();
}

// =========================
// DAILY CHALLENGE
// =========================

function loadDailyChallenge() {
    const today = new Date().toDateString();

    if (dailyChallenge.date !== today) {
        dailyChallenge.date = today;
        dailyChallenge.progress = 0;
    }
}

function checkDailyChallenge() {
    if (dailyChallenge.progress >= dailyChallenge.target) {
        playerCoins += dailyChallenge.rewardCoins;
        addXP(dailyChallenge.rewardXP);
        alert("Daily challenge complete!");
        dailyChallenge.progress = 0;
        saveProgress();
    }
}

// =========================
// SAVING / LOADING
// =========================

function saveProgress() {
    const data = {
        coins: playerCoins,
        xp: playerXP,
        level: playerLevel,
        emotes: myUnlockedEmotes,
        outfits: myUnlockedOutfits,
        courts: myUnlockedCourts,
        daily: dailyChallenge
    };
    localStorage.setItem("hoop_save", JSON.stringify(data));
}

function loadProgress() {
    const raw = localStorage.getItem("hoop_save");
    if (!raw) return;

    try {
        const data = JSON.parse(raw);
        playerCoins = data.coins || 0;
        playerXP = data.xp || 0;
        playerLevel = data.level || 1;
        myUnlockedEmotes = data.emotes || [];
        myUnlockedOutfits = data.outfits || [];
        myUnlockedCourts = data.courts || [];
        dailyChallenge = data.daily || dailyChallenge;
    } catch (e) {
        console.error("Save load error:", e);
    }
}
