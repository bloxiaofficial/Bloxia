/* Bloxia — shared app state, data, and UI helpers */
(function () {
  "use strict";

  // ---------- Persistent state ----------
  const DEFAULTS = {
    bux: 12500,
    username: "Builder",
    avatar: { skin: "#f6c177", shirt: "#e2231a", pants: "#2b3a55", face: ":)", hat: "none" },
    owned: ["item-cap-red"],
    likes: {}
  };

  const State = {
    data: load(),
    save() { localStorage.setItem("bloxia.state", JSON.stringify(this.data)); },
    set(partial) { Object.assign(this.data, partial); this.save(); },
  };

  // ---------- Auth (server-backed when available) ----------
  const API = window.BloxiaAPI || null;
  function isAuthed() { return !!(API && API.isConfigured() && API.getToken()); }

  function applyServerUser(user) {
    if (!user) return;
    State.data.username = user.username;
    State.data.bux = user.coins;
    if (user.avatar && typeof user.avatar === "object") {
      State.data.avatar = Object.assign({}, DEFAULTS.avatar, user.avatar);
    }
    State.save();
  }

  async function refreshUser() {
    if (!isAuthed()) return null;
    try {
      const { user } = await API.me();
      applyServerUser(user);
      renderHeader();
      return user;
    } catch (e) {
      // token invalid/expired -> drop it, fall back to guest
      API.setToken(null);
      renderHeader();
      return null;
    }
  }

  function logout() {
    if (API) API.setToken(null);
    localStorage.removeItem("bloxia.state");
    location.href = "index.html";
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem("bloxia.state"));
      if (raw && typeof raw === "object") return Object.assign({}, DEFAULTS, raw,
        { avatar: Object.assign({}, DEFAULTS.avatar, raw.avatar || {}) });
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  // ---------- Catalog data ----------
  const GAMES = [
    { id: "obby-tower", title: "Mega Obby Tower", emoji: "🗼", grad: ["#ff6a3d", "#f9a826"], plays: 184200000, rating: 92, genre: "Obby", featured: true, playable: true },
    { id: "tycoon-pizza", title: "Pizza Tycoon", emoji: "🍕", grad: ["#ff5b54", "#ffba49"], plays: 98300000, rating: 88, genre: "Tycoon" },
    { id: "jail-escape", title: "Jail Escape", emoji: "🚓", grad: ["#3a6ea5", "#6fd3ff"], plays: 412000000, rating: 90, genre: "Adventure", featured: true },
    { id: "pet-sim", title: "Pet Simulator X", emoji: "🐾", grad: ["#7a5cff", "#c39bff"], plays: 256000000, rating: 95, genre: "Simulator", featured: true },
    { id: "build-battle", title: "Build Battle", emoji: "🧱", grad: ["#00b06f", "#5be0a8"], plays: 64000000, rating: 84, genre: "Building" },
    { id: "speed-run", title: "Speed Run Infinity", emoji: "🏃", grad: ["#ff3d7f", "#ff9ec4"], plays: 73000000, rating: 86, genre: "Obby", playable: true },
    { id: "natural-disaster", title: "Survive the Disaster", emoji: "🌪️", grad: ["#444b59", "#8c97ad"], plays: 130000000, rating: 89, genre: "Survival" },
    { id: "hangout", title: "Bloxy Hangout", emoji: "🛋️", grad: ["#ff8fb1", "#ffd1e0"], plays: 41000000, rating: 80, genre: "Social" },
    { id: "racing", title: "Turbo Racing", emoji: "🏎️", grad: ["#e2231a", "#ff8a65"], plays: 88000000, rating: 87, genre: "Racing" },
    { id: "zombie", title: "Zombie Rush", emoji: "🧟", grad: ["#2d6a4f", "#95d5b2"], plays: 152000000, rating: 91, genre: "Fighting" },
    { id: "fashion", title: "Fashion Famous", emoji: "👗", grad: ["#c44dff", "#ffb3ff"], plays: 55000000, rating: 83, genre: "Social" },
    { id: "mining", title: "Deep Mine Tycoon", emoji: "⛏️", grad: ["#5e503f", "#a98467"], plays: 67000000, rating: 85, genre: "Tycoon" },
  ];

  const ITEMS = [
    { id: "item-cap-red", name: "Classic Red Cap", emoji: "🧢", price: 0, cat: "Hats", rare: "Common" },
    { id: "item-crown", name: "Golden Crown", emoji: "👑", price: 9500, cat: "Hats", rare: "Legendary" },
    { id: "item-wings", name: "Shadow Wings", emoji: "🦋", price: 6800, cat: "Back", rare: "Epic" },
    { id: "item-sword", name: "Bloxy Blade", emoji: "🗡️", price: 4200, cat: "Gear", rare: "Rare" },
    { id: "item-shades", name: "Cool Shades", emoji: "🕶️", price: 1500, cat: "Face", rare: "Common" },
    { id: "item-jetpack", name: "Turbo Jetpack", emoji: "🎒", price: 12000, cat: "Back", rare: "Legendary" },
    { id: "item-headphones", name: "Beat Headphones", emoji: "🎧", price: 2300, cat: "Hats", rare: "Rare" },
    { id: "item-pet-dragon", name: "Baby Dragon", emoji: "🐉", price: 15000, cat: "Pets", rare: "Legendary" },
    { id: "item-skateboard", name: "Neon Skateboard", emoji: "🛹", price: 3100, cat: "Gear", rare: "Rare" },
    { id: "item-flower", name: "Daisy Crown", emoji: "🌼", price: 800, cat: "Hats", rare: "Common" },
    { id: "item-robot", name: "Robot Helmet", emoji: "🤖", price: 5400, cat: "Hats", rare: "Epic" },
    { id: "item-balloon", name: "Party Balloon", emoji: "🎈", price: 600, cat: "Back", rare: "Common" },
  ];

  const RARE_COLOR = { Common: "#7a8288", Rare: "#00a2ff", Epic: "#a14bff", Legendary: "#f5b50a" };

  // ---------- Helpers ----------
  function fmt(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B+";
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M+";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K+";
    return String(n);
  }
  function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }

  function toast(msg) {
    let t = document.querySelector(".toast");
    if (!t) { t = el(`<div class="toast"></div>`); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 1900);
  }

  function gameCard(g) {
    const liked = State.data.likes[g.id];
    const c = el(`
      <a class="card" href="game.html?id=${g.id}">
        <div class="thumb" style="background:linear-gradient(150deg,${g.grad[0]},${g.grad[1]})">
          ${g.featured ? `<span class="badge">★ Featured</span>` : ``}
          <span class="emoji">${g.emoji}</span>
        </div>
        <div class="card-body">
          <p class="card-title">${g.title}</p>
          <div class="card-meta">
            <span class="pill-green">${g.rating}%</span>
            <span>▶ ${fmt(g.plays)}</span>
          </div>
        </div>
      </a>`);
    return c;
  }

  function itemCard(item) {
    const owned = State.data.owned.includes(item.id);
    const c = el(`
      <div class="card shop-item">
        <div class="thumb"><span class="emoji">${item.emoji}</span></div>
        <div class="card-body">
          <p class="card-title">${item.name}</p>
          <div class="card-meta">
            <span style="color:${RARE_COLOR[item.rare]};font-weight:700">${item.rare}</span>
          </div>
          <button class="btn ${owned ? "dark" : "green"} block" style="margin-top:10px;padding:8px" data-buy="${item.id}">
            ${owned ? "Owned" : (item.price === 0 ? "Get Free" : `<span class="price"><span class="bux">B</span>${item.price.toLocaleString()}</span>`)}
          </button>
        </div>
      </div>`);
    return c;
  }

  async function buy(id) {
    const item = ITEMS.find(i => i.id === id);
    if (!item) return;
    if (State.data.owned.includes(id)) { toast("You already own this item."); return; }
    if (State.data.bux < item.price) { toast("Not enough Bux!"); return; }
    if (isAuthed() && item.price > 0) {
      try {
        const { user } = await API.spend(item.price, "item:" + id);
        applyServerUser(user);
      } catch (e) { toast(e.message || "Purchase failed"); return; }
    } else {
      State.data.bux -= item.price;
    }
    if (!State.data.owned.includes(id)) State.data.owned.push(id);
    State.save();
    renderHeader();
    toast(`Purchased ${item.name}!`);
    document.querySelectorAll(`[data-buy="${id}"]`).forEach(b => {
      b.classList.remove("green"); b.classList.add("dark"); b.textContent = "Owned";
    });
  }

  // ---------- Header ----------
  function renderHeader() {
    const path = location.pathname.split("/").pop() || "index.html";
    const slot = document.getElementById("topbar");
    if (!slot) return;
    slot.innerHTML = `
      <div class="topbar-inner">
        <a class="logo" href="index.html"><span class="logo-mark"><span>B</span></span> Blox<b>ia</b></a>
        <nav class="nav-links">
          <a href="index.html" data-p="index.html">Home</a>
          <a href="discover.html" data-p="discover.html">Discover</a>
          <a href="studio.html" data-p="studio.html">Studio</a>
          <a href="avatar.html" data-p="avatar.html">Avatar</a>
          <a href="marketplace.html" data-p="marketplace.html">Marketplace</a>
        </nav>
        <div class="search"><span>🔍</span><input id="searchInput" placeholder="Search games..." /></div>
        <a class="currency" href="coins.html" title="Buy more Bux"><span class="bux">B</span><span id="buxAmt">${State.data.bux.toLocaleString()}</span><span class="buy-plus">+</span></a>
        ${authArea()}
      </div>`;
    const cur = slot.querySelector(`[data-p="${path}"]`);
    if (cur) cur.classList.add("active");
    const si = document.getElementById("searchInput");
    if (si) si.addEventListener("keydown", e => {
      if (e.key === "Enter") location.href = "discover.html?q=" + encodeURIComponent(si.value);
    });
    const lo = document.getElementById("logoutBtn");
    if (lo) lo.addEventListener("click", e => { e.preventDefault(); logout(); });
  }

  function authArea() {
    if (isAuthed()) {
      const u = State.data.username || "Player";
      return `<div class="avatar-chip" title="${u}">${u[0].toUpperCase()}</div>
        <a href="#" id="logoutBtn" class="auth-link">Log out</a>`;
    }
    return `<a href="login.html" class="btn green auth-btn">Log In</a>`;
  }

  function renderFooter() {
    const slot = document.getElementById("footer");
    if (!slot) return;
    slot.innerHTML = `
      <div class="footer-inner">
        <div><b>Bloxia</b> — Powering Imagination™ · A fan-made Roblox-style demo platform.</div>
        <div>About · Jobs · Blog · Parents · Help · Terms · Privacy</div>
        <div>© ${new Date().getFullYear()} Bloxia Demo</div>
      </div>`;
  }

  // click delegation for buy buttons
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-buy]");
    if (b) { e.preventDefault(); buy(b.getAttribute("data-buy")); }
  });

  // expose
  window.Bloxia = { State, GAMES, ITEMS, RARE_COLOR, fmt, el, toast, gameCard, itemCard, buy, renderHeader, renderFooter, isAuthed, refreshUser, applyServerUser, logout, API };

  document.addEventListener("DOMContentLoaded", () => { renderHeader(); renderFooter(); refreshUser(); });
})();
