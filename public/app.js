const els = {
  authForm: document.getElementById("auth-form"),
  authSection: document.getElementById("auth-section"),
  accountShell: document.getElementById("account-shell"),
  authName: document.getElementById("auth-name"),
  authNameGroup: document.getElementById("auth-name-group"),
  authEmail: document.getElementById("auth-email"),
  authPassword: document.getElementById("auth-password"),
  authModeLoginBtn: document.getElementById("auth-mode-login"),
  authModeRegisterBtn: document.getElementById("auth-mode-register"),
  authRegisterBtn: document.getElementById("auth-register-btn"),
  authLoginBtn: document.getElementById("auth-login-btn"),
  authLogoutBtn: document.getElementById("auth-logout-btn"),
  authStatus: document.getElementById("auth-status"),
  authUser: document.getElementById("auth-user"),
  form: document.getElementById("roadmap-form"),
  status: document.getElementById("status"),
  generateBtn: document.getElementById("generate-btn"),
  suggestionsSection: document.getElementById("suggestions-section"),
  suggestionsList: document.getElementById("suggestions-list"),
  generateSelectedBtn: document.getElementById("generate-selected"),
  skipContinueBtn: document.getElementById("skip-continue"),
  roadmapsSection: document.getElementById("roadmaps-section"),
  roadmapsList: document.getElementById("roadmaps-list"),
  roadmapLibraryCount: document.getElementById("roadmap-library-count"),
  roadmapSection: document.getElementById("roadmap-section"),
  roadmap: document.getElementById("roadmap"),
  roadmapNameInput: document.getElementById("roadmap_name"),
  activeRoadmapName: document.getElementById("active-roadmap-name"),
  roadmapProgress: document.getElementById("roadmap-progress"),
  conceptCount: document.getElementById("concept-count"),
  
  quizModal: document.getElementById("quiz-modal"),
  quizTitle: document.getElementById("quiz-title"),
  quizBody: document.getElementById("quiz-body"),
  quizScoreMsg: document.getElementById("quiz-score-msg"),
  submitQuizBtn: document.getElementById("submit-quiz-btn"),
  retakeQuizBtn: document.getElementById("retake-quiz-btn"),
  closeQuizBtn: document.getElementById("close-quiz-btn"),
  viewToggleBtn: document.getElementById("view-toggle-btn"),
  cyContainer: document.getElementById("cy-container"),

  // NEW: YouTube Modal Elements
  ytModal: document.getElementById("yt-modal"),
  ytIframe: document.getElementById("yt-iframe"),
  closeYtBtn: document.getElementById("close-yt-btn")
};

let authToken = localStorage.getItem("authToken") || "";
let currentUser = null;
let authMode = "login";
let lastPayload = null;
let lastSuggestions = [];
let activeRoadmapId = null;
let currentRoadmaps = [];

let activeQuizOriginalData = null;
let activeQuizQuestions = [];
let activeQuizAnswers = [];
let activeQuizConceptId = null; 
let completedConcepts = new Set(); 
let activeRoadmapData = null;

function normalizeCompletedConceptIds(ids) {
  return [...new Set(
    (Array.isArray(ids) ? ids : [])
      .map((id) => Number.parseInt(id, 10))
      .filter((id) => Number.isFinite(id) && id > 0)
  )];
}

function getConceptAllocatedMinutes(concept) {
  const allocated = Number(concept?.allocated_time || 0);
  const base = Number(concept?.allocated_base_time || 0);
  const buffer = Number(concept?.allocated_buffer_time || 0);
  return Math.max(allocated, base + buffer, 0);
}

function getRoadmapCompletionMeta(result, completedSetInput) {
  const completedSet = completedSetInput instanceof Set
    ? completedSetInput
    : new Set(normalizeCompletedConceptIds(completedSetInput));

  const weeks = Array.isArray(result?.roadmap) ? result.roadmap : [];
  let totalEligibleConcepts = 0;
  let totalCompletedConcepts = 0;
  const weekStats = new Map();

  for (const week of weeks) {
    const concepts = Array.isArray(week?.concepts) ? week.concepts : [];
    const eligibleConceptIds = [];

    for (const concept of concepts) {
      const conceptId = Number.parseInt(concept?.concept_id, 10);
      if (!Number.isFinite(conceptId) || conceptId <= 0) continue;
      if (getConceptAllocatedMinutes(concept) <= 0) continue;
      if (!eligibleConceptIds.includes(conceptId)) {
        eligibleConceptIds.push(conceptId);
      }
    }

    const completedCount = eligibleConceptIds.filter((id) => completedSet.has(id)).length;
    const totalCount = eligibleConceptIds.length;
    const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    weekStats.set(Number(week?.week), {
      eligible: totalCount > 0,
      completedCount,
      totalCount,
      percent
    });

    if (totalCount > 0) {
      totalEligibleConcepts += totalCount;
      totalCompletedConcepts += completedCount;
    }
  }

  const percent = totalEligibleConcepts > 0
    ? Math.round((totalCompletedConcepts / totalEligibleConcepts) * 100)
    : 0;

  return {
    completedCount: totalCompletedConcepts,
    totalCount: totalEligibleConcepts,
    percent,
    weekStats
  };
}

// Close YT Modal Logic
els.closeYtBtn.addEventListener("click", () => {
  els.ytModal.classList.add("hidden");
  els.ytModal.classList.remove("flex");
  els.ytIframe.src = ""; // Stop the video
});

function setStatus(message, { error = false } = {}) {
  if (!message) {
    els.status.textContent = "";
    els.status.classList.remove("text-red-400");
    return;
  }
  els.status.textContent = message;
  els.status.classList.toggle("text-red-400", error);
}

function setBusy(busy) {
  els.generateBtn.disabled = busy;
  els.generateSelectedBtn.disabled = busy;
  els.skipContinueBtn.disabled = busy;
  document.body.style.cursor = busy ? "progress" : "";
  if(busy) els.generateBtn.classList.add("opacity-50", "pointer-events-none");
  else els.generateBtn.classList.remove("opacity-50", "pointer-events-none");
}

function asInt(v, fallback) {
  const n = Number.parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function asFloat(v, fallback) {
  const n = Number.parseFloat(String(v ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function formatMinutes(totalMinutes) {
  const mins = Math.max(0, Math.round(totalMinutes || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function setAuthToken(token) {
  authToken = token || "";
  if (authToken) localStorage.setItem("authToken", authToken);
  else localStorage.removeItem("authToken");
}

function setAuthStatus(message, { error = false } = {}) {
  if (!els.authStatus) return;
  els.authStatus.textContent = message || "";
  els.authStatus.classList.toggle("text-red-400", Boolean(error));
  els.authStatus.classList.toggle("text-emerald-300", Boolean(message) && !error);
}

function updateAuthUi() {
  if (!els.authUser) return;

  if (currentUser) {
    els.authUser.textContent = `${currentUser.name} (${currentUser.email})`;
    els.authLogoutBtn?.classList.remove("hidden");
    els.accountShell?.classList.remove("hidden");
    return;
  }

  els.authUser.textContent = "Not signed in";
  els.authLogoutBtn?.classList.add("hidden");
  els.accountShell?.classList.add("hidden");
}

function setAuthMode(mode) {
  authMode = mode === "register" ? "register" : "login";

  const isRegister = authMode === "register";
  els.authNameGroup?.classList.toggle("hidden", !isRegister);
  els.authRegisterBtn?.classList.toggle("hidden", !isRegister);
  els.authLoginBtn?.classList.toggle("hidden", isRegister);

  els.authModeLoginBtn?.classList.toggle("bg-primary-600", !isRegister);
  els.authModeLoginBtn?.classList.toggle("text-white", !isRegister);
  els.authModeLoginBtn?.classList.toggle("shadow-lg", !isRegister);
  els.authModeLoginBtn?.classList.toggle("shadow-primary-500/20", !isRegister);
  els.authModeLoginBtn?.classList.toggle("text-slate-300", isRegister);
  els.authModeLoginBtn?.classList.toggle("hover:text-white", isRegister);
  els.authModeLoginBtn?.classList.toggle("hover:bg-slate-800/70", isRegister);

  els.authModeRegisterBtn?.classList.toggle("bg-primary-600", isRegister);
  els.authModeRegisterBtn?.classList.toggle("text-white", isRegister);
  els.authModeRegisterBtn?.classList.toggle("shadow-lg", isRegister);
  els.authModeRegisterBtn?.classList.toggle("shadow-primary-500/20", isRegister);
  els.authModeRegisterBtn?.classList.toggle("text-slate-300", !isRegister);
  els.authModeRegisterBtn?.classList.toggle("hover:text-white", !isRegister);
  els.authModeRegisterBtn?.classList.toggle("hover:bg-slate-800/70", !isRegister);

  if (els.authName) {
    els.authName.required = isRegister;
  }
}

function setAuthenticatedView(isAuthenticated) {
  const generatorSections = [
    els.form?.closest("section"),
    els.suggestionsSection,
    els.roadmapsSection,
    els.roadmapSection
  ].filter(Boolean);

  for (const section of generatorSections) {
    section.classList.toggle("hidden", !isAuthenticated);
  }

  els.authSection?.classList.toggle("hidden", isAuthenticated);

  if (isAuthenticated) {
    els.form?.closest("section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    els.authSection?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function clearSession() {
  setAuthToken("");
  currentUser = null;
  activeRoadmapId = null;
  activeRoadmapData = null;
  currentRoadmaps = [];
  completedConcepts = new Set();
  if (els.roadmapsList) els.roadmapsList.innerHTML = "";
  if (els.roadmapLibraryCount) els.roadmapLibraryCount.textContent = "0 roadmaps";
  updateAuthUi();
  setAuthenticatedView(false);
}

async function fetchJson(url, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const error = new Error(data?.error || `Request failed: ${res.status}`);
    error.status = res.status;
    throw error;
  }

  return data;
}

let cyInstance = null;

els.viewToggleBtn.addEventListener("click", () => {
  const isGraphHidden = els.cyContainer.classList.contains("hidden");
  if (isGraphHidden) {
    els.cyContainer.classList.remove("hidden");
    els.roadmap.classList.add("hidden");
    els.viewToggleBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg> Show List View`;
    els.roadmapSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (cyInstance) { 
      cyInstance.resize(); 
      cyInstance.fit(null, 30); 
    }
  } else {
    els.cyContainer.classList.add("hidden");
    els.roadmap.classList.remove("hidden");
    els.viewToggleBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Show Graph View`;
  }
});

function renderGraph(graphData) {
  if (cyInstance) { cyInstance.destroy(); }

  const elements = [];
  
  graphData.nodes.forEach(n => {
    elements.push({
      data: {
        id: n.id,
        name: n.name,
        level: n.level,
        size: 25 + (n.out_degree * 5),
        icf: n.icf,
        completed: completedConcepts.has(Number(n.id))
      }
    });
  });

  graphData.edges.forEach(e => {
    elements.push({ data: { source: e.source, target: e.target } });
  });

  // Theme: Black, White, Blue logic applied for Dark Bg
  const levelColors = {
    1: '#ffffff', // Lvl 1: White
    2: '#bfdbfe', // Lvl 2: Light Blue
    3: '#60a5fa', // Lvl 3: Med Blue
    4: '#2563eb', // Lvl 4: Primary Blue
    5: '#1e3a8a'  // Lvl 5: Dark Blue
  };

  cyInstance = cytoscape({
    container: els.cyContainer,
    elements: elements,
    style: [
      {
        selector: 'node',
        style: {
          'label': function(ele) { return (ele.data('completed') ? '✅ ' : '') + ele.data('name'); },
          'width': 'data(size)',
          'height': 'data(size)',
          'background-color': (ele) => levelColors[ele.data('level')] || '#94a3b8',
          'opacity': function(ele) { return ele.data('completed') ? 0.35 : 1; }, 
          'color': '#f8fafc', // slate-50
          'text-valign': 'bottom',
          'text-margin-y': 6,
          'font-size': '11px',
          'font-weight': '600',
          'text-background-color': '#0f172a', 
          'text-background-opacity': 0.8,
          'text-background-padding': '3px',
          'text-border-radius': '4px',
          'border-width': (ele) => ele.data('icf') > 0.6 ? 3 : 0, 
          'border-color': '#ffffff'
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 2,
          'line-color': '#334155', // slate-700
          'target-arrow-color': '#334155',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier'
        }
      }
    ],
    layout: {
      name: 'breadthfirst',
      directed: true,
      spacingFactor: 1.15
    }
  });

  cyInstance.on('tap', 'node', function(evt){
    const nodeId = evt.target.id();
    els.viewToggleBtn.click(); 
    
    const card = document.getElementById('concept-card-' + nodeId);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const details = card.querySelector('.details-wrapper');
      if (details.classList.contains('hidden')) {
        card.querySelector('.concept-header button')?.click();
      }
    }
  });
}

const CONCEPTS = [
  {id:1,name:'Big O Notation'},{id:2,name:'Time Complexity'},{id:3,name:'Space Complexity'},{id:4,name:'Recursion'},{id:5,name:'Amortized Analysis'},{id:6,name:'Arrays'},{id:7,name:'Dynamic Arrays'},{id:8,name:'Strings'},{id:9,name:'Linked List'},{id:10,name:'Doubly Linked List'},{id:11,name:'Circular Linked List'},{id:12,name:'Stack'},{id:13,name:'Queue'},{id:14,name:'Deque'},{id:15,name:'Priority Queue'},{id:16,name:'Hash Tables'},{id:17,name:'Hash Functions'},{id:18,name:'Collision Handling'},{id:19,name:'Heap'},{id:20,name:'Min Heap'},{id:21,name:'Max Heap'},{id:22,name:'Heapify Operation'},{id:23,name:'Binary Tree'},{id:24,name:'Binary Tree Traversals'},{id:25,name:'Binary Search Tree'},{id:26,name:'AVL Tree'},{id:27,name:'Red-Black Tree'},{id:28,name:'Trie'},{id:29,name:'Segment Tree'},{id:30,name:'Fenwick Tree'},{id:31,name:'Graph Representation'},{id:32,name:'Breadth First Search'},{id:33,name:'Depth First Search'},{id:34,name:'Topological Sort'},{id:35,name:'Dijkstra’s Algorithm'},{id:36,name:'Bellman-Ford Algorithm'},{id:37,name:'Minimum Spanning Tree'},{id:38,name:'Union-Find'},{id:39,name:'Floyd-Warshall Algorithm'},{id:40,name:'Strongly Connected Components'}
];

(function initConceptDropdown(){
  const select = document.getElementById("concept_id");
  if (!select) return;
  CONCEPTS.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.id} - ${c.name}`;
    select.appendChild(opt);
  });
})();

function buildPayloadFromForm() {
  const formData = new FormData(els.form);
  const payload = {
    roadmap_name: String(formData.get('roadmap_name') || '').trim() || 'Untitled Roadmap',
    concept_id: asInt(formData.get('concept_id'), null),
    duration_weeks: asInt(formData.get('duration_weeks'), 6),
    language: String(formData.get('language') || 'general').trim() || 'general',
    experience_level: String(formData.get('experience_level') || 'intermediate').trim(),
    daily_hours: asFloat(formData.get('daily_hours'), 2),
    days_per_week: asInt(formData.get('days_per_week'), 5)
  };
  return { payload };
}

async function postGenerateRoadmap(payload) {
  return fetchJson("/api/generate-roadmap", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

function getRoadmapName(roadmap) {
  return String(roadmap?.roadmap_name || "Untitled Roadmap").trim() || "Untitled Roadmap";
}

function applyRoadmapsState(roadmaps) {
  currentRoadmaps = Array.isArray(roadmaps) ? roadmaps : [];
  renderRoadmapLibrary();
}

function renderRoadmapLibrary() {
  if (!els.roadmapsList || !els.roadmapLibraryCount) return;

  const count = currentRoadmaps.length;
  els.roadmapLibraryCount.textContent = `${count} roadmap${count === 1 ? "" : "s"}`;
  els.roadmapsList.innerHTML = "";

  if (count === 0) {
    els.roadmapsList.innerHTML = `<div class="col-span-full text-sm text-slate-400 border border-dashed border-slate-700 rounded-xl px-4 py-5 bg-slate-900/50">No roadmaps yet. Create one above using a custom roadmap name.</div>`;
    return;
  }

  for (const roadmap of currentRoadmaps) {
    const btn = document.createElement("button");
    btn.type = "button";
    const isActive = Number(roadmap.roadmap_id) === Number(activeRoadmapId);
    btn.className = `text-left p-4 rounded-xl border transition-all shadow-sm ${isActive
      ? "border-primary-500/70 bg-primary-500/10"
      : "border-slate-700/70 bg-slate-900/70 hover:bg-slate-800/70 hover:border-slate-600"}`;

    const savedAt = roadmap?.saved_at ? new Date(roadmap.saved_at) : null;
    const savedText = savedAt && !Number.isNaN(savedAt.getTime())
      ? savedAt.toLocaleString()
      : "Unknown time";

    const completionPercent = Number(roadmap?.completion?.percent || 0);
    const completed = Number(roadmap?.completion?.completed_concepts || 0);
    const total = Number(roadmap?.completion?.total_concepts || 0);

    btn.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-white truncate">${getRoadmapName(roadmap)}</p>
          <p class="text-xs text-slate-400 mt-1">Saved: ${savedText}</p>
        </div>
        <span class="text-[11px] px-2 py-1 rounded border ${isActive
          ? "border-primary-400/60 text-primary-200 bg-primary-500/10"
          : "border-slate-700 text-slate-300 bg-slate-950/70"}">${completionPercent}%</span>
      </div>
      <p class="text-xs text-slate-400 mt-3">Progress: ${completed}/${total} assigned concepts</p>
    `;

    btn.addEventListener("click", () => {
      selectRoadmap(roadmap.roadmap_id);
    });

    els.roadmapsList.appendChild(btn);
  }
}

async function refreshRoadmapsListOnly() {
  if (!authToken) return;
  const result = await fetchJson("/api/roadmaps", { method: "GET" });
  applyRoadmapsState(result.roadmaps || []);
}

async function selectRoadmap(roadmapId) {
  const id = Number.parseInt(roadmapId, 10);
  if (!Number.isFinite(id) || id <= 0) return;

  try {
    const result = await fetchJson(`/api/roadmaps/${id}`, { method: "GET" });
    const roadmap = result?.roadmap;
    if (!roadmap) return;

    activeRoadmapId = Number(roadmap.roadmap_id);
    completedConcepts = new Set(normalizeCompletedConceptIds(roadmap?.progress_payload?.completed_concepts));
    activeRoadmapData = roadmap;
    renderRoadmap(roadmap);
    renderRoadmapLibrary();
  } catch (err) {
    setStatus(err?.message || "Failed to load roadmap.", { error: true });
  }
}

async function saveRoadmapProgress() {
  if (!authToken || !activeRoadmapId) return;

  const completed = normalizeCompletedConceptIds(Array.from(completedConcepts));
  const result = await fetchJson(`/api/roadmaps/${activeRoadmapId}/progress`, {
    method: "PATCH",
    body: JSON.stringify({ completed_concepts: completed })
  });

  if (result?.roadmap) {
    activeRoadmapData = result.roadmap;
    completedConcepts = new Set(normalizeCompletedConceptIds(result.roadmap?.progress_payload?.completed_concepts));
    await refreshRoadmapsListOnly();
  }
}

function showSuggestions(suggestions) {
  lastSuggestions = Array.isArray(suggestions) ? suggestions : [];
  els.suggestionsList.innerHTML = "";

  for (const s of lastSuggestions) {
    const row = document.createElement("label");
    row.className = "flex items-center justify-between p-4 bg-slate-900/80 border border-slate-700/80 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors shadow-inner";

    const left = document.createElement("div");
    left.className = "flex items-center gap-4";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "w-5 h-5 accent-primary-500 bg-slate-800 border-slate-600 rounded cursor-pointer";
    cb.value = String(s.id);
    cb.checked = true;
    cb.dataset.conceptId = String(s.id);

    const title = document.createElement("div");
    title.className = "flex flex-col";

    const name = document.createElement("span");
    name.className = "font-semibold text-sm text-white";
    name.textContent = s.name ?? `Concept ${s.id}`;

    const level = document.createElement("span");
    level.className = "text-xs text-slate-400 mt-0.5";
    level.textContent = `Level: ${s.level ?? "-"}`;

    title.appendChild(name);
    title.appendChild(level);
    left.appendChild(cb);
    left.appendChild(title);

    row.appendChild(left);
    els.suggestionsList.appendChild(row);
  }

  els.suggestionsSection.classList.remove("hidden");
  els.roadmapSection.classList.add("hidden");
}

function getSelectedSuggestionIds() {
  const ids = [];
  const inputs = els.suggestionsList.querySelectorAll("input[type='checkbox']");
  for (const cb of inputs) {
    if (cb.checked) ids.push(asInt(cb.dataset.conceptId, null));
  }
  return ids.filter(x => x !== null);
}

function clearOutputs() {
  els.suggestionsSection.classList.add("hidden");
  els.roadmapSection.classList.add("hidden");
  els.suggestionsList.innerHTML = "";
  els.roadmap.innerHTML = "";
  activeRoadmapData = null;
  els.conceptCount.textContent = "0 concepts";
  if (els.activeRoadmapName) {
    els.activeRoadmapName.textContent = "Untitled Roadmap";
  }
  if (els.roadmapProgress) {
    els.roadmapProgress.textContent = "0% complete";
  }
}

function renderRoadmap(result) {
  activeRoadmapData = result || null;
  if (result?.roadmap_id) {
    activeRoadmapId = Number(result.roadmap_id);
  }

  if (result?.progress_payload?.completed_concepts) {
    completedConcepts = new Set(normalizeCompletedConceptIds(result.progress_payload.completed_concepts));
  }

  const roadmap = Array.isArray(result?.roadmap) ? result.roadmap : [];
  els.conceptCount.textContent = `${asInt(result?.total_concepts, 0)} concepts`;
  if (els.activeRoadmapName) {
    els.activeRoadmapName.textContent = getRoadmapName(result);
  }

  const completionMeta = getRoadmapCompletionMeta(result, completedConcepts);
  if (els.roadmapProgress) {
    els.roadmapProgress.textContent = `${completionMeta.percent}% complete (${completionMeta.completedCount}/${completionMeta.totalCount})`;
  }

  els.roadmap.innerHTML = "";
  els.cyContainer.classList.add("hidden");
  els.roadmap.classList.remove("hidden");
  els.viewToggleBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Show Graph View`;

  if (result.graph_data) renderGraph(result.graph_data);

  for (const w of roadmap) {
    const weekEl = document.createElement("div");
    weekEl.className = "bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden mb-6 shadow-sm";

    const summary = document.createElement("div");
    summary.className = "flex items-center justify-between px-5 py-4 bg-slate-900/80 border-b border-slate-800/80";

    const title = document.createElement("div");
    title.className = "flex flex-col gap-1";

    const strong = document.createElement("strong");
    strong.className = "text-sm text-white font-semibold tracking-wide uppercase";
    strong.textContent = `Week ${asInt(w.week, 0)}`;

    const meta = document.createElement("span");
    meta.className = "text-xs text-slate-400";

    const weekStat = completionMeta.weekStats.get(Number(w.week));
    if (weekStat?.eligible) {
      meta.textContent = `Planned study time: ${formatMinutes(w.total_time)} • Completion: ${weekStat.percent}% (${weekStat.completedCount}/${weekStat.totalCount})`;
    } else {
      meta.textContent = `Planned study time: ${formatMinutes(w.total_time)} • Completion: Not counted (no assigned content/time)`;
    }

    title.appendChild(strong);
    title.appendChild(meta);
    summary.appendChild(title);

    const body = document.createElement("div");
    body.className = "p-5 flex flex-col gap-3";

    const concepts = Array.isArray(w.concepts) ? w.concepts : [];
    if (concepts.length === 0) {
      body.innerHTML = `<div class="text-xs text-slate-500 italic">No concepts scheduled this week.</div>`;
    } else {
      for (const c of concepts) body.appendChild(renderConcept(c));
    }

    weekEl.appendChild(summary);
    weekEl.appendChild(body);
    els.roadmap.appendChild(weekEl);
  }

  els.roadmapSection.classList.remove("hidden");
}

function renderConcept(c) {
  const conceptId = Number(c.concept_id);
  const isCompleted = completedConcepts.has(conceptId);

  const conceptEl = document.createElement("div");
  conceptEl.id = "concept-card-" + c.concept_id;
  conceptEl.className = "p-4 bg-slate-900/80 border border-slate-700/50 rounded-xl transition-all hover:border-slate-600 hover:shadow-md hover:shadow-blue-900/10";

  const header = document.createElement("div");
  header.className = "concept-header w-full flex items-start justify-between gap-3 text-left group";

  const completionWrap = document.createElement("label");
  completionWrap.className = "mt-0.5 inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none";

  const completionInput = document.createElement("input");
  completionInput.type = "checkbox";
  completionInput.className = "w-4 h-4 accent-emerald-500 rounded bg-slate-800 border-slate-600 cursor-pointer";
  completionInput.checked = isCompleted;
  completionInput.dataset.conceptId = String(conceptId);

  const completionText = document.createElement("span");
  completionText.textContent = "Done";

  completionWrap.appendChild(completionInput);
  completionWrap.appendChild(completionText);

  const headerLeft = document.createElement("div");
  headerLeft.className = "flex flex-col gap-1.5 flex-1 min-w-0";

  const name = document.createElement("div");
  name.className = "concept-name font-semibold text-sm text-slate-100 flex items-center flex-wrap gap-2";
  
  const phaseName = c.is_pivoted ? `${c.phase ?? "Other"} + Project` : (c.phase ?? "Other");
  name.textContent = `${c.concept ?? "Concept"}`;

  const phaseTag = document.createElement("span");
  phaseTag.className = "text-[10px] px-2 py-0.5 rounded border border-slate-700 text-slate-400 bg-slate-800/80 uppercase tracking-wider font-medium ml-2";
  phaseTag.textContent = phaseName;
  name.appendChild(phaseTag);

  if (isCompleted) {
    const badge = document.createElement("span");
    badge.className = "completed-badge bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ml-2 shadow-inner";
    badge.textContent = "✓ Completed";
    name.appendChild(badge);
  }

  const meta = document.createElement("div");
  meta.className = "text-xs text-slate-400";
  meta.innerHTML = `Lvl ${c.level ?? "-"} &bull; Study ${formatMinutes(c.allocated_base_time)} &bull; Buffer ${formatMinutes(c.allocated_buffer_time)} &bull; Total ${formatMinutes(c.allocated_time)}${c.is_split ? " <span class='text-orange-400 font-medium'>&bull; Split</span>" : ""}`;

  headerLeft.appendChild(name);
  headerLeft.appendChild(meta);

  const toggleDetailsBtn = document.createElement("button");
  toggleDetailsBtn.type = "button";
  toggleDetailsBtn.className = "inline-flex items-center gap-2 text-slate-400 hover:text-white text-xs px-2.5 py-1.5 rounded-md border border-slate-700 bg-slate-900/80 transition-colors";

  const caret = document.createElement("span");
  caret.className = "text-slate-500 transition-transform duration-200 group-hover:text-white";
  caret.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>`;
  const detailsText = document.createElement("span");
  detailsText.textContent = "Details";
  toggleDetailsBtn.appendChild(detailsText);
  toggleDetailsBtn.appendChild(caret);

  header.appendChild(completionWrap);
  header.appendChild(headerLeft);
  header.appendChild(toggleDetailsBtn);

  const details = document.createElement("div");
  details.className = "details-wrapper hidden mt-4 pt-4 border-t border-slate-700/50 text-sm text-slate-300 leading-relaxed fade-in";
  details.appendChild(renderDetails(c));

  toggleDetailsBtn.addEventListener("click", () => {
    const isHidden = details.classList.contains("hidden");
    details.classList.toggle("hidden", !isHidden);
    caret.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
  });

  completionInput.addEventListener("change", async () => {
    const conceptKey = Number.parseInt(completionInput.dataset.conceptId, 10);
    if (!Number.isFinite(conceptKey) || conceptKey <= 0) return;

    if (completionInput.checked) {
      completedConcepts.add(conceptKey);
    } else {
      completedConcepts.delete(conceptKey);
    }

    try {
      await saveRoadmapProgress();
      if (activeRoadmapData) {
        renderRoadmap(activeRoadmapData);
      }
      if (cyInstance) {
        const node = cyInstance.$('#' + conceptKey);
        if (node && node.length > 0) {
          node.data('completed', completionInput.checked);
          node.style('opacity', completionInput.checked ? 0.35 : 1);
        }
      }
    } catch (err) {
      completionInput.checked = !completionInput.checked;
      if (completionInput.checked) {
        completedConcepts.add(conceptKey);
      } else {
        completedConcepts.delete(conceptKey);
      }
      setStatus(err?.message || "Failed to save concept progress.", { error: true });
    }
  });

  conceptEl.appendChild(header);
  conceptEl.appendChild(details);
  return conceptEl;
}

function renderDetails(c) {
  const wrap = document.createElement("div");
  wrap.className = "flex flex-col gap-5";

  if (c.is_pivoted) {
    const alert = document.createElement("div");
    alert.className = "bg-primary-500/10 border border-primary-500/20 rounded-lg p-4 shadow-inner";
    alert.innerHTML = `<h4 class="text-primary-400 font-bold text-xs uppercase tracking-wider mb-1 flex items-center gap-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Application Module</h4><p class="text-sm text-primary-200">Extra ${formatMinutes(c.application_surplus)} allocated! Build a mini-project or solve advanced LeetCode problems to solidify mastery.</p>`;
    wrap.appendChild(alert);
  }

  const addSection = (title, text) => {
    if (!text) return;
    const block = document.createElement("div");
    block.innerHTML = `<h4 class="text-white font-semibold mb-1.5 text-sm">${title}</h4><p class="text-slate-400 text-sm leading-relaxed">${String(text)}</p>`;
    wrap.appendChild(block);
  };

  addSection("Explanation", c.explanation);
  addSection("Example", c.example);
  addSection("Summary", c.summary);

  if (c.key_points) {
    const block = document.createElement("div");
    block.innerHTML = `<h4 class="text-white font-semibold mb-2 text-sm">Key Points</h4>`;
    
    let items = [];
    try {
      const parsed = JSON.parse(c.key_points);
      items = Array.isArray(parsed) ? parsed : String(c.key_points).split("\n");
    } catch { items = String(c.key_points).split("\n"); }

    const ul = document.createElement("ul");
    ul.className = "list-disc list-inside text-slate-400 space-y-1.5 marker:text-slate-600";
    for (const item of items.map(x => String(x).trim()).filter(Boolean)) {
      const li = document.createElement("li");
      li.textContent = item;
      ul.appendChild(li);
    }
    block.appendChild(ul);
    wrap.appendChild(block);
  }

  // --- UPDATED RESOURCES BLOCK WITH YOUTUBE DETECTION ---
  const resources = Array.isArray(c.resources) ? c.resources : [];
  if (resources.length) {
    const block = document.createElement("div");
    block.innerHTML = `<h4 class="text-white font-semibold mb-2 text-sm">Resources</h4>`;
    const flex = document.createElement("div");
    flex.className = "flex flex-wrap gap-2";
    
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;

    for (const r of resources) {
      const a = document.createElement("a");
      a.className = "inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-md transition-colors border border-slate-700 shadow-sm cursor-pointer";
      
      const ytMatch = r.url.match(ytRegex);
      
      if (ytMatch && ytMatch[1]) {
        a.innerHTML = `<svg class="w-3.5 h-3.5 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg> Watch Video`;
        a.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const videoId = ytMatch[1];
          const origin = encodeURIComponent(window.location.origin);
          els.ytIframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&origin=${origin}`;
          els.ytModal.classList.remove("hidden");
          els.ytModal.classList.add("flex");
        };
      } else {
        a.href = r.url;
        a.target = "_blank";
        a.innerHTML = `<svg class="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg> ${r.content_type ?? "Read Article"}`;
      }
      
      flex.appendChild(a);
    }
    block.appendChild(flex);
    wrap.appendChild(block);
  }

  let quizData = c.mcq_quiz;
  if (typeof quizData === 'string') {
    try { quizData = JSON.parse(quizData); } catch (err) {}
  }

  if (quizData && Array.isArray(quizData) && quizData.length > 0) {
    const quizBtn = document.createElement("button");
    quizBtn.className = "mt-4 w-full bg-primary-600 text-white hover:bg-primary-500 py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20";
    quizBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Assess Knowledge`;
    quizBtn.addEventListener("click", (e) => {
      e.stopPropagation(); 
      openQuiz(c.concept_id, c.concept, quizData); 
    });
    wrap.appendChild(quizBtn);
  }

  return wrap;
}

function shuffleArray(arr) {
  const newArr = [...arr];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

function mapQuizData(originalData, shouldShuffle) {
  let mapped = originalData.map(q => {
    let opts = q.options.map((optText, index) => ({
      text: optText,
      isCorrect: index === q.correct_index
    }));
    if (shouldShuffle) opts = shuffleArray(opts);
    return { question: q.question, options: opts, explanation: q.explanation };
  });
  if (shouldShuffle) mapped = shuffleArray(mapped);
  return mapped;
}

function openQuiz(conceptId, title, mcqData) {
  activeQuizConceptId = conceptId; 
  activeQuizOriginalData = mcqData;
  els.quizTitle.textContent = `${title} Quiz`;
  startQuizFlow(false);
  els.quizModal.classList.remove("hidden");
  els.quizModal.classList.add("flex");
}

function startQuizFlow(shouldShuffle) {
  activeQuizQuestions = mapQuizData(activeQuizOriginalData, shouldShuffle);
  activeQuizAnswers = new Array(activeQuizQuestions.length).fill(null);
  
  els.quizScoreMsg.classList.add("hidden");
  els.quizScoreMsg.textContent = "";
  els.quizScoreMsg.className = "font-medium text-sm hidden";
  
  els.submitQuizBtn.classList.remove("hidden");
  els.retakeQuizBtn.classList.add("hidden");
  els.quizBody.innerHTML = "";

  activeQuizQuestions.forEach((q, qIndex) => {
    const qDiv = document.createElement("div");
    qDiv.className = "flex flex-col gap-3";

    const h4 = document.createElement("h4");
    h4.className = "text-slate-100 font-semibold text-base";
    h4.textContent = `${qIndex + 1}. ${q.question}`;
    qDiv.appendChild(h4);

    const optsDiv = document.createElement("div");
    optsDiv.className = "flex flex-col gap-2";
    optsDiv.dataset.qIndex = qIndex;

    q.options.forEach((opt, oIndex) => {
      const optBtn = document.createElement("button");
      optBtn.className = "quiz-opt w-full text-left p-3.5 rounded-lg border border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800 hover:border-slate-600 transition-all text-sm shadow-sm";
      optBtn.textContent = opt.text;
      optBtn.dataset.oIndex = oIndex;

      optBtn.addEventListener("click", () => handleOptionSelect(qIndex, oIndex));
      optsDiv.appendChild(optBtn);
    });

    qDiv.appendChild(optsDiv);

    const expDiv = document.createElement("div");
    expDiv.className = "hidden mt-2 p-4 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300 text-sm leading-relaxed fade-in shadow-inner";
    expDiv.id = `quiz-exp-${qIndex}`;
    expDiv.innerHTML = `<strong class="text-white block mb-1">Explanation:</strong>${q.explanation}`;
    qDiv.appendChild(expDiv);

    els.quizBody.appendChild(qDiv);
  });
}

function handleOptionSelect(qIndex, oIndex) {
  activeQuizAnswers[qIndex] = oIndex;
  const optsDiv = els.quizBody.querySelector(`[data-q-index="${qIndex}"]`);
  const buttons = optsDiv.querySelectorAll(".quiz-opt");
  
  buttons.forEach(btn => {
    btn.classList.remove("border-primary-500", "bg-primary-500/10", "text-white", "ring-1", "ring-primary-500");
    btn.classList.add("border-slate-700", "bg-slate-800/40", "text-slate-300");
  });
  
  const selected = buttons[oIndex];
  selected.classList.remove("border-slate-700", "bg-slate-800/40", "text-slate-300");
  selected.classList.add("border-primary-500", "bg-primary-500/10", "text-white", "ring-1", "ring-primary-500");
}

els.submitQuizBtn.addEventListener("click", async () => {
  if (activeQuizAnswers.includes(null)) return alert("Please answer all questions before submitting.");

  let score = 0;
  activeQuizQuestions.forEach((q, qIndex) => {
    const selectedOIndex = activeQuizAnswers[qIndex];
    const optsDiv = els.quizBody.querySelector(`[data-q-index="${qIndex}"]`);
    const buttons = optsDiv.querySelectorAll(".quiz-opt");

    buttons.forEach(btn => btn.disabled = true); 

    const isCorrect = q.options[selectedOIndex].isCorrect;
    if (isCorrect) {
      score++;
      buttons[selectedOIndex].className = "w-full text-left p-3.5 rounded-lg border border-green-500/50 bg-green-500/10 text-green-400 text-sm font-semibold shadow-sm ring-1 ring-green-500/50";
    } else {
      buttons[selectedOIndex].className = "w-full text-left p-3.5 rounded-lg border border-red-500/50 bg-red-500/10 text-red-400 text-sm shadow-sm";
      const correctIdx = q.options.findIndex(o => o.isCorrect);
      buttons[correctIdx].className = "w-full text-left p-3.5 rounded-lg border border-green-500/50 bg-green-500/10 text-green-400 text-sm font-semibold shadow-sm ring-1 ring-green-500/50 mt-2";
    }

    const expDiv = document.getElementById(`quiz-exp-${qIndex}`);
    expDiv.classList.remove("hidden");
  });

  els.submitQuizBtn.classList.add("hidden");
  els.quizScoreMsg.classList.remove("hidden");
  
  const threshold = Math.ceil(activeQuizQuestions.length * 0.66);

  if (score >= threshold) {
    els.quizScoreMsg.innerHTML = `<span class="text-green-400 font-bold">Score: ${score}/${activeQuizQuestions.length}</span> — Mastered!`;
    completedConcepts.add(activeQuizConceptId);
    try {
      await saveRoadmapProgress();
      if (activeRoadmapData) {
        renderRoadmap(activeRoadmapData);
      }
      if (typeof cyInstance !== 'undefined' && cyInstance) {
        const node = cyInstance.$('#' + activeQuizConceptId);
        if (node && node.length > 0) {
          node.data('completed', true);
          node.style('opacity', 0.35);
        }
      }
    } catch (err) {
      setStatus(err?.message || "Failed to save quiz completion.", { error: true });
    }
  } else {
    els.quizScoreMsg.innerHTML = `<span class="text-red-400 font-bold">Score: ${score}/${activeQuizQuestions.length}</span> — Needs Review.`;
    els.retakeQuizBtn.classList.remove("hidden");
  }
});

els.retakeQuizBtn.addEventListener("click", () => startQuizFlow(true));
els.closeQuizBtn.addEventListener("click", () => {
  els.quizModal.classList.add("hidden");
  els.quizModal.classList.remove("flex");
});

async function runInitialGenerate() {
  clearOutputs();
  setStatus("");

  if (!authToken) {
    setStatus("Please sign in or create an account first.", { error: true });
    return;
  }

  const { payload } = buildPayloadFromForm();
  if (!payload.concept_id) return setStatus("Valid Target Concept ID required.", { error: true });
  
  lastPayload = { payload };
  setBusy(true);

  try {
    const result = await postGenerateRoadmap(payload);
    if (result?.status === "UNREALISTIC") {
      setStatus(result.message, { error: true });
      els.roadmapSection.classList.add("hidden");
      return;
    }
    if (result?.needs_suggestions) return showSuggestions(result.suggestions || []);

    activeRoadmapId = Number(result?.roadmap_id || activeRoadmapId || 0) || null;
    completedConcepts = new Set(normalizeCompletedConceptIds(result?.progress_payload?.completed_concepts));
    renderRoadmap(result);
    await refreshRoadmapsListOnly();
    renderRoadmapLibrary();
    setStatus("Roadmap saved.");
  } catch (err) {
    if (err?.status === 401) {
      clearSession();
      setStatus("Your session expired. Sign in again.", { error: true });
      return;
    }
    setStatus(err?.message || "Generation failed.", { error: true });
  } finally { setBusy(false); }
}

async function runWithAccepted(accepted_concepts) {
  const { payload } = buildPayloadFromForm();
  const nextPayload = { ...payload, accepted_concepts };
  setBusy(true);

  try {
    const result = await postGenerateRoadmap(nextPayload);
    if (result?.status === "UNREALISTIC") {
      setStatus(result.message, { error: true });
      els.roadmapSection.classList.add("hidden");
      return;
    }
    setStatus("");
    els.suggestionsSection.classList.add("hidden"); 

    activeRoadmapId = Number(result?.roadmap_id || activeRoadmapId || 0) || null;
    completedConcepts = new Set(normalizeCompletedConceptIds(result?.progress_payload?.completed_concepts));
    renderRoadmap(result);
    await refreshRoadmapsListOnly();
    renderRoadmapLibrary();
    setStatus("Roadmap saved.");
  } catch (err) {
    if (err?.status === 401) {
      clearSession();
      setStatus("Your session expired. Sign in again.", { error: true });
      return;
    }
    setStatus(err?.message || "Generation failed.", { error: true });
  } finally { setBusy(false); }
}

async function submitAuth(mode) {
  if (!els.authEmail || !els.authPassword) return;

  const name = String(els.authName?.value || "").trim();
  const email = String(els.authEmail.value || "").trim();
  const password = String(els.authPassword.value || "");

  if (!email || !password) {
    setAuthStatus("Email and password are required.", { error: true });
    return;
  }

  const resolvedMode = mode || authMode;

  if (resolvedMode === "register" && !name) {
    setAuthStatus("Name is required to create an account.", { error: true });
    return;
  }

  setAuthStatus(resolvedMode === "register" ? "Creating account..." : "Signing in...");

  try {
    const result = await fetchJson(`/api/auth/${resolvedMode}`, {
      method: "POST",
      body: JSON.stringify({ name, email, password })
    });

    setAuthToken(result.token);
    currentUser = result.user;
    updateAuthUi();
    setAuthenticatedView(true);
    setAuthStatus(`Signed in as ${result.user.name}.`);

    clearOutputs();
    applyRoadmapsState(result.roadmaps || []);
    if (result.roadmap) {
      activeRoadmapId = Number(result.roadmap.roadmap_id || 0) || null;
      completedConcepts = new Set(normalizeCompletedConceptIds(result.roadmap?.progress_payload?.completed_concepts));
      renderRoadmap(result.roadmap);
    }
  } catch (err) {
    setAuthStatus(err?.message || "Authentication failed.", { error: true });
  }
}

async function restoreSession() {
  if (!authToken) {
    updateAuthUi();
    setAuthenticatedView(false);
    return;
  }

  setAuthStatus("Restoring session...");

  try {
    const result = await fetchJson("/api/auth/me", { method: "GET" });
    currentUser = result.user;
    updateAuthUi();
    setAuthenticatedView(true);
    clearOutputs();
    applyRoadmapsState(result.roadmaps || []);
    if (result.roadmap) {
      activeRoadmapId = Number(result.roadmap.roadmap_id || 0) || null;
      completedConcepts = new Set(normalizeCompletedConceptIds(result.roadmap?.progress_payload?.completed_concepts));
      renderRoadmap(result.roadmap);
    }
    setAuthStatus("");
  } catch (err) {
    clearSession();
    clearOutputs();
    setAuthStatus("Session expired. Please sign in again.", { error: true });
  }
}

els.authRegisterBtn?.addEventListener("click", () => submitAuth("register"));
els.authLoginBtn?.addEventListener("click", () => submitAuth("login"));
els.authModeLoginBtn?.addEventListener("click", () => setAuthMode("login"));
els.authModeRegisterBtn?.addEventListener("click", () => setAuthMode("register"));
els.authLogoutBtn?.addEventListener("click", () => {
  clearSession();
  clearOutputs();
  setAuthStatus("Signed out.");
});

els.form.addEventListener("submit", e => { e.preventDefault(); runInitialGenerate(); });
els.generateSelectedBtn.addEventListener("click", () => runWithAccepted(getSelectedSuggestionIds()));
els.skipContinueBtn.addEventListener("click", () => runWithAccepted([]));

restoreSession();
setAuthMode("login");