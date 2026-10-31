/* ---------- entities ---------- */
const cOpts = () =>
  DB.customers.filter((c) => !c.archived).map((c) => [c.id, c.name]);
const plOpts = () =>
  DB.plans.filter((c) => !c.archived).map((c) => [c.id, c.name]);
const E = {
  customers: {
    t: "Customers",
    s: "customer",
    w: ["admin", "staff"],
    f: [
      { k: "name", l: "Name", r: 1 },
      { k: "email", l: "Email", t: "email", r: 1 },
      { k: "phone", l: "Phone" },
      { k: "address", l: "Billing address", t: "textarea" },
    ],
    h: ["Name", "Email", "Phone", "Billing address"],
    c: (r) => [r.name, r.email, r.phone, r.address],
    x: (r) =>
      `<button class="b" data-a="cview" data-id="${r.id}">History</button>`,
    v: (d, r) =>
      DB.customers.some(
        (c) =>
          c.id != r.id &&
          !c.archived &&
          c.email.toLowerCase() == d.email.toLowerCase(),
      ) && "That email already belongs to a customer.",
  },
  products: {
    t: "Products",
    s: "product",
    w: ["admin"],
    f: [
      { k: "name", l: "Name", r: 1 },
      {
        k: "type",
        l: "Type",
        t: "select",
        o: ["Software", "Add-on", "Service", "Hardware"],
      },
      num("sales", "Sales price", 0),
      num("cost", "Cost price", 0),
      {
        k: "vt",
        l: "Variants, one per line as name:extra price (e.g. Odoo:560)",
        t: "textarea",
      },
      { k: "notes", l: "Notes", t: "textarea" },
    ],
    h: ["Name", "Type", "Sales", "Cost", "Variants"],
    c: (r) => [
      r.name,
      r.type,
      money(r.sales),
      money(r.cost),
      (r.variants || []).map((v) => `${v.name} +${v.extra}`).join(", ") || "-",
    ],
    in: (r) => ({
      ...r,
      vt: (r.variants || []).map((v) => v.name + ":" + v.extra).join("\n"),
    }),
    out: (d) => {
      d.variants = (d.vt || "")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => {
          const [a, b] = x.split(":");
          return { name: a.trim(), extra: +b || 0 };
        });
      delete d.vt;
    },
  },
  plans: {
    t: "Plans",
    s: "plan",
    w: ["admin"],
    f: [
      { k: "name", l: "Plan name", r: 1 },
      num("price", "Plan price", 0),
      {
        k: "freq",
        l: "Billing frequency",
        t: "select",
        o: [
          ["daily", "Daily"],
          ["weekly", "Weekly"],
          ["monthly", "Monthly"],
          ["yearly", "Yearly"],
        ],
      },
      num("minQty", "Minimum quantity", 1),
      { k: "from", l: "Available from", t: "date" },
      { k: "to", l: "Available until", t: "date" },
      {
        k: "autoClose",
        l: "Close automatically at expiry",
        t: "select",
        o: YN,
      },
      { k: "allowEarly", l: "Allow early closure", t: "select", o: YN },
      { k: "allowPause", l: "Allow pause", t: "select", o: YN },
      { k: "allowRenew", l: "Allow renewal", t: "select", o: YN },
    ],
    h: [
      "Plan",
      "Price",
      "Billing",
      "Min qty",
      "Available",
      "Auto close / early / pause / renew",
    ],
    c: (r) => [
      r.name,
      money(r.price),
      r.freq,
      r.minQty,
      (r.from || "any") + " to " + (r.to || "any"),
      [r.autoClose, r.allowEarly, r.allowPause, r.allowRenew]
        .map((x) => (x == "yes" ? "Y" : "N"))
        .join(" / "),
    ],
  },
  templates: {
    t: "Quotation templates",
    s: "template",
    w: ["admin", "staff"],
    lines: 1,
    f: [
      { k: "name", l: "Template name", r: 1 },
      { k: "planId", l: "Plan", t: "select", o: plOpts },
      num("validity", "Valid for (days)", 15),
    ],
    h: ["Template", "Plan", "Validity", "Lines"],
    c: (r) => [
      r.name,
      nm("plans", r.planId),
      r.validity + " days",
      r.lines.length,
    ],
    x: (r) =>
      `<button class="b pr" data-a="usetp" data-id="${r.id}">Generate quotation</button>`,
  },
  taxes: {
    t: "Taxes",
    s: "tax rule",
    w: ["admin"],
    f: [{ k: "name", l: "Tax name", r: 1 }, num("rate", "Percentage", 0)],
    h: ["Tax", "Rate"],
    c: (r) => [r.name, r.rate + "%"],
  },
  discounts: {
    t: "Discounts",
    s: "discount",
    w: ["admin"],
    f: [
      { k: "name", l: "Name", r: 1 },
      {
        k: "type",
        l: "Type",
        t: "select",
        o: [
          ["percent", "Percentage"],
          ["fixed", "Fixed amount"],
        ],
      },
      num("value", "Value", 0),
      num("minAmount", "Minimum purchase amount", 0),
      num("minQty", "Minimum quantity", 0),
      { k: "from", l: "Valid from", t: "date" },
      { k: "to", l: "Valid until", t: "date" },
      num("max", "Maximum uses (0 = unlimited)", 0),
      {
        k: "appliesTo",
        l: "Applies to",
        t: "select",
        o: () => [
          ["all", "Entire subscription"],
          ...DB.products.filter((p) => !p.archived).map((p) => [p.id, p.name]),
        ],
      },
      { k: "active", l: "Active", t: "select", o: YN },
    ],
    h: ["Discount", "Value", "Minimums", "Valid", "Used", "Applies to"],
    c: (r) => [
      r.name,
      r.type == "percent" ? r.value + "%" : money(r.value),
      `${money(r.minAmount)} / ${r.minQty || 0} qty`,
      (r.from || "any") + " to " + (r.to || "any"),
      (r.used || 0) + "/" + (r.max || "∞"),
      r.appliesTo == "all" ? "Whole subscription" : nm("products", r.appliesTo),
    ],
  },
  users: {
    t: "Staff accounts",
    s: "staff",
    w: ["admin"],
    noedit: 1,
    flt: (r) => r.role == "staff",
    f: [],
    h: ["Name", "Email", "Role"],
    c: (r) => [r.name, r.email, r.role],
  },
};
/* ---------- forms ---------- */
const fields = (f, r) =>
  f
    .map((x) => {
      const v = r[x.k] ?? x.d ?? "";
      let i;
      if (x.t == "select") {
        const o = typeof x.o == "function" ? x.o() : x.o;
        i = `<select name="${x.k}">${o
          .map((y) => {
            const [a, b] = Array.isArray(y) ? y : [y, y];
            return `<option value="${esc(a)}"${a == v ? " selected" : ""}>${esc(b)}</option>`;
          })
          .join("")}</select>`;
      } else if (x.t == "textarea")
        i = `<textarea name="${x.k}" rows="3">${esc(v)}</textarea>`;
      else
        i = `<input name="${x.k}" type="${x.t || "text"}" value="${esc(v)}" ${x.t == "number" ? 'step="any" min="0"' : ""} ${x.r ? "required" : ""}>`;
      return `<label>${x.l}${i}</label>`;
    })
    .join("");
function modal(h) {
  $("#mo").innerHTML = `<div class="md">${h}</div>`;
  $("#mo").style.display = "flex";
}
const closeM = () => {
  $("#mo").style.display = "none";
  $("#mo").innerHTML = "";
};
function fmodal(title, body, onsave, btn = "Save") {
  modal(
    `<h3>${title}</h3><form id="fm">${body}<div class="bar" style="margin-top:12px"><span class="sp"></span><button type="button" class="b" data-a="close">Cancel</button><button class="b pr">${btn}</button></div></form>`,
  );
  $("#fm").onsubmit = (ev) => {
    ev.preventDefault();
    const d = {};
    $("#fm")
      .querySelectorAll("[name]")
      .forEach((i) => (d[i.name] = i.value));
    try {
      if (onsave(d) !== false) {
        closeM();
        render();
      }
    } catch (e) {
      log(e);
      toast("Something went wrong: " + e.message);
    }
  };
}
function lineRow(l) {
  const ps = DB.products.filter((p) => !p.archived),
    p = by("products", l.productId) || ps[0];
  if (!p) return "";
  const vs =
    `<option value="">No variant</option>` +
    (p.variants || [])
      .map(
        (v) =>
          `<option value="${esc(v.name)}"${v.name == l.variant ? " selected" : ""}>${esc(v.name)} (+${v.extra})</option>`,
      )
      .join("");
  return `<div class="lr"><select class="p">${ps.map((x) => `<option value="${x.id}"${x.id == p.id ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select><select class="v">${vs}</select><input class="q" type="number" min="1" value="${l.qty || 1}"><input class="u" type="number" step="any" value="${l.price ?? p.sales}"><select class="t">${DB.taxes
    .filter((t) => !t.archived)
    .map(
      (t) =>
        `<option value="${t.id}"${t.id == (l.taxId || "t1") ? " selected" : ""}>${esc(t.name)}</option>`,
    )
    .join(
      "",
    )}</select><button type="button" class="b dn" data-a="rml">×</button></div>`;
}
const linesBox = (ls) =>
  `<h4>Product lines</h4><div id="ls">${(ls.length ? ls : [{}]).map(lineRow).join("")}</div><button type="button" class="b" data-a="addl">+ Add line</button>`;
const readLines = () =>
  [...document.querySelectorAll("#ls .lr")].map((r) => {
    const p = by("products", r.querySelector(".p").value),
      v = r.querySelector(".v").value;
    return {
      productId: p.id,
      variant: v,
      name: p.name + (v ? ` (${v})` : ""),
      qty: +r.querySelector(".q").value || 1,
      price: +r.querySelector(".u").value || 0,
      taxId: r.querySelector(".t").value,
    };
  });
document.addEventListener("change", (e) => {
  const r = e.target.closest(".lr");
  if (!r) return;
  const p = by("products", r.querySelector(".p").value);
  if (e.target.classList.contains("p")) {
    r.querySelector(".v").innerHTML =
      `<option value="">No variant</option>` +
      (p.variants || [])
        .map(
          (v) =>
            `<option value="${esc(v.name)}">${esc(v.name)} (+${v.extra})</option>`,
        )
        .join("");
    r.querySelector(".u").value = p.sales;
  }
  if (e.target.classList.contains("v")) {
    const v = (p.variants || []).find((x) => x.name == e.target.value);
    r.querySelector(".u").value = p.sales + (v ? v.extra : 0);
  }
});
function eform(ent, id) {
  const e = E[ent],
    r = id ? by(ent, id) : {},
    rr = e.in ? e.in(r) : r;
  fmodal(
    (id ? "Edit " : "New ") + e.s,
    fields(e.f, rr) + (e.lines ? linesBox(r.lines || []) : ""),
    (d) => {
      e.f.forEach((f) => {
        if (f.t == "number") d[f.k] = +d[f.k] || 0;
      });
      if (e.lines) {
        d.lines = readLines();
        if (!d.lines.length) return fail("Add at least one product line.");
      }
      if (e.v) {
        const m = e.v(d, r);
        if (m) return fail(m);
      }
      if (e.out) e.out(d);
      if (id) Object.assign(r, d);
      else {
        d.id = uid();
        DB[ent].push(d);
      }
      save();
    },
  );
}
function staffForm() {
  fmodal(
    "New staff account",
    fields(
      [
        { k: "name", l: "Name", r: 1 },
        { k: "email", l: "Email", t: "email", r: 1 },
        { k: "pw", l: "Temporary password", t: "password", r: 1 },
      ],
      {},
    ),
    (d) => {
      if (!pwOk(d.pw)) return fail(PWMSG);
      if (DB.users.some((u) => u.email == d.email.toLowerCase()))
        return fail("That email is already registered.");
      mkUser(d.name, d.email, d.pw, "staff").then((u) => {
        DB.users.push(u);
        save();
        render();
        toast("Staff account created");
      });
    },
  );
}
