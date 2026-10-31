/* ---------- pricing ---------- */
function calc(lines) {
  const t = today();
  let L = lines.map((l) => ({ ...l, net: l.qty * l.price }));
  const sub = sum(L, (l) => l.net);
  let disc = 0,
    used = [];
  DB.discounts
    .filter(
      (d) =>
        !d.archived &&
        d.active != "no" &&
        (!d.from || d.from <= t) &&
        (!d.to || d.to >= t) &&
        (!d.max || (d.used || 0) < d.max),
    )
    .forEach((d) => {
      const el = L.filter(
          (l) => d.appliesTo == "all" || l.productId == d.appliesTo,
        ),
        base = sum(el, (l) => l.net),
        q = sum(el, (l) => l.qty);
      if (!base || base < (+d.minAmount || 0) || q < (+d.minQty || 0)) return;
      const v =
        d.type == "percent" ? (base * d.value) / 100 : Math.min(+d.value, base);
      el.forEach((l) => (l.net -= (l.net / base) * v));
      disc += v;
      used.push(d.id);
    });
  L.forEach((l) => {
    const x = by("taxes", l.taxId);
    l.rate = x ? x.rate : 0;
    l.tax = (l.net * l.rate) / 100;
  });
  const tax = sum(L, (l) => l.tax);
  L.forEach((l) => {
    l.net = r2(l.net);
    l.tax = r2(l.tax);
  });
  return {
    lines: L,
    subtotal: r2(sub),
    discount: r2(disc),
    tax: r2(tax),
    total: r2(sub - disc + tax),
    used,
  };
}
const paid = (i) => {
  if (!C.pm) {
    C.pm = {};
    DB.payments.forEach(
      (p) => (C.pm[p.invoiceId] = (C.pm[p.invoiceId] || 0) + p.amount),
    );
  }
  return C.pm[i.id] || 0;
};
const owed = (i) => r2(i.total - paid(i));
const istat = (i) =>
  i.status == "Confirmed" && i.due < today() && owed(i) > 0.005
    ? "Overdue"
    : i.status;
const termD = (x) => ({ Immediate: 0, "Net 15": 15, "Net 30": 30 })[x] || 0;
/* ---------- billing engine ---------- */
function runBilling() {
  let n = 0;
  const t = today(),
    keys = new Set(DB.invoices.map((i) => i.key));
  DB.subscriptions
    .filter((s) => s.status == "Active" && !s.paused)
    .forEach((s) => {
      const p = by("plans", s.planId);
      if (!p) return;
      let g = 0;
      while (s.next && s.next <= t && s.next <= s.expiry && g++ < 400) {
        const k = s.id + "|" + s.next;
        if (!keys.has(k)) {
          keys.add(k);
          const c = calc(s.lines);
          c.used.forEach((id) => {
            const d = by("discounts", id);
            d.used = (d.used || 0) + 1;
          });
          DB.invoices.push({
            id: uid(),
            number: "INV-" + String(DB.seq.inv++).padStart(4, "0"),
            key: k,
            subId: s.id,
            customerId: s.customerId,
            issue: t,
            period: s.next,
            due: addD(t, termD(s.terms)),
            lines: c.lines,
            subtotal: c.subtotal,
            discount: c.discount,
            tax: c.tax,
            total: c.total,
            status: "Draft",
            sent: false,
          });
          n++;
        }
        s.next = nextP(s.next, p.freq);
      }
      if (s.expiry < t && p.autoClose == "yes") {
        s.status = "Closed";
        s.closed = t;
      }
    });
  if (n || 1) save();
  return n;
}
