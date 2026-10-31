/* ---------- tables ---------- */
const cell = (c) => (c && c.raw !== undefined ? c.raw : esc(c));
const plain = (c) =>
  c && c.raw !== undefined ? c.raw.replace(/<[^>]*>/g, "") : String(c);
function page(title, tools, get, heads, filters = "") {
  M.innerHTML = `<div class="bar"><h2>${title}</h2><span class="sp"></span>${filters}<input id="q" placeholder="Search" value="${esc(Q)}" aria-label="Search">${tools}</div><div id="tb" class="card"></div>`;
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
    (d) => {
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
      if (id) Object.assign(s, d);
      else {
        Object.assign(d, {
          id: uid(),
          number: "SUB-" + String(DB.seq.sub++).padStart(4, "0"),
          status: "Draft",
          paused: false,
          next: null,
        });
        DB.subscriptions.push(d);
      }
      save();
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
  } else if (s.status == "Active" && !s.request) {
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
A.close = closeM;
A.new = (_, e) => (e == "users" ? staffForm() : eform(e));
A.edit = (i, e) => eform(e, i);
A.snew = () => sform();
A.sedit = (i) => sform(i);
A.arch = (i, e) => {
  if (
    !confirm(
      "Archive this record? It will be hidden from lists but kept in history.",
    )
  )
    return;
  if (e == "users") DB.users = DB.users.filter((u) => u.id != i);
  else by(e, i).archived = true;
  save();
  render();
};
A.addl = () => $("#ls").insertAdjacentHTML("beforeend", lineRow({}));
A.rml = (_, __, t) => {
  if (document.querySelectorAll("#ls .lr").length > 1)
    t.closest(".lr").remove();
};
A.sa = (id, _, __, x) => {
  const s = by("subscriptions", id),
    p = by("plans", s.planId),
    t = today();
  if (x == "quote") {
    s.status = "Quotation";
    s.validUntil = addD(t, 15);
  } else if (x == "confirm") {
    if (s.validUntil && s.validUntil < t)
      return toast("This quotation expired on " + s.validUntil + ".");
    s.status = "Confirmed";
  } else if (x == "activate") {
    s.status = "Active";
    s.next = s.next || s.start;
  } else if (x == "pause") {
    s.paused = true;
  } else if (x == "resume") {
    s.paused = false;
  } else if (x == "renew") {
    s.expiry = addD(s.expiry, Math.max(1, days(s.start, s.expiry)));
    s.request = null;
    toast("Renewed until " + s.expiry);
  } else if (x == "close") {
    if (s.expiry > t && p.allowEarly != "yes")
      return toast("This plan does not allow early closure.");
    if (!confirm("Close " + s.number + "?")) return;
    s.status = "Closed";
    s.closed = t;
    s.request = null;
  }
  save();
  render();
};
A.req = (id, _, __, x) => {
  by("subscriptions", id).request = x;
  save();
  render();
  toast(x + " request sent to the team.");
};

// Customer self-service: plan changes are requests for staff review; no surprise billing.
A.planchange = (id) => {
  const s = by("subscriptions", id);
  if (!s || s.customerId !== ME.cid || s.status !== "Active") return toast("This subscription cannot be changed.");
  const options = DB.plans.filter(p => !p.archived && p.id !== s.planId);
  if (!options.length) return toast("No other plans are available.");
  fmodal("Request a plan change", `<p class="mu">Choose a plan. Your current subscription remains unchanged until the team reviews the request.</p><label>New plan<select name="planId" required>${options.map(p => `<option value="${esc(p.id)}">${esc(p.name)} · ${money(p.price)}/${esc(p.freq)}</option>`).join("")}</select></label><label>Notes<textarea name="note" rows="2" maxlength="300" placeholder="Optional details"></textarea></label>`, d => {
    s.changeRequest = {fromPlanId:s.planId,toPlanId:d.planId,note:d.note||"",requestedAt:today(),status:"Pending"};
    save(); toast("Plan change request submitted.");
  }, "Submit request");
};

// Demo payment-method vault stores only display metadata, never card number or CVV.
A.paymentmethods = () => {
  const c = by("customers", ME.cid) || {};
  const pm = c.paymentMethod || {};
  modal(`<h3>Payment methods</h3><p class="mu">Demo mode: this saves payment-method details for display only. Do not enter a real card number or CVV. A payment provider must be connected for secure, real payments.</p><p>${pm.brand ? `${esc(pm.brand)} ending in ${esc(pm.last4)} · expires ${esc(pm.expiry||"-")}` : "No payment method saved."}</p><form id="pmf"><label>Card brand<select name="brand"><option>Visa</option><option>Mastercard</option><option>American Express</option><option>Other</option></select></label><label>Last four digits<input name="last4" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required value="${esc(pm.last4||"")}"></label><label>Expiry (MM/YY)<input name="expiry" placeholder="MM/YY" pattern="(0[1-9]|1[0-2])/[0-9]{2}" value="${esc(pm.expiry||"")}" required></label><div class="bar"><button type="button" class="b" data-a="close">Cancel</button>${pm.brand?'<button type="button" class="b dn" data-a="paymentremove">Remove</button>':''}<span class="sp"></span><button class="b pr">Save</button></div></form>`);
  $("#pmf").onsubmit = e => { e.preventDefault(); const d=Object.fromEntries(new FormData(e.currentTarget)); if(!/^\d{4}$/.test(d.last4)||! /^(0[1-9]|1[0-2])\/\d{2}$/.test(d.expiry)) return toast("Enter a valid last-four and expiry."); c.paymentMethod={brand:d.brand,last4:d.last4,expiry:d.expiry}; save(); closeM(); render(); toast("Payment method saved (demo metadata only)."); };
};
A.paymentremove = () => { const c=by("customers",ME.cid); if(c) delete c.paymentMethod; save(); closeM(); render(); toast("Saved payment method removed."); };
A.bill = () => {
  const n = runBilling();
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
    (d) => {
      DB.subscriptions.push({
        id: uid(),
        number: "SUB-" + String(DB.seq.sub++).padStart(4, "0"),
        customerId: d.customerId,
        planId: t.planId,
        start: d.start,
        expiry: addM(d.start, 12),
        terms: "Net 15",
        status: "Quotation",
        validUntil: addD(today(), +t.validity || 15),
        paused: false,
        next: null,
        lines: JSON.parse(JSON.stringify(t.lines)),
      });
      save();
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
