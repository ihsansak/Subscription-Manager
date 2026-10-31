/* ---------- backup, log ---------- */
function log(e) {
  try {
    DB.log.push(new Date().toISOString() + " " + (e.message || e));
    DB.log = DB.log.slice(-50);
    save();
  } catch (x) {}
}
addEventListener("error", (e) => log(e.message));
A.bk = () =>
  modal(
    `<h3>Backup and error log</h3><p class="mu">Copy this text to back up the database. Paste a backup below and restore it to replace current data.</p><textarea id="bkt" rows="8">${esc(JSON.stringify(DB))}</textarea><div class="bar" style="margin-top:8px"><button class="b dn" data-a="restore">Restore from text</button><span class="sp"></span><button class="b" data-a="close">Close</button></div><h4>Recent errors</h4><pre style="white-space:pre-wrap">${esc((DB.log || []).slice(-8).join("\n") || "No errors logged.")}</pre>`,
  );
A.restore = () => {
  try {
    const d = JSON.parse($("#bkt").value);
    if (!d.users || !d.subscriptions) throw 0;
    DB = d;
    save();
    closeM();
    render();
    toast("Backup restored");
  } catch (e) {
    toast("That text is not a valid backup.");
  }
};
/* ---------- shell ---------- */
const NAV = {
  admin: [
    "dashboard",
    "customers",
    "products",
    "plans",
    "templates",
    "subscriptions",
    "invoices",
    "payments",
    "taxes",
    "discounts",
    "users",
  ],
  staff: [
    "dashboard",
    "customers",
    "products",
    "plans",
    "templates",
    "subscriptions",
    "invoices",
    "payments",
  ],
  customer: ["dashboard", "subscriptions", "invoices", "payments"],
};
const LBL = {
  dashboard: "Dashboard",
  customers: "Customers",
  products: "Products",
  plans: "Plans",
  templates: "Quotations",
  subscriptions: "Subscriptions",
  invoices: "Invoices",
  payments: "Payments",
  taxes: "Taxes",
  discounts: "Discounts",
  users: "Staff",
};
const M = $("#M");
function render() {
  if (!ME) return;
  $("#nv").innerHTML = NAV[ME.role]
    .map(
      (v) =>
        `<button class="${v == VIEW ? "on" : ""}" data-a="go" data-id="${v}">${LBL[v]}</button>`,
    )
    .join("");
  $("#who").textContent = `${ME.name} (${ME.role})`;
  $("#bkb").style.display = ME.role == "admin" ? "" : "none";
  (V[VIEW] || V.dashboard)();
}
A.go = (v) => {
  VIEW = v;
  Q = "";
  FL = {};
  render();
};
A.out = () => {
  ME = null;
  clearInterval(window.bt);
  $("#app").style.display = "none";
  auth("login");
};
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-a]");
  if (!t) return;
  const f = A[t.dataset.a];
  if (f) f(t.dataset.id, t.dataset.e, t, t.dataset.x);
});
function enter(u) {
  ME = u;
  VIEW = "dashboard";
  $("#au").style.display = "none";
  $("#app").style.display = "block";
  if (staff()) {
    runBilling();
    window.bt = setInterval(() => {
      if (runBilling()) render();
    }, 60000);
  }
  render();
}
/* ---------- auth ---------- */
function auth(mode, msg = "") {
  $("#app").style.display = "none";
  const a = $("#au");
  a.style.display = "block";
  const F = {
    login: [
      ["email", "Email", "email"],
      ["pw", "Password", "password"],
    ],
    register: [
      ["name", "Full name", "text"],
      ["email", "Email", "email"],
      ["pw", "Password", "password"],
    ],
    forgot: [["email", "Registered email", "email"]],
    reset: [
      ["email", "Email", "email"],
      ["tok", "Reset code from email", "text"],
      ["pw", "New password", "password"],
    ],
  };
  const T = {
    login: "Log in",
    register: "Create your account",
    forgot: "Forgot password",
    reset: "Set a new password",
  };
  a.innerHTML = `<h1 style="text-align:center;margin-bottom:14px">Bright<span style="color:var(--ac2)">loop</span></h1><div class="card"><h3>${T[mode]}</h3>${msg}<form id="af">${F[mode].map(([k, l, t]) => `<label>${l}<input name="${k}" type="${t}" required></label>`).join("")}<button class="b pr" style="width:100%;padding:8px;margin-top:6px">${T[mode]}</button></form>
 <p class="hint">${mode == "login" ? '<a class="l" data-a="au" data-id="register">Create account</a> · <a class="l" data-a="au" data-id="forgot">Forgot password?</a>' : '<a class="l" data-a="au" data-id="login">Back to log in</a>'}</p>${mode == "login" ? '<p class="hint">Demo logins: admin@brightloop.com / Admin@1234 · staff@brightloop.com / Staff@1234 · acme@example.com / Acme@1234</p>' : ""}</div>`;
  $("#af").onsubmit = async (ev) => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(ev.target)),
      em = (d.email || "").toLowerCase().trim(),
      u = DB.users.find((x) => x.email == em);
    if (mode == "login") {
      if (u && u.hash == (await H(d.pw, u.salt))) return enter(u);
      return auth(
        "login",
        '<p style="color:var(--er)">Email or password is incorrect.</p>',
      );
    }
    if (mode == "register") {
      if (!pwOk(d.pw)) return toast(PWMSG);
      if (u || DB.customers.some((c) => c.email.toLowerCase() == em))
        return toast("An account with this email already exists.");
      const c = { id: uid(), name: d.name, email: em, phone: "", address: "" };
      DB.customers.push(c);
      const n = await mkUser(d.name, em, d.pw, "customer", c.id);
      DB.users.push(n);
      save();
      return enter(n);
    }
    if (mode == "forgot") {
      const tok = uid() + uid();
      let pv = "";
      if (u) {
        DB.resets[em] = { tok, exp: Date.now() + 36e5 };
        save();
        pv = `<div class="pv">Demo mailbox: your reset code is <b>${tok}</b> (valid for 1 hour). A real deployment would email this link.</div>`;
      }
      return auth(
        "reset",
        '<p class="mu">If that email is registered, a reset message is on its way.</p>' +
          pv,
      );
    }
    if (mode == "reset") {
      const r = DB.resets[em];
      if (!u || !r || r.tok != d.tok.trim() || r.exp < Date.now())
        return toast("That code is invalid or has expired.");
      if (!pwOk(d.pw)) return toast(PWMSG);
      u.salt = uid();
      u.hash = await H(d.pw, u.salt);
      delete DB.resets[em];
      save();
      auth(
        "login",
        '<p style="color:var(--ok)">Password updated. Log in with your new password.</p>',
      );
    }
  };
}
A.au = (m) => auth(m);
(async () => {
  try {
    DB = JSON.parse(localStorage.getItem(KEY));
  } catch (e) {}
  if (!DB || !DB.users) await seed();
  auth("login");
})();
