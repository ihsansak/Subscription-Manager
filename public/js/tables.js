/* ---------- tables ---------- */
const cell = (c) => (c && c.raw !== undefined ? c.raw : esc(c));
const plain = (c) =>
  c && c.raw !== undefined ? c.raw.replace(/<[^>]*>/g, "") : String(c);
let CSV_EXPORT = null;
const csvCell = (value) => {
  let text = String(value ?? "").replace(/\r?\n|\r/g, " ");
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
};
const csvFilename = (title) =>
  `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "export"}-${today()}.csv`;
function page(title, tools, get, heads, filters = "") {
  CSV_EXPORT = { title, get, heads };
  M.innerHTML = `<div class="bar"><h2>${title}</h2><span class="sp"></span>${filters}<input id="q" placeholder="Search" value="${esc(Q)}" aria-label="Search"><button class="b" data-a="csv">Export CSV</button>${tools}</div><div id="tb" class="card"></div>`;
  const draw = (DRAW = () => {
    const q = Q.toLowerCase(),
      all = get().filter(
        (r) => !q || r.map(plain).join(" ").toLowerCase().includes(q),
      );
    $("#tb").innerHTML = all.length
      ? `<div class="tw"><table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}<th></th></tr></thead><tbody>${all
          .slice(0, 100)
          .map(
            (r) => `<tr>${r.map((c) => `<td>${cell(c)}</td>`).join("")}</tr>`,
          )
          .join(
            "",
          )}</tbody></table></div>${all.length > 100 ? `<p class="mu" style="padding:0 10px">Showing 100 of ${all.length}. Use search to narrow down.</p>` : ""}`
      : `<p class="mu" style="padding:14px">Nothing here yet.</p>`;
  });
  $("#q").oninput = (e) => {
    Q = e.target.value;
    draw();
  };
  M.querySelectorAll(".flt").forEach((i) => {
    i.value = FL[i.id] || "";
    i.onchange = () => {
      FL[i.id] = i.value;
      draw();
    };
  });
  draw();
}
const exportCsv = () => {
  if (!CSV_EXPORT) return toast("There is no table to export.");
  if (!window.Blob || !window.URL?.createObjectURL) {
    return toast("CSV export is not supported by this browser.");
  }
  const { title, get, heads } = CSV_EXPORT,
    q = Q.toLowerCase(),
    rows = get()
      .filter(
        (r) => !q || r.map(plain).join(" ").toLowerCase().includes(q),
      )
      .map((r) => r.slice(0, heads.length)),
    csv = [heads, ...rows]
      .map((r) => r.map((c) => csvCell(plain(c))).join(","))
      .join("\r\n"),
    url = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
    ),
    link = document.createElement("a");
  link.href = url;
  link.download = csvFilename(title);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  toast(`${rows.length} row${rows.length == 1 ? "" : "s"} exported.`);
};
const can = (ent) => E[ent].w.includes(ME.role);
function listEnt(ent) {
  const e = E[ent],
    w = can(ent);
  page(
    e.t,
    w ? `<button class="b pr" data-a="new" data-e="${ent}">+ New</button>` : "",
    () =>
      DB[ent]
        .filter((r) => !r.archived && (!e.flt || e.flt(r)))
        .map((r) => [
          ...e.c(r),
          raw(
            (e.x ? e.x(r) : "") +
              (w
                ? (e.noedit
                    ? ""
                    : `<button class="b" data-a="edit" data-e="${ent}" data-id="${r.id}">Edit</button>`) +
                  `<button class="b dn" data-a="arch" data-e="${ent}" data-id="${r.id}">${ent == "users" ? "Remove" : "Archive"}</button>`
                : ""),
          ),
        ]),
    e.h,
  );
}
const V = {};
[
  "customers",
  "products",
  "plans",
  "templates",
  "taxes",
  "discounts",
  "users",
].forEach((k) => (V[k] = () => listEnt(k)));
const myC = () => ME.role == "customer",
  staff = () => !myC();
const subsV = () =>
  DB.subscriptions.filter((s) => !myC() || s.customerId == ME.cid);
const invV = () => DB.invoices.filter((i) => !myC() || i.customerId == ME.cid);
const payV = () =>
  DB.payments.filter(
    (p) => !myC() || by("invoices", p.invoiceId)?.customerId == ME.cid,
  );
/* ---------- subscriptions ---------- */
const SF = [
  { k: "customerId", l: "Customer", t: "select", o: cOpts },
  { k: "planId", l: "Plan", t: "select", o: plOpts },
  { k: "start", l: "Start date", t: "date", d: today(), r: 1 },
  { k: "expiry", l: "Expiry date", t: "date", d: addM(today(), 12), r: 1 },
  {
    k: "terms",
    l: "Payment terms",
    t: "select",
    o: ["Immediate", "Net 15", "Net 30"],
  },
];
function sform(id) {
  const s = id ? by("subscriptions", id) : { lines: [] };
  fmodal(
    id ? "Edit " + s.number : "New subscription",
    fields(SF, s) + linesBox(s.lines),
    async (d) => {
      const p = by("plans", d.planId),
        L = readLines();
      if (!L.length) return fail("Add at least one product line.");
      if (d.expiry <= d.start)
        return fail("Expiry must be after the start date.");
      if (sum(L, (l) => l.qty) < (p.minQty || 0))
        return fail(
          `This plan needs a total quantity of at least ${p.minQty}.`,
        );
      if ((p.from && d.start < p.from) || (p.to && d.start > p.to))
        return fail(
          `This plan is only available ${p.from || "any time"} to ${p.to || "any time"}.`,
        );
      d.lines = L;
      await api(
        id
          ? `/subscriptions/${encodeURIComponent(id)}`
          : "/subscriptions",
        {
          method: id ? "PUT" : "POST",
          body: JSON.stringify(d),
        },
      );
      await reloadData();
    },
  );
}
const SB = (s, w) => {
  const p = by("plans", s.planId) || {};
  let b = "";
  if (w) {
    if (s.status == "Draft")
      b += `<button class="b" data-a="sa" data-id="${s.id}" data-x="quote">Send quotation</button>`;
    if (s.status == "Quotation")
      b += `<button class="b pr" data-a="sa" data-id="${s.id}" data-x="confirm">Convert to subscription</button>`;
    if (s.status == "Confirmed")
      b += `<button class="b pr" data-a="sa" data-id="${s.id}" data-x="activate">Activate</button>`;
    if (s.status == "Active") {
      b += s.paused
        ? `<button class="b" data-a="sa" data-id="${s.id}" data-x="resume">Resume</button>`
        : p.allowPause == "yes"
          ? `<button class="b" data-a="sa" data-id="${s.id}" data-x="pause">Pause</button>`
          : "";
      if (p.allowRenew == "yes")
        b += `<button class="b" data-a="sa" data-id="${s.id}" data-x="renew">Renew</button>`;
      b += `<button class="b dn" data-a="sa" data-id="${s.id}" data-x="close">Close</button>`;
    }
    if (["Draft", "Quotation"].includes(s.status))
      b += `<button class="b" data-a="sedit" data-id="${s.id}">Edit</button>`;
  } else if (
    s.status == "Active" &&
    !s.request &&
    s.changeRequest?.status != "Pending"
  ) {
    if (p.allowRenew == "yes")
      b += `<button class="b" data-a="req" data-id="${s.id}" data-x="Renewal">Request renewal</button>`;
    b += `<button class="b" data-a="planchange" data-id="${s.id}">Change plan</button>`;
    b += `<button class="b dn" data-a="req" data-id="${s.id}" data-x="Cancellation">Request cancellation</button>`;
  }
  return `<button class="b" data-a="sview" data-id="${s.id}">View</button>` + b;
};
V.subscriptions = () => {
  const w = staff(),
    sts = ["Draft", "Quotation", "Confirmed", "Active", "Closed"];
  page(
    myC() ? "My subscriptions" : "Subscriptions",
    w
      ? `<button class="b pr" data-a="snew">+ New</button><button class="b" data-a="bill">Run billing now</button>`
      : `<button class="b pr" data-a="paymentmethods">Manage payment methods</button>`,
    () =>
      subsV()
        .filter((s) => !FL.ss || s.status == FL.ss)
        .map((s) => [
          s.number,
          nm("customers", s.customerId),
          nm("plans", s.planId),
          s.start,
          s.expiry,
          s.next || "-",
          raw(
            `${badge(s.status).raw}${s.paused ? badge("Paused").raw : ""}${s.request ? ` <span class="mu">${s.request} requested</span>` : ""}`,
          ),
          money(calc(s.lines).total),
          raw(SB(s, w)),
        ]),
    [
      "No.",
      "Customer",
      "Plan",
      "Start",
      "Expiry",
      "Next billing",
      "Status",
      "Est. total",
    ],
    `<select id="ss" class="flt" aria-label="Status"><option value="">All statuses</option>${sts.map((x) => `<option>${x}</option>`).join("")}</select>`,
  );
};
const A = {};
A.csv = exportCsv;
A.close = closeM;
A.new = (_, e) => (e == "users" ? staffForm() : eform(e));
A.edit = (i, e) => eform(e, i);
A.snew = () => sform();
A.sedit = (i) => sform(i);
A.arch = async (i, e) => {
  if (
    !confirm(
      "Archive this record? It will be hidden from lists but kept in history.",
    )
  )
    return;
  await api(
    e == "users"
      ? `/staff/${encodeURIComponent(i)}`
      : `/c/${e}/${encodeURIComponent(i)}`,
    { method: "DELETE" },
  );
  await reloadData();
  render();
};
A.addl = () => $("#ls").insertAdjacentHTML("beforeend", lineRow({}));
A.rml = (_, __, t) => {
  if (document.querySelectorAll("#ls .lr").length > 1)
    t.closest(".lr").remove();
};
A.sa = async (id, _, __, x) => {
  const s = by("subscriptions", id),
    p = by("plans", s.planId);
  if (x == "close") {
    if (s.expiry > today() && p.allowEarly != "yes")
      return toast("This plan does not allow early closure.");
    if (!confirm("Close " + s.number + "?")) return;
  }
  const result = await api(`/subscriptions/${encodeURIComponent(id)}/action`, {
    method: "POST",
    body: JSON.stringify({ x }),
  });
  await reloadData();
  render();
  toast(result.msg);
};
A.req = async (id, _, __, x) => {
  const result = await api(
    `/subscriptions/${encodeURIComponent(id)}/request`,
    {
      method: "POST",
      body: JSON.stringify({ x }),
    },
  );
  await reloadData();
  render();
  toast(result.msg);
};

// Customer self-service: plan changes are requests for staff review; no surprise billing.
A.planchange = (id) => {
  const s = by("subscriptions", id);
  if (
    !s ||
    s.customerId !== ME.cid ||
    s.status !== "Active" ||
    s.changeRequest?.status == "Pending"
  )
    return toast("This subscription cannot be changed.");
  const options = DB.plans.filter(
    (p) => !p.archived && p.id !== s.planId,
  );
  if (!options.length) return toast("No other plans are available.");
  fmodal(
    "Request a plan change",
    `<p class="mu">Choose a plan. Your current subscription remains unchanged until the team reviews the request.</p><label>New plan<select name="planId" required>${options
      .map(
        (p) =>
          `<option value="${esc(p.id)}">${esc(p.name)} · ${money(p.price)}/${esc(p.freq)}</option>`,
      )
      .join("")}</select></label><label>Notes<textarea name="note" rows="2" maxlength="300" placeholder="Optional details"></textarea></label>`,
    async (d) => {
      const result = await api(
        `/subscriptions/${encodeURIComponent(id)}/change-request`,
        {
          method: "POST",
          body: JSON.stringify({ planId: d.planId, note: d.note || "" }),
        },
      );
      await reloadData();
      toast(result.msg);
    },
    "Submit request",
  );
};

// Demo payment-method vault stores only display metadata, never card number or CVV.
A.paymentmethods = () => {
  const c = by("customers", ME.cid) || {};
  const pm = c.paymentMethod || {},
    brands = ["Visa", "Mastercard", "American Express", "Other"];
  modal(
    `<h3>Payment methods</h3><p class="mu">Demo mode: this saves payment-method details for display only. Do not enter a real card number or CVV. A payment provider must be connected for secure, real payments.</p><p>${pm.brand ? `${esc(pm.brand)} ending in ${esc(pm.last4)} · expires ${esc(pm.expiry || "-")}` : "No payment method saved."}</p><form id="pmf"><label>Card brand<select name="brand">${brands
      .map(
        (brand) =>
          `<option${(pm.brand || "Visa") == brand ? " selected" : ""}>${brand}</option>`,
      )
      .join("")}</select></label><label>Last four digits<input name="last4" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required value="${esc(pm.last4 || "")}"></label><label>Expiry (MM/YY)<input name="expiry" placeholder="MM/YY" pattern="(0[1-9]|1[0-2])/[0-9]{2}" value="${esc(pm.expiry || "")}" required></label><div class="bar"><button type="button" class="b" data-a="close">Cancel</button>${pm.brand ? '<button type="button" class="b dn" data-a="paymentremove">Remove</button>' : ""}<span class="sp"></span><button class="b pr">Save</button></div></form>`,
  );
  $("#pmf").onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    if (!/^\d{4}$/.test(d.last4) || !/^(0[1-9]|1[0-2])\/\d{2}$/.test(d.expiry))
      return toast("Enter a valid last-four and expiry.");
    try {
      const result = await api("/customer/payment-method", {
        method: "PUT",
        body: JSON.stringify(d),
      });
      await reloadData();
      closeM();
      render();
      toast(result.msg);
    } catch (error) {
      toast(error.message);
      void log(error);
    }
  };
};
A.paymentremove = async () => {
  try {
    const result = await api("/customer/payment-method", {
      method: "DELETE",
    });
    await reloadData();
    closeM();
    render();
    toast(result.msg);
  } catch (error) {
    toast(error.message);
    void log(error);
  }
};
A.bill = async () => {
  const { n } = await api("/billing/run", { method: "POST" });
  await reloadData();
  render();
  toast(
    n
      ? `${n} invoice(s) generated as drafts.`
      : "No subscriptions are due. Nothing was billed twice.",
  );
};
A.usetp = (id) => {
  const t = by("templates", id);
  fmodal(
    "Generate quotation from “" + esc(t.name) + "”",
    fields(
      [
        { k: "customerId", l: "Customer", t: "select", o: cOpts },
        { k: "start", l: "Start date", t: "date", d: today() },
      ],
      {},
    ),
    async (d) => {
      await api(`/templates/${encodeURIComponent(id)}/quote`, {
        method: "POST",
        body: JSON.stringify(d),
      });
      await reloadData();
      VIEW = "subscriptions";
      toast("Quotation created");
    },
    "Create quotation",
  );
};
const linesTbl = (c) =>
  `<div class="tw"><table><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Amount</th><th>Tax</th></tr></thead><tbody>${c.lines.map((l) => `<tr><td>${esc(l.name)}</td><td>${l.qty}</td><td>${money(l.price)}</td><td>${money(l.net)}</td><td>${money(l.tax)} (${l.rate}%)</td></tr>`).join("")}</tbody></table></div><p style="text-align:right">Subtotal ${money(c.subtotal)}<br>Discount −${money(c.discount)}<br>Tax ${money(c.tax)}<br><b>Total ${money(c.total)}</b></p>`;
A.sview = (id) => {
  const s = by("subscriptions", id),
    c = calc(s.lines);
  modal(
    `<h3>${s.number} ${badge(s.status).raw}</h3><p class="mu">${esc(nm("customers", s.customerId))} · ${esc(nm("plans", s.planId))} · ${s.start} to ${s.expiry} · ${s.terms}${s.validUntil && s.status == "Quotation" ? " · quote valid until " + s.validUntil : ""}</p>${linesTbl(c)}<p class="mu">Totals include any discounts that apply today.</p><div class="bar"><span class="sp"></span><button class="b" data-a="close">Close</button></div>`,
  );
};
