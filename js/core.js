let DB,
  ME = null,
  VIEW = "dashboard",
  Q = "",
  FL = {},
  DRAW = null,
  C = {},
  TM = null;
const KEY = "bl_sub_db_v1",
  $ = (s) => document.querySelector(s),
  uid = () => Math.random().toString(36).slice(2, 9);
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
const addD = (s, n) => {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
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
const nextP = (s, f) =>
  f == "daily"
    ? addD(s, 1)
    : f == "weekly"
      ? addD(s, 7)
      : f == "monthly"
        ? addM(s, 1)
        : addM(s, 12);
const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const money = (n) =>
  "₹" +
  (+n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const by = (c, id) => {
  if (!C[c]) C[c] = new Map(DB[c].map((x) => [x.id, x]));
  return C[c].get(id);
};
const nm = (c, id) => by(c, id)?.name || "-";
const save = () => {
  C = {};
  try {
    localStorage.setItem(KEY, JSON.stringify(DB));
  } catch (e) {}
};
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
async function H(p, s) {
  try {
    const b = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(s + p),
    );
    return [...new Uint8Array(b)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  } catch (e) {
    return btoa(s + p);
  }
}
async function mkUser(name, email, pw, role, cid) {
  const salt = uid();
  return {
    id: uid(),
    name,
    email: email.toLowerCase().trim(),
    salt,
    hash: await H(pw, salt),
    role,
    cid,
  };
}
const num = (k, l, d) => ({ k, l, t: "number", d });
async function seed() {
  const L = (p, v, q, pr, t) => ({
    productId: p,
    variant: v,
    qty: q,
    price: pr,
    taxId: t,
    name: nm2(p) + (v ? ` (${v})` : ""),
  });
  const nm2 = (p) =>
    ({ p1: "Brightloop CRM", p2: "Analytics Add-on", p3: "Priority Support" })[
      p
    ];
  const t = today(),
    y = t.slice(0, 4);
  DB = {
    seq: { sub: 3, inv: 1 },
    log: [],
    resets: {},
    users: [
      await mkUser("Admin", "admin@brightloop.com", "Admin@1234", "admin"),
      await mkUser("Sam Staff", "staff@brightloop.com", "Staff@1234", "staff"),
      await mkUser(
        "Acme Traders",
        "acme@example.com",
        "Acme@1234",
        "customer",
        "c1",
      ),
    ],
    customers: [
      {
        id: "c1",
        name: "Acme Traders",
        email: "acme@example.com",
        phone: "9876500001",
        address: "12 Market Road, Kochi",
      },
      {
        id: "c2",
        name: "Northwind Retail",
        email: "accounts@northwind.test",
        phone: "9876500002",
        address: "4 Lake View, Bengaluru",
      },
    ],
    taxes: [
      { id: "t1", name: "GST 18%", rate: 18 },
      { id: "t2", name: "GST 5%", rate: 5 },
    ],
    products: [
      {
        id: "p1",
        name: "Brightloop CRM",
        type: "Software",
        sales: 2000,
        cost: 800,
        notes: "Core CRM seat",
        variants: [
          { name: "Odoo", extra: 560 },
          { name: "Zoho", extra: 300 },
        ],
      },
      {
        id: "p2",
        name: "Analytics Add-on",
        type: "Add-on",
        sales: 500,
        cost: 150,
        notes: "",
        variants: [],
      },
      {
        id: "p3",
        name: "Priority Support",
        type: "Service",
        sales: 1000,
        cost: 400,
        notes: "",
        variants: [],
      },
    ],
    plans: [
      {
        id: "pl1",
        name: "CRM Monthly",
        price: 2000,
        freq: "monthly",
        minQty: 1,
        from: y + "-01-01",
        to: +y + 2 + "-12-31",
        autoClose: "yes",
        allowEarly: "yes",
        allowPause: "yes",
        allowRenew: "yes",
      },
      {
        id: "pl2",
        name: "CRM Yearly",
        price: 20000,
        freq: "yearly",
        minQty: 5,
        from: y + "-01-01",
        to: +y + 2 + "-12-31",
        autoClose: "no",
        allowEarly: "no",
        allowPause: "no",
        allowRenew: "yes",
      },
    ],
    discounts: [
      {
        id: "d1",
        name: "Volume 10%",
        type: "percent",
        value: 10,
        minAmount: 0,
        minQty: 5,
        from: "",
        to: "",
        max: 100,
        used: 0,
        appliesTo: "all",
        active: "yes",
      },
    ],
    templates: [
      {
        id: "tp1",
        name: "Starter bundle",
        planId: "pl1",
        validity: 15,
        lines: [L("p1", "Odoo", 3, 2560, "t1"), L("p2", "", 3, 500, "t1")],
      },
    ],
    subscriptions: [
      {
        id: "s1",
        number: "SUB-0001",
        customerId: "c1",
        planId: "pl1",
        start: addM(t, -2),
        expiry: addM(t, 10),
        terms: "Net 15",
        status: "Active",
        paused: false,
        next: addM(t, -2),
        lines: [L("p1", "Odoo", 3, 2560, "t1"), L("p2", "", 3, 500, "t1")],
      },
      {
        id: "s2",
        number: "SUB-0002",
        customerId: "c2",
        planId: "pl2",
        start: addD(t, -5),
        expiry: addM(t, 12),
        terms: "Net 30",
        status: "Active",
        paused: false,
        next: addD(t, -5),
        lines: [L("p1", "", 6, 2000, "t1"), L("p3", "", 1, 1000, "t2")],
      },
    ],
    invoices: [],
    payments: [],
  };
  save();
}
