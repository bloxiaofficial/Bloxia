/* Bloxia — backend API client.
 *
 * The frontend is served from the SAME origin as the API, so all calls are
 * relative ("/api/..."). This avoids CORS/preflight entirely. The app JWT is
 * sent in the custom `X-Auth-Token` header (the `Authorization` header is left
 * untouched so any reverse-proxy Basic auth keeps working). */
(function () {
  "use strict";

  const API_BASE = ""; // same origin
  const TOKEN_KEY = "bloxia.token";

  function getToken() { return localStorage.getItem(TOKEN_KEY) || null; }
  function setToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }
  function isConfigured() { return true; }

  async function req(path, { method = "GET", body, auth = false } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (auth) {
      const t = getToken();
      if (t) headers["X-Auth-Token"] = t;
    }
    const res = await fetch(API_BASE + path, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      const msg = (data && (data.detail || data.message)) || ("Request failed (" + res.status + ")");
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return data;
  }

  function wsUrl(path) {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return proto + "//" + location.host + path;
  }

  const API = {
    base: API_BASE,
    isConfigured,
    getToken, setToken,
    register: (username, password) => req("/api/register", { method: "POST", body: { username, password } }),
    login: (username, password) => req("/api/login", { method: "POST", body: { username, password } }),
    me: () => req("/api/me", { auth: true }),
    updateAvatar: (avatar) => req("/api/me/avatar", { method: "PUT", auth: true, body: { avatar } }),
    packs: () => req("/api/coins/packs"),
    purchase: (pack) => req("/api/coins/purchase", { method: "POST", auth: true, body: { pack } }),
    reward: (amount) => req("/api/coins/reward", { method: "POST", auth: true, body: { amount } }),
    spend: (amount, reason) => req("/api/coins/spend", { method: "POST", auth: true, body: { amount, reason } }),
    listGames: (sort = "new") => req("/api/games?sort=" + encodeURIComponent(sort)),
    getGame: (id) => req("/api/games/" + id),
    createGame: (game) => req("/api/games", { method: "POST", auth: true, body: game }),
    playGame: (id) => req("/api/games/" + id + "/play", { method: "POST" }),
    likeGame: (id) => req("/api/games/" + id + "/like", { method: "POST", auth: true }),
    chatRecent: () => req("/api/chat/recent"),
    chatWsUrl: () => wsUrl("/ws/chat?token=" + encodeURIComponent(getToken() || "")),
  };

  window.BloxiaAPI = API;
})();
