/**
 * Demo datasets for GreenStream — Albanian copy lives in the UI; data only here.
 */

/** @typedef {'delivered' | 'in-transit' | 'pending' | 'processing'} OrderStatus */
/** @typedef {'active' | 'maintenance' | 'idle'} VehicleStatus */

/** @type {ReadonlyArray<{ id: string, status: OrderStatus, carbonSaved: number, date: string, destination: string }>} */
export const ORDERS = Object.freeze([
  { id: 'ORD-001', status: 'delivered', carbonSaved: 45.2, date: '2026-05-10', destination: 'Prishtinë' },
  { id: 'ORD-002', status: 'in-transit', carbonSaved: 32.8, date: '2026-05-11', destination: 'Durrës' },
  { id: 'ORD-003', status: 'pending', carbonSaved: 28.5, date: '2026-05-12', destination: 'Vlorë' },
  { id: 'ORD-004', status: 'delivered', carbonSaved: 51.0, date: '2026-05-09', destination: 'Tiranë (Kombinat)' },
  { id: 'ORD-005', status: 'processing', carbonSaved: 19.4, date: '2026-05-12', destination: 'Shkodër' },
  { id: 'ORD-006', status: 'in-transit', carbonSaved: 36.1, date: '2026-05-11', destination: 'Pejë' },
  { id: 'ORD-007', status: 'delivered', carbonSaved: 62.3, date: '2026-05-08', destination: 'Elbasan' },
  { id: 'ORD-008', status: 'pending', carbonSaved: 24.0, date: '2026-05-12', destination: 'Gjakovë' },
  { id: 'ORD-009', status: 'delivered', carbonSaved: 41.7, date: '2026-05-07', destination: 'Fier' },
  { id: 'ORD-010', status: 'in-transit', carbonSaved: 29.9, date: '2026-05-10', destination: 'Prizren' },
  { id: 'ORD-011', status: 'delivered', carbonSaved: 38.2, date: '2026-05-06', destination: 'Korçë' },
  { id: 'ORD-012', status: 'processing', carbonSaved: 33.6, date: '2026-05-12', destination: 'Mitrovicë' },
  { id: 'ORD-013', status: 'delivered', carbonSaved: 47.8, date: '2026-05-05', destination: 'Berat' },
  { id: 'ORD-014', status: 'pending', carbonSaved: 21.3, date: '2026-05-12', destination: 'Ferizaj' },
  { id: 'ORD-015', status: 'in-transit', carbonSaved: 55.4, date: '2026-05-09', destination: 'Lezhë' },
  { id: 'ORD-016', status: 'delivered', carbonSaved: 30.5, date: '2026-04-28', destination: 'Gjilan' },
  { id: 'ORD-017', status: 'delivered', carbonSaved: 44.1, date: '2026-04-22', destination: 'Kukës' },
  { id: 'ORD-018', status: 'in-transit', carbonSaved: 27.2, date: '2026-05-11', destination: 'Suharekë' },
]);

/** @type {ReadonlyArray<{ id: string, status: VehicleStatus, location: string, efficiency: number, route: string }>} */
export const FLEET = Object.freeze([
  { id: 'TRUCK-001', status: 'active', location: 'Depo Tiranë', efficiency: 94, route: 'TR–DU' },
  { id: 'TRUCK-002', status: 'maintenance', location: 'Qendra e servisit', efficiency: 0, route: '—' },
  { id: 'TRUCK-003', status: 'active', location: 'Në rrugë', efficiency: 87, route: 'DU–VL' },
  { id: 'TRUCK-004', status: 'idle', location: 'Parku Ferizaj', efficiency: 0, route: '—' },
  { id: 'TRUCK-005', status: 'active', location: 'Kalim kufiri Morinë', efficiency: 91, route: 'KUK–PRN' },
  { id: 'TRUCK-006', status: 'active', location: 'Depo Durrës', efficiency: 88, route: 'DU–SHK' },
  { id: 'TRUCK-007', status: 'idle', location: 'Depo Vlorë', efficiency: 0, route: 'VL–SAR' },
  { id: 'TRUCK-008', status: 'active', location: 'Rruga Tiranë–Elbasan', efficiency: 82, route: 'TR–EL' },
]);

/** @type {ReadonlyArray<{ id: string, name: string, capacity: number, temperature: string, pallets: number }>} */
export const WAREHOUSES = Object.freeze([
  { id: 'WH-001', name: 'Depo qendrore Tirana', capacity: 92, temperature: '20°C', pallets: 450 },
  { id: 'WH-002', name: 'Porti i Durrësit', capacity: 78, temperature: '18°C', pallets: 290 },
  { id: 'WH-003', name: 'Depo rajonale Vlorë', capacity: 45, temperature: '22°C', pallets: 120 },
  { id: 'WH-004', name: 'Hubi verior Shkodër', capacity: 63, temperature: '19°C', pallets: 210 },
  { id: 'WH-005', name: 'Depo kufitare Kukës', capacity: 71, temperature: '17°C', pallets: 175 },
]);

const whReportLabels = { all: 'Të gjitha depot' };
for (const w of WAREHOUSES) {
  whReportLabels[w.id] = w.name;
}

export const REPORT_WAREHOUSE_IDS = Object.freeze(['all', ...WAREHOUSES.map((w) => w.id)]);
export const WH_REPORT_LABELS = Object.freeze(whReportLabels);

/** @type {ReadonlyArray<{ id: string, at: string, title: string, detail: string, lane: string }>} */
export const OPS_EVENTS = Object.freeze([
  { id: 'OPS-2401', at: '2026-05-12 07:40', title: 'Nisje e grupuar', detail: 'Kombinim TR→DU për 4 paleta FMCG.', lane: 'Tiranë–Durrës' },
  { id: 'OPS-2402', at: '2026-05-12 09:05', title: 'Slot në port', detail: 'Dokumentacion i përfunduar për kontejnerin DU-18.', lane: 'Durrës' },
  { id: 'OPS-2403', at: '2026-05-12 10:22', title: 'Koridor verior', detail: 'Kapacitet i rezervuar për mjetin TRUCK-006.', lane: 'Durrës–Shkodër' },
  { id: 'OPS-2404', at: '2026-05-12 11:50', title: 'Kufi', detail: 'Kalim i paraparë për ngarkesën drejt Prishtinës.', lane: 'Kukës–Prishtinë' },
  { id: 'OPS-2405', at: '2026-05-12 13:15', title: 'Ripozicionim', detail: 'Paletat e ftohta kalojnë nga WH-001 në WH-002.', lane: 'Tiranë–Durrës' },
  { id: 'OPS-2406', at: '2026-05-12 14:40', title: 'Planifikim', detail: 'Dritare e re për VL–SAR nesër në mëngjes.', lane: 'Vlorë–Sarandë' },
]);

/** @type {ReadonlyArray<{ id: string, severity: 'info' | 'warning' | 'critical', at: string, title: string, detail: string }>} */
export const ALERTS = Object.freeze([
  { id: 'ALT-901', severity: 'warning', at: '2026-05-12 06:10', title: 'Temperatura në kufi', detail: 'WH-005 raporton +0.8°C mbi setpoint për 12 min.' },
  { id: 'ALT-902', severity: 'info', at: '2026-05-12 08:30', title: 'Vonesë e lehtë', detail: 'ORD-002 +25 min në segment DU (trafik).' },
  { id: 'ALT-903', severity: 'critical', at: '2026-05-12 09:55', title: 'Servisim', detail: 'TRUCK-002 — pritje për pjesë rezervë deri në 14:00.' },
  { id: 'ALT-904', severity: 'info', at: '2026-05-12 11:05', title: 'Kapacitet', detail: 'WH-003 në 88% të zonës së ngurtë — planifikoni devijim.' },
  { id: 'ALT-905', severity: 'warning', at: '2026-05-12 12:20', title: 'Dokumentacion', detail: '1 CMR ende pa nënshkrim për ORD-010 (Prizren).' },
]);

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toISODateUTC(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function parseOrderDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * @param {Date} ref
 */
function startOfMonthUTC(ref) {
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
}

/**
 * @param {ReadonlyArray<{ date: string, carbonSaved: number }>} orders
 * @param {number} daysBack
 * @param {Date} [ref=new Date()]
 */
export function buildDailyCarbonSeries(orders, daysBack = 14, ref = new Date()) {
  const end = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (daysBack - 1));
  const keys = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    keys.push(toISODateUTC(new Date(t)));
  }
  const byDay = new Map(keys.map((k) => [k, { date: k, orders: 0, carbonKg: 0 }]));
  for (const o of orders) {
    const row = byDay.get(o.date);
    if (!row) continue;
    row.orders += 1;
    row.carbonKg += o.carbonSaved;
  }
  return keys.map((k) => byDay.get(k));
}

/**
 * @param {ReadonlyArray<{ date: string, carbonSaved: number, status: string }>} orders
 * @param {ReadonlyArray<{ status: string, efficiency: number }>} fleet
 * @param {Date} [ref=new Date()]
 */
export function computeClientOrderKpis(orders, fleet, ref = new Date()) {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const monthStart = startOfMonthUTC(ref);
  const nextMonth = new Date(Date.UTC(y, m + 1, 1));

  let carbonMonthKg = 0;
  let inTransit = 0;
  let pendingOrProcessing = 0;
  for (const o of orders) {
    const od = parseOrderDate(o.date);
    if (od >= monthStart && od < nextMonth) {
      carbonMonthKg += o.carbonSaved;
    }
    if (o.status === 'in-transit') inTransit += 1;
    if (o.status === 'pending' || o.status === 'processing') pendingOrProcessing += 1;
  }

  const activeFleet = fleet.filter((v) => v.status === 'active');
  const avgFleetEff =
    activeFleet.length === 0
      ? 0
      : Math.round(activeFleet.reduce((a, v) => a + v.efficiency, 0) / activeFleet.length);

  const routeSavingsEur = Math.round(carbonMonthKg * 2.75 + inTransit * 120);

  return {
    carbonMonthKg: Math.round(carbonMonthKg * 10) / 10,
    inTransit,
    pendingOrProcessing,
    routeSavingsEur,
    fleetEfficiencyPct: avgFleetEff,
  };
}

/**
 * CO₂ for calendar day of `ref`, active shipments = in-transit count, fleet eff = active avg.
 * @param {ReadonlyArray<{ date: string, carbonSaved: number, status: string }>} orders
 * @param {ReadonlyArray<{ status: string, efficiency: number }>} fleet
 * @param {Date} [ref=new Date()]
 */
export function computePublicLandingStats(orders, fleet, ref = new Date()) {
  const day = toISODateUTC(ref);
  let co2TodayKg = 0;
  let activeShipments = 0;
  for (const o of orders) {
    if (o.date === day) co2TodayKg += o.carbonSaved;
    if (o.status === 'in-transit') activeShipments += 1;
  }
  const activeFleet = fleet.filter((v) => v.status === 'active');
  const fleetEfficiencyPct =
    activeFleet.length === 0 ? 0 : Math.round(activeFleet.reduce((a, v) => a + v.efficiency, 0) / activeFleet.length);
  return {
    co2TodayKg: Math.round(co2TodayKg * 10) / 10,
    activeShipments,
    fleetEfficiencyPct,
  };
}

/**
 * @param {ReadonlyArray<{ status: string, efficiency: number }>} fleet
 */
export function computeCorridorEfficiencyPct(fleet) {
  const active = fleet.filter((v) => v.status === 'active');
  if (!active.length) return 0;
  return Math.round(active.reduce((a, v) => a + v.efficiency, 0) / active.length);
}

/**
 * @param {ReadonlyArray<{ capacity: number }>} warehouses
 * @param {ReadonlyArray<{ severity: string }>} alerts
 */
export function computeAvailabilityDisplayPct(warehouses, alerts) {
  if (!warehouses.length) return '99,0';
  const avgCap = warehouses.reduce((a, w) => a + w.capacity, 0) / warehouses.length;
  const critical = alerts.filter((a) => a.severity === 'critical').length;
  const raw = 99.4 + (100 - avgCap) * 0.012 - critical * 0.35 - alerts.length * 0.04;
  const v = Math.min(99.9, Math.max(97.0, raw));
  return v.toFixed(1).replace('.', ',');
}

/** @type {ReadonlyArray<{ id: string, title: string, detail: string, at: string, read?: boolean }>} */
export const CLIENT_NOTIFICATIONS = Object.freeze([
  {
    id: 'NTF-101',
    title: 'Dërgesa në transit',
    detail: 'ORD-002 është në segment Durrës — ETA e përditësuar.',
    at: '2026-05-12 08:40',
    read: false,
  },
  {
    id: 'NTF-102',
    title: 'Raporti mujor',
    detail: 'Raporti i prillit është gati për shkarkim nga seksioni Raportet.',
    at: '2026-05-12 07:15',
    read: false,
  },
  {
    id: 'NTF-103',
    title: 'Kursim CO₂',
    detail: 'Këtë javë keni +12% CO₂ të shmangur krahasuar me mesataren e 14 ditëve të fundit.',
    at: '2026-05-11 16:02',
    read: true,
  },
  {
    id: 'NTF-104',
    title: 'Dokumentacion',
    detail: 'Kujtesë: CMR për ORD-010 pret nënshkrimin në portal.',
    at: '2026-05-11 11:30',
    read: true,
  },
]);

/**
 * Tekst trendi në shqip, krahason mesataren e fundit vs mëparshme të serisë ditore.
 * @param {ReadonlyArray<{ carbonKg: number }>} series
 */
export function summarizeCarbonSeriesTrend(series) {
  if (!series || series.length < 4) {
    return { tone: 'neutral', text: 'Të dhëna të pamjaftueshme për trend në këtë dritare.' };
  }
  const n = series.length;
  const half = Math.floor(n / 2);
  const first = series.slice(0, half);
  const second = series.slice(half);
  const avg = (rows) => rows.reduce((a, r) => a + r.carbonKg, 0) / Math.max(1, rows.length);
  const a0 = avg(first);
  const a1 = avg(second);
  if (a0 < 0.0001 && a1 < 0.0001) {
    return { tone: 'neutral', text: 'Aktivitet i ulët në këtë periudhë — trendi është i qëndrueshëm.' };
  }
  const deltaPct = a0 > 0.0001 ? ((a1 - a0) / a0) * 100 : a1 > 0 ? 100 : 0;
  if (Math.abs(deltaPct) < 3) {
    return { tone: 'neutral', text: 'CO₂ e shmangur është e qëndrueshme krahasuar me fillimin e periudhës.' };
  }
  if (deltaPct > 0) {
    return {
      tone: 'positive',
      text: `Trend në rritje: fundi i periudhës është ~${Math.abs(Math.round(deltaPct))}% më i lartë se fillimi (kg CO₂ të përmbledhur në ditë).`,
    };
  }
  return {
    tone: 'caution',
    text: `Trend në ulje: fundi i periudhës është ~${Math.abs(Math.round(deltaPct))}% më i ulët se fillimi — verifikoni volumin e dërgesave.`,
  };
}
