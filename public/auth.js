const els = {
  authName: document.getElementById("auth-name"),
  authNameGroup: document.getElementById("auth-name-group"),
  authEmail: document.getElementById("auth-email"),
  authPassword: document.getElementById("auth-password"),
  authModeLoginBtn: document.getElementById("auth-mode-login"),
  authModeRegisterBtn: document.getElementById("auth-mode-register"),
  authRegisterBtn: document.getElementById("auth-register-btn"),
  authLoginBtn: document.getElementById("auth-login-btn"),
  authStatus: document.getElementById("auth-status")
};

let authMode = "login";

function setAuthToken(token) {
  if (token) {
    localStorage.setItem("authToken", token);
  } else {
    localStorage.removeItem("authToken");
  }
}

function setAuthStatus(message, { error = false } = {}) {
  if (!els.authStatus) return;
  els.authStatus.textContent = message || "";
  els.authStatus.classList.toggle("text-red-400", Boolean(error));
  els.authStatus.classList.toggle("text-emerald-300", Boolean(message) && !error);
}

function setAuthMode(mode) {
  authMode = mode === "register" ? "register" : "login";
  const isRegister = authMode === "register";

  els.authNameGroup?.classList.toggle("hidden", !isRegister);
  els.authRegisterBtn?.classList.toggle("hidden", !isRegister);
  els.authLoginBtn?.classList.toggle("hidden", isRegister);

  els.authModeLoginBtn?.classList.toggle("bg-primary-600", !isRegister);
  els.authModeLoginBtn?.classList.toggle("text-white", !isRegister);
  els.authModeLoginBtn?.classList.toggle("text-slate-300", isRegister);
  els.authModeLoginBtn?.classList.toggle("hover:bg-slate-800/70", isRegister);

  els.authModeRegisterBtn?.classList.toggle("bg-primary-600", isRegister);
  els.authModeRegisterBtn?.classList.toggle("text-white", isRegister);
  els.authModeRegisterBtn?.classList.toggle("text-slate-300", !isRegister);
  els.authModeRegisterBtn?.classList.toggle("hover:bg-slate-800/70", !isRegister);

  if (els.authName) {
    els.authName.required = isRegister;
  }
}

async function fetchJson(url, options = {}) {
  const headers = { ...(options.headers || {}) };
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

async function submitAuth(mode) {
  const name = String(els.authName?.value || "").trim();
  const email = String(els.authEmail?.value || "").trim();
  const password = String(els.authPassword?.value || "");

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
    setAuthStatus("Success. Redirecting...");
    window.location.replace("/roadmap.html");
  } catch (err) {
    setAuthStatus(err?.message || "Authentication failed.", { error: true });
  }
}

async function restoreSessionIfAny() {
  const token = localStorage.getItem("authToken") || "";
  if (!token) return;

  try {
    await fetchJson("/api/auth/me", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });
    window.location.replace("/roadmap.html");
  } catch {
    setAuthToken("");
  }
}

els.authRegisterBtn?.addEventListener("click", () => submitAuth("register"));
els.authLoginBtn?.addEventListener("click", () => submitAuth("login"));
els.authModeLoginBtn?.addEventListener("click", () => setAuthMode("login"));
els.authModeRegisterBtn?.addEventListener("click", () => setAuthMode("register"));

setAuthMode("login");
restoreSessionIfAny();
