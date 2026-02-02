(() => {
  // =========================
  // SOCKET SETUP
  // =========================
  const ROOM_ID =
    window.EGG_HUNT_ROOM ||
    new URLSearchParams(location.search).get("room") ||
    "oda1";

  if (typeof io !== "function") {
    console.error("socket.io client yok! index.html içine <script src='/socket.io/socket.io.js'></script> ekle.");
  }
  const socket = (typeof io === "function") ? io() : null;

  // =========================
  // CANVAS
  // =========================
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // ===== UI refs =====
  const storyPanel = document.getElementById("storyPanel");
  const overlay = document.getElementById("overlay");
  const nickInput = document.getElementById("nickInput");
  const avatarGrid = document.getElementById("avatarGrid");
  const startBtn = document.getElementById("startBtn");
  const errEl = document.getElementById("err");

  const myEggsEl = document.getElementById("myEggs");
  const leaderboardEl = document.getElementById("leaderboard");
  const lobbyListEl = document.getElementById("lobbyList");
  const lobbyInfoEl = document.getElementById("lobbyInfo");
  const countdownBig = document.getElementById("countdownBig");

  const hudTime = document.getElementById("time");
  const hudEggs = document.getElementById("eggs");
  const phaseText = document.getElementById("phaseText");

  const resultOverlay = document.getElementById("resultOverlay");
  const resultTitle = document.getElementById("resultTitle");
  const resultSub = document.getElementById("resultSub");
  const resultList = document.getElementById("resultList");
  const resultCountdown = document.getElementById("resultCountdown");

  const rotateOverlay = document.getElementById("rotateOverlay");

  // Joystick (mobil)
  const joy = document.getElementById("joystick");
  const joyKnob = document.getElementById("joyKnob");

  // =========================
  // GAME CONFIG (asıl kodu bozmadım)
  // =========================
  // ===== ZOMBIE HOUR CONFIG =====
  const ZOMBIE_HOUR_START = 240; // 4.dk (GAME içinde)
  const ZOMBIE_HOUR_END   = 420; // 6.dk (GAME içinde)

  const ZOMBIE_BASE_SPEED = 320 * 1.15;
  const ZOMBIE_COUNT_PER_PLAYER = 10;
  const ZOMBIE_R = 14;
  const ZOMBIE_HIT_COOLDOWN = 1.2; // saniye

  // ===== ZOMBIE TYPES =====
  const ZOMBIE_TYPES = {
    normal: {
      chance: 0.8,
      size: 1,
      speedMin: 1.1,
      speedMax: 1.3,
      damage: 1,
      color: "#5aff5a"
    },
    big: {
      chance: 0.1,
      size: 1.6,
      speedMin: 1.1,
      speedMax: 1.3,
      damage: 2,
      color: "#2aff2a"
    },
    fast: {
      chance: 0.1,
      size: 0.7,
      speedMin: 1.4,
      speedMax: 1.6,
      damage: 1,
      color: "#00ffff"
    }
  };

  // ===== STAMINA =====
  let isZombieHour = false;
  let zombieWarning = false;
  let extraZombiesAdded = false;
  let zombieWarningTimer = 0;
	let storyShown = false;

let remainingEggs = 0;
	const optimisticEggs = new Set();

	
  const zombies = [];

  const STAMINA_MAX = 4000;
  const STAMINA_DRAIN = 180;   // saniyede azalma (hareketliyken)
  const STAMINA_REGEN = 220;   // saniyede dolma (dururken)
  const STAMINA_SLOW = 500;    // altı yavaş

  const MAX_PLAYERS = 20;

  const FOG_START = 0.06;   // oyun başı
  const FOG_END   = 0.22;   // oyun sonu

  // Dünya
  const WORLD_W = 80000;
  const WORLD_H = 50000;

  // Tiles
  const TILE_SIZE = 32;
  const WORLD_COLS = Math.floor(WORLD_W / TILE_SIZE);
  const WORLD_ROWS = Math.floor(WORLD_H / TILE_SIZE);

  const TILE_FOREST = 0;
  const TILE_CLEAR = 1;
  const TILE_PATH = 2;

  // Yumurtalar
  const EGG_COUNT = 1000;
  const EGG_RADIUS = 10;

  // Süreler (Senin istediğin: 2dk lobby + 8dk oyun = 10dk)
  const LOBBY_SECONDS = 120;
  const GAME_SECONDS = 480;

  // Sonuç bekleme süresi (prod'da 10dk kuralını bozmamak için 0 yaptım)
  const RESULTS_SECONDS = 0;

  // Hareket
  const PLAYER_SPEED = 320;
  const PLAYER_R = 14;

  // Kamera / Zoom
  const CAMERA_ZOOM = 0.70;
  const CAMERA_Y_OFFSET = 0;

  // Ağaç ayarları (deterministik)
  const TREE_CHANCE = 0.40;
  const TREE_MIN_R = 12;
  const TREE_MAX_R = 26;

  function getTreeType(tx, ty) {
    const r = rand01Tile(tx, ty, 99);
    if (r < 0.25) return "pine";
    if (r < 0.50) return "oak";
    if (r < 0.75) return "bush";
    return "dead";
  }

  const FOG_ALPHA_EDGE = 0.40;
  const FOG_ALPHA_FULL = 0.20;

  // =========================
  // STATE (MULTI)
  // =========================
  const PHASE = { LOBBY: "LOBBY", GAME: "GAME", RESULTS: "RESULTS" };
  let phase = PHASE.LOBBY;

  // Serverdan gelen timeLeft (10 dk toplam => lobby+game)
  // Biz bunu lobby/game diye böleceğiz
  let serverTimeLeftTotal = (LOBBY_SECONDS + GAME_SECONDS);
  let phaseLeft = LOBBY_SECONDS; // UI için

  // =========================
  // INPUT
  // =========================
  const keys = new Set();
  window.addEventListener("keydown", (e) => keys.add(e.key));
  window.addEventListener("keyup", (e) => keys.delete(e.key));

  // Joystick axis
  let joyActive = false;
  let joyDX = 0;
  let joyDY = 0;

  // =========================
  // PLAYERS (server sync)
  // =========================
  let myId = null;

  // serverdan gelen oyuncular => array kullanıyoruz çünkü mevcut kod çok kullanıyor
  const players = []; // {id,nick,avatar,color,x,y,eggs,r,stamina}

  // quick lookup
  const playersById = new Map();

  // =========================
  // WORLD DATA
  // =========================
  const worldTiles = [];
  const eggs = []; // {id,x,y,takenBy|null}

  // Effects
  const effects = [];

  // =========================
  // UTILS (asıl kod)
  // =========================
  function avatarColor(i) {
    const hue = (i * 360) / 40;
    return `hsl(${hue} 80% 55%)`;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function getMe() {
    if (!myId) return null;
    return playersById.get(myId) || null;
  }

  // Deterministik hash (ağaçlar için titremesin)
  function hash2(x, y) {
    let n = (x * 374761393) ^ (y * 668265263);
    n = (n ^ (n >>> 13)) * 1274126177;
    n = (n ^ (n >>> 16)) >>> 0;
    return n;
  }

  function rand01Tile(x, y, salt = 0) {
    const h = hash2(x + salt * 1013, y - salt * 997);
    return (h % 100000) / 100000;
  }

  // =========================
  // ZOMBIE HELPERS (asıl)
  // =========================
  function getZombieType() {
    const r = Math.random();
    let acc = 0;
    for (const key in ZOMBIE_TYPES) {
      acc += ZOMBIE_TYPES[key].chance;
      if (r <= acc) return key;
    }
    return "normal";
  }

// ===== ZOMBIE UTILS =====
function spawnZombies(extraCount = 0) {
  zombies.length = 0;

  for (const p of players) {
    for (let i = 0; i < ZOMBIE_COUNT_PER_PLAYER; i++) {
      const typeKey = getZombieType();
      const t = ZOMBIE_TYPES[typeKey];

      const angle = Math.random() * Math.PI * 2;
      const dist = 500 + Math.random() * 700; // oyuncudan uzakta doğsun

      zombies.push({
        type: typeKey,
        x: p.x + Math.cos(angle) * dist,
        y: p.y + Math.sin(angle) * dist,
        vx: rand(-1, 1),
        vy: rand(-1, 1),
        speed: ZOMBIE_BASE_SPEED * rand(t.speedMin, t.speedMax),
        size: ZOMBIE_R * t.size,
        damage: t.damage,
        color: t.color,
        hitCD: 0,
        dirTimer: rand(1, 3)
      });
    }

    // (opsiyonel) ekstra zombi istersen:
    for (let i = 0; i < extraCount; i++) {
      const typeKey = getZombieType();
      const t = ZOMBIE_TYPES[typeKey];

      const angle = Math.random() * Math.PI * 2;
      const dist = 500 + Math.random() * 700;

      zombies.push({
        type: typeKey,
        x: p.x + Math.cos(angle) * dist,
        y: p.y + Math.sin(angle) * dist,
        vx: rand(-1, 1),
        vy: rand(-1, 1),
        speed: ZOMBIE_BASE_SPEED * rand(t.speedMin, t.speedMax),
        size: ZOMBIE_R * t.size,
        damage: t.damage,
        color: t.color,
        hitCD: 0,
        dirTimer: rand(1, 3)
      });
    }
  }
}


  // =========================
  // WORLD GEN (asıl)
  // =========================
  function generateWorldTiles() {
    worldTiles.length = 0;
    for (let y = 0; y < WORLD_ROWS; y++) {
      const row = [];
      for (let x = 0; x < WORLD_COLS; x++) {
        const r = Math.random();
        if (r < 0.20) row.push(TILE_PATH);
        else if (r < 0.35) row.push(TILE_CLEAR);
        else row.push(TILE_FOREST);
      }
      worldTiles.push(row);
    }
  }

  // eggleri server gönderiyorsa onu kullan, yoksa (fallback) local üret
  function applyServerEggs(serverEggs) {
    eggs.length = 0;
    if (Array.isArray(serverEggs) && serverEggs.length > 0) {
      for (const e of serverEggs) {
        eggs.push({
          id: e.id,
          x: e.x,
          y: e.y,
          takenBy: e.taken ? "someone" : null
        });
      }
      return;
    }

    // fallback (senin asıl kodun)
    spawnEggsLocal();
	  remainingEggs = eggs.filter(e => !e.takenBy).length;

  }

  function spawnEggsLocal() {
    eggs.length = 0;

    for (let i = 0; i < EGG_COUNT; i++) {
      let tx, ty;
      do {
        tx = Math.floor(Math.random() * WORLD_COLS);
        ty = Math.floor(Math.random() * WORLD_ROWS);
      } while (ty < 0 || ty >= WORLD_ROWS || tx < 0 || tx >= WORLD_COLS);

      eggs.push({
        id: i,
        x: tx * TILE_SIZE + TILE_SIZE / 2,
        y: ty * TILE_SIZE + TILE_SIZE / 2,
        takenBy: null
      });
    }
	  remainingEggs = eggs.length;

  }

  // =========================
  // RESIZE / ROTATE
  // =========================
  function resize() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  function checkRotateOverlay() {
    const isMobile = matchMedia("(max-width: 900px)").matches;
    const isPortrait = window.innerHeight > window.innerWidth;
    rotateOverlay.style.display = (isMobile && isPortrait) ? "grid" : "none";
  }
  window.addEventListener("resize", checkRotateOverlay);
  checkRotateOverlay();

  // =========================
  // AVATAR UI (asıl)
  // =========================
  const AVATARS = Array.from({ length: 40 }, (_, i) => i);
  let selectedAvatar = 0;

  function buildAvatarGrid() {
    if (!avatarGrid) return;
    avatarGrid.innerHTML = "";
    AVATARS.forEach((id) => {
      const btn = document.createElement("button");
      btn.className = "avatarBtn" + (id === selectedAvatar ? " selected" : "");
      btn.style.background = avatarColor(id);
      btn.title = "İkon " + (id + 1);
      btn.onclick = () => { selectedAvatar = id; buildAvatarGrid(); };
      avatarGrid.appendChild(btn);
    });
  }
  buildAvatarGrid();

  function showErr(msg) {
    if (!errEl) return;
    errEl.textContent = msg || "";
  }

  // =========================
  // SERVER SYNC HELPERS
  // =========================
  function upsertPlayer(p) {
    let existing = playersById.get(p.id);
    if (!existing) {
      existing = {
        id: p.id,
        nick: p.nick || "Player",
        avatar: typeof p.avatar === "number" ? p.avatar : 0,
        color: avatarColor(typeof p.avatar === "number" ? p.avatar : 0),
        x: p.x ?? (WORLD_W / 2),
        y: p.y ?? (WORLD_H / 2),
        eggs: p.eggs ?? 0,
        r: PLAYER_R,
        stamina: STAMINA_MAX
      };
      players.push(existing);
      playersById.set(existing.id, existing);
    } else {
      existing.nick = p.nick ?? existing.nick;
      existing.avatar = (typeof p.avatar === "number") ? p.avatar : existing.avatar;
      existing.color = avatarColor(existing.avatar);
      if (typeof p.x === "number") existing.x = p.x;
      if (typeof p.y === "number") existing.y = p.y;
      if (typeof p.eggs === "number") existing.eggs = p.eggs;
    }
    return existing;
  }

  function removePlayer(id) {
    const p = playersById.get(id);
    if (!p) return;
    playersById.delete(id);
    const idx = players.findIndex(x => x.id === id);
    if (idx >= 0) players.splice(idx, 1);
  }

  function setPhaseByTotalTimeLeft(totalLeft) {
    // totalLeft = 600..0
    serverTimeLeftTotal = Math.max(0, Math.floor(totalLeft));

    if (serverTimeLeftTotal > GAME_SECONDS) {
      // lobby
      phase = PHASE.LOBBY;
      phaseLeft = serverTimeLeftTotal - GAME_SECONDS; // 120..1
    } else if (serverTimeLeftTotal > 0) {
      phase = PHASE.GAME;
      phaseLeft = serverTimeLeftTotal; // 480..1
    } else {
      phase = PHASE.RESULTS;
      phaseLeft = 0;
    }

    if (phaseText) phaseText.textContent = phase === PHASE.LOBBY ? "LOBBY" : (phase === PHASE.GAME ? "OYUN" : "SONUÇ");
  }

  // =========================
  // JOIN (MULTI)
  // =========================
  function joinLobby() {
    const nick = (nickInput?.value || "").trim();
    if (!nick) return showErr("Nick boş olamaz.");
    if (nick.length > 20) return showErr("Nick max 20 karakter.");
    showErr("");

    if (!socket) return showErr("Socket yok. index.html içine socket.io scripti ekli mi?");

    socket.emit("joinRoom", {
      roomId: ROOM_ID,
      nick,
      avatar: selectedAvatar
    });

    // mobil joystick göster
    const isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
    if (isTouch && joy) joy.style.display = "block";
  }

  if (nickInput) nickInput.addEventListener("keydown", (e) => { if (e.key === "Enter") joinLobby(); });
  if (startBtn) startBtn.addEventListener("click", joinLobby);

  // =========================
  // LOBBY LIST / LEADERBOARD (asıl)
  // =========================
  function renderLobbyList() {
    if (!lobbyListEl) return;
    lobbyListEl.innerHTML = "";
    const list = players.slice(0, MAX_PLAYERS);
    list.forEach((p) => {
      const row = document.createElement("div");
      row.className = "lobbyItem";
      row.innerHTML = `
        <span class="lobbyDot" style="background:${p.color}"></span>
        <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.nick)}</span>
      `;
      lobbyListEl.appendChild(row);
    });
  }

  function renderLeaderboard() {
    if (!leaderboardEl) return;
    leaderboardEl.innerHTML = "";

    const sorted = players
      .slice()
      .sort((a, b) => (b.eggs - a.eggs) || a.nick.localeCompare(b.nick));

    sorted.slice(0, 20).forEach((p, idx) => {
      const row = document.createElement("div");
      row.className = "lbItem";

      if (idx === 0) row.classList.add("rank1");
      else if (idx === 1) row.classList.add("rank2");
      else if (idx === 2) row.classList.add("rank3");

      let medal = "";
      if (idx === 0) medal = "🥇";
      else if (idx === 1) medal = "🥈";
      else if (idx === 2) medal = "🥉";

      row.innerHTML = `
        <div class="lbLeft">
          <span class="lbDot" style="background:${p.color}"></span>
          <span class="lbName">${medal} ${escapeHtml(p.nick)}</span>
        </div>
        <strong>${p.eggs}</strong>
      `;
      leaderboardEl.appendChild(row);
    });

    const me = getMe();
    if (myEggsEl) myEggsEl.textContent = me ? String(me.eggs) : "0";
  }

  // =========================
  // PHASE UI (asıl)
  // =========================
  function showResults() {
    if (!resultOverlay) return;
    resultOverlay.style.display = "grid";

    const sorted = players
      .slice()
      .sort((a, b) => (b.eggs - a.eggs) || a.nick.localeCompare(b.nick));

    const me = getMe();
    let myRank = -1;
    if (me) myRank = sorted.findIndex(x => x.id === me.id) + 1;

    if (resultTitle) resultTitle.textContent = "ROUND BİTTİ 🏁";

    let msg = "Yeni oyun başlıyor…";
    if (myRank === 1) msg = "🥇 Efsanesin! Bu round’un kazananı sensin!";
    else if (myRank === 2 || myRank === 3) msg = "🔥 Harikaydı! Az farkla kaçırdın!";
    else if (myRank >= 4 && myRank <= 10) msg = "💪 İyi yarıştın! Devam!";
    else if (myRank > 10) msg = "🤝 Bir dahaki round senin olabilir!";
    if (resultSub) resultSub.textContent = msg;

    if (resultList) {
      resultList.innerHTML = "";
      sorted.slice(0, 20).forEach((p, idx) => {
        const row = document.createElement("div");
        row.className = "resultRow";
        row.innerHTML = `
          <div class="resultLeft">
            <span class="resultDot" style="background:${p.color}"></span>
            <span class="resultName">${idx + 1}. ${escapeHtml(p.nick)}</span>
          </div>
          <strong>${p.eggs}</strong>
        `;
        resultList.appendChild(row);
      });
    }

    if (resultCountdown) {
  resultCountdown.textContent = String(
    Math.max(0, Math.ceil(phaseLeft))
  );
}

  }

  // =========================
  // MOVEMENT (asıl + send)
  // =========================
  function getMoveVector() {
    let vx = 0, vy = 0;

    if (keys.has("ArrowLeft") || keys.has("a")) vx -= 1;
    if (keys.has("ArrowRight") || keys.has("d")) vx += 1;
    if (keys.has("ArrowUp") || keys.has("w")) vy -= 1;
    if (keys.has("ArrowDown") || keys.has("s")) vy += 1;

    vx += joyDX;
    vy += joyDY;

    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy);
      vx /= len; vy /= len;
    }
    return { vx, vy, moving: (vx !== 0 || vy !== 0) };
  }

  function getPlayerSpeed(me) {
    if (me.stamina <= 0) return 0;
    if (me.stamina < STAMINA_SLOW) return PLAYER_SPEED * 0.5;
    return PLAYER_SPEED;
  }

  // =========================
  // EGG PICKUP (asıl + socket)
  // =========================
  function tryPickupEggs(me) {
    for (const e of eggs) {
      if (e.takenBy) continue;

      if (dist2(me.x, me.y, e.x, e.y) < (me.r + EGG_RADIUS) ** 2) {
        // OPTIMISTIC: hemen localde işaretle (çakışma azalır)
        e.takenBy = me.id;

        // +1 yazısı
        effects.push({
          type: "plus",
          x: me.x,
          y: me.y - 18,
          text: "+1",
          life: 0.85,
          vy: -34,
        });

        for (let i = 0; i < 10; i++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = 90 + Math.random() * 150;
          effects.push({
            type: "particle",
            x: e.x,
            y: e.y,
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp,
            life: 0.55 + Math.random() * 0.25,
          });
        }

        // servera bildir
        if (socket && myId) {
          socket.emit("pickupEgg", { roomId: ROOM_ID, eggId: e.id });
        }
		 // optimistic skor (client anında)
me.eggs += 1;
optimisticEggs.add(e.id);

remainingEggs--;


        break;
      }
    }
  }

  // =========================
  // CAMERA
  // =========================
  function computeCamera(me, zoom) {
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    let camX = me.x - (viewW / 2) / zoom;
    let camY = (me.y - CAMERA_Y_OFFSET) - (viewH / 2) / zoom;

    camX = clamp(camX, 0, WORLD_W - (viewW / zoom));
    camY = clamp(camY, 0, WORLD_H - (viewH / zoom));
    return { camX, camY };
  }

  // =========================
  // JOYSTICK (asıl)
  // =========================
  function setupJoystick() {
    if (!joy || !joyKnob) return;

    const baseRect = () => joy.getBoundingClientRect();
    const baseRadius = () => baseRect().width / 2;
    const center = () => {
      const r = baseRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    };

    function setKnob(px, py) {
      const r = baseRadius();
      const max = r - 35;
      const len = Math.hypot(px, py) || 1;
      const cl = Math.min(max, len);
      const nx = (px / len) * cl;
      const ny = (py / len) * cl;

      joyKnob.style.transform = `translate(${nx}px, ${ny}px)`;

      joyDX = nx / max;
      joyDY = ny / max;
    }

    function resetKnob() {
      joyKnob.style.transform = `translate(0px, 0px)`;
      joyDX = 0; joyDY = 0;
    }

    joy.addEventListener("pointerdown", (e) => {
      joyActive = true;
      joy.setPointerCapture(e.pointerId);
      const c = center();
      setKnob(e.clientX - c.cx, e.clientY - c.cy);
    });

    joy.addEventListener("pointermove", (e) => {
      if (!joyActive) return;
      const c = center();
      setKnob(e.clientX - c.cx, e.clientY - c.cy);
    });

    function endJoy() {
      joyActive = false;
      resetKnob();
    }
    joy.addEventListener("pointerup", endJoy);
    joy.addEventListener("pointercancel", endJoy);
    joy.addEventListener("pointerleave", endJoy);
  }
  setupJoystick();

  // =========================
  // DRAW HELPERS (asıl)
  // =========================
  function drawStaminaBar(me) {
    if (!me) return;

    const x = 12;
    const y = 120;
    const w = 140;
    const h = 10;

    const ratio = me.stamina / STAMINA_MAX;

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = ratio < 0.5 ? "#4fa3ff" : "#6bd1ff";
    ctx.fillRect(x, y, w * ratio, h);

    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = "#fff";
    ctx.font = "11px monospace";
    ctx.fillText(
      `${Math.floor(me.stamina)}/${STAMINA_MAX}`,
      x,
      y - 4
    );
  }

  function tileHasTree(tx, ty) {
    if (worldTiles[ty]?.[tx] !== TILE_FOREST) return false;
    const r = rand01Tile(tx, ty, 1);
    return r < TREE_CHANCE;
  }

  function getTreeSpec(tx, ty) {
    const r1 = rand01Tile(tx, ty, 2);
    const r2 = rand01Tile(tx, ty, 3);
    const r3 = rand01Tile(tx, ty, 4);

    const size = (TREE_MIN_R + (TREE_MAX_R - TREE_MIN_R) * r1);
    const ox = (r2 - 0.5) * 10;
    const oy = (r3 - 0.5) * 10;

    const cx = tx * TILE_SIZE + TILE_SIZE / 2 + ox;
    const cy = ty * TILE_SIZE + TILE_SIZE / 2 + oy;

    const baseY = cy + 10 + size * 0.25;

    return {
      cx,
      cy,
      baseY,
      size,
      type: getTreeType(tx, ty)
    };
  }

  function drawTree(tree, camX, camY, zoom) {
    const sx = (tree.cx - camX) * zoom;
    const sy = (tree.cy - camY) * zoom;
    const size = tree.size * zoom;
    const type = tree.type;

    // gölge
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(
      sx + size*0.15,
      sy + size*1.2,
      size*1.1,
      size*0.45,
      0,
      0,
      Math.PI*2
    );
    ctx.fill();

    // gövde
    const trunkH = size * 1.2;
    const trunkW = size * 0.25;

    ctx.fillStyle = type === "dead" ? "#3b2a1a" : "#6b4f35";
    ctx.fillRect(
      sx - (trunkW/2),
      sy + size*0.4,
      trunkW,
      trunkH
    );

    // yaprak
    if (type === "pine") {
      ctx.fillStyle = "#1d6b3a";
      ctx.beginPath();
      ctx.moveTo(sx, sy-size);
      ctx.lineTo(sx-size, sy+size);
      ctx.lineTo(sx+size, sy+size);
      ctx.fill();
    }
    else if (type === "oak") {
      ctx.fillStyle = "#2e7a4a";
      ctx.beginPath();
      ctx.arc(sx, sy - size*0.2, size, 0, Math.PI*2);
      ctx.fill();
    }
    else if (type === "bush") {
      ctx.fillStyle = "#3a8b55";
      ctx.beginPath();
      ctx.arc(sx, sy, size*0.6, 0, Math.PI*2);
      ctx.fill();
    }
    else if (type === "dead") {
      ctx.strokeStyle = "#6b4f35";
      ctx.lineWidth = 3 * zoom;
    }
  }

  function eggGlowBoost(e) {
    const tx = Math.floor(e.x / TILE_SIZE);
    const ty = Math.floor(e.y / TILE_SIZE);
    if (!tileHasTree(tx, ty)) return 0;
    const t = getTreeSpec(tx, ty);

    const d = Math.hypot(e.x - t.cx, e.y - t.cy);
    const max = TILE_SIZE * 0.75;
    const k = clamp(1 - (d / max), 0, 1);
    return 0.5 * k + 0.25;
  }

  function drawFogOverlay() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // progress sadece GAME içinde anlamlı
    const progress = (phase === PHASE.GAME) ? (1 - (phaseLeft / GAME_SECONDS)) : 0;
    const fogAlpha = FOG_START + (FOG_END - FOG_START) * clamp(progress, 0, 1);

    ctx.fillStyle = `rgba(10,15,12,${fogAlpha})`;
    ctx.fillRect(0, 0, w, h);

    const g = ctx.createRadialGradient(
      w * 0.5, h * 0.5, Math.min(w, h) * 0.2,
      w * 0.5, h * 0.5, Math.max(w, h) * 0.7
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${fogAlpha + 0.12})`);

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    if (isZombieHour) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

	function drawWorldGround(camX, camY, zoom) {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  const startCol = Math.floor(camX / TILE_SIZE);
  const endCol = Math.ceil((camX + viewW / zoom) / TILE_SIZE);
  const startRow = Math.floor(camY / TILE_SIZE);
  const endRow = Math.ceil((camY + viewH / zoom) / TILE_SIZE);

  // === ZEMİN TILE'LARI ===
  for (let y = startRow; y < endRow; y++) {
    if (y < 0 || y >= WORLD_ROWS) continue;
    for (let x = startCol; x < endCol; x++) {
      if (x < 0 || x >= WORLD_COLS) continue;

      const tile = worldTiles[y][x];
      const sx = (x * TILE_SIZE - camX) * zoom;
      const sy = (y * TILE_SIZE - camY) * zoom;

      if (tile === TILE_FOREST) {
        ctx.fillStyle = "#1f5a32";
      } else if (tile === TILE_CLEAR) {
        ctx.fillStyle = "#355f3b";
      } else if (tile === TILE_PATH) {
        ctx.fillStyle = "#6b4b2a";
      }

      ctx.fillRect(sx, sy, TILE_SIZE * zoom, TILE_SIZE * zoom);
    }
  }
}

function drawTrees(camX, camY, zoom) {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  const startCol = Math.floor(camX / TILE_SIZE);
  const endCol = Math.ceil((camX + viewW / zoom) / TILE_SIZE);
  const startRow = Math.floor(camY / TILE_SIZE);
  const endRow = Math.ceil((camY + viewH / zoom) / TILE_SIZE);

  for (let y = startRow; y < endRow; y++) {
    if (y < 0 || y >= WORLD_ROWS) continue;
    for (let x = startCol; x < endCol; x++) {
      if (x < 0 || x >= WORLD_COLS) continue;

      if (tileHasTree(x, y)) {
        const tree = getTreeSpec(x, y);
        drawTree(tree, camX, camY, zoom);
      }
    }
  }
}


  function drawEgg(e, camX, camY, zoom) {
    const sx = (e.x - camX) * zoom;
    const sy = (e.y - camY) * zoom;

    const glow = eggGlowBoost(e);
    if (glow > 0) {
      ctx.save();
      ctx.globalAlpha = glow;
      ctx.fillStyle = "rgba(255,220,120,0.85)";
      ctx.beginPath();
      ctx.arc(sx, sy + 6*zoom, 14*zoom, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    const boost = eggGlowBoost(e);
    if (boost > 0) {
      ctx.save();
      ctx.shadowColor = "rgba(255,220,120,0.85)";
      ctx.shadowBlur = 18 * boost;
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#f4e7c6";
      ctx.beginPath();
      ctx.ellipse(sx, sy, EGG_RADIUS * zoom, EGG_RADIUS * 1.25 * zoom, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.fillStyle = "#f4e7c6";
    ctx.ellipse(sx, sy, EGG_RADIUS * zoom, EGG_RADIUS * 1.25 * zoom, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.ellipse(sx - 3 * zoom, sy - 4 * zoom, 3 * zoom, 5 * zoom, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer(p, camX, camY, zoom, alpha = 1) {
    const sx = (p.x - camX) * zoom;
    const sy = (p.y - camY) * zoom;

    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(sx, sy + 12 * zoom, 14 * zoom, 6 * zoom, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(sx, sy, p.r * zoom, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = `${Math.max(10, 12 * zoom)}px monospace`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(p.nick, sx, sy - 22 * zoom);

    ctx.restore();
  }

  function findNearbyTreeForPlayer(p) {
    const tx = Math.floor(p.x / TILE_SIZE);
    const ty = Math.floor(p.y / TILE_SIZE);

    let best = null;
    let bestD = Infinity;

    for (let yy = ty - 1; yy <= ty + 1; yy++) {
      if (yy < 0 || yy >= WORLD_ROWS) continue;
      for (let xx = tx - 1; xx <= tx + 1; xx++) {
        if (xx < 0 || xx >= WORLD_COLS) continue;
        if (!tileHasTree(xx, yy)) continue;

        const t = getTreeSpec(xx, yy);
        const d = Math.hypot(p.x - t.cx, p.y - t.cy);
        const thresh = t.size + 18;
        if (d < thresh && d < bestD) {
          bestD = d;
          best = t;
        }
      }
    }
    return best;
  }

  // =========================
  // NETWORK THROTTLE (move)
  // =========================
  let lastNetSend = 0;

  function sendMyMoveThrottled(nowMs, me) {
    if (!socket || !myId) return;
    if (!me) return;
    // 15hz gönder
    if (nowMs - lastNetSend < 66) return;
    lastNetSend = nowMs;

    socket.emit("move", {
      roomId: ROOM_ID,
      x: me.x,
      y: me.y
    });
  }

  // =========================
  // MAIN LOOP
  // =========================
  let lastTime = performance.now();

function tick(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

    const me = getMe();

    // ===== phase UI (server time)
    // serverTimeLeftTotal azalacak, biz ona göre phaseLeft hesaplıyoruz.

// ===== PHASE UI (TEK VE TEMİZ) =====
if (phase === PHASE.LOBBY) {
  if (hudTime) hudTime.textContent = formatTime(phaseLeft);

  if (lobbyInfoEl) {
    lobbyInfoEl.textContent =
      `Şuan lobbydesiniz. Oyun ${formatTime(phaseLeft)} içinde başlayacak.`;
  }

  if (countdownBig) {
    countdownBig.textContent =
      `⏱️ Oyun ${Math.ceil(phaseLeft)} saniye sonra başlıyor…`;
  }

  // ✅ LOBBY'DE PANEL AÇIK
  if (storyPanel) storyPanel.style.display = "block";
  storyShown = false;

  if (resultOverlay) resultOverlay.style.display = "none";

  renderLobbyList();
  renderLeaderboard();
}

else if (phase === PHASE.GAME) {
  if (hudTime) hudTime.textContent = formatTime(phaseLeft);

  if (lobbyInfoEl) lobbyInfoEl.textContent = "Oyun başladı! Yumurtaları topla.";
  if (countdownBig) countdownBig.textContent = "";

  // ✅ OYUN BAŞLAYINCA PANEL KAPANSIN
  if (storyPanel) storyPanel.style.display = "none";

  if (resultOverlay) resultOverlay.style.display = "none";
}




else if (phase === PHASE.RESULTS) {
  if (hudTime) hudTime.textContent = "00:00";
  if (countdownBig) countdownBig.textContent = "";
  showResults();
}


// 🔒 STORY RESET (HER FRAME, AYRI)


    // ===== Zombie warning + zombie hour (asıl mantık)
    if (phase === PHASE.GAME) {
      const elapsed = GAME_SECONDS - phaseLeft;

      if (
        elapsed > ZOMBIE_HOUR_START - 3 &&
        elapsed < ZOMBIE_HOUR_START &&
        !zombieWarning
      ) {
        zombieWarning = true;
        zombieWarningTimer = 3;
      }

      if (elapsed >= ZOMBIE_HOUR_START && !isZombieHour) {
        isZombieHour = true;
        spawnZombies();
      }

      // +200 zombi (son 1 dk öncesi gibi)
      if (elapsed >= 300 && isZombieHour && !extraZombiesAdded) {
        for (const p of players) {
          for (let i = 0; i < 200 / Math.max(1, players.length); i++) {
            const typeKey = getZombieType();
            const t = ZOMBIE_TYPES[typeKey];

            const ang = Math.random() * Math.PI * 2;
            const d = 600 + Math.random() * 800;

         zombies.push({
  type: typeKey,
  x: p.x + Math.cos(ang) * d,
  y: p.y + Math.sin(ang) * d,
  vx: rand(-1,1),
  vy: rand(-1,1),
  speed: ZOMBIE_BASE_SPEED * rand(t.speedMin, t.speedMax),
  size: ZOMBIE_R * t.size,
  damage: t.damage,
  color: t.color,
  hitCD: 0,
  dirTimer: rand(1,3)
});
          }
        }
        extraZombiesAdded = true;
      }

      if (elapsed > ZOMBIE_HOUR_END && isZombieHour) {
        isZombieHour = false;
        zombieWarning = false;
        extraZombiesAdded = false;
        zombies.length = 0;
      }
    }

    if (zombieWarning) {
      zombieWarningTimer -= dt;
      if (countdownBig) {
        countdownBig.textContent =
          `⚠️ ZOMBİ SAATİ ${Math.ceil(zombieWarningTimer)} SANİYE SONRA`;
      }
      if (zombieWarningTimer <= 0) {
        zombieWarning = false;
        if (countdownBig) countdownBig.textContent = "";
      }
    }

    if (hudEggs) {
  hudEggs.textContent = String(remainingEggs);
}


    // =========================
    // PLAYER LOGIC
    // =========================
    if (me && phase === PHASE.GAME) {
      const { vx, vy, moving } = getMoveVector();

      if (moving && me.stamina > 0) {
        me.stamina -= STAMINA_DRAIN * dt;
      } else {
        me.stamina += STAMINA_REGEN * dt;
      }
      me.stamina = clamp(me.stamina, 0, STAMINA_MAX);

      const speed = getPlayerSpeed(me);
      me.x += vx * speed * dt;
      me.y += vy * speed * dt;

      me.x = clamp(me.x, me.r, WORLD_W - me.r);
      me.y = clamp(me.y, me.r, WORLD_H - me.r);

      tryPickupEggs(me);
      sendMyMoveThrottled(now, me);
    }

    // =========================
    // ZOMBIE DAMAGE
    // =========================
    if (isZombieHour && me) {
      for (const z of zombies) {
        z.dirTimer -= dt;
        if (z.dirTimer <= 0) {
          z.vx = rand(-1,1);
          z.vy = rand(-1,1);
          const l = Math.hypot(z.vx, z.vy) || 1;
          z.vx /= l;
          z.vy /= l;
          z.dirTimer = rand(1,3);
        }

        z.x += z.vx * z.speed * dt;
        z.y += z.vy * z.speed * dt;

        z.x = clamp(z.x, 0, WORLD_W);
        z.y = clamp(z.y, 0, WORLD_H);

        z.hitCD -= dt;
        if (
          z.hitCD <= 0 &&
          dist2(z.x, z.y, me.x, me.y) < (z.size + me.r) ** 2
        ) {
          me.eggs = Math.max(0, me.eggs - z.damage);

          effects.push({
            type: "minus",
            x: me.x,
            y: me.y - 18,
            text: `-${z.damage}`,
            life: 0.9,
            vy: -30,
            color: "#ff3b3b"
          });

          z.hitCD = ZOMBIE_HIT_COOLDOWN;
        }
      }
    }

    // =========================
    // EFFECTS UPDATE
    // =========================
    for (let i = effects.length - 1; i >= 0; i--) {
      const ef = effects[i];
      ef.life -= dt;

      if (ef.type === "plus" || ef.type === "minus") {
        ef.y += (ef.vy || -34) * dt;
      } else if (ef.type === "particle") {
        ef.x += ef.vx * dt;
        ef.y += ef.vy * dt;
        ef.vx *= (1 - 2.2 * dt);
        ef.vy *= (1 - 2.2 * dt);
      }

      if (ef.life <= 0) effects.splice(i, 1);
    }

    // =========================
    // RENDER
    // =========================
    drawFrame(me);

    if (getMe()) {
      renderLeaderboard();
      renderLobbyList();
    }

    requestAnimationFrame(tick);
  }

  // =========================
  // DRAW FRAME
  // =========================
function drawFrame(me) {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  ctx.clearRect(0, 0, viewW, viewH);

  const zoom = CAMERA_ZOOM;
  let camX = 0, camY = 0;

  if (me) {
    const cam = computeCamera(me, zoom);
    camX = cam.camX;
    camY = cam.camY;
  }

  // 1️⃣ ZEMİN
  drawWorldGround(camX, camY, zoom);

  // 2️⃣ YUMURTALAR (AĞAÇLARIN ARKASINDA)
  for (const e of eggs) {
    if (!e.takenBy) drawEgg(e, camX, camY, zoom);
  }

  // 3️⃣ AĞAÇLAR
  drawTrees(camX, camY, zoom);

  // 4️⃣ PLAYER + ZOMBIE (Y-depth)
  const drawables = [];

  for (const p of players) {
    let alpha = 1;

    // 🌲 AĞAÇ ARKASI ŞEFFAFLIK
    const nearTree = findNearbyTreeForPlayer(p);
    if (nearTree && p.y < nearTree.baseY - 2) {
      alpha = 0.45;
    }

    drawables.push({ type: "player", y: p.y, p, alpha });
  }

  if (isZombieHour) {
    for (const z of zombies) {
      drawables.push({ type: "zombie", y: z.y, z });
    }
  }

  drawables.sort((a, b) => a.y - b.y);

  for (const d of drawables) {
    if (d.type === "player") {
      drawPlayer(d.p, camX, camY, zoom, d.alpha);
    } else {
      const z = d.z;
      const sx = (z.x - camX) * zoom;
      const sy = (z.y - camY) * zoom;

      ctx.save();
      ctx.fillStyle = z.color;
      ctx.shadowColor = z.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(sx, sy, z.size * zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // 5️⃣ EFFECTLER
  for (const ef of effects) {
    const sx = (ef.x - camX) * zoom;
    const sy = (ef.y - camY) * zoom;

    ctx.save();
    ctx.globalAlpha = clamp(ef.life, 0, 1);
    ctx.fillStyle = ef.color || "#ffd700";
    ctx.font = `${Math.max(14, 18 * zoom)}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText(ef.text, sx, sy);
    ctx.restore();
  }

  // 6️⃣ FOG + HUD
  drawFogOverlay();
  drawStaminaBar(me);
}


  // =========================
  // SOCKET EVENTS
  // =========================
  if (socket) {
    socket.on("init", data => {
      myId = data.id;

      players.length = 0;
      playersById.clear();
      data.players.forEach(upsertPlayer);

      applyServerEggs(data.eggs);
      setPhaseByTotalTimeLeft(data.timeLeft);

      if (overlay) overlay.style.display = "none";
    });

    socket.on("playerJoined", p => upsertPlayer(p));
    socket.on("playerLeft", id => removePlayer(id));
    socket.on("playerMoved", p => upsertPlayer(p));

    socket.on("eggTaken", ({ eggId, playerId }) => {
  const e = eggs.find(x => x.id === eggId);
  if (e) e.takenBy = playerId;

  // 🔥 SKORU CLIENT'TA DA ARTIR
const p = playersById.get(playerId);
if (p) {
  // Eğer bu yumurtayı ben client'ta zaten optimistic saydıysam
  if (playerId === myId && optimisticEggs.has(eggId)) {
    optimisticEggs.delete(eggId);
  } else {
    p.eggs += 1;
  }
}


  // 🔥 PANELİ ZORLA YENİDEN ÇİZ
  renderLeaderboard();
});


    socket.on("gameOver", () => {
      phase = PHASE.RESULTS;
      phaseLeft = 0;
    });

    socket.on("tick", totalLeft => {
  setPhaseByTotalTimeLeft(totalLeft);

  // 🔒 UI'YI ZORLA GÜNCELLE
  if (hudTime) hudTime.textContent = formatTime(phaseLeft);

  if (countdownBig && phase === PHASE.LOBBY) {
    countdownBig.textContent =
      `⏱️ Oyun ${Math.ceil(phaseLeft)} saniye sonra başlıyor…`;
  }
});

	  console.log("🟢 OYUN ONLINE - SOCKET BAĞLANDI");

  }

  // =========================
  // INIT
  // =========================
  // =========================
// INIT
// =========================
generateWorldTiles();

storyShown = false;
if (storyPanel) storyPanel.style.display = "none";

if (overlay) overlay.style.display = "block";
requestAnimationFrame(tick);

})();















