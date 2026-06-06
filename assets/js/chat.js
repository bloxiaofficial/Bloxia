/* Bloxia — floating realtime chat widget (WebSocket) */
(function () {
  "use strict";
  const API = window.BloxiaAPI;
  if (!API || !API.isConfigured()) return;

  const Bloxia = window.Bloxia || {};
  let ws = null, open = false, connected = false;

  const launcher = document.createElement("button");
  launcher.className = "chat-launcher";
  launcher.innerHTML = "💬";
  launcher.title = "Bloxia Chat";

  const panel = document.createElement("div");
  panel.className = "chat-panel";
  panel.innerHTML = `
    <div class="chat-head">
      <span>🌐 Global Chat</span>
      <button class="chat-close" title="Close">✕</button>
    </div>
    <div class="chat-log" id="chatLog"></div>
    <div class="chat-input-row">
      <input id="chatInput" placeholder="Say something…" maxlength="300" />
      <button class="btn green" id="chatSend">Send</button>
    </div>
    <p class="chat-note" id="chatNote"></p>`;

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  const logEl = panel.querySelector("#chatLog");
  const inputEl = panel.querySelector("#chatInput");
  const noteEl = panel.querySelector("#chatNote");

  function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
  function time(ts) { try { return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }

  function addMsg(m) {
    let row;
    if (m.type === "system") {
      row = document.createElement("div");
      row.className = "chat-sys";
      row.textContent = m.body;
    } else {
      const me = (Bloxia.State && Bloxia.State.data.username) === m.username;
      row = document.createElement("div");
      row.className = "chat-msg" + (me ? " me" : "");
      row.innerHTML = `<span class="chat-user">${esc(m.username)}</span>
        <span class="chat-body">${esc(m.body)}</span>
        <span class="chat-time">${time(m.created_at)}</span>`;
    }
    logEl.appendChild(row);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function connect() {
    if (!API.getToken()) {
      noteEl.innerHTML = `<a href="login.html">Log in</a> to join the chat.`;
      inputEl.disabled = true;
      panel.querySelector("#chatSend").disabled = true;
      return;
    }
    noteEl.textContent = "Connecting…";
    try {
      ws = new WebSocket(API.chatWsUrl());
    } catch (e) { noteEl.textContent = "Chat unavailable."; return; }
    ws.onopen = () => { connected = true; noteEl.textContent = ""; };
    ws.onmessage = (ev) => {
      const data = JSON.parse(ev.data);
      if (data.type === "history") { logEl.innerHTML = ""; data.messages.forEach(addMsg); }
      else addMsg(data);
    };
    ws.onclose = () => { connected = false; if (open) noteEl.textContent = "Disconnected. Reopen chat to retry."; };
    ws.onerror = () => { noteEl.textContent = "Connection error."; };
  }

  function send() {
    const v = inputEl.value.trim();
    if (!v || !connected) return;
    ws.send(v);
    inputEl.value = "";
  }

  launcher.addEventListener("click", () => {
    open = !open;
    panel.classList.toggle("show", open);
    launcher.classList.toggle("active", open);
    if (open && (!ws || ws.readyState > 1)) connect();
  });
  panel.querySelector(".chat-close").addEventListener("click", () => {
    open = false; panel.classList.remove("show"); launcher.classList.remove("active");
  });
  panel.querySelector("#chatSend").addEventListener("click", send);
  inputEl.addEventListener("keydown", e => { if (e.key === "Enter") send(); });
})();
