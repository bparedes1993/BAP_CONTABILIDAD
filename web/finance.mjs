// Deterministic finance calculations. Currency amounts are integer cents.
const DAY = 86400000;
function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Fecha inválida');
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new Error('Fecha inválida');
  return time / DAY;
}
function cents(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Importe inválido');
  return value;
}
function add(a, b) {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) throw new Error('Importe fuera de rango');
  return sum;
}
export function receivables(invoices, asOf) {
  const today = day(asOf);
  const aging = { current: 0, days1to30: 0, days31to60: 0, days61plus: 0 };
  let totalCents = 0, collectedCents = 0;
  const rows = invoices.map(invoice => {
    const total = cents(invoice.totalCents), paid = cents(invoice.paidCents);
    if (paid > total) throw new Error('Cobro mayor al documento');
    if (day(invoice.issuedOn) > today) throw new Error('Documento posterior a la fecha de corte');
    const daysLate = Math.max(0, today - day(invoice.dueOn));
    const balanceCents = total - paid;
    const bucket = daysLate === 0 ? 'current' : daysLate <= 30 ? 'days1to30' : daysLate <= 60 ? 'days31to60' : 'days61plus';
    aging[bucket] = add(aging[bucket], balanceCents);
    totalCents = add(totalCents, total); collectedCents = add(collectedCents, paid);
    return { ...invoice, balanceCents, daysLate, bucket };
  });
  return { rows, aging, totalCents, collectedCents, outstandingCents: totalCents - collectedCents,
    overdueCents: add(add(aging.days1to30, aging.days31to60), aging.days61plus) };
}
export function cashScenario({ invoices, bills, asOf, openingCents, horizonDays = 30 }) {
  const today = day(asOf);
  if(!Number.isSafeInteger(openingCents))throw new Error('Caja inicial inválida');
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 90) throw new Error('Horizonte inválido');
  const portfolio = receivables(invoices, asOf);
  const scheduled = new Map(); let excludedOverdueCents = 0;
  function schedule(dueOn, inflow, outflow) {
    const offset = day(dueOn) - today;
    if (offset < 0) return false;
    if (offset > horizonDays) return true;
    const entry = scheduled.get(offset) || { inflowCents: 0, outflowCents: 0 };
    entry.inflowCents = add(entry.inflowCents, inflow); entry.outflowCents = add(entry.outflowCents, outflow);
    scheduled.set(offset, entry); return true;
  }
  for (const row of portfolio.rows) {
    if (!schedule(row.dueOn, row.balanceCents, 0)) excludedOverdueCents = add(excludedOverdueCents, row.balanceCents);
  }
  // Overdue unpaid bills are obligations to cover immediately on day zero.
  for (const bill of bills) {
    cents(bill.amountCents);
    const due = day(bill.dueOn) < today ? asOf : bill.dueOn;
    schedule(due, 0, bill.amountCents);
  }
  let balanceCents = openingCents, minimumCents = openingCents, inflowCents = 0, outflowCents = 0;
  let firstShortfallOn = openingCents < 0 ? asOf : null;
  const daily = [];
  for (let offset = 0; offset <= horizonDays; offset++) {
    const entry = scheduled.get(offset) || { inflowCents: 0, outflowCents: 0 };
    inflowCents = add(inflowCents, entry.inflowCents); outflowCents = add(outflowCents, entry.outflowCents);
    balanceCents = add(add(balanceCents, entry.inflowCents), -entry.outflowCents);
    const date = new Date((today + offset) * DAY).toISOString().slice(0, 10);
    if (balanceCents < minimumCents) minimumCents = balanceCents;
    if (balanceCents < 0 && !firstShortfallOn) firstShortfallOn = date;
    daily.push({ date, ...entry, balanceCents });
  }
  return { closingCents: balanceCents, minimumCents, firstShortfallOn, inflowCents, outflowCents, excludedOverdueCents, daily };
}
