let DB = {},
  ME = null,
  VIEW = "dashboard",
  Q = "",
  FL = {},
  DRAW = null,
  C = {},
  TM = null;
const $ = (s) => document.querySelector(s);
const sum = (a, f) => a.reduce((x, y) => x + (+f(y) || 0), 0),
  r2 = (n) => Math.round(n * 100) / 100,
  YN = [
    ["yes", "Yes"],
    ["no", "No"],
  ];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const raw = (s) => ({ raw: s }),
  badge = (s) => raw(`<span class="bd ${String(s).toLowerCase()}">${s}</span>`);
const today = () => new Date().toISOString().slice(0, 10);
const addM = (s, n) => {
  const d = new Date(s + "T00:00:00Z"),
    k = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const l = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(k, l));
  return d.toISOString().slice(0, 10);
};
const money = (n) =>
  "₹" +
  (+n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const by = (c, id) => {
  if (!C[c]) C[c] = new Map((DB[c] || []).map((x) => [x.id, x]));
  return C[c].get(id);
};
const nm = (c, id) => by(c, id)?.name || "-";
const subEvents = (id) => (DB.subscriptionEvents || []).filter((e) => e.subscriptionId == id);
async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error("The server returned an invalid response.");
  }
  if (!response.ok) {
    const error = new Error(data.error || "The request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}
async function reloadData() {
  DB = await api("/bootstrap");
  C = {};
  return DB;
}
async function loadSubscriptions(options = {}) {
  const query = new URLSearchParams();
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, value);
  });
  const result = await api(`/subscriptions?${query}`);
  DB.subscriptions = result.rows;
  DB.subscriptionSummary = result.summary;
  C.subscriptions = new Map(result.rows.map((row) => [row.id, row]));
  return result;
}
const toast = (m) => {
  const t = $("#toast");
  t.textContent = m;
  t.style.display = "block";
  clearTimeout(TM);
  TM = setTimeout(() => (t.style.display = "none"), 3800);
};
const fail = (m) => {
  toast(m);
  return false;
};
const pwOk = (p) =>
  p.length >= 9 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /[^A-Za-z0-9]/.test(p);
const PWMSG =
  "Password needs 9 or more characters with an uppercase letter, a lowercase letter and a special character.";
async function log(e) {
  const message = e?.message || e;
  try {
    await api("/log", {
      method: "POST",
      body: JSON.stringify({ msg: String(message) }),
    });
  } catch (error) {
    console.error("Could not send the error to the server log:", error);
  }
}
addEventListener("error", (e) => {
  void log(e.message);
});
const num = (k, l, d) => ({ k, l, t: "number", d });
