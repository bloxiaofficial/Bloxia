/* Bloxia — in-browser 3D obby game (Three.js) */
(function () {
  const { GAMES, State, gameCard, toast, fmt } = window.Bloxia;
  const params = new URLSearchParams(location.search);
  const gameId = params.get("id") || "obby-tower";
  const game = GAMES.find(g => g.id === gameId) || GAMES[0];

  // ---- Page chrome ----
  document.getElementById("gameTitle").textContent = game.title;
  document.getElementById("overlayTitle").textContent = game.title;
  document.getElementById("gameMeta").innerHTML =
    `${game.genre} · 👍 ${game.rating}% · ▶ ${fmt(game.plays)} plays`;
  const icon = document.getElementById("gameIcon");
  icon.style.background = `linear-gradient(150deg,${game.grad[0]},${game.grad[1]})`;
  icon.style.display = "grid"; icon.style.placeItems = "center"; icon.style.fontSize = "34px";
  icon.textContent = game.emoji;

  const more = GAMES.filter(g => g.id !== game.id && g.genre === game.genre).concat(
    GAMES.filter(g => g.id !== game.id && g.genre !== game.genre)).slice(0, 8);
  document.getElementById("moreRow").append(...more.map(gameCard));

  const likeBtn = document.getElementById("likeBtn");
  function syncLike() {
    const liked = State.data.likes[game.id];
    likeBtn.textContent = liked ? "👍 Liked" : "👍 Like";
    likeBtn.classList.toggle("dark", !!liked);
    likeBtn.classList.toggle("green", !liked);
  }
  likeBtn.onclick = () => {
    State.data.likes[game.id] = !State.data.likes[game.id];
    State.save(); syncLike();
    toast(State.data.likes[game.id] ? "Liked!" : "Removed like");
  };
  syncLike();

  // ===================== THREE.JS GAME =====================
  const canvas = document.getElementById("game-canvas");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 40, 140);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 500);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  // Lights
  const sun = new THREE.DirectionalLight(0xffffff, 0.95);
  sun.position.set(30, 60, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  scene.add(new THREE.HemisphereLight(0xbfe0ff, 0x4a7a3a, 0.5));

  // ---- Build the obby course ----
  const platforms = [];
  const coins = [];
  const hazards = [];
  let finishPad = null;

  function addPlatform(x, y, z, w, d, color, opts = {}) {
    const geo = new THREE.BoxGeometry(w, 1, d);
    const mat = new THREE.MeshLambertMaterial({ color });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.receiveShadow = true; m.castShadow = true;
    scene.add(m);
    const p = { mesh: m, x, y, z, w, d, ...opts };
    platforms.push(p);
    return p;
  }

  function addCoin(x, y, z) {
    const geo = new THREE.CylinderGeometry(0.5, 0.5, 0.12, 18);
    const mat = new THREE.MeshLambertMaterial({ color: 0xf5b50a, emissive: 0x6b4e00 });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y + 1.4, z);
    m.castShadow = true;
    scene.add(m);
    coins.push({ mesh: m, taken: false });
  }

  const STAGE_COLORS = [0x00b06f, 0x00a2ff, 0xf5b50a, 0xff5b54, 0xa14bff, 0xff8fb1];
  let stageCount = 0;

  // Start pad
  addPlatform(0, 0, 0, 10, 10, 0x4a7a3a, { safe: true });

  // Procedural-ish climbing course: each stage rises and shifts
  let cx = 0, cz = -8, cy = 0;
  const stagePositions = [];
  function buildCourse() {
    const layout = [
      { dx: 0, dz: -7, dy: 2.5, w: 5, d: 5 },
      { dx: 5, dz: -6, dy: 2.5, w: 4, d: 4 },
      { dx: 6, dz: 0, dy: 2.5, w: 4, d: 4, gap: true },
      { dx: 4, dz: 6, dy: 3, w: 4, d: 4 },
      { dx: -3, dz: 6, dy: 2.5, w: 3.5, d: 3.5 },
      { dx: -7, dz: 0, dy: 3, w: 4, d: 4, moving: true },
      { dx: -6, dz: -6, dy: 2.5, w: 4, d: 4 },
      { dx: 0, dz: -8, dy: 3, w: 4, d: 4 },
      { dx: 7, dz: -5, dy: 2.5, w: 3.5, d: 3.5, hazardNear: true },
      { dx: 8, dz: 3, dy: 3, w: 4, d: 4, moving: true },
      { dx: 2, dz: 8, dy: 2.5, w: 4, d: 4 },
      { dx: -6, dz: 6, dy: 3, w: 5, d: 5 },
    ];
    layout.forEach((l, i) => {
      cx += l.dx; cz += l.dz; cy += l.dy;
      const color = STAGE_COLORS[i % STAGE_COLORS.length];
      const opts = {};
      if (l.moving) { opts.moving = true; opts.baseX = cx; opts.phase = i; }
      const p = addPlatform(cx, cy, cz, l.w, l.d, color, opts);
      // a checkpoint every 2 platforms
      if (i % 2 === 0) { p.checkpoint = true; stageCount++; stagePositions.push({ x: cx, y: cy, z: cz }); }
      // coins
      addCoin(cx, cy, cz);
      if (l.hazardNear) {
        // spinning hazard bar (visual + deadly)
        const bar = new THREE.Mesh(new THREE.BoxGeometry(6, 0.6, 0.6),
          new THREE.MeshLambertMaterial({ color: 0xe2231a, emissive: 0x400 }));
        bar.position.set(cx, cy + 1.2, cz);
        scene.add(bar);
        hazards.push({ mesh: bar, cx, cy: cy + 1.2, cz, r: 3 });
      }
    });
    // Finish pad (gold) at the top
    cy += 3; cz -= 7;
    finishPad = addPlatform(cx, cy, cz, 6, 6, 0xf5b50a, { finish: true, safe: true });
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2, 4),
      new THREE.MeshLambertMaterial({ color: 0xe2231a }));
    flag.position.set(cx, cy + 2, cz);
    scene.add(flag);
  }
  buildCourse();
  document.getElementById("stageTotal").textContent = stageCount;

  // ---- Player (blocky avatar using saved colors) ----
  const av = State.data.avatar;
  const player = new THREE.Group();
  function box(w, h, d, color, y) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color }));
    m.position.y = y; m.castShadow = true; player.add(m); return m;
  }
  box(0.9, 0.9, 0.9, parseInt(av.skin.replace("#", "0x")) || 0xf6c177, 1.55);   // head
  box(1.1, 1.1, 0.6, parseInt(av.shirt.replace("#", "0x")) || 0xe2231a, 0.75);  // torso
  box(0.35, 1.1, 0.5, parseInt(av.pants.replace("#", "0x")) || 0x2b3a55, -0.35); // legs
  scene.add(player);

  const spawn = { x: 0, y: 2, z: 0 };
  const pos = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
  const vel = new THREE.Vector3();
  let onGround = false;
  let currentCheckpoint = { x: 0, y: 2, z: 0 };

  // ---- Controls ----
  const keys = {};
  let yaw = 0, pitch = 0.25;
  let running = false;
  let coinsCollected = 0;
  let startTime = 0, elapsed = 0;
  let won = false;

  window.addEventListener("keydown", e => {
    keys[e.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    if (e.code === "KeyR") respawn();
  });
  window.addEventListener("keyup", e => { keys[e.code] = false; });

  canvas.addEventListener("click", () => { if (running) canvas.requestPointerLock(); });
  document.addEventListener("mousemove", e => {
    if (document.pointerLockElement === canvas) {
      yaw -= e.movementX * 0.0025;
      pitch = Math.max(-0.3, Math.min(1.2, pitch + e.movementY * 0.0025));
    }
  });

  function respawn() {
    pos.set(currentCheckpoint.x, currentCheckpoint.y + 1, currentCheckpoint.z);
    vel.set(0, 0, 0);
  }

  // ---- Physics + collision ----
  const GRAVITY = -32, MOVE = 9, JUMP = 12, PLAYER_R = 0.5;

  function topPlatformAt(x, z, y) {
    let best = null;
    for (const p of platforms) {
      const px = p.mesh.position.x, pz = p.mesh.position.z;
      if (x > px - p.w / 2 - PLAYER_R && x < px + p.w / 2 + PLAYER_R &&
          z > pz - p.d / 2 - PLAYER_R && z < pz + p.d / 2 + PLAYER_R) {
        const top = p.mesh.position.y + 0.5;
        if (y >= top - 0.6 && (best === null || top > best.top)) best = { top, p };
      }
    }
    return best;
  }

  function update(dt) {
    // moving platforms
    const t = performance.now() / 1000;
    for (const p of platforms) {
      if (p.moving) {
        const nx = p.baseX + Math.sin(t * 0.8 + p.phase) * 4;
        p.mesh.position.x = nx;
      }
    }
    // hazards spin
    for (const h of hazards) {
      h.mesh.rotation.y += dt * 2.2;
    }
    // coins spin
    for (const c of coins) { if (!c.taken) c.mesh.rotation.z += dt * 3; }

    if (!running || won) return;

    // movement relative to yaw
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const move = new THREE.Vector3();
    if (keys["KeyW"] || keys["ArrowUp"]) move.add(forward);
    if (keys["KeyS"] || keys["ArrowDown"]) move.sub(forward);
    if (keys["KeyD"] || keys["ArrowRight"]) move.add(right);
    if (keys["KeyA"] || keys["ArrowLeft"]) move.sub(right);
    if (move.lengthSq() > 0) { move.normalize(); player.rotation.y = Math.atan2(move.x, move.z); }

    vel.x = move.x * MOVE;
    vel.z = move.z * MOVE;
    vel.y += GRAVITY * dt;

    if ((keys["Space"]) && onGround) { vel.y = JUMP; onGround = false; }

    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    pos.y += vel.y * dt;

    // ground collision
    const hit = topPlatformAt(pos.x, pos.z, pos.y + 0.9);
    onGround = false;
    if (hit && vel.y <= 0 && pos.y <= hit.top + 0.95) {
      pos.y = hit.top + 0.9;
      vel.y = 0; onGround = true;
      if (hit.p.checkpoint && (currentCheckpoint.y < hit.p.mesh.position.y)) {
        currentCheckpoint = { x: hit.p.mesh.position.x, y: hit.p.mesh.position.y, z: hit.p.mesh.position.z };
        const stageIdx = stagePositions.findIndex(s => Math.abs(s.y - hit.p.y) < 0.01) + 1;
        if (stageIdx > 0) document.getElementById("stage").textContent = stageIdx;
        toast("Checkpoint reached!");
      }
      if (hit.p.finish && !won) winGame();
    }

    // hazard collision
    for (const h of hazards) {
      const dx = pos.x - h.cx, dz = pos.z - h.cz, dy = pos.y - h.cy;
      if (Math.abs(dy) < 1.2 && Math.sqrt(dx * dx + dz * dz) < 1.0) { toast("Ouch! Respawning…"); respawn(); }
    }

    // coin pickup
    for (const c of coins) {
      if (c.taken) continue;
      const d = c.mesh.position.distanceTo(new THREE.Vector3(pos.x, pos.y + 0.9, pos.z));
      if (d < 1.3) {
        c.taken = true; c.mesh.visible = false; coinsCollected++;
        document.getElementById("coins").textContent = coinsCollected;
      }
    }

    // fell off
    if (pos.y < currentCheckpoint.y - 25 || pos.y < -30) { toast("You fell! Respawning…"); respawn(); }

    player.position.copy(pos);

    // camera follow (third person)
    const camDist = 9, camH = 4.5;
    const cax = pos.x + Math.sin(yaw) * camDist * Math.cos(pitch);
    const caz = pos.z + Math.cos(yaw) * camDist * Math.cos(pitch);
    const cay = pos.y + camH + Math.sin(pitch) * camDist;
    camera.position.set(cax, cay, caz);
    camera.lookAt(pos.x, pos.y + 1, pos.z);

    elapsed = (performance.now() - startTime) / 1000;
    document.getElementById("timer").textContent = elapsed.toFixed(1);
  }

  function winGame() {
    won = true; running = false;
    const reward = 500 + coinsCollected * 50;
    State.data.bux += reward; State.save();
    window.Bloxia.renderHeader();
    document.getElementById("winText").innerHTML =
      `Finished in <b>${elapsed.toFixed(1)}s</b> with <b>${coinsCollected}</b> coins.<br>You earned <b>${reward.toLocaleString()} Bux</b>! 💰`;
    document.getElementById("winOverlay").classList.remove("hidden");
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ---- Loop ----
  let last = performance.now();
  function loop() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    resize();
    update(dt);
    if (!running) { // idle camera orbit on start screen
      const t = now / 1000;
      camera.position.set(Math.sin(t * 0.3) * 16, 9, Math.cos(t * 0.3) * 16);
      camera.lookAt(0, 4, 0);
      player.position.copy(pos);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  function start() {
    pos.set(spawn.x, spawn.y, spawn.z);
    currentCheckpoint = { x: 0, y: 2, z: 0 };
    coinsCollected = 0; won = false;
    document.getElementById("coins").textContent = 0;
    document.getElementById("stage").textContent = 1;
    document.getElementById("startOverlay").classList.add("hidden");
    document.getElementById("winOverlay").classList.add("hidden");
    running = true;
    startTime = performance.now();
    canvas.requestPointerLock();
  }

  document.getElementById("startBtn").onclick = start;
  document.getElementById("playAgainBtn").onclick = start;

  player.position.copy(pos);
  loop();
})();
