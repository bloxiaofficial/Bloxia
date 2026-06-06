/* Bloxia — avatar editor */
(function () {
  const { State, toast, isAuthed, API } = window.Bloxia;
  const A = State.data.avatar;

  const SKINS = ["#f6c177", "#e8b98b", "#c68642", "#8d5524", "#ffd9b3", "#a3e635", "#7dd3fc", "#f9a8d4"];
  const COLORS = ["#e2231a", "#2b3a55", "#00b06f", "#f5b50a", "#7a5cff", "#ff5b54", "#00a2ff", "#191b1d", "#ffffff", "#ff8fb1"];
  const FACES = [":)", ":D", ":|", ":o", "^_^", ">:)", "B)", ":3"];
  const HATS = [
    { id: "none", label: "None", emoji: "" },
    { id: "cap", label: "Cap", emoji: "🧢" },
    { id: "crown", label: "Crown", emoji: "👑" },
    { id: "top", label: "Top Hat", emoji: "🎩" },
    { id: "head", label: "Headphones", emoji: "🎧" },
    { id: "party", label: "Party", emoji: "🥳" },
  ];

  function drawAvatar() {
    const a = State.data.avatar;
    const hat = HATS.find(h => h.id === a.hat) || HATS[0];
    const svg = `
      <svg viewBox="0 0 200 320" class="bloxguy" xmlns="http://www.w3.org/2000/svg">
        <!-- legs -->
        <rect x="70" y="225" width="26" height="80" rx="3" fill="${a.pants}"/>
        <rect x="104" y="225" width="26" height="80" rx="3" fill="${a.pants}"/>
        <!-- arms -->
        <rect x="38" y="135" width="26" height="80" rx="3" fill="${a.skin}"/>
        <rect x="136" y="135" width="26" height="80" rx="3" fill="${a.skin}"/>
        <!-- torso -->
        <rect x="64" y="135" width="72" height="92" rx="4" fill="${a.shirt}"/>
        <!-- head -->
        <rect x="66" y="50" width="68" height="68" rx="6" fill="${a.skin}"/>
        <!-- face -->
        <text x="100" y="95" font-size="26" text-anchor="middle" fill="#191b1d" font-family="monospace" font-weight="bold">${a.face}</text>
        <!-- hat -->
        ${hat.emoji ? `<text x="100" y="48" font-size="46" text-anchor="middle">${hat.emoji}</text>` : ""}
      </svg>`;
    document.getElementById("bloxguy").innerHTML = svg;
  }

  const TABS = [
    { id: "skin", label: "Skin" },
    { id: "shirt", label: "Shirt" },
    { id: "pants", label: "Pants" },
    { id: "face", label: "Face" },
    { id: "hat", label: "Hat" },
  ];
  let activeTab = "skin";

  function renderTabs() {
    const t = document.getElementById("tabs");
    t.innerHTML = "";
    TABS.forEach(tab => {
      const b = document.createElement("button");
      b.className = "tab" + (tab.id === activeTab ? " active" : "");
      b.textContent = tab.label;
      b.onclick = () => { activeTab = tab.id; renderTabs(); renderEditor(); };
      t.appendChild(b);
    });
  }

  function swatch(color, selected, onClick) {
    const s = document.createElement("button");
    s.className = "swatch" + (selected ? " sel" : "");
    s.style.background = color;
    s.onclick = onClick;
    return s;
  }

  function renderEditor() {
    const p = document.getElementById("editorPanel");
    const a = State.data.avatar;
    p.innerHTML = `<h3>Choose ${TABS.find(t => t.id === activeTab).label}</h3>`;
    const wrap = document.createElement("div");
    wrap.className = "swatches";

    if (activeTab === "skin" || activeTab === "shirt" || activeTab === "pants") {
      const palette = activeTab === "skin" ? SKINS : COLORS;
      palette.forEach(c => wrap.appendChild(swatch(c, a[activeTab] === c, () => {
        a[activeTab] = c; State.save(); drawAvatar(); renderEditor();
      })));
    } else if (activeTab === "face") {
      FACES.forEach(f => {
        const b = document.createElement("button");
        b.className = "tab" + (a.face === f ? " active" : "");
        b.style.fontFamily = "monospace"; b.textContent = f;
        b.onclick = () => { a.face = f; State.save(); drawAvatar(); renderEditor(); };
        wrap.appendChild(b);
      });
    } else if (activeTab === "hat") {
      HATS.forEach(h => {
        const b = document.createElement("button");
        b.className = "tab" + (a.hat === h.id ? " active" : "");
        b.textContent = (h.emoji ? h.emoji + " " : "") + h.label;
        b.onclick = () => { a.hat = h.id; State.save(); drawAvatar(); renderEditor(); };
        wrap.appendChild(b);
      });
    }
    p.appendChild(wrap);

    const save = document.createElement("button");
    save.className = "btn green block"; save.style.marginTop = "18px";
    save.textContent = "Save Avatar";
    save.onclick = async () => {
      State.save();
      if (isAuthed()) {
        try { await API.updateAvatar(State.data.avatar); toast("Avatar saved to account!"); }
        catch (e) { toast("Saved locally; server sync failed."); }
      } else { toast("Avatar saved! Log in to sync across devices."); }
    };
    p.appendChild(save);
  }

  function renderEquipped() {
    const e = document.getElementById("equipped");
    const a = State.data.avatar;
    const items = [
      { label: "Skin", color: a.skin },
      { label: "Shirt", color: a.shirt },
      { label: "Pants", color: a.pants },
    ];
    e.innerHTML = "";
    items.forEach(it => {
      const wrap = document.createElement("div");
      wrap.style.textAlign = "center"; wrap.style.fontSize = "12px"; wrap.style.color = "var(--muted)";
      const sw = document.createElement("div");
      sw.className = "swatch"; sw.style.background = it.color; sw.style.cursor = "default";
      wrap.appendChild(sw);
      wrap.appendChild(document.createTextNode(it.label));
      e.appendChild(wrap);
    });
  }

  // re-render equipped whenever avatar changes
  const _draw = drawAvatar;
  drawAvatar = function () { _draw(); renderEquipped(); };

  renderTabs();
  renderEditor();
  drawAvatar();
})();
