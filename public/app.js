const els = {
  form: document.getElementById("roadmap-form"),
  status: document.getElementById("status"),
  generateBtn: document.getElementById("generate-btn"),
  suggestionsSection: document.getElementById("suggestions-section"),
  suggestionsList: document.getElementById("suggestions-list"),
  generateSelectedBtn: document.getElementById("generate-selected"),
  skipContinueBtn: document.getElementById("skip-continue"),
  roadmapSection: document.getElementById("roadmap-section"),
  roadmap: document.getElementById("roadmap"),
  conceptCount: document.getElementById("concept-count")
};

let lastPayload = null;
let lastSuggestions = [];

function setStatus(message, { error = false } = {}) {
  if (!message) {
    els.status.textContent = "";
    els.status.classList.remove("error");
    return;
  }
  els.status.textContent = message;
  els.status.classList.toggle("error", error);
}

function setBusy(busy) {
  els.generateBtn.disabled = busy;
  els.generateSelectedBtn.disabled = busy;
  els.skipContinueBtn.disabled = busy;
  document.body.style.cursor = busy ? "progress" : "";
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

// Concept mapping
const CONCEPTS = [
  {id:1,name:'Big O Notation'},{id:2,name:'Time Complexity'},{id:3,name:'Space Complexity'},{id:4,name:'Recursion'},{id:5,name:'Amortized Analysis'},{id:6,name:'Arrays'},{id:7,name:'Dynamic Arrays'},{id:8,name:'Strings'},{id:9,name:'Linked List'},{id:10,name:'Doubly Linked List'},{id:11,name:'Circular Linked List'},{id:12,name:'Stack'},{id:13,name:'Queue'},{id:14,name:'Deque'},{id:15,name:'Priority Queue'},{id:16,name:'Hash Tables'},{id:17,name:'Hash Functions'},{id:18,name:'Collision Handling'},{id:19,name:'Heap'},{id:20,name:'Min Heap'},{id:21,name:'Max Heap'},{id:22,name:'Heapify Operation'},{id:23,name:'Binary Tree'},{id:24,name:'Binary Tree Traversals'},{id:25,name:'Binary Search Tree'},{id:26,name:'AVL Tree'},{id:27,name:'Red-Black Tree'},{id:28,name:'Trie'},{id:29,name:'Segment Tree'},{id:30,name:'Fenwick Tree'},{id:31,name:'Graph Representation'},{id:32,name:'Breadth First Search'},{id:33,name:'Depth First Search'},{id:34,name:'Topological Sort'},{id:35,name:'Dijkstra’s Algorithm'},{id:36,name:'Bellman-Ford Algorithm'},{id:37,name:'Minimum Spanning Tree'},{id:38,name:'Union-Find'},{id:39,name:'Floyd-Warshall Algorithm'},{id:40,name:'Strongly Connected Components'}
];

// Populate dropdown
(function initConceptDropdown(){
  const input = document.querySelector("[name='concept_id']");
  if (!input) return;
  const select = document.createElement('select');
  select.name = 'concept_id';
  select.className = input.className;
  CONCEPTS.forEach(c=>{
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.id} - ${c.name}`;
    select.appendChild(opt);
  });
  input.replaceWith(select);
})();

function buildPayloadFromForm() {
  const formData = new FormData(els.form);

  const payload = {
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
  const headers = { "Content-Type": "application/json" };

  const res = await fetch("/api/generate-roadmap", {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    let detail = "";
    try {
      const text = await res.text();
      detail = text ? ` (${text.slice(0, 280)})` : "";
    } catch {}
    throw new Error(`Request failed: ${res.status}${detail}`);
  }

  return await res.json();
}

function showSuggestions(suggestions) {
  lastSuggestions = Array.isArray(suggestions) ? suggestions : [];
  els.suggestionsList.innerHTML = "";

  for (const s of lastSuggestions) {
    const row = document.createElement("div");
    row.className = "suggestion-item";

    const left = document.createElement("div");
    left.className = "suggestion-left";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "checkbox";
    cb.value = String(s.id);
    cb.checked = true;
    cb.dataset.conceptId = String(s.id);

    const title = document.createElement("div");
    title.className = "suggestion-title";

    const name = document.createElement("div");
    name.className = "suggestion-name";
    name.textContent = s.name ?? `Concept ${s.id}`;

    const level = document.createElement("div");
    level.className = "suggestion-level";
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
  els.conceptCount.textContent = "0 concepts";
}

function renderRoadmap(result) {
  const roadmap = Array.isArray(result?.roadmap) ? result.roadmap : [];
  const total = asInt(result?.total_concepts, 0);

  els.conceptCount.textContent = `${total} concepts`;
  els.roadmap.innerHTML = "";

  for (const w of roadmap) {
    const weekEl = document.createElement("div");
    weekEl.className = "week";

    const summary = document.createElement("div");
    summary.className = "week-summary";

    const title = document.createElement("div");
    title.className = "week-title";

    const weekNum = asInt(w.week, 0);
    const strong = document.createElement("strong");
    strong.textContent = `Week ${weekNum || ""}`.trim();

    const meta = document.createElement("div");
    meta.className = "week-meta";
    meta.textContent = `Planned study time: ${formatMinutes(w.total_time)}`;

    title.appendChild(strong);
    title.appendChild(meta);

    summary.appendChild(title);

    const body = document.createElement("div");
    body.className = "week-body";

    const concepts = Array.isArray(w.concepts) ? w.concepts : [];
    if (concepts.length === 0) {
      const empty = document.createElement("div");
      empty.className = "week-meta";
      empty.textContent = "No concepts scheduled this week.";
      body.appendChild(empty);
    } else {
      for (const c of concepts) {
        body.appendChild(renderConcept(c));
      }
    }

    weekEl.appendChild(summary);
    weekEl.appendChild(body);
    els.roadmap.appendChild(weekEl);
  }

  els.roadmapSection.classList.remove("hidden");
}

function renderConcept(c) {
  const conceptEl = document.createElement("div");
  conceptEl.className = "concept";

  const header = document.createElement("button");
  header.type = "button";
  header.className = "concept-header";

  const headerLeft = document.createElement("div");
  headerLeft.className = "concept-header-left";

  const name = document.createElement("div");
  name.className = "concept-name";
  name.textContent = `${c.concept ?? "Concept"} (${c.phase ?? "Other"})`;

  const meta = document.createElement("div");
  meta.className = "concept-meta";

  const base = c.allocated_base_time ?? 0;
  const buffer = c.allocated_buffer_time ?? 0;
  const total = c.allocated_time ?? (base + buffer);

  meta.textContent = `Level ${c.level ?? "-"} • Study ${formatMinutes(base)} • Buffer ${formatMinutes(buffer)} • Total ${formatMinutes(total)}${c.is_split ? " • split" : ""}`;

  headerLeft.appendChild(name);
  headerLeft.appendChild(meta);

  const caret = document.createElement("div");
  caret.className = "concept-caret";
  caret.textContent = "▸";

  header.appendChild(headerLeft);
  header.appendChild(caret);

  const details = document.createElement("div");
  details.className = "details hidden";
  details.appendChild(renderDetails(c));

  header.addEventListener("click", () => {
    const isHidden = details.classList.contains("hidden");
    details.classList.toggle("hidden", !isHidden);
    caret.textContent = isHidden ? "▾" : "▸";
  });

  conceptEl.appendChild(header);
  conceptEl.appendChild(details);
  return conceptEl;
}

function renderDetails(c) {
  const wrap = document.createElement("div");

  const addSection = (title, text) => {
    if (!text) return;
    const h = document.createElement("h4");
    h.textContent = title;
    const p = document.createElement("p");
    p.textContent = String(text);
    wrap.appendChild(h);
    wrap.appendChild(p);
  };

  addSection("Explanation", c.explanation);
  addSection("Example", c.example);
  addSection("Summary", c.summary);

  // Key points may come as JSON string
  if (c.key_points) {
    const h = document.createElement("h4");
    h.textContent = "Key Points";
    wrap.appendChild(h);

    let items = [];
    if (Array.isArray(c.key_points)) {
      items = c.key_points;
    } else {
      try {
        const parsed = JSON.parse(c.key_points);
        items = Array.isArray(parsed) ? parsed : String(c.key_points).split("\n");
      } catch {
        items = String(c.key_points).split("\n");
      }
    }

    const ul = document.createElement("ul");
    for (const item of items.map(x => String(x).trim()).filter(Boolean)) {
      const li = document.createElement("li");
      li.textContent = item;
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
  }

  const resources = Array.isArray(c.resources) ? c.resources : [];
  if (resources.length) {
    const h = document.createElement("h4");
    h.textContent = "Resources";
    wrap.appendChild(h);

    const ul = document.createElement("ul");
    for (const r of resources) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = r.url;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.textContent = `${r.content_type ?? "link"}: ${r.url}`;
      li.appendChild(a);
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
  }

  return wrap;
}

async function runInitialGenerate() {
  clearOutputs();
  setStatus("");

  const { payload } = buildPayloadFromForm();
  if (!payload.concept_id) {
    setStatus("Please enter a valid Target Concept ID.", { error: true });
    return;
  }

  lastPayload = { payload };

  setBusy(true);
  setStatus("Generating…");

  try {
    const result = await postGenerateRoadmap(payload);
    if (result?.needs_suggestions) {
      setStatus("");
      showSuggestions(result.suggestions || []);
      return;
    }

    setStatus("");
    renderRoadmap(result);
  } catch (err) {
    setStatus(err?.message || "Something went wrong.", { error: true });
  } finally {
    setBusy(false);
  }
}

async function runWithAccepted(accepted_concepts) {
  if (!lastPayload) return;

  const { payload } = lastPayload;
  const nextPayload = { ...payload, accepted_concepts };

  setBusy(true);
  setStatus("Generating…");
  try {
    const result = await postGenerateRoadmap(nextPayload);
    setStatus("");
    els.suggestionsSection.classList.add("hidden");
    renderRoadmap(result);
  } catch (err) {
    setStatus(err?.message || "Something went wrong.", { error: true });
  } finally {
    setBusy(false);
  }
}

els.form.addEventListener("submit", e => {
  e.preventDefault();
  runInitialGenerate();
});

els.generateSelectedBtn.addEventListener("click", () => {
  const ids = getSelectedSuggestionIds();
  runWithAccepted(ids);
});

els.skipContinueBtn.addEventListener("click", () => {
  runWithAccepted([]);
});
