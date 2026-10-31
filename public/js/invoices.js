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
A.ia = async (id, _, __, x) => {
  const i = by("invoices", id);
  if (x != "confirm") {
    if (!confirm("Cancel " + i.number + "?")) return;
  }
  const result = await api(`/invoices/${encodeURIComponent(id)}/${x}`, {
    method: "POST",
  });
  await reloadData();
  render();
  toast(result.msg);
};
A.iview = (id) => {
  const i = by("invoices", id),
    c = nm("customers", i.customerId),
    cu = by("customers", i.customerId) || {};
  modal(`<h3>Invoice ${i.number} ${badge(istat(i)).raw}</h3><p class="mu">${esc(c)}<br>${esc(cu.address || "")}<br>Issued ${i.issue} · Due ${i.due} · Billing period starting ${i.period} · ${esc(nm("subscriptions", i.subId) === "-" ? (by("subscriptions", i.subId) || {}).number : "")}</p>${linesTbl(i)}<p style="text-align:right">Paid ${money(paid(i))} · <b>Outstanding ${money(owed(i))}</b></p>
 <div class="bar noprint"><span class="sp"></span>${staff() && i.status != "Draft" && i.status != "Cancelled" ? `<button class="b" data-a="send" data-id="${i.id}">Send to customer</button>` : ""}<button class="b" onclick="window.print()">Print or save PDF</button><button class="b" data-a="close">Close</button></div>`);
};
A.send = async (id) => {
  const result = await api(`/invoices/${encodeURIComponent(id)}/send`, {
    method: "POST",
  });
  await reloadData();
  render();
  toast(result.msg);
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
    async (d) => {
      const i = by("invoices", d.invoiceId),
        a = +d.amount;
      if (!(a > 0)) return fail("Enter an amount above zero.");
      if (a > owed(i) + 0.005)
        return fail(
          "That is more than the outstanding " + money(owed(i)) + ".",
        );
      const result = await api("/payments", {
        method: "POST",
        body: JSON.stringify({
          invoiceId: i.id,
          method: d.method,
          amount: a,
          date: d.date,
          note: d.note,
        }),
      });
      await reloadData();
      toast(result.msg);
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
  `<div class="cards">${a.map(([l, v, meta = ""]) => `<div class="kp"><span>${l}</span><b>${v}</b>${meta ? `<small>${meta}</small>` : ""}</div>`).join("")}</div>`;
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
    const overdue = ii.filter((i) => istat(i) == "Overdue"),
      outstanding = sum(ii.filter((i) => i.status == "Confirmed"), owed);
    M.innerHTML =
      `<div class="dash-hero"><div><span class="eyebrow">CUSTOMER PORTAL</span><h2>Welcome back, ${esc(ME.name)}</h2><p class="mu">Here is the latest view of your Brightloop account.</p></div><div class="dash-actions"><button class="b pr" data-a="profile">Manage profile</button><button class="b" data-a="go" data-id="subscriptions">Subscriptions</button></div></div>` +
      kp([
        ["Active subscriptions", act.length, act.length ? "Currently running" : "No active plans"],
        ["Next billing date", nx || "-", nx ? "Upcoming charge" : "Nothing scheduled"],
        ["Outstanding balance", money(outstanding), outstanding ? "Payment required" : "All caught up"],
        ["Overdue invoices", overdue.length, overdue.length ? "Needs attention" : "No overdue invoices"],
      ]) +
      `<div class="two dash-panels"><div class="card dash-panel"><div class="panel-head"><div><span class="eyebrow">ACCOUNT SNAPSHOT</span><h3>Keep everything on track</h3></div><button class="b" data-a="go" data-id="invoices">View invoices</button></div><p class="mu">Review invoices, check payment history, and manage your subscriptions from one place.</p><div class="dash-links"><button class="b" data-a="go" data-id="invoices">Open invoices <span>→</span></button><button class="b" data-a="go" data-id="payments">Payment history <span>→</span></button></div></div><div class="card dash-panel"><div class="panel-head"><div><span class="eyebrow">UPCOMING</span><h3>Next billing</h3></div></div><p class="dash-big">${esc(nx || "No upcoming billing")}</p><p class="mu">${nx ? "Your next subscription renewal date." : "There are no active subscriptions with billing scheduled."}</p></div></div>`;
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
  const active = subs.filter((s) => s.status == "Active"),
    collected = sum(DB.payments.filter((p) => inR(p.date)), (p) => p.amount),
    outstanding = sum(bill.filter((i) => i.status == "Confirmed"), owed),
    upcoming = active.filter((s) => s.next).sort((a, b) => a.next.localeCompare(b.next)).slice(0, 6),
    totalInvoiceValue = sum(inv, (i) => i.total);
  M.innerHTML =
    `<div class="dash-hero"><div><span class="eyebrow">OPERATIONS OVERVIEW</span><h2>Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${esc(ME.name)}</h2><p class="mu">Monitor subscriptions, cash flow, and accounts that need attention.</p></div><div class="dash-actions"><button class="b pr" data-a="bill">Run billing now</button><button class="b" data-a="go" data-id="invoices">Review invoices</button></div></div><div class="dash-filters"><span class="eyebrow">REPORTING PERIOD</span><label>From <input type="date" id="df" class="flt"></label><label>To <input type="date" id="dt" class="flt"></label><select id="ds" class="flt" aria-label="Subscription status"><option value="">All subscription statuses</option>${sts.map((x) => `<option>${x}</option>`).join("")}</select></div>` +
    kp([
      ["Total subscriptions", subs.length, `${active.length} active now`],
      ["Active subscriptions", active.length, active.length ? "Billing enabled" : "No active plans"],
      ["Total revenue", money(sum(bill, (i) => i.total)), `${bill.length} issued invoices`],
      ["Collected payments", money(collected), totalInvoiceValue ? `${Math.round((collected / totalInvoiceValue) * 100)}% of invoiced value` : "No payments in period"],
      ["Outstanding", money(outstanding), outstanding ? "Confirmed invoices" : "Nothing currently owed"],
      ["Overdue invoices", od.length, od.length ? "Follow-up required" : "No overdue accounts"],
    ]) +
    `<div class="two dash-panels"><div class="card dash-panel"><div class="panel-head"><div><span class="eyebrow">SUBSCRIPTIONS</span><h3>Portfolio health</h3></div><button class="b" data-a="go" data-id="subscriptions">View all</button></div><div class="status-list">${sts.map((s) => { const count = subs.filter((x) => x.status == s).length, pct = subs.length ? (count / subs.length) * 100 : 0; return `<div class="status-row"><div><span>${s}</span><b>${count}</b></div><div class="bar-track"><i style="width:${pct}%"></i></div></div>`; }).join("")}</div></div>
 <div class="card dash-panel"><div class="panel-head"><div><span class="eyebrow">INVOICES</span><h3>Billing health</h3></div><button class="b" data-a="go" data-id="invoices">View all</button></div><div class="tw"><table class="compact-table"><thead><tr><th>Status</th><th>Count</th><th>Amount</th></tr></thead><tbody>${[
   "Draft",
   "Confirmed",
   "Paid",
   "Overdue",
   "Cancelled",
 ]
   .map((s) => {
     const x = inv.filter((i) => istat(i) == s);
     return `<tr><td><span class="status-dot ${s.toLowerCase()}"></span>${s}</td><td>${x.length}</td><td>${money(sum(x, (i) => i.total))}</td></tr>`;
   })
   .join("")}</tbody></table></div></div></div>
 <div class="two dash-panels dash-lower"><div><div class="section-head"><div><span class="eyebrow">NEXT UP</span><h3>Upcoming billing</h3></div><button class="b" data-a="go" data-id="subscriptions">View subscriptions</button></div><div class="card tw"><table class="compact-table"><thead><tr><th>Subscription</th><th>Customer</th><th>Billing date</th><th>Value</th></tr></thead><tbody>${
   upcoming.map((s) => `<tr><td><b>${esc(s.number)}</b></td><td>${esc(nm("customers", s.customerId))}</td><td>${esc(s.next)}</td><td>${money(calc(s.lines).total)}</td></tr>`).join("") || '<tr><td colspan="4" class="mu">No upcoming billing found.</td></tr>'
 }</tbody></table></div></div><div><div class="section-head"><div><span class="eyebrow">ACTION REQUIRED</span><h3>Overdue invoices</h3></div><button class="b" data-a="go" data-id="invoices">View invoices</button></div><div class="card tw"><table class="compact-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th>Owed</th></tr></thead><tbody>${
   od
     .slice(0, 6)
     .map(
      (i) =>
        `<tr><td><b>${esc(i.number)}</b></td><td>${esc(nm("customers", i.customerId))}</td><td>${esc(i.due)}</td><td class="danger-text">${money(owed(i))}</td></tr>`,
     )
     .join("") || '<tr><td colspan="4" class="mu">Nothing overdue. Nice work.</td></tr>'
 }</tbody></table></div></div></div>`;
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
  ], c), async d => {
    const em = d.email.trim().toLowerCase();
    if (!d.name.trim() || !em) return fail("Name and email are required.");
    const result = await api("/customer/profile", {
      method: "PUT",
      body: JSON.stringify({
        name: d.name.trim(),
        email: em,
        phone: d.phone.trim(),
        address: d.address.trim(),
      }),
    });
    ME = result.user;
    await reloadData();
    render();
    toast(result.msg);
  });
};
