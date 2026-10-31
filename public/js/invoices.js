/* ---------- invoices & payments ---------- */
V.invoices = () => {
  const sts = ["Draft", "Confirmed", "Paid", "Overdue", "Cancelled"];
  page(
    myC() ? "My invoices" : "Invoices",
    staff() ? `<button class="b" data-a="bill">Run billing now</button>` : "",
    () =>
      invV()
        .filter(
          (i) =>
            (!FL.is || istat(i) == FL.is) &&
            (!FL.if || i.issue >= FL.if) &&
            (!FL.it || i.issue <= FL.it),
        )
        .sort((a, b) => b.number.localeCompare(a.number))
        .map((i) => {
          const st = istat(i),
            w = staff();
          return [
            i.number,
            nm("customers", i.customerId),
            i.issue,
            i.due,
            money(i.total),
            money(paid(i)),
            money(owed(i)),
            badge(st),
            raw(
              `<button class="b" data-a="iview" data-id="${i.id}">View</button>` +
                (w && i.status == "Draft"
                  ? `<button class="b pr" data-a="ia" data-id="${i.id}" data-x="confirm">Confirm</button>`
                  : "") +
                (w && ["Draft", "Confirmed"].includes(i.status) && !paid(i)
                  ? `<button class="b dn" data-a="ia" data-id="${i.id}" data-x="cancel">Cancel</button>`
                  : "") +
                (w && i.status == "Confirmed"
                  ? `<button class="b" data-a="pay" data-id="${i.id}">Record payment</button>`
                  : ""),
            ),
          ];
        }),
    [
      "No.",
      "Customer",
      "Issued",
      "Due",
      "Total",
      "Paid",
      "Outstanding",
      "Status",
    ],
    `<select id="is" class="flt" aria-label="Status"><option value="">All statuses</option>${sts.map((x) => `<option>${x}</option>`).join("")}</select><input type="date" id="if" class="flt" aria-label="From"><input type="date" id="it" class="flt" aria-label="To">`,
  );
};
A.ia = (id, _, __, x) => {
  const i = by("invoices", id);
  if (x == "confirm") i.status = "Confirmed";
  else {
    if (!confirm("Cancel " + i.number + "?")) return;
    i.status = "Cancelled";
  }
  save();
  render();
};
A.iview = (id) => {
  const i = by("invoices", id),
    c = nm("customers", i.customerId),
    cu = by("customers", i.customerId) || {};
  modal(`<h3>Invoice ${i.number} ${badge(istat(i)).raw}</h3><p class="mu">${esc(c)}<br>${esc(cu.address || "")}<br>Issued ${i.issue} · Due ${i.due} · Billing period starting ${i.period} · ${esc(nm("subscriptions", i.subId) === "-" ? (by("subscriptions", i.subId) || {}).number : "")}</p>${linesTbl(i)}<p style="text-align:right">Paid ${money(paid(i))} · <b>Outstanding ${money(owed(i))}</b></p>
 <div class="bar noprint"><span class="sp"></span>${staff() && i.status != "Draft" && i.status != "Cancelled" ? `<button class="b" data-a="send" data-id="${i.id}">Send to customer</button>` : ""}<button class="b" onclick="window.print()">Print or save PDF</button><button class="b" data-a="close">Close</button></div>`);
};
A.send = (id) => {
  const i = by("invoices", id);
  i.sent = true;
  save();
  toast(
    `Invoice ${i.number} sent to ${(by("customers", i.customerId) || {}).email} (demo: no real email is sent).`,
  );
};
A.pay = (id) => pform(id);
function pform(inv) {
  const open = DB.invoices.filter(
    (i) => i.status == "Confirmed" && owed(i) > 0.005,
  );
  if (!open.length)
    return toast("No confirmed invoices are waiting for payment.");
  fmodal(
    "Record payment",
    fields(
      [
        {
          k: "invoiceId",
          l: "Invoice",
          t: "select",
          o: () =>
            open.map((i) => [
              i.id,
              `${i.number} · ${nm("customers", i.customerId)} · owes ${money(owed(i))}`,
            ]),
          d: inv,
        },
        {
          k: "method",
          l: "Method",
          t: "select",
          o: ["Bank transfer", "UPI", "Card", "Cash", "Cheque"],
        },
        num("amount", "Amount", inv ? owed(by("invoices", inv)) : 0),
        { k: "date", l: "Date", t: "date", d: today() },
        { k: "note", l: "Note", t: "textarea" },
      ],
      {},
    ),
    (d) => {
      const i = by("invoices", d.invoiceId),
        a = +d.amount;
      if (!(a > 0)) return fail("Enter an amount above zero.");
      if (a > owed(i) + 0.005)
        return fail(
          "That is more than the outstanding " + money(owed(i)) + ".",
        );
      DB.payments.push({
        id: uid(),
        invoiceId: i.id,
        method: d.method,
        amount: a,
        date: d.date,
        note: d.note,
      });
      save();
      if (owed(i) <= 0.005) {
        i.status = "Paid";
        save();
      }
      toast("Payment recorded");
    },
    "Save payment",
  );
}
V.payments = () =>
  page(
    myC() ? "My payments" : "Payments",
    staff()
      ? `<button class="b pr" data-a="pay">+ Record payment</button>`
      : "",
    () =>
      payV()
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((p) => {
          const i = by("invoices", p.invoiceId);
          return [
            p.date,
            i.number,
            nm("customers", i.customerId),
            p.method,
            money(p.amount),
            p.note || "",
            raw(""),
          ];
        }),
    ["Date", "Invoice", "Customer", "Method", "Amount", "Note"],
  );
A.cview = (id) => {
  const c = by("customers", id),
    ss = DB.subscriptions.filter((s) => s.customerId == id),
    ii = DB.invoices.filter((i) => i.customerId == id),
    pp = DB.payments.filter(
      (p) => by("invoices", p.invoiceId)?.customerId == id,
    );
  modal(
    `<h3>${esc(c.name)}</h3><p class="mu">${esc(c.email)} · ${esc(c.phone)}<br>${esc(c.address)}</p><h4>Subscriptions (${ss.length})</h4>${ss.map((s) => `${s.number} ${badge(s.status).raw} ${esc(nm("plans", s.planId))}`).join("<br>") || "None"}<h4>Invoices (${ii.length})</h4>${ii.map((i) => `${i.number} ${money(i.total)} ${badge(istat(i)).raw}`).join("<br>") || "None"}<h4>Payments (${pp.length})</h4>${pp.map((p) => `${p.date} ${p.method} ${money(p.amount)}`).join("<br>") || "None"}<div class="bar"><span class="sp"></span><button class="b" data-a="close">Close</button></div>`,
  );
};
/* ---------- dashboard ---------- */
const kp = (a) =>
  `<div class="cards">${a.map(([l, v]) => `<div class="kp"><span>${l}</span><b>${v}</b></div>`).join("")}</div>`;
V.dashboard = () => {
  DRAW = null;
  if (myC()) {
    const ss = subsV(),
      ii = invV(),
      act = ss.filter((s) => s.status == "Active"),
      nx = act
        .map((s) => s.next)
        .filter(Boolean)
        .sort()[0];
    M.innerHTML =
      `<h2>Welcome, ${esc(ME.name)}</h2><br>` +
      kp([
        ["Active subscriptions", act.length],
        ["Next billing date", nx || "-"],
        [
          "Outstanding balance",
          money(
            sum(
              ii.filter((i) => i.status == "Confirmed"),
              owed,
            ),
          ),
        ],
        ["Overdue invoices", ii.filter((i) => istat(i) == "Overdue").length],
      ]) +
      `<div class="bar"><button class="b pr" data-a="profile">Manage billing profile</button><button class="b" data-a="go" data-id="subscriptions">View subscriptions</button><button class="b" data-a="go" data-id="invoices">View invoices</button></div><p class="mu">Manage your subscription details, review upcoming billing, and access invoices and payment history from this portal.</p>`;
    return;
  }
  const f = FL,
    inR = (d) => (!f.df || d >= f.df) && (!f.dt || d <= f.dt),
    subs = DB.subscriptions.filter(
      (s) => (!f.ds || s.status == f.ds) && inR(s.start),
    ),
    inv = DB.invoices.filter((i) => inR(i.issue)),
    bill = inv.filter((i) => ["Confirmed", "Paid"].includes(i.status)),
    od = bill.filter((i) => istat(i) == "Overdue"),
    sts = ["Draft", "Quotation", "Confirmed", "Active", "Closed"];
  M.innerHTML =
    `<div class="bar"><h2>Dashboard</h2><span class="sp"></span><label style="margin:0">From <input type="date" id="df" class="flt"></label><label style="margin:0">To <input type="date" id="dt" class="flt"></label><select id="ds" class="flt" aria-label="Subscription status"><option value="">All subscription statuses</option>${sts.map((x) => `<option>${x}</option>`).join("")}</select></div>` +
    kp([
      ["Total subscriptions", subs.length],
      ["Active subscriptions", subs.filter((s) => s.status == "Active").length],
      ["Total revenue (invoiced)", money(sum(bill, (i) => i.total))],
      [
        "Collected payments",
        money(
          sum(
            DB.payments.filter((p) => inR(p.date)),
            (p) => p.amount,
          ),
        ),
      ],
      [
        "Outstanding payments",
        money(
          sum(
            bill.filter((i) => i.status == "Confirmed"),
            owed,
          ),
        ),
      ],
      ["Overdue invoices", od.length],
    ]) +
    `<div class="two"><div class="card"><div class="tw"><table><thead><tr><th>Subscription status</th><th>Count</th></tr></thead><tbody>${sts.map((s) => `<tr><td>${s}</td><td>${subs.filter((x) => x.status == s).length}</td></tr>`).join("")}</tbody></table></div></div>
 <div class="card"><div class="tw"><table><thead><tr><th>Invoice status</th><th>Count</th><th>Amount</th></tr></thead><tbody>${[
   "Draft",
   "Confirmed",
   "Paid",
   "Overdue",
   "Cancelled",
 ]
   .map((s) => {
     const x = inv.filter((i) => istat(i) == s);
     return `<tr><td>${s}</td><td>${x.length}</td><td>${money(sum(x, (i) => i.total))}</td></tr>`;
   })
   .join("")}</tbody></table></div></div></div>
 <h4>Overdue invoices to chase</h4><div class="card tw"><table><tbody>${
   od
     .slice(0, 10)
     .map(
       (i) =>
         `<tr><td>${i.number}</td><td>${esc(nm("customers", i.customerId))}</td><td>Due ${i.due}</td><td>${money(owed(i))}</td></tr>`,
     )
     .join("") || '<tr><td class="mu">Nothing overdue.</td></tr>'
 }</tbody></table></div>`;
  M.querySelectorAll(".flt").forEach((i) => {
    i.value = f[i.id] || "";
    i.onchange = () => {
      FL[i.id] = i.value;
      render();
    };
  });
};

/* Customer self-service billing profile */
A.profile = () => {
  if (!myC()) return;
  const c = by("customers", ME.cid);
  if (!c) return toast("Customer profile not found.");
  fmodal("Manage billing profile", fields([
    { k: "name", l: "Full name", r: 1 },
    { k: "email", l: "Email address", t: "email", r: 1 },
    { k: "phone", l: "Phone" },
    { k: "address", l: "Billing address", t: "textarea" },
  ], c), d => {
    const em = d.email.trim().toLowerCase();
    if (!d.name.trim() || !em) return fail("Name and email are required.");
    if (DB.customers.some(x => x.id !== c.id && !x.archived && x.email.toLowerCase() === em)) return fail("That email already belongs to another customer.");
    c.name = d.name.trim(); c.email = em; c.phone = d.phone.trim(); c.address = d.address.trim();
    ME.name = c.name; ME.email = em;
    const u = DB.users.find(x => x.id === ME.id); if (u) { u.name = c.name; u.email = em; }
    save(); render(); toast("Billing profile updated.");
  });
};
