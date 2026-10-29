const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const hud = document.getElementById("hud");
const hudLevel = document.getElementById("hud-level");
const hudHits = document.getElementById("hud-hits");
const hudTimer = document.getElementById("hud-timer");
const hudTimerCard = document.getElementById("hud-timer-card");
const overlay = document.getElementById("overlay");
const overlayKicker = document.getElementById("overlay-kicker");
const overlayTitle = document.getElementById("overlay-title");
const overlayCopy = document.getElementById("overlay-copy");
const overlayBtn = document.getElementById("overlay-btn");

const WORLD = { w: 960, h: 620 };
const HITS_TO_WIN = 3;
const LEVEL_SECONDS = 60;
const BASE_PATH_SPEED = 0.22;
const LEVEL_SPEED_STEP = 0.055;
const GUN_SPEED = 460;
const SHOT_SPEED = 720;
const FIRE_COOLDOWN = 0.22;
const BALL_RADIUS = 18;
const SHOT_RADIUS = 4;
const RESPAWN_DELAY = 0.45;
const PATH_PAD = 88;
const PATH_Y = 168;
const PATH_AMP = 56;

const keys = {
  left: false,
  right: false,
  space: false,
};

const COPY = {
  start: {
    kicker: "Calibration",
    title: "Path interceptor",
    copy: "Track the sphere along its corridor. Land three hits before the minute expires to graduate.",
    button: "Begin session",
  },
  win: {
    kicker: "Cleared",
    title: "Level complete",
    copy: "Three intercepts logged. The next corridor uses the same path at higher velocity.",
    button: "Next level",
  },
  lose: {
    kicker: "Expired",
    title: "Time out",
    copy: "Fewer than three hits in sixty seconds. Reset the clock and try this level again.",
    button: "Try again",
  },
};

const state = {
  mode: "start",
  level: 1,
  hits: 0,
  timeLeft: LEVEL_SECONDS,
  gunX: WORLD.w / 2,
  fireCooldown: 0,
  shots: [],
  ball: null,
  respawnIn: 0,
  pathT: 0,
  lastTs: 0,
};

function ballSpeed() {
  return BASE_PATH_SPEED + (state.level - 1) * LEVEL_SPEED_STEP;
}

function pathPoint(t) {
  const u = pingPong(t);
  const x = PATH_PAD + (WORLD.w - PATH_PAD * 2) * u;
  const y = PATH_Y + Math.sin(u * Math.PI * 2) * PATH_AMP;
  return { x, y };
}

function pingPong(t) {
  const cycle = ((t % 2) + 2) % 2;
  return cycle < 1 ? cycle : 2 - cycle;
}

function spawnBall() {
  state.ball = { t: state.pathT, r: BALL_RADIUS };
}

function resetRound({ advanceLevel = false, sameLevel = false } = {}) {
  if (advanceLevel) state.level += 1;
  if (!sameLevel && !advanceLevel) state.level = 1;
  state.hits = 0;
  state.timeLeft = LEVEL_SECONDS;
  state.gunX = WORLD.w / 2;
  state.fireCooldown = 0;
  state.shots = [];
  state.pathT = 0;
  state.respawnIn = 0;
  spawnBall();
  updateHud();
}

function startPlaying({ advanceLevel = false, sameLevel = false } = {}) {
  resetRound({ advanceLevel, sameLevel });
  state.mode = "play";
  overlay.hidden = true;
  hud.hidden = false;
}

function showOverlay(kind) {
  const data = COPY[kind];
  overlayKicker.textContent = data.kicker;
  overlayTitle.textContent = data.title;
  overlayCopy.textContent = data.copy;
  overlayBtn.textContent = data.button;
  overlay.hidden = false;
  hud.hidden = kind === "start";
  if (kind !== "start") hud.hidden = false;
}

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function updateHud() {
  hudLevel.textContent = String(state.level);
  hudHits.textContent = `${state.hits} / ${HITS_TO_WIN}`;
  hudTimer.textContent = formatTime(state.timeLeft);
  hudTimerCard.classList.toggle("warn", state.mode === "play" && state.timeLeft <= 10);
}

function fire() {
  if (state.fireCooldown > 0) return;
  const barrelY = WORLD.h - 92;
  state.shots.push({ x: state.gunX, y: barrelY, r: SHOT_RADIUS });
  state.fireCooldown = FIRE_COOLDOWN;
}

function hitTest(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const rr = a.r + b.r;
  return dx * dx + dy * dy <= rr * rr;
}

function endLevel(result) {
  state.mode = result;
  state.shots = [];
  showOverlay(result);
}

function update(dt) {
  if (state.mode !== "play") return;

  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    updateHud();
    endLevel("lose");
    return;
  }

  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  state.gunX = clamp(state.gunX + dir * GUN_SPEED * dt, 48, WORLD.w - 48);

  if (keys.space) fire();
  state.fireCooldown = Math.max(0, state.fireCooldown - dt);

  for (const shot of state.shots) {
    shot.y -= SHOT_SPEED * dt;
  }
  state.shots = state.shots.filter((shot) => shot.y + shot.r > 0);

  if (state.ball) {
    state.ball.t += ballSpeed() * dt;
    state.pathT = state.ball.t;
    const pos = pathPoint(state.ball.t);
    const target = { x: pos.x, y: pos.y, r: state.ball.r };

    for (let i = state.shots.length - 1; i >= 0; i -= 1) {
      if (hitTest(state.shots[i], target)) {
        state.shots.splice(i, 1);
        state.hits += 1;
        state.ball = null;
        state.respawnIn = RESPAWN_DELAY;
        updateHud();
        if (state.hits >= HITS_TO_WIN) {
          endLevel("win");
          return;
        }
        break;
      }
    }
  } else {
    state.respawnIn -= dt;
    if (state.respawnIn <= 0) spawnBall();
  }

  updateHud();
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, WORLD.h);
  g.addColorStop(0, "#101827");
  g.addColorStop(1, "#070b12");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  const glow = ctx.createRadialGradient(
    WORLD.w * 0.5,
    WORLD.h * 0.18,
    20,
    WORLD.w * 0.5,
    WORLD.h * 0.2,
    420
  );
  glow.addColorStop(0, "rgba(56, 189, 248, 0.10)");
  glow.addColorStop(1, "rgba(56, 189, 248, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  ctx.save();
  ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 40; x < WORLD.w; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD.h);
    ctx.stroke();
  }
  for (let y = 40; y < WORLD.h; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD.w, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPath() {
  ctx.save();
  ctx.strokeStyle = "rgba(94, 234, 212, 0.22)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 10]);
  ctx.beginPath();
  const steps = 80;
  for (let i = 0; i <= steps; i += 1) {
    const p = pathPoint(i / steps);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawBall() {
  if (!state.ball) return;
  const p = pathPoint(state.ball.t);
  const r = state.ball.r;
  ctx.save();
  ctx.shadowColor = "rgba(125, 211, 252, 0.55)";
  ctx.shadowBlur = 18;
  const g = ctx.createRadialGradient(p.x - 5, p.y - 6, 3, p.x, p.y, r);
  g.addColorStop(0, "#f8fbff");
  g.addColorStop(0.35, "#7dd3fc");
  g.addColorStop(1, "#0369a1");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawShots() {
  for (const shot of state.shots) {
    ctx.save();
    ctx.shadowColor = "#5eead4";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#ccfbf1";
    ctx.beginPath();
    ctx.roundRect(shot.x - 2, shot.y - 10, 4, 16, 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawGun() {
  const x = state.gunX;
  const y = WORLD.h - 54;
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
  ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-36, 8, 72, 18, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#1e293b";
  ctx.beginPath();
  ctx.roundRect(-22, -6, 44, 22, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#334155";
  ctx.beginPath();
  ctx.roundRect(-6, -38, 12, 36, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#5eead4";
  ctx.beginPath();
  ctx.arc(0, 4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function draw() {
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  drawBackground();
  drawPath();
  drawBall();
  drawShots();
  drawGun();
}

function frame(ts) {
  const last = state.lastTs || ts;
  const dt = Math.min(0.033, (ts - last) / 1000);
  state.lastTs = ts;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

function resize() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  state.dpr = dpr;
  canvas.width = Math.floor(WORLD.w * dpr);
  canvas.height = Math.floor(WORLD.h * dpr);
  draw();
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function onOverlayAction() {
  if (state.mode === "start" || state.mode === "lose") {
    startPlaying({ sameLevel: state.mode === "lose" });
    return;
  }
  if (state.mode === "win") {
    startPlaying({ advanceLevel: true });
  }
}

function isTypingTarget(el) {
  return el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

window.addEventListener("keydown", (event) => {
  if (isTypingTarget(event.target)) return;
  if (event.code === "ArrowLeft") keys.left = true;
  if (event.code === "ArrowRight") keys.right = true;
  if (event.code === "Space") {
    event.preventDefault();
    if (state.mode !== "play") {
      if (!event.repeat) onOverlayAction();
      return;
    }
    keys.space = true;
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "ArrowLeft") keys.left = false;
  if (event.code === "ArrowRight") keys.right = false;
  if (event.code === "Space") keys.space = false;
});

overlayBtn.addEventListener("click", onOverlayAction);
window.addEventListener("resize", resize);

window.__aperture = {
  getState: () => state,
  ballSpeed,
  pathPoint,
};

showOverlay("start");
resize();
requestAnimationFrame(frame);
