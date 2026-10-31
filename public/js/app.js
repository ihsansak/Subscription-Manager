/* ---------- backup, log ---------- */
A.bk = async () => {
  const [backup, result] = await Promise.all([
    api("/backup"),
    api("/logs"),
  ]);
  modal(
    `<h3>Server backup and error log</h3><p class="mu">This backup is read from the server database. Copy it and store it securely.</p><textarea id="bkt" rows="8" readonly>${esc(JSON.stringify(backup, null, 2))}</textarea><div class="bar" style="margin-top:8px"><span class="sp"></span><button class="b" data-a="close">Close</button></div><h4>Recent server errors</h4><pre style="white-space:pre-wrap">${esc((result.logs || []).slice(-8).join("\n") || "No errors logged.")}</pre>`,
  );
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
  const currency = $("#currency");
  currency.value = CURRENCY;
  currency.title = DB.currency?.updatedAt
    ? `Exchange rate from INR, dated ${DB.currency.updatedAt}${DB.currency.stale ? " (using cached rate)" : ""}`
    : "Base currency";
  currency.onchange = async () => {
    const previous = CURRENCY;
    currency.disabled = true;
    try {
      const { currency: preference } = await api("/currency", {
        method: "PUT",
        body: JSON.stringify({ currency: currency.value }),
      });
      CURRENCY = preference.code;
      FX_RATE = preference.rate;
      DB.currency = preference;
      render();
      toast(
        preference.code == "INR"
          ? "Currency changed to INR."
          : `Currency changed to ${preference.code}; rate dated ${preference.updatedAt}${preference.stale ? " (cached rate)" : ""}.`,
      );
    } catch (error) {
      currency.value = previous;
      currency.disabled = false;
      toast(error.message);
    }
  };
  (V[VIEW] || V.dashboard)();
}
A.go = async (v) => {
  await reloadData();
  VIEW = v;
  Q = "";
  FL = {};
  render();
};
A.out = () => {
  void (async () => {
    try {
      await api("/logout", { method: "POST" });
    } catch (e) {
      toast(e.message);
    }
    ME = null;
    clearInterval(window.bt);
    $("#app").style.display = "none";
    auth("login");
  })();
};
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-a]");
  if (!t) return;
  const f = A[t.dataset.a];
  if (f)
    Promise.resolve(f(t.dataset.id, t.dataset.e, t, t.dataset.x)).catch(
      (error) => {
        toast(error.message || "The request failed.");
        void log(error);
      },
    );
});
async function enter(u) {
  ME = u;
  VIEW = "dashboard";
  await reloadData();
  if (staff()) {
    await api("/billing/run", { method: "POST" });
    await reloadData();
  }
  $("#au").style.display = "none";
  $("#app").style.display = "block";
  if (staff()) {
    clearInterval(window.bt);
    window.bt = setInterval(async () => {
      try {
        const { n } = await api("/billing/run", { method: "POST" });
        if (n) {
          await reloadData();
          render();
        }
      } catch (error) {
        toast(error.message);
        void log(error);
      }
    }, 60000);
  }
  render();
}
/* ---------- auth ---------- */
function auth(mode, msg = "", email = "") {
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
    verify: [
      ["tok", "Verification code", "text"],
    ],
    forgot: [["email", "Registered email", "email"]],
    reset: [
      ["tok", "Reset code from email", "text"],
      ["pw", "New password", "password"],
    ],
  };
  const T = {
    login: "Log in",
    register: "Create your account",
    verify: "Verify your email",
    forgot: "Forgot password",
    reset: "Set a new password",
  };
  a.innerHTML = `<h1 style="text-align:center;margin-bottom:14px">Bright<span style="color:var(--ac2)">loop</span></h1><div class="card"><h3>${T[mode]}</h3>${msg}<form id="af">${F[mode].map(([k, l, t]) => `<label>${l}<input name="${k}" type="${t}" required></label>`).join("")}<button class="b pr" style="width:100%;padding:8px;margin-top:6px">${T[mode]}</button></form>
 <p class="hint">${mode == "login" ? '<a class="l" data-a="au" data-id="register">Create account</a> · <a class="l" data-a="au" data-id="forgot">Forgot password?</a>' : '<a class="l" data-a="au" data-id="login">Back to log in</a>'}</p>${mode == "login" ? '<p class="hint">Demo logins: admin@brightloop.com / Admin@1234 · staff@brightloop.com / Staff@1234 · acme@example.com / Acme@1234</p>' : ""}</div>`;
  $("#af").onsubmit = async (ev) => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(ev.target));
    try {
      if (mode == "login") {
        const { user } = await api("/login", {
          method: "POST",
          body: JSON.stringify({ email: d.email, pw: d.pw }),
        });
        await enter(user);
      } else if (mode == "register") {
        await api("/register", {
          method: "POST",
          body: JSON.stringify({ name: d.name, email: d.email, pw: d.pw }),
        });
        auth(
          "verify",
          '<p class="mu">We sent a verification code to your email. It expires in 10 minutes.</p>',
          d.email,
        );
      } else if (mode == "verify") {
        const { user } = await api("/verify-registration", {
          method: "POST",
          body: JSON.stringify({ email, tok: d.tok }),
        });
        await enter(user);
      } else if (mode == "forgot") {
        const result = await api("/forgot", {
          method: "POST",
          body: JSON.stringify({ email: d.email }),
        });
        auth(
          "reset",
          `<p class="mu">${esc(result.message || "If that email is registered, a verification code has been sent.")}</p>`,
          d.email,
        );
      } else if (mode == "reset") {
        await api("/reset", {
          method: "POST",
          body: JSON.stringify({
            email,
            tok: d.tok,
            pw: d.pw,
          }),
        });
        auth(
          "login",
          '<p style="color:var(--ok)">Password updated. Log in with your new password.</p>',
        );
      }
    } catch (error) {
      const message =
        mode == "login" && error.message == "Email or password is incorrect."
          ? "Email or password is incorrect."
          : error.message;
      if (mode == "login")
        return auth(
          "login",
          `<p style="color:var(--er)">${esc(message)}</p>`,
        );
      toast(message);
    }
  };
}
A.au = (m) => auth(m);
(async () => {
  try {
    const { user } = await api("/me");
    await enter(user);
  } catch (error) {
    auth(
      "login",
      error.status != 401
        ? `<p style="color:var(--er)">${esc(error.message)}</p>`
        : "",
    );
  }
})();
