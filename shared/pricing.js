/* Pricing and date rules shared by the server (billing) and the browser (previews). */
(function (root, f) {
  if (typeof module === "object" && module.exports) module.exports = f();
  else root.BL = f();
})(this, function () {
  const r2 = (n) => Math.round(n * 100) / 100;
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
  const termD = (x) => ({ Immediate: 0, "Net 15": 15, "Net 30": 30 })[x] || 0;
  const sum = (a, f) => a.reduce((x, y) => x + (+f(y) || 0), 0);
  function calc(lines, taxes, discounts, t) {
    const L = lines.map((l) => ({ ...l, net: l.qty * l.price })),
      sub = sum(L, (l) => l.net);
    let disc = 0;
    const used = [];
    discounts
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
          d.type == "percent"
            ? (base * d.value) / 100
            : Math.min(+d.value, base);
        el.forEach((l) => (l.net -= (l.net / base) * v));
        disc += v;
        used.push(d.id);
      });
    L.forEach((l) => {
      const x = taxes.find((z) => z.id == l.taxId);
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
  return { r2, addD, addM, nextP, days, termD, calc };
});
