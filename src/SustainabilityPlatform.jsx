import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import {
  ChevronRight,
  LogOut,
  Menu,
  X,
  BarChart3,
  Package,
  Truck,
  Users,
  Settings,
  TrendingDown,
  Download,
  AlertCircle,
  Search,
  Bell,
  Moon,
  Sun,
} from 'lucide-react';
import {
  ORDERS,
  FLEET,
  WAREHOUSES,
  REPORT_WAREHOUSE_IDS,
  WH_REPORT_LABELS,
  OPS_EVENTS,
  ALERTS,
  buildDailyCarbonSeries,
  computeClientOrderKpis,
  computePublicLandingStats,
  computeCorridorEfficiencyPct,
  computeAvailabilityDisplayPct,
  CLIENT_NOTIFICATIONS,
  summarizeCarbonSeriesTrend,
} from './mockData';

const BRAND = 'GreenStream';

const DEMO_SESSION_STORAGE_KEY = 'greenstream_demo_session';
const CLIENT_THEME_STORAGE_KEY = 'greenstream_client_theme';
const CLIENT_PREFS_STORAGE_KEY = 'greenstream_client_prefs';

/** @returns {{ emailNjoftime: boolean, smsNjoftime: boolean, raportiJavor: boolean }} */
function loadClientPrefs() {
  try {
    const raw = localStorage.getItem(CLIENT_PREFS_STORAGE_KEY);
    if (!raw) return { emailNjoftime: true, smsNjoftime: false, raportiJavor: true };
    const o = JSON.parse(raw);
    return {
      emailNjoftime: Boolean(o.emailNjoftime ?? true),
      smsNjoftime: Boolean(o.smsNjoftime ?? false),
      raportiJavor: Boolean(o.raportiJavor ?? true),
    };
  } catch {
    return { emailNjoftime: true, smsNjoftime: false, raportiJavor: true };
  }
}

function saveClientPrefs(prefs) {
  try {
    localStorage.setItem(CLIENT_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

/** @param {ReadonlyArray<{ carbonKg: number }>} points */
function MiniCarbonSparkline({ points }) {
  const w = 120;
  const h = 36;
  const pad = 2;
  const max = Math.max(0.0001, ...points.map((p) => p.carbonKg));
  const coords = points.map((p, i) => {
    const x = pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2);
    const y = h - pad - (p.carbonKg / max) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const poly = coords.join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 overflow-visible" aria-hidden>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-emerald-500 dark:text-emerald-400"
        points={poly}
      />
    </svg>
  );
}

function formatDemoInt(n) {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

function formatDemoDecimal(n, fractionDigits = 1) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

const DEMO_USERS = Object.freeze([
  { email: 'client@example.com', password: 'password123', role: 'client', name: 'Industria GreenTech' },
  { email: 'admin@example.com', password: 'password123', role: 'admin', name: 'Menaxheri i operacioneve' },
]);

function authenticateDemoUser(email, password) {
  const key = String(email).trim().toLowerCase();
  const pw = String(password).trim();
  const u = DEMO_USERS.find((x) => x.email === key);
  if (!u || u.password !== pw) return null;
  return { email: u.email, role: u.role, name: u.name };
}

function isIsoDateString(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) return false;
  const [y, m, d] = s.trim().split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function parseDateUTC(s) {
  const t = s.trim();
  const [y, m, d] = t.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const REPORT_TITLE_MAX = 200;
const REPORT_NOTES_MAX = 2000;

/**
 * @param {unknown} body
 * @returns {{ ok: true, value: { dataFillimit: string, dataMbarimit: string, depo: string, titull: string, shenime: string } } | { ok: false, error: string }}
 */
function validateAdminReportBody(body) {
  if (body == null || typeof body !== 'object') {
    return { ok: false, error: 'Të dhënat e formës mungojnë.' };
  }
  const dataFillimit = body.dataFillimit ?? body.periodStart;
  const dataMbarimit = body.dataMbarimit ?? body.periodEnd;
  const depo = body.depo ?? body.warehouse ?? body.warehouseId;
  const titull = body.titull ?? body.title ?? '';
  const shenime = body.shenime ?? body.notes ?? '';

  if (dataFillimit == null || String(dataFillimit).trim() === '') {
    return { ok: false, error: 'Data e fillimit është e detyrueshme.' };
  }
  if (dataMbarimit == null || String(dataMbarimit).trim() === '') {
    return { ok: false, error: 'Data e mbarimit është e detyrueshme.' };
  }
  const df = String(dataFillimit).trim();
  const dm = String(dataMbarimit).trim();
  if (!isIsoDateString(df)) {
    return { ok: false, error: 'Data e fillimit duhet të jetë në formatin YYYY-MM-DD.' };
  }
  if (!isIsoDateString(dm)) {
    return { ok: false, error: 'Data e mbarimit duhet të jetë në formatin YYYY-MM-DD.' };
  }
  if (parseDateUTC(dm) < parseDateUTC(df)) {
    return { ok: false, error: 'Data e mbarimit nuk mund të jetë para datës së fillimit.' };
  }
  if (depo == null || String(depo).trim() === '') {
    return { ok: false, error: 'Depoja është e detyrueshme.' };
  }
  const depoKey = String(depo).trim();
  if (!REPORT_WAREHOUSE_IDS.includes(depoKey)) {
    return { ok: false, error: 'Vlera e depot nuk është e vlefshme.' };
  }
  const titullStr = String(titull).trim();
  const shenimeStr = String(shenime).trim();
  if (titullStr.length > REPORT_TITLE_MAX) {
    return { ok: false, error: `Titulli nuk mund të kalojë ${REPORT_TITLE_MAX} karaktere.` };
  }
  if (shenimeStr.length > REPORT_NOTES_MAX) {
    return { ok: false, error: `Shënimet nuk mund të kalojnë ${REPORT_NOTES_MAX} karaktere.` };
  }
  return {
    ok: true,
    value: {
      dataFillimit: df,
      dataMbarimit: dm,
      depo: depoKey,
      titull: titullStr,
      shenime: shenimeStr,
    },
  };
}

function buildReportAttachmentFilename(dataFillimit, dataMbarimit) {
  const safe = (s) =>
    String(s)
      .replace(/[^\w.-]+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 80);
  return `raporti-greenstream_${safe(dataFillimit)}_${safe(dataMbarimit)}.pdf`;
}

/**
 * @param {{ dataFillimit: string, dataMbarimit: string, depo: string, titull: string, shenime: string }} value
 * @param {string} generatedBy
 */
function generateClientAdminReportPdf(value, generatedBy) {
  const { dataFillimit, dataMbarimit, depo, titull, shenime } = value;
  const displayTitle = titull || 'Raport operacionesh';
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 50;
  const contentW = pageW - margin * 2;
  let y = margin;
  const lineH = 14;

  const ensureSpace = (needed) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(4, 120, 87);
  const titleLines = doc.splitTextToSize(displayTitle, contentW);
  ensureSpace(titleLines.length * lineH + 8);
  doc.text(titleLines, margin, y);
  y += titleLines.length * lineH + 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(64, 64, 64);
  doc.text('GreenStream — raport administrativ (demo)', margin, y);
  y += lineH + 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(17, 17, 17);
  doc.text('Periudha', margin, y);
  y += lineH + 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(51, 51, 51);
  doc.text(`Nga: ${dataFillimit}`, margin + 10, y);
  y += lineH;
  doc.text(`Deri: ${dataMbarimit}`, margin + 10, y);
  y += lineH + 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(17, 17, 17);
  doc.text('Depo', margin, y);
  y += lineH + 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(51, 51, 51);
  const depoLabel = WH_REPORT_LABELS[depo] || depo;
  const depoLines = doc.splitTextToSize(depoLabel, contentW - 10);
  ensureSpace(depoLines.length * lineH + 8);
  doc.text(depoLines, margin + 10, y);
  y += depoLines.length * lineH + 12;

  if (generatedBy) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(17, 17, 17);
    doc.text('Gjeneruar nga', margin, y);
    y += lineH + 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(51, 51, 51);
    const byLines = doc.splitTextToSize(generatedBy, contentW - 10);
    ensureSpace(byLines.length * lineH + 8);
    doc.text(byLines, margin + 10, y);
    y += byLines.length * lineH + 12;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(17, 17, 17);
  doc.text('Përmbledhje', margin, y);
  y += lineH + 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(51, 51, 51);
  const summary =
    'Ky dokument është një raport demonstrues për periudhën dhe depot e zgjedhura. Për integrime reale, lidhni burimet e të dhënave operacionale.';
  const sumLines = doc.splitTextToSize(summary, contentW);
  ensureSpace(sumLines.length * lineH + 8);
  doc.text(sumLines, margin, y);
  y += sumLines.length * lineH + 10;

  if (shenime) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(17, 17, 17);
    doc.text('Shënime', margin, y);
    y += lineH + 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(51, 51, 51);
    const noteLines = doc.splitTextToSize(shenime, contentW);
    for (let i = 0; i < noteLines.length; i += 1) {
      ensureSpace(lineH + 2);
      doc.text(noteLines[i], margin, y);
      y += lineH;
    }
  }

  y += 16;
  ensureSpace(lineH);
  doc.setFontSize(9);
  doc.setTextColor(136, 136, 136);
  doc.text(`Gjeneruar më: ${new Date().toISOString()}`, margin, y);

  doc.save(buildReportAttachmentFilename(dataFillimit, dataMbarimit));
}

function formatShipmentStatus(status) {
  const labels = {
    delivered: 'Dorëzuar',
    'in-transit': 'Në transit',
    pending: 'Në pritje',
    processing: 'Në përpunim',
  };
  return labels[status] || status;
}

function formatVehicleStatus(status) {
  const labels = { active: 'Aktiv', maintenance: 'Në servisim', idle: 'Parkuar' };
  return labels[status] || status;
}

function statusBadgeClasses(status) {
  if (status === 'delivered') return 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80';
  if (status === 'in-transit') return 'bg-sky-50 text-sky-900 ring-1 ring-sky-200/80';
  if (status === 'processing') return 'bg-amber-50 text-amber-950 ring-1 ring-amber-200/80';
  return 'bg-neutral-50 text-neutral-800 ring-1 ring-neutral-200/80';
}

function vehicleBadgeClasses(status) {
  if (status === 'active') return 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30';
  if (status === 'idle') return 'bg-sky-500/15 text-sky-100 ring-1 ring-sky-500/25';
  return 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30';
}

function CarbonSeriesBarChart({ series }) {
  const maxCarbon = useMemo(() => Math.max(0.0001, ...series.map((d) => d.carbonKg)), [series]);
  const captionId = React.useId();

  return (
    <figure
      className="rounded-xl border border-neutral-200/90 bg-gradient-to-b from-neutral-50/90 to-white p-4 shadow-sm ring-1 ring-black/[0.03] sm:p-5 dark:border-neutral-700/80 dark:from-neutral-900/80 dark:to-neutral-950/90 dark:ring-white/[0.06]"
      aria-labelledby={captionId}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <figcaption id={captionId} className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          Shpërndarja ditore e CO₂
        </figcaption>
        <p className="max-w-[14rem] text-right text-xs leading-snug text-neutral-500 dark:text-neutral-400">
          Lartësia e shtyllës tregon kilogramët e shmangur për ditë (demo).
        </p>
      </div>
      <div className="mt-4 flex h-40 items-stretch gap-1.5 sm:h-44 sm:gap-2" role="presentation">
        {series.map((row) => {
          const hPct = Math.min(100, (row.carbonKg / maxCarbon) * 100);
          const barH = Math.max(hPct, row.carbonKg > 0 ? 12 : 4);
          const label = `${row.date}: ${formatDemoDecimal(row.carbonKg, 1)} kg CO₂ të shmangur, ${formatDemoInt(row.orders)} porosi`;
          return (
            <div key={row.date} className="flex min-w-0 flex-1 flex-col items-stretch justify-end gap-2">
              <div className="flex h-[7.25rem] flex-col justify-end sm:h-[8.25rem]" title={label}>
                <div
                  role="img"
                  aria-label={label}
                  className="mx-auto w-full max-w-[1.65rem] rounded-t-md bg-gradient-to-t from-emerald-800 via-emerald-600 to-emerald-400 shadow-sm ring-1 ring-emerald-800/15 transition-[filter] duration-300 ease-out-soft motion-reduce:transition-none hover:brightness-110 motion-reduce:hover:brightness-100 sm:max-w-[2.1rem] dark:from-emerald-900 dark:via-emerald-700 dark:to-emerald-500 dark:ring-emerald-500/20"
                  style={{ height: `${barH}%`, minHeight: row.carbonKg > 0 ? '0.25rem' : '0.125rem' }}
                />
              </div>
              <span className="text-center text-[10px] font-medium tabular-nums text-neutral-500 sm:text-xs dark:text-neutral-400" aria-hidden>
                {row.date.slice(5)}
              </span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

const rootShellClass =
  'min-h-[100dvh] min-h-screen antialiased text-neutral-900 [text-size-adjust:100%] supports-[padding:max(0px)]:pb-[max(0px,env(safe-area-inset-bottom))]';

function Toast({ message, variant, onDismiss }) {
  if (!message) return null;
  const bg =
    variant === 'error'
      ? 'bg-red-600 text-white'
      : variant === 'success'
        ? 'bg-emerald-700 text-white'
        : 'bg-neutral-800 text-white';
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[100] w-[min(92vw,24rem)] -translate-x-1/2 rounded-2xl border border-white/10 px-4 py-3 text-sm shadow-xl backdrop-blur-sm transition-all duration-200 ${bg}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="leading-snug">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-lg p-1.5 min-h-[44px] min-w-[44px] -m-1 flex items-center justify-center opacity-90 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white transition-opacity duration-150"
          aria-label="Mbyll njoftimin"
        >
          <X size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function OrderRow({ order }) {
  return (
    <tr className="border-b border-neutral-100/85 odd:bg-white even:bg-neutral-50/55 last:border-0 transition-colors duration-200 ease-out-soft hover:bg-emerald-50/60 motion-reduce:transition-none dark:border-neutral-800/80 dark:odd:bg-neutral-900/70 dark:even:bg-neutral-900/40 dark:hover:bg-emerald-950/25">
      <td className="px-4 py-3 font-medium text-neutral-900 sm:px-6 dark:text-neutral-100">{order.id}</td>
      <td className="px-4 py-3 text-neutral-700 sm:px-6 dark:text-neutral-300">{order.destination}</td>
      <td className="px-4 py-3 sm:px-6">
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClasses(order.status)}`}>
          {formatShipmentStatus(order.status)}
        </span>
      </td>
      <td className="px-4 py-3 font-semibold text-emerald-700 tabular-nums sm:px-6 dark:text-emerald-400">{order.carbonSaved} kg</td>
      <td className="px-4 py-3 text-sm text-neutral-600 tabular-nums sm:px-6 dark:text-neutral-400">{order.date}</td>
    </tr>
  );
}

function OrderCard({ order }) {
  return (
    <article className="rounded-2xl border border-neutral-200/90 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] transition-shadow duration-200 ease-out-soft hover:shadow-md motion-reduce:transition-none motion-reduce:hover:shadow-sm dark:border-neutral-700/80 dark:bg-neutral-900/80 dark:ring-white/[0.06] dark:hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Porosi</p>
          <p className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{order.id}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClasses(order.status)}`}>
          {formatShipmentStatus(order.status)}
        </span>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500 dark:text-neutral-400">Destinacioni</dt>
          <dd className="font-medium text-neutral-900 dark:text-neutral-100">{order.destination}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500 dark:text-neutral-400">CO₂ e shmangur</dt>
          <dd className="font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">{order.carbonSaved} kg</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500 dark:text-neutral-400">Data</dt>
          <dd className="tabular-nums text-neutral-700 dark:text-neutral-300">{order.date}</dd>
        </div>
      </dl>
    </article>
  );
}

function FleetRow({ vehicle }) {
  return (
    <tr className="border-b border-neutral-800/55 odd:bg-transparent even:bg-white/[0.025] last:border-0 transition-colors duration-200 ease-out-soft hover:bg-white/[0.06] motion-reduce:transition-none">
      <td className="px-4 py-3 font-medium text-white sm:px-6">{vehicle.id}</td>
      <td className="px-4 py-3 text-neutral-300 sm:px-6">{vehicle.location}</td>
      <td className="px-4 py-3 sm:px-6">
        <span
          className={`inline-flex w-fit items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${vehicleBadgeClasses(vehicle.status)}`}
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-current" aria-hidden />
          {formatVehicleStatus(vehicle.status)}
        </span>
      </td>
      <td className="px-4 py-3 text-neutral-300 sm:px-6">{vehicle.route}</td>
      <td className="px-4 py-3 sm:px-6">
        <div className="flex min-w-[8rem] items-center gap-2">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-700/80"
            role="progressbar"
            aria-valuenow={vehicle.efficiency}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Efikasiteti ${vehicle.efficiency}%`}
          >
            <div
              className={`h-full transition-[width] duration-500 ease-out-soft motion-reduce:transition-none ${
                vehicle.efficiency === 0
                  ? 'bg-neutral-600'
                  : vehicle.efficiency > 90
                    ? 'bg-emerald-500'
                    : vehicle.efficiency > 75
                      ? 'bg-amber-500'
                      : 'bg-red-500'
              }`}
              style={{ width: `${vehicle.efficiency}%` }}
            />
          </div>
          <span className="w-10 text-right text-sm font-semibold tabular-nums text-neutral-300">{vehicle.efficiency}%</span>
        </div>
      </td>
    </tr>
  );
}

function FleetCard({ vehicle }) {
  return (
    <article className="rounded-2xl border border-neutral-700/80 bg-neutral-800/60 p-4 shadow-inner ring-1 ring-white/[0.04] transition-shadow duration-200 ease-out-soft hover:border-neutral-600/90 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:shadow-inner">
      <div className="flex items-start justify-between gap-2">
        <p className="text-lg font-semibold text-white">{vehicle.id}</p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${vehicleBadgeClasses(vehicle.status)}`}>
          {formatVehicleStatus(vehicle.status)}
        </span>
      </div>
      <p className="mt-1 text-sm text-neutral-400">{vehicle.location}</p>
      <dl className="mt-4 space-y-2 text-sm text-neutral-300">
        <div className="flex justify-between gap-4">
          <dt>Rruga</dt>
          <dd className="font-medium text-white">{vehicle.route}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Efikasiteti</dt>
          <dd className="tabular-nums text-white">{vehicle.efficiency}%</dd>
        </div>
      </dl>
    </article>
  );
}

function PublicPage({ onOpenLogin, onStartSignup }) {
  const landing = useMemo(() => computePublicLandingStats(ORDERS, FLEET), []);

  return (
    <div className={`${rootShellClass} bg-gradient-to-b from-emerald-50/70 via-white to-teal-50/50`}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-xl focus:bg-neutral-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg"
      >
        Kaloni te përmbajtja
      </a>
      <header className="sticky top-0 z-50 border-b border-emerald-200/50 bg-white/85 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-white/75">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6 lg:px-8">
          <div className="text-lg font-bold tracking-tight text-emerald-900 sm:text-xl">{BRAND}</div>
          <button
            type="button"
            onClick={onOpenLogin}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm shadow-emerald-900/10 ring-1 ring-emerald-800/10 transition-all duration-200 ease-out-soft hover:bg-emerald-800 hover:shadow-md active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 touch-manipulation"
          >
            Hyni
          </button>
        </div>
      </header>

      <main id="main-content">
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18 lg:px-8 lg:py-22">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="space-y-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800/90 sm:text-sm">
                Platformë logjistike
              </p>
              <h1 className="text-balance text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl lg:text-[2.85rem] lg:leading-[1.12]">
                Logjistikë me emetime të ulëta që mund t’i matni
              </h1>
              <p className="max-w-prose text-pretty text-base leading-relaxed text-neutral-600 sm:text-lg">
                Ndiqni dërgesat, llogaritni CO₂ të shmangur sipas korridorit dhe ofroni raporte të qarta për klientët dhe palët e interesuara—pa humbur në
                detaje teknike.
              </p>
              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={onOpenLogin}
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-6 text-base font-semibold text-white shadow-md shadow-emerald-900/15 ring-1 ring-emerald-800/10 transition-all duration-200 ease-out-soft hover:bg-emerald-800 hover:shadow-lg active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 touch-manipulation"
                >
                  Portali
                  <ChevronRight size={22} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={onStartSignup}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-neutral-200/90 bg-white px-6 text-base font-semibold text-neutral-800 shadow-sm ring-1 ring-black/[0.04] transition-all duration-200 ease-out-soft hover:border-emerald-200 hover:bg-emerald-50/60 hover:shadow-md motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 touch-manipulation"
                >
                  Kontaktoni shitjet
                </button>
              </div>
            </div>
            <div className="relative">
              <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br from-emerald-300/20 to-teal-400/20 blur-3xl motion-reduce:blur-none" aria-hidden />
              <div className="relative rounded-3xl border border-emerald-100/80 bg-white p-5 shadow-lg shadow-emerald-900/[0.06] ring-1 ring-black/[0.04] transition-shadow duration-300 ease-out-soft hover:shadow-xl motion-reduce:transition-none sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800/80">Indikatorët kryesorë</p>
                <p className="mt-1 text-sm text-neutral-600">Pamje e shkurtër nga operacionet demo.</p>
                <ul className="mt-6 space-y-3">
                  <li className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-100/60 bg-emerald-50/80 px-4 py-3.5 transition-colors duration-200 ease-out-soft hover:border-emerald-200/80 motion-reduce:transition-none">
                    <span className="text-sm font-medium text-neutral-700">CO₂ e shmangur sot</span>
                    <span className="text-xl font-bold tabular-nums text-emerald-900">{formatDemoDecimal(landing.co2TodayKg, 1)} kg</span>
                  </li>
                  <li className="flex items-center justify-between gap-4 rounded-2xl border border-sky-100/60 bg-sky-50/80 px-4 py-3.5 transition-colors duration-200 ease-out-soft hover:border-sky-200/80 motion-reduce:transition-none">
                    <span className="text-sm font-medium text-neutral-700">Dërgesa në transit</span>
                    <span className="text-xl font-bold tabular-nums text-sky-900">{formatDemoInt(landing.activeShipments)}</span>
                  </li>
                  <li className="flex items-center justify-between gap-4 rounded-2xl border border-amber-100/60 bg-amber-50/80 px-4 py-3.5 transition-colors duration-200 ease-out-soft hover:border-amber-200/80 motion-reduce:transition-none">
                    <span className="text-sm font-medium text-neutral-700">Efikasiteti i flotës</span>
                    <span className="text-xl font-bold tabular-nums text-amber-950">{landing.fleetEfficiencyPct}%</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-emerald-100/70 bg-white/50 py-16 sm:py-22" aria-labelledby="why-heading">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 id="why-heading" className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
                Pse {BRAND}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-neutral-600 sm:text-base">
                Një ekran për ekipin operacional dhe një për klientët — i njëjti burim i së vërtetës për emetime dhe performancë.
              </p>
            </div>
            <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
              {[
                {
                  icon: TrendingDown,
                  title: 'Emetime të dokumentuara',
                  desc: 'Faktorë për dërgesë dhe total që mbështeten auditimin financiar dhe operacional.',
                },
                {
                  icon: Truck,
                  title: 'Operacion i lexueshëm',
                  desc: 'Statusi, korridoret dhe përjashtimet në një ekran—më pak telefonata, vendime më të shpejta.',
                },
                {
                  icon: BarChart3,
                  title: 'Raporte për eksport',
                  desc: 'Paketa mujore për klientë dhe kërkesa rregullatore pa punë manuale në tabela.',
                },
              ].map(({ icon: Icon, title, desc }) => (
                <li
                  key={title}
                  className="rounded-2xl border border-emerald-100/80 bg-white p-6 shadow-sm ring-1 ring-black/[0.03] transition-all duration-200 ease-out-soft hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-sm"
                >
                  <Icon className="text-emerald-700" size={28} strokeWidth={1.75} aria-hidden />
                  <h3 className="mt-4 text-lg font-bold text-neutral-900">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600">{desc}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="rounded-3xl border border-white/20 bg-gradient-to-br from-emerald-700 via-emerald-700 to-teal-700 px-6 py-12 text-center text-white shadow-xl shadow-emerald-900/20 sm:px-12 sm:py-16">
            <h2 className="text-2xl font-bold sm:text-3xl">Filloni një korridor pilot</h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-base text-white/95 sm:text-lg">
              Hartojmë fluksin tuaj, lidhim burimet e të dhënave dhe ju dorëzojmë një panel që ekipi përdor çdo ditë.
            </p>
            <button
              type="button"
              onClick={onStartSignup}
              className="mt-9 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-white px-6 text-base font-semibold text-emerald-900 shadow-md ring-1 ring-black/5 transition-all duration-200 ease-out-soft hover:bg-emerald-50 hover:shadow-lg active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white touch-manipulation"
            >
              Kërkoni qasje
              <ChevronRight size={20} aria-hidden />
            </button>
          </div>
        </section>
      </main>

      <footer className="mt-auto border-t border-emerald-100/80 bg-neutral-50/90 py-9">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-neutral-600 sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} {BRAND}. Të gjitha të drejtat e rezervuara.</p>
        </div>
      </footer>
    </div>
  );
}

function ClientSidebar({ expanded, onToggle, user, onLogout, navItems, isNavActive, onSelectNav }) {
  const drawerClass = expanded
    ? 'translate-x-0'
    : '-translate-x-full max-[767px]:pointer-events-none max-[767px]:opacity-0';

  return (
    <>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="client-sidebar"
        onClick={onToggle}
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg md:hidden touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
      >
        {expanded ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
        <span className="sr-only">{expanded ? 'Mbyll menunë' : 'Hap menunë'}</span>
      </button>

      {expanded && (
        <button
          type="button"
          aria-label="Mbyll mbivendosjen e menysë"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onToggle}
        />
      )}

      <aside
        id="client-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,88vw)] flex-col border-r border-neutral-800/90 bg-gradient-to-b from-neutral-950 to-neutral-950 text-white shadow-xl shadow-black/25 transition-transform duration-200 ease-out-soft motion-reduce:transition-none md:static md:z-0 md:w-56 md:translate-x-0 md:shadow-none ${drawerClass}`}
      >
        <div className="flex h-14 items-center border-b border-neutral-800 px-4 sm:h-16">
          <span className="text-lg font-bold tracking-tight">{BRAND.slice(0, 2)}</span>
        </div>
        <nav className="flex-1 space-y-1 p-3" aria-label="Klienti">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelectNav(item.key)}
              aria-current={isNavActive(item.key) ? 'page' : undefined}
              className={`flex w-full min-h-[44px] items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-colors duration-200 ease-out-soft motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 touch-manipulation ${
                isNavActive(item.key)
                  ? 'bg-neutral-800 text-white ring-1 ring-emerald-500/35'
                  : 'text-neutral-200 hover:bg-neutral-800'
              }`}
            >
              <item.icon size={20} aria-hidden />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="border-t border-neutral-800 p-3">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full min-h-[44px] items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-neutral-200 transition-colors duration-200 ease-out-soft hover:bg-neutral-800 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 touch-manipulation"
          >
            <LogOut size={20} aria-hidden />
            Dilni
          </button>
        </div>
        <p className="border-t border-neutral-800 px-4 py-3 text-xs text-neutral-500">
          Identifikuar si <span className="font-medium text-neutral-300">{user?.name}</span>
        </p>
      </aside>
    </>
  );
}

function ClientDashboard({ user, onLogout, onNotify }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [clientSection, setClientSection] = useState('orders');
  const [clientTheme, setClientTheme] = useState('light');
  const [notifOpen, setNotifOpen] = useState(false);
  const [readNotifIds, setReadNotifIds] = useState(
    () => new Set(CLIENT_NOTIFICATIONS.filter((n) => n.read).map((n) => n.id)),
  );
  const [clientPrefs, setClientPrefs] = useState(() => loadClientPrefs());
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [orderSort, setOrderSort] = useState('date-desc');

  useEffect(() => {
    try {
      const v = localStorage.getItem(CLIENT_THEME_STORAGE_KEY);
      if (v === 'dark' || v === 'light') setClientTheme(v);
    } catch {
      /* ignore */
    }
  }, []);

  const setTheme = useCallback((mode) => {
    setClientTheme(mode);
    try {
      localStorage.setItem(CLIENT_THEME_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, []);

  const unreadNotifCount = useMemo(
    () => CLIENT_NOTIFICATIONS.filter((n) => !readNotifIds.has(n.id)).length,
    [readNotifIds],
  );

  const markAllNotifsRead = useCallback(() => {
    setReadNotifIds(new Set(CLIENT_NOTIFICATIONS.map((n) => n.id)));
  }, []);

  const markOneNotifRead = useCallback((id) => {
    setReadNotifIds((prev) => new Set([...prev, id]));
  }, []);

  useEffect(() => {
    if (!notifOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notifOpen]);

  const navItems = useMemo(
    () => [
      { icon: Package, label: 'Porositë', key: 'orders' },
      { icon: BarChart3, label: 'Analitika', key: 'analytics' },
      { icon: Download, label: 'Raportet', key: 'reports' },
      { icon: Settings, label: 'Cilësimet', key: 'settings' },
    ],
    [],
  );

  const handleSelectClientNav = useCallback((key) => {
    setClientSection(key);
    setMenuOpen(false);
  }, []);

  const isClientNavActive = useCallback((key) => clientSection === key, [clientSection]);

  const sectionTitle = useMemo(() => {
    const map = {
      orders: 'Dërgesat',
      analytics: 'Analitika',
      reports: 'Raportet',
      settings: 'Cilësimet',
    };
    return map[clientSection] || 'Dërgesat';
  }, [clientSection]);

  const [downloadHint, setDownloadHint] = useState('');
  useEffect(() => {
    if (!downloadHint) return;
    const id = window.setTimeout(() => setDownloadHint(''), 4500);
    return () => window.clearTimeout(id);
  }, [downloadHint]);

  const handleDownloadMonthly = useCallback(() => {
    setDownloadHint('Raporti mujor do të shkarkohet automatikisht kur të jetë i gatshëm. (Demo)');
  }, []);

  const clientOrderKpis = useMemo(() => computeClientOrderKpis(ORDERS, FLEET), []);
  const analyticsSeries = useMemo(() => buildDailyCarbonSeries(ORDERS, 14), []);
  const sparklinePoints = useMemo(() => analyticsSeries.slice(-7), [analyticsSeries]);
  const carbonTrend = useMemo(() => summarizeCarbonSeriesTrend(analyticsSeries), [analyticsSeries]);
  const analyticsTotals = useMemo(() => {
    const orders = analyticsSeries.reduce((a, d) => a + d.orders, 0);
    const carbon = analyticsSeries.reduce((a, d) => a + d.carbonKg, 0);
    return { orders, carbonKg: Math.round(carbon * 10) / 10 };
  }, [analyticsSeries]);

  const filteredSortedOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    let rows = [...ORDERS];
    if (orderStatusFilter !== 'all') {
      rows = rows.filter((o) => o.status === orderStatusFilter);
    }
    if (q) {
      rows = rows.filter((o) => {
        const st = formatShipmentStatus(o.status).toLowerCase();
        return (
          o.id.toLowerCase().includes(q) ||
          o.destination.toLowerCase().includes(q) ||
          o.status.toLowerCase().includes(q) ||
          st.includes(q)
        );
      });
    }
    rows.sort((a, b) => {
      if (orderSort === 'date-desc' || orderSort === 'date-asc') {
        const cmp = parseDateUTC(a.date).getTime() - parseDateUTC(b.date).getTime();
        return orderSort === 'date-desc' ? -cmp : cmp;
      }
      const c = a.carbonSaved - b.carbonSaved;
      return orderSort === 'carbon-desc' ? -c : c;
    });
    return rows;
  }, [orderSearch, orderStatusFilter, orderSort]);

  const updatePref = useCallback(
    (key, value) => {
      setClientPrefs((prev) => {
        const next = { ...prev, [key]: value };
        saveClientPrefs(next);
        if (onNotify) onNotify('Cilësimet u ruajtën.', 'success');
        return next;
      });
    },
    [onNotify],
  );

  const orderKpiCards = useMemo(
    () => [
      {
        label: 'CO₂ e shmangur',
        value: `${formatDemoDecimal(clientOrderKpis.carbonMonthKg, 1)} kg`,
        hint: 'Ky muaj',
        tone: 'text-emerald-700 dark:text-emerald-400',
      },
      {
        label: 'Porosi në transit',
        value: formatDemoInt(clientOrderKpis.inTransit),
        hint: `${formatDemoInt(clientOrderKpis.pendingOrProcessing)} në pritje / përpunim`,
        tone: 'text-sky-800 dark:text-sky-300',
      },
      {
        label: 'Kursim rrugor',
        value: `${formatDemoInt(clientOrderKpis.routeSavingsEur)} €`,
        hint: 'Vlerësim nga korridori',
        tone: 'text-amber-900 dark:text-amber-300',
      },
      {
        label: 'Efikasiteti i flotës',
        value: `${clientOrderKpis.fleetEfficiencyPct}%`,
        hint: 'Mesatarja e mjeteve aktive',
        tone: 'text-violet-800 dark:text-violet-300',
      },
    ],
    [clientOrderKpis],
  );

  const trendToneClass =
    carbonTrend.tone === 'positive'
      ? 'text-emerald-800 dark:text-emerald-300'
      : carbonTrend.tone === 'caution'
        ? 'text-amber-900 dark:text-amber-200'
        : 'text-neutral-600 dark:text-neutral-400';

  return (
    <div className={clientTheme === 'dark' ? 'dark' : ''}>
      <div className={`${rootShellClass} flex bg-[#f6f8f7] dark:bg-neutral-950`}>
        <ClientSidebar
          expanded={menuOpen}
          onToggle={() => setMenuOpen((o) => !o)}
          user={user}
          onLogout={onLogout}
          navItems={navItems}
          isNavActive={isClientNavActive}
          onSelectNav={handleSelectClientNav}
        />

        <div className="flex min-w-0 flex-1 flex-col md:pl-0">
          <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b border-neutral-200/90 bg-white/90 px-4 py-3 shadow-sm backdrop-blur dark:border-neutral-800/90 dark:bg-neutral-950/95 sm:min-h-16 sm:px-6">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">{sectionTitle}</h1>
              <p className="hidden text-sm text-neutral-500 dark:text-neutral-400 sm:block">{user?.email}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => setNotifOpen(true)}
                className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-neutral-200/90 bg-white text-neutral-800 shadow-sm transition hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                aria-expanded={notifOpen}
                aria-controls="client-notif-panel"
                aria-label="Hap njoftimet"
              >
                <Bell size={20} aria-hidden />
                {unreadNotifCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-neutral-950">
                    {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setTheme(clientTheme === 'dark' ? 'light' : 'dark')}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-neutral-200/90 bg-white text-neutral-800 shadow-sm transition hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                aria-pressed={clientTheme === 'dark'}
                aria-label={clientTheme === 'dark' ? 'Aktivizo pamjen e çelët' : 'Aktivizo pamjen e errët'}
              >
                {clientTheme === 'dark' ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
              </button>
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{user?.name}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{user?.email}</p>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto overscroll-y-contain">
            <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
              {clientSection === 'orders' ? (
                <>
                  {downloadHint ? (
                    <p
                      className="rounded-2xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-950 ring-1 ring-emerald-500/15 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-50 dark:ring-emerald-500/20"
                      role="status"
                    >
                      {downloadHint}
                    </p>
                  ) : null}
                  <div className="relative my-2 flex flex-wrap items-center gap-3 border-y border-neutral-200/80 py-4 dark:border-neutral-800/80">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3">
                      <MiniCarbonSparkline points={sparklinePoints} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Trendi (14 ditë)</p>
                        <p className={`mt-1 text-sm leading-snug ${trendToneClass}`}>{carbonTrend.text}</p>
                      </div>
                    </div>
                  </div>

                  <section aria-label="Përmbledhje" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {orderKpiCards.map((kpi) => (
                      <div
                        key={kpi.label}
                        className="rounded-2xl border border-neutral-200/90 bg-white p-4 shadow-sm ring-1 ring-black/[0.03] transition-shadow duration-200 ease-out-soft hover:shadow-md motion-reduce:transition-none motion-reduce:hover:shadow-sm sm:p-5 dark:border-neutral-800/90 dark:bg-neutral-900/80 dark:ring-white/[0.06]"
                      >
                        <p className="text-sm text-neutral-600 dark:text-neutral-400">{kpi.label}</p>
                        <p className={`mt-1 text-2xl font-bold tabular-nums sm:text-3xl ${kpi.tone}`}>{kpi.value}</p>
                        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">{kpi.hint}</p>
                      </div>
                    ))}
                  </section>

                  <section
                    className="overflow-hidden rounded-2xl border border-neutral-200/90 bg-white shadow-sm ring-1 ring-black/[0.03] dark:border-neutral-800/90 dark:bg-neutral-900/80 dark:ring-white/[0.06]"
                    aria-labelledby="orders-heading"
                  >
                    <div className="flex flex-col gap-4 border-b border-neutral-200/80 bg-neutral-50/80 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:px-6 dark:border-neutral-800/80 dark:bg-neutral-950/50">
                      <div className="min-w-0">
                        <h2 id="orders-heading" className="text-base font-bold tracking-tight text-neutral-900 dark:text-white sm:text-lg">
                          Porositë e fundit
                        </h2>
                        <p className="mt-1 text-xs text-neutral-600 sm:text-sm dark:text-neutral-400">
                          Kërkoni sipas ID, destinacioni ose statusit; renditni sipas datës ose CO₂.
                        </p>
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[12rem] sm:max-w-full sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                        <label className="relative flex min-w-0 flex-1 sm:max-w-xs">
                          <span className="sr-only">Kërko porositë</span>
                          <Search
                            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400 dark:text-neutral-500"
                            aria-hidden
                          />
                          <input
                            type="search"
                            value={orderSearch}
                            onChange={(e) => setOrderSearch(e.target.value)}
                            placeholder="Kërko (ID, destinacion, status)…"
                            className="w-full min-h-[44px] rounded-xl border border-neutral-200/90 bg-white py-2 pl-9 pr-3 text-sm text-neutral-900 shadow-sm placeholder:text-neutral-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:placeholder:text-neutral-500"
                            autoComplete="off"
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <label className="sr-only" htmlFor="order-status-filter">
                            Filtro sipas statusit
                          </label>
                          <select
                            id="order-status-filter"
                            value={orderStatusFilter}
                            onChange={(e) => setOrderStatusFilter(e.target.value)}
                            className="min-h-[44px] min-w-[10rem] flex-1 rounded-xl border border-neutral-200/90 bg-white px-3 text-sm font-medium text-neutral-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 sm:flex-initial"
                          >
                            <option value="all">Të gjitha statuset</option>
                            <option value="delivered">Dorëzuar</option>
                            <option value="in-transit">Në transit</option>
                            <option value="pending">Në pritje</option>
                            <option value="processing">Në përpunim</option>
                          </select>
                          <label className="sr-only" htmlFor="order-sort">
                            Rendit porositë
                          </label>
                          <select
                            id="order-sort"
                            value={orderSort}
                            onChange={(e) => setOrderSort(e.target.value)}
                            className="min-h-[44px] min-w-[11rem] flex-1 rounded-xl border border-neutral-200/90 bg-white px-3 text-sm font-medium text-neutral-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 sm:flex-initial"
                          >
                            <option value="date-desc">Data: më e reja së pari</option>
                            <option value="date-asc">Data: më e vjetra së pari</option>
                            <option value="carbon-desc">CO₂: më e lartë së pari</option>
                            <option value="carbon-asc">CO₂: më e ulët së pari</option>
                          </select>
                        </div>
                      </div>
                      <p className="w-full text-xs text-neutral-500 dark:text-neutral-500" aria-live="polite">
                        {filteredSortedOrders.length} nga {ORDERS.length} porosi
                        {orderSearch.trim() || orderStatusFilter !== 'all' ? ' (me filtra aktivë)' : ''}
                      </p>
                    </div>

                    {filteredSortedOrders.length === 0 ? (
                      <div className="px-4 py-16 text-center sm:px-6">
                        <p className="text-base font-semibold text-neutral-800 dark:text-neutral-100">Nuk u gjet asnjë porosi</p>
                        <p className="mt-2 max-w-md mx-auto text-sm text-neutral-600 dark:text-neutral-400">
                          Provoni të zbrazni kërkimin ose të zgjidhni «Të gjitha statuset» për të parë përsëri listën e plotë.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setOrderSearch('');
                            setOrderStatusFilter('all');
                          }}
                          className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-neutral-200/90 bg-white px-4 text-sm font-semibold text-neutral-800 shadow-sm transition hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:bg-neutral-900"
                        >
                          Pastro filtrat
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="hidden md:block overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] touch-pan-x">
                          <table className="w-full min-w-[640px] text-left text-sm">
                            <thead className="sticky top-0 z-10 border-b border-neutral-200/90 bg-neutral-50/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-neutral-50/85 dark:border-neutral-800/90 dark:bg-neutral-950/95 dark:supports-[backdrop-filter]:bg-neutral-950/85">
                              <tr>
                                <th scope="col" className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-neutral-600 sm:px-6 dark:text-neutral-400">
                                  Porosia
                                </th>
                                <th scope="col" className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-neutral-600 sm:px-6 dark:text-neutral-400">
                                  Destinacioni
                                </th>
                                <th scope="col" className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-neutral-600 sm:px-6 dark:text-neutral-400">
                                  Statusi
                                </th>
                                <th scope="col" className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-neutral-600 sm:px-6 dark:text-neutral-400">
                                  CO₂ e shmangur
                                </th>
                                <th scope="col" className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-neutral-600 sm:px-6 dark:text-neutral-400">
                                  Data
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredSortedOrders.map((order) => (
                                <OrderRow key={order.id} order={order} />
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="grid gap-3 p-4 pb-6 md:hidden">
                          {filteredSortedOrders.map((order) => (
                            <OrderCard key={order.id} order={order} />
                          ))}
                        </div>
                      </>
                    )}
                  </section>

                  <button
                    type="button"
                    onClick={handleDownloadMonthly}
                    className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white shadow-md shadow-emerald-900/10 ring-1 ring-emerald-800/10 transition-all duration-200 ease-out-soft hover:bg-emerald-800 hover:shadow-lg motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 touch-manipulation sm:w-auto"
                  >
                    <Download size={20} aria-hidden />
                    Shkarko raportin mujor
                  </button>
                </>
              ) : clientSection === 'analytics' ? (
                <div className="space-y-8">
                  <div className="border-b border-neutral-200/80 pb-2 dark:border-neutral-800/80" />
                  <section
                    className="rounded-2xl border border-neutral-200/90 bg-white p-6 shadow-sm ring-1 ring-black/[0.03] sm:p-8 dark:border-neutral-800/90 dark:bg-neutral-900/80 dark:ring-white/[0.06]"
                    aria-labelledby="client-analytics-heading"
                  >
                    <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-400">Pamje demonstruese</p>
                    <h2 id="client-analytics-heading" className="mt-2 text-xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">
                      Analitika (14 ditë)
                    </h2>
                    <p className="mt-3 max-w-prose text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                      Vlerat më poshtë llogariten nga porositë demo: {formatDemoInt(analyticsTotals.orders)} porosi me aktivitet në
                      dritaren e zgjedhur dhe {formatDemoDecimal(analyticsTotals.carbonKg, 1)} kg CO₂ e shmangur të përmbledhur.
                    </p>
                    <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-500">Nuk ka ngarkim nga rrjeti në këtë demo — të gjitha vlerat janë të paracaktuara.</p>
                    <div className="mt-6">
                      <CarbonSeriesBarChart series={analyticsSeries} />
                    </div>
                    <h3 className="mt-8 text-sm font-bold uppercase tracking-wide text-neutral-800 dark:text-neutral-200">Tabela ditore</h3>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">Renditja: nga e fundit drejt së kaluarës (lexim i shpejtë).</p>
                    <div className="mt-3 overflow-x-auto overscroll-x-contain rounded-xl border border-neutral-200/80 [-webkit-overflow-scrolling:touch] touch-pan-x dark:border-neutral-700/80">
                      <table className="w-full min-w-[520px] text-left text-sm">
                        <thead className="sticky top-0 z-10 border-b border-neutral-200/90 bg-neutral-50/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-neutral-50/85 dark:border-neutral-800/90 dark:bg-neutral-950/95 dark:supports-[backdrop-filter]:bg-neutral-950/85">
                          <tr>
                            <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-400">
                              Data
                            </th>
                            <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-400">
                              Porosi
                            </th>
                            <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-400">
                              CO₂ (kg)
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...analyticsSeries].reverse().map((row) => (
                            <tr
                              key={row.date}
                              className="border-b border-neutral-100/90 odd:bg-white even:bg-neutral-50/55 last:border-0 transition-colors duration-150 ease-out-soft hover:bg-emerald-50/40 motion-reduce:transition-none dark:border-neutral-800/60 dark:odd:bg-neutral-900/60 dark:even:bg-neutral-900/35 dark:hover:bg-emerald-950/20"
                            >
                              <td className="px-4 py-2.5 tabular-nums text-neutral-800 dark:text-neutral-200">{row.date}</td>
                              <td className="px-4 py-2.5 tabular-nums text-neutral-700 dark:text-neutral-300">{row.orders}</td>
                              <td className="px-4 py-2.5 font-medium tabular-nums text-emerald-800 dark:text-emerald-400">
                                {formatDemoDecimal(row.carbonKg, 1)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              ) : clientSection === 'settings' ? (
                <section
                  className="rounded-2xl border border-neutral-200/90 bg-white p-6 shadow-sm ring-1 ring-black/[0.03] sm:p-8 dark:border-neutral-800/90 dark:bg-neutral-900/80 dark:ring-white/[0.06]"
                  aria-labelledby="client-settings-heading"
                >
                  <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-400">Preferencat</p>
                  <h2 id="client-settings-heading" className="mt-2 text-xl font-bold text-neutral-900 dark:text-white">
                    Cilësimet e llogarisë
                  </h2>
                  <p className="mt-2 max-w-prose text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                    Ndryshimet ruhen vetëm në këtë shfletues (localStorage). Do të shfaqet një mesazh kur ruani një ndryshim.
                  </p>
                  <ul className="mt-8 divide-y divide-neutral-200/90 dark:divide-neutral-800/90" role="list">
                    <li className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0">
                      <div>
                        <p className="font-medium text-neutral-900 dark:text-neutral-100">Njoftime me email</p>
                        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">Dërgo alerte për statusin e porosive dhe raporte.</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={clientPrefs.emailNjoftime}
                        onClick={() => updatePref('emailNjoftime', !clientPrefs.emailNjoftime)}
                        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                          clientPrefs.emailNjoftime ? 'bg-emerald-600' : 'bg-neutral-300 dark:bg-neutral-600'
                        }`}
                      >
                        <span className="sr-only">{clientPrefs.emailNjoftime ? 'Aktive' : 'Joaktive'}</span>
                        <span
                          className={`inline-block size-6 rounded-full bg-white shadow transition-transform ${
                            clientPrefs.emailNjoftime ? 'translate-x-7' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </li>
                    <li className="flex flex-wrap items-center justify-between gap-4 py-4">
                      <div>
                        <p className="font-medium text-neutral-900 dark:text-neutral-100">Njoftime me SMS</p>
                        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">Për ngjarje kritike (demo — pa dërgim real).</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={clientPrefs.smsNjoftime}
                        onClick={() => updatePref('smsNjoftime', !clientPrefs.smsNjoftime)}
                        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                          clientPrefs.smsNjoftime ? 'bg-emerald-600' : 'bg-neutral-300 dark:bg-neutral-600'
                        }`}
                      >
                        <span className="sr-only">{clientPrefs.smsNjoftime ? 'Aktive' : 'Joaktive'}</span>
                        <span
                          className={`inline-block size-6 rounded-full bg-white shadow transition-transform ${
                            clientPrefs.smsNjoftime ? 'translate-x-7' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </li>
                    <li className="flex flex-wrap items-center justify-between gap-4 py-4">
                      <div>
                        <p className="font-medium text-neutral-900 dark:text-neutral-100">Përmbledhje javore</p>
                        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">Email me KPI javore (demo).</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={clientPrefs.raportiJavor}
                        onClick={() => updatePref('raportiJavor', !clientPrefs.raportiJavor)}
                        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                          clientPrefs.raportiJavor ? 'bg-emerald-600' : 'bg-neutral-300 dark:bg-neutral-600'
                        }`}
                      >
                        <span className="sr-only">{clientPrefs.raportiJavor ? 'Aktive' : 'Joaktive'}</span>
                        <span
                          className={`inline-block size-6 rounded-full bg-white shadow transition-transform ${
                            clientPrefs.raportiJavor ? 'translate-x-7' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </li>
                  </ul>
                </section>
              ) : (
                <section
                  className="rounded-2xl border border-neutral-200/90 bg-white p-6 shadow-sm ring-1 ring-black/[0.03] sm:p-8 dark:border-neutral-800/90 dark:bg-neutral-900/80 dark:ring-white/[0.06]"
                  aria-label={sectionTitle}
                >
                  <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-400">Seksioni</p>
                  <h2 className="mt-2 text-xl font-bold text-neutral-900 dark:text-white">{sectionTitle}</h2>
                  <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-500">Kjo zonë është bosh në demo — funksionaliteti i plotë vjen në integrimin me backend-in.</p>
                  <p className="mt-3 max-w-prose text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {clientSection === 'reports' &&
                      'Eksportet PDF/CSV dhe oraret e raporteve për palët e interesuara do të konfigurohen këtu.'}
                  </p>
                </section>
              )}
            </div>
          </div>
        </div>

        {notifOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-[1px] dark:bg-black/60"
              aria-label="Mbyll panelin e njoftimeve"
              onClick={() => setNotifOpen(false)}
            />
            <div
              id="client-notif-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="notif-drawer-title"
              className="fixed inset-y-0 right-0 z-[80] flex w-[min(22rem,92vw)] flex-col border-l border-neutral-200/90 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
            >
              <div className="flex items-center justify-between gap-2 border-b border-neutral-200/90 px-4 py-4 dark:border-neutral-800">
                <h2 id="notif-drawer-title" className="text-lg font-bold text-neutral-900 dark:text-white">
                  Njoftime
                </h2>
                <div className="flex items-center gap-2">
                  {unreadNotifCount > 0 ? (
                    <button
                      type="button"
                      onClick={markAllNotifsRead}
                      className="rounded-lg px-2 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                    >
                      Shëno të gjitha
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setNotifOpen(false)}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-neutral-600 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:text-neutral-300 dark:hover:bg-neutral-900"
                    aria-label="Mbyll"
                  >
                    <X size={22} aria-hidden />
                  </button>
                </div>
              </div>
              <ul className="flex-1 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800" role="list">
                {CLIENT_NOTIFICATIONS.map((n) => {
                  const isRead = readNotifIds.has(n.id);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => markOneNotifRead(n.id)}
                        className={`flex w-full flex-col items-start gap-1 px-4 py-4 text-left transition hover:bg-neutral-50 dark:hover:bg-neutral-900/80 ${
                          !isRead ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''
                        }`}
                      >
                        <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-500">{n.at}</span>
                        <span className="font-semibold text-neutral-900 dark:text-white">{n.title}</span>
                        <span className="text-sm text-neutral-600 dark:text-neutral-400">{n.detail}</span>
                        {!isRead ? (
                          <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                            E palexuara
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function localISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function firstDayOfMonthISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function AdminSidebar({ expanded, onToggle, user, onLogout, navItems, isNavActive, onSelectNav }) {
  const drawerClass = expanded
    ? 'translate-x-0'
    : '-translate-x-full max-[767px]:pointer-events-none max-[767px]:opacity-0';

  return (
    <>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="admin-sidebar"
        onClick={onToggle}
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg md:hidden touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
      >
        {expanded ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
        <span className="sr-only">{expanded ? 'Mbyll menunë' : 'Hap menunë'}</span>
      </button>

      {expanded && (
        <button
          type="button"
          aria-label="Mbyll mbivendosjen e menysë"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onToggle}
        />
      )}

      <aside
        id="admin-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,88vw)] flex-col border-r border-neutral-800/90 bg-gradient-to-b from-neutral-950 to-neutral-950 text-white shadow-xl shadow-black/30 transition-transform duration-200 ease-out-soft motion-reduce:transition-none md:static md:z-0 md:w-56 md:translate-x-0 md:opacity-100 ${drawerClass}`}
      >
        <div className="flex h-14 items-center border-b border-neutral-800/90 px-4 sm:h-16">
          <span className="text-lg font-bold text-emerald-400">{BRAND.slice(0, 2)}</span>
        </div>
        <nav className="flex-1 space-y-1 p-3" aria-label="Operacionet">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelectNav(item.key)}
              aria-current={isNavActive(item.key) ? 'page' : undefined}
              className={`flex w-full min-h-[44px] items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-colors duration-200 ease-out-soft motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 touch-manipulation ${
                isNavActive(item.key)
                  ? 'bg-neutral-900 text-white ring-1 ring-emerald-500/35'
                  : 'text-neutral-200 hover:bg-neutral-900'
              }`}
            >
              <item.icon size={20} aria-hidden />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="border-t border-neutral-800/90 p-3">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full min-h-[44px] items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-neutral-200 transition-colors duration-200 ease-out-soft hover:bg-neutral-900 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 touch-manipulation"
          >
            <LogOut size={20} aria-hidden />
            Dilni
          </button>
        </div>
        <p className="border-t border-neutral-800/90 px-4 py-3 text-xs text-neutral-500">
          {user?.name} · <span className="text-neutral-400">{user?.email}</span>
        </p>
      </aside>
    </>
  );
}

function AdminPdfReportSection({ user }) {
  const [dataFillimit, setDataFillimit] = useState(() => firstDayOfMonthISO());
  const [dataMbarimit, setDataMbarimit] = useState(() => localISODate());
  const [depo, setDepo] = useState('all');
  const [titull, setTitull] = useState('');
  const [shenime, setShenime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      setError('');
      setBusy(true);
      try {
        const parsed = validateAdminReportBody({
          dataFillimit,
          dataMbarimit,
          depo,
          titull: titull.trim(),
          shenime: shenime.trim(),
        });
        if (!parsed.ok) {
          setError(parsed.error);
          return;
        }
        const generatedBy = user?.name ? `${user.name} <${user.email}>` : user?.email || '';
        generateClientAdminReportPdf(parsed.value, generatedBy);
      } catch {
        setError('Gjenerimi i PDF dështoi. Provoni përsëri.');
      } finally {
        setBusy(false);
      }
    },
    [dataFillimit, dataMbarimit, depo, titull, shenime, user],
  );

  return (
    <section
      className="rounded-2xl border border-neutral-800/80 bg-neutral-900/80 p-4 shadow-md ring-1 ring-white/[0.04] sm:p-6"
      aria-labelledby="admin-report-heading"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="admin-report-heading" className="text-lg font-bold tracking-tight sm:text-xl">
            Raport PDF
          </h2>
          <p className="mt-1 text-sm text-neutral-400">
            Plotësoni periudhën dhe depot për të gjeneruar një raport demonstrues si PDF drejtpërdrejt në shfletues (vetëm për administratorët).
          </p>
        </div>
        <p className="text-xs text-neutral-500 sm:text-right">
          {user?.name} · <span className="text-neutral-400">{user?.email}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-1">
          <label htmlFor="rep-start" className="block text-sm font-medium text-neutral-300">
            Data e fillimit
          </label>
          <input
            id="rep-start"
            name="dataFillimit"
            type="date"
            required
            value={dataFillimit}
            onChange={(e) => setDataFillimit(e.target.value)}
            className="mt-2 w-full min-h-[48px] rounded-xl border border-neutral-700 bg-neutral-950 px-3 text-base text-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
          />
        </div>
        <div className="sm:col-span-1">
          <label htmlFor="rep-end" className="block text-sm font-medium text-neutral-300">
            Data e mbarimit
          </label>
          <input
            id="rep-end"
            name="dataMbarimit"
            type="date"
            required
            value={dataMbarimit}
            onChange={(e) => setDataMbarimit(e.target.value)}
            className="mt-2 w-full min-h-[48px] rounded-xl border border-neutral-700 bg-neutral-950 px-3 text-base text-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="rep-depo" className="block text-sm font-medium text-neutral-300">
            Depo
          </label>
          <select
            id="rep-depo"
            name="depo"
            required
            value={depo}
            onChange={(e) => setDepo(e.target.value)}
            className="mt-2 w-full min-h-[48px] rounded-xl border border-neutral-700 bg-neutral-950 px-3 text-base text-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
          >
            <option value="all">Të gjitha depot</option>
            {WAREHOUSES.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="rep-title" className="block text-sm font-medium text-neutral-300">
            Titulli (opsional)
          </label>
          <input
            id="rep-title"
            name="titull"
            type="text"
            maxLength={200}
            value={titull}
            onChange={(e) => setTitull(e.target.value)}
            placeholder="p.sh. Raport mujor logjistikë"
            className="mt-2 w-full min-h-[48px] rounded-xl border border-neutral-700 bg-neutral-950 px-3 text-base text-white placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="rep-notes" className="block text-sm font-medium text-neutral-300">
            Shënime (opsionale)
          </label>
          <textarea
            id="rep-notes"
            name="shenime"
            rows={4}
            maxLength={2000}
            value={shenime}
            onChange={(e) => setShenime(e.target.value)}
            placeholder="Kontekst për palët e interesuara, kufizime, ose hipoteza…"
            className="mt-2 w-full resize-y rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-base text-white placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
          />
        </div>

        {error ? (
          <p className="sm:col-span-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-100 ring-1 ring-red-500/30" role="alert">
            {error}
          </p>
        ) : null}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-md shadow-emerald-950/30 ring-1 ring-emerald-400/20 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 touch-manipulation sm:w-auto"
          >
            <Download size={20} aria-hidden />
            {busy ? 'Po gjenerohet PDF…' : 'Shkarko PDF'}
          </button>
        </div>
      </form>
    </section>
  );
}

function AdminPanel({ user, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminNavKey, setAdminNavKey] = useState('overview');
  const navItems = useMemo(
    () => [
      { icon: BarChart3, label: 'Përmbledhja', key: 'overview' },
      { icon: Truck, label: 'Flota', key: 'fleet' },
      { icon: Package, label: 'Depot', key: 'warehouses' },
      { icon: Users, label: 'Koordinimi', key: 'ops' },
      { icon: AlertCircle, label: 'Sinjalizimet', key: 'alerts' },
      { icon: Download, label: 'Raport PDF', key: 'report' },
    ],
    [],
  );

  const handleSelectNav = useCallback((key) => {
    setAdminNavKey(key);
    setMenuOpen(false);
  }, []);

  const isNavActive = useCallback((key) => adminNavKey === key, [adminNavKey]);

  const adminTitle = useMemo(() => {
    const titles = {
      overview: 'Operacionet',
      fleet: 'Flota',
      warehouses: 'Depot',
      ops: 'Koordinimi',
      alerts: 'Sinjalizimet',
      report: 'Raporti PDF',
    };
    return titles[adminNavKey] || 'Operacionet';
  }, [adminNavKey]);

  const fleetActive = useMemo(() => FLEET.filter((v) => v.status === 'active').length, []);
  const avgCapacity = useMemo(
    () => Math.round(WAREHOUSES.reduce((a, w) => a + w.capacity, 0) / WAREHOUSES.length),
    [],
  );
  const corridorEfficiencyPct = useMemo(() => computeCorridorEfficiencyPct(FLEET), []);
  const availabilityDisplayPct = useMemo(() => computeAvailabilityDisplayPct(WAREHOUSES, ALERTS), []);

  const [fleetSearch, setFleetSearch] = useState('');
  const [fleetStatusFilter, setFleetStatusFilter] = useState('all');
  const fleetFiltered = useMemo(() => {
    let rows = [...FLEET];
    if (fleetStatusFilter !== 'all') rows = rows.filter((v) => v.status === fleetStatusFilter);
    const q = fleetSearch.trim().toLowerCase();
    if (q) rows = rows.filter((v) => v.id.toLowerCase().includes(q));
    return rows;
  }, [fleetSearch, fleetStatusFilter]);

  const kpiSection = (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Përmbledhje">
      <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-600 to-emerald-800 p-4 shadow-lg shadow-emerald-950/20 transition-transform duration-200 ease-out-soft hover:-translate-y-0.5 hover:shadow-xl motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-lg sm:p-5">
        <p className="text-sm font-medium text-white/90">Flota aktive</p>
        <p className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">
          {fleetActive}/{FLEET.length}
        </p>
        <p className="mt-1 text-xs text-white/75">mjete në punë</p>
      </div>
      <div className="rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-600 to-sky-800 p-4 shadow-lg shadow-sky-950/20 transition-transform duration-200 ease-out-soft hover:-translate-y-0.5 hover:shadow-xl motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-lg sm:p-5">
        <p className="text-sm font-medium text-white/90">Depot</p>
        <p className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">{WAREHOUSES.length}</p>
        <p className="mt-1 text-xs text-white/75">përdorimi mesatar {avgCapacity}%</p>
      </div>
      <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-600 to-amber-800 p-4 shadow-lg shadow-amber-950/25 transition-transform duration-200 ease-out-soft hover:-translate-y-0.5 hover:shadow-xl motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-lg sm:p-5">
        <p className="text-sm font-medium text-white/90">Disponueshmëria</p>
        <p className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">{availabilityDisplayPct}%</p>
        <p className="mt-1 text-xs text-white/75">nga depot + sinjalizimet demo</p>
      </div>
      <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-600 to-violet-800 p-4 shadow-lg shadow-violet-950/25 transition-transform duration-200 ease-out-soft hover:-translate-y-0.5 hover:shadow-xl motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-lg sm:p-5">
        <p className="text-sm font-medium text-white/90">Efikasiteti i korridorit</p>
        <p className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">{corridorEfficiencyPct}%</p>
        <p className="mt-1 text-xs text-white/75">mesatarja e mjeteve aktive</p>
      </div>
    </section>
  );

  const renderFleetSection = (vehicles, showFilters) => (
    <section
      className="overflow-hidden rounded-2xl border border-neutral-800/80 bg-neutral-900 shadow-md ring-1 ring-white/[0.04]"
      aria-labelledby="fleet-heading"
    >
      <div className="border-b border-neutral-800/80 bg-neutral-950/50 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h2 id="fleet-heading" className="text-base font-bold tracking-tight sm:text-lg">
              Monitori i flotës
            </h2>
            <p className="mt-1 text-xs text-neutral-500 sm:text-sm">
              {showFilters
                ? 'Filtroni sipas statusit ose kërkoni sipas ID së mjetit.'
                : 'Tabela është e gjerë — lëvizni horizontalisht nëse duhet.'}
            </p>
          </div>
          {showFilters ? (
            <div className="flex w-full flex-col gap-2 sm:max-w-xl sm:flex-row sm:flex-wrap sm:items-center">
              <label className="relative min-h-[44px] min-w-0 flex-1">
                <span className="sr-only">Kërko mjetin</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500"
                  aria-hidden
                />
                <input
                  type="search"
                  value={fleetSearch}
                  onChange={(e) => setFleetSearch(e.target.value)}
                  placeholder="Kërko sipas ID (p.sh. TRUCK-001)…"
                  className="h-11 w-full rounded-xl border border-neutral-700 bg-neutral-950 py-2 pl-9 pr-3 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                  autoComplete="off"
                />
              </label>
              <label className="sr-only" htmlFor="fleet-status-filter">
                Filtro sipas statusit
              </label>
              <select
                id="fleet-status-filter"
                value={fleetStatusFilter}
                onChange={(e) => setFleetStatusFilter(e.target.value)}
                className="h-11 min-w-[10rem] rounded-xl border border-neutral-700 bg-neutral-950 px-3 text-sm font-medium text-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
              >
                <option value="all">Të gjitha statuset</option>
                <option value="active">Aktiv</option>
                <option value="idle">Parkuar</option>
                <option value="maintenance">Në servisim</option>
              </select>
            </div>
          ) : null}
        </div>
        {showFilters ? (
          <p className="mt-3 text-xs text-neutral-500" aria-live="polite">
            {vehicles.length} nga {FLEET.length} mjete
            {fleetSearch.trim() || fleetStatusFilter !== 'all' ? ' (me filtra aktivë)' : ''}
          </p>
        ) : null}
      </div>
      {vehicles.length === 0 ? (
        <div className="px-4 py-14 text-center sm:px-6">
          <p className="text-sm font-medium text-neutral-300">Nuk u gjet asnjë mjet</p>
          <p className="mt-2 text-sm text-neutral-500">Provoni një ID tjetër ose zgjidhni «Të gjitha statuset».</p>
          <button
            type="button"
            onClick={() => {
              setFleetSearch('');
              setFleetStatusFilter('all');
            }}
            className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-neutral-600 bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            Pastro filtrat
          </button>
        </div>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] touch-pan-x">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-neutral-800/90 bg-neutral-950/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-neutral-950/85">
                <tr>
                  <th scope="col" className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-neutral-400 sm:px-6">
                    Mjeti
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-neutral-400 sm:px-6">
                    Vendndodhja
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-neutral-400 sm:px-6">
                    Statusi
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-neutral-400 sm:px-6">
                    Rruga
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-neutral-400 sm:px-6">
                    Efikasiteti
                  </th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((vehicle) => (
                  <FleetRow key={vehicle.id} vehicle={vehicle} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 p-4 pb-6 md:hidden">
            {vehicles.map((vehicle) => (
              <FleetCard key={vehicle.id} vehicle={vehicle} />
            ))}
          </div>
        </>
      )}
    </section>
  );

  const fleetSectionOverview = renderFleetSection(FLEET, false);
  const fleetSectionFiltered = renderFleetSection(fleetFiltered, true);

  const warehousesSection = (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Depot">
      {WAREHOUSES.map((warehouse) => (
        <article
          key={warehouse.id}
          className="rounded-2xl border border-neutral-800/80 bg-neutral-900/80 p-5 shadow-inner ring-1 ring-white/[0.04] transition-all duration-200 ease-out-soft hover:border-emerald-500/25 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:shadow-inner"
        >
          <h3 className="text-lg font-bold tracking-tight">{warehouse.name}</h3>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm font-medium text-neutral-400">Kapaciteti</p>
              <div
                className="mt-2 h-3 w-full overflow-hidden rounded-full bg-neutral-800"
                role="progressbar"
                aria-valuenow={warehouse.capacity}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Kapaciteti ${warehouse.capacity}%`}
              >
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-sky-500 transition-[width] duration-500 ease-out-soft motion-reduce:transition-none"
                  style={{ width: `${warehouse.capacity}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-neutral-500 tabular-nums">{warehouse.capacity}%</p>
            </div>
            <dl className="grid gap-2 text-sm">
              <div className="flex items-center justify-between rounded-xl bg-neutral-950 px-3 py-2">
                <dt className="text-neutral-400">Temperatura</dt>
                <dd className="font-semibold">{warehouse.temperature}</dd>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-neutral-950 px-3 py-2">
                <dt className="text-neutral-400">Paletat</dt>
                <dd className="font-semibold tabular-nums">{warehouse.pallets}</dd>
              </div>
            </dl>
          </div>
        </article>
      ))}
    </section>
  );

  const opsSection = (
    <section
      className="overflow-hidden rounded-2xl border border-neutral-800/80 bg-neutral-900 shadow-md ring-1 ring-white/[0.04]"
      aria-labelledby="ops-heading"
    >
      <div className="border-b border-neutral-800/80 bg-neutral-950/50 px-4 py-4 sm:px-6">
        <h2 id="ops-heading" className="text-base font-bold tracking-tight sm:text-lg">
          Koordinimi operacional
        </h2>
        <p className="mt-1 text-sm text-neutral-400">Ngjarje të fundit (demo) — {OPS_EVENTS.length} regjistrime</p>
      </div>
      <ul className="divide-y divide-neutral-800/80">
        {OPS_EVENTS.map((ev) => (
          <li key={ev.id} className="px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold text-white">{ev.title}</p>
              <time className="text-xs tabular-nums text-neutral-500" dateTime={ev.at.replace(' ', 'T')}>
                {ev.at}
              </time>
            </div>
            <p className="mt-1 text-sm text-neutral-400">{ev.detail}</p>
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-emerald-400/90">{ev.lane}</p>
          </li>
        ))}
      </ul>
    </section>
  );

  const alertsSection = (
    <section
      className="overflow-hidden rounded-2xl border border-neutral-800/80 bg-neutral-900 shadow-md ring-1 ring-white/[0.04]"
      aria-labelledby="alerts-heading"
    >
      <div className="border-b border-neutral-800/80 bg-neutral-950/50 px-4 py-4 sm:px-6">
        <h2 id="alerts-heading" className="text-base font-bold tracking-tight sm:text-lg">
          Sinjalizimet
        </h2>
        <p className="mt-1 text-sm text-neutral-400">
          {ALERTS.filter((a) => a.severity === 'critical').length} kritike · {ALERTS.length} gjithsej (demo)
        </p>
      </div>
      <ul className="divide-y divide-neutral-800/80">
        {ALERTS.map((a) => {
          const badge =
            a.severity === 'critical'
              ? 'bg-red-500/20 text-red-100 ring-red-500/35'
              : a.severity === 'warning'
                ? 'bg-amber-500/15 text-amber-100 ring-amber-500/30'
                : 'bg-sky-500/15 text-sky-100 ring-sky-500/25';
          const label = a.severity === 'critical' ? 'Kritike' : a.severity === 'warning' ? 'Paralajmërim' : 'Info';
          return (
            <li key={a.id} className="px-4 py-4 sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${badge}`}>{label}</span>
                <span className="text-xs tabular-nums text-neutral-500">{a.at}</span>
              </div>
              <p className="mt-2 font-semibold text-white">{a.title}</p>
              <p className="mt-1 text-sm text-neutral-400">{a.detail}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <div className={`${rootShellClass} flex bg-neutral-950 text-white selection:bg-emerald-500/30`}>
      <AdminSidebar
        expanded={menuOpen}
        onToggle={() => setMenuOpen((o) => !o)}
        user={user}
        onLogout={onLogout}
        navItems={navItems}
        isNavActive={isNavActive}
        onSelectNav={handleSelectNav}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b border-neutral-800/80 bg-neutral-950/90 px-4 py-3 shadow-sm backdrop-blur sm:min-h-16 sm:px-6">
          <h1 className="truncate text-lg font-bold tracking-tight sm:text-2xl">{adminTitle}</h1>
          <div className="hidden text-right text-sm sm:block">
            <p className="font-semibold">{user?.name}</p>
            <p className="text-xs text-neutral-400">{user?.email}</p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-y-contain">
          <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
            {adminNavKey === 'report' ? (
              <AdminPdfReportSection user={user} />
            ) : adminNavKey === 'overview' ? (
              <>
                {kpiSection}
                {fleetSectionOverview}
                {warehousesSection}
              </>
            ) : adminNavKey === 'fleet' ? (
              fleetSectionFiltered
            ) : adminNavKey === 'warehouses' ? (
              warehousesSection
            ) : adminNavKey === 'ops' ? (
              opsSection
            ) : adminNavKey === 'alerts' ? (
              alertsSection
            ) : (
              <>
                {kpiSection}
                {fleetSectionOverview}
                {warehousesSection}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginPage({ email, password, onChangeEmail, onChangePassword, onSubmit, onBack, error, busy }) {
  return (
    <div className={`${rootShellClass} flex items-stretch justify-center bg-gradient-to-b from-neutral-950 via-neutral-900 to-emerald-950/30 px-4 py-10 sm:items-center sm:py-12`}>
      <div className="w-full max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">{BRAND}</h1>
          <p className="mt-2 text-sm text-neutral-400">Identifikohuni për të vazhduar</p>
        </div>

        <div className="mt-8 rounded-2xl border border-neutral-700/80 bg-neutral-900/70 p-6 shadow-2xl shadow-black/40 ring-1 ring-white/[0.06] backdrop-blur-md sm:p-8">
          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-neutral-300">
                E-posta
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                enterKeyHint="next"
                value={email}
                onChange={(e) => onChangeEmail(e.target.value)}
                required
                className="mt-2 w-full min-h-[48px] rounded-xl border border-neutral-600/80 bg-neutral-800/80 px-4 text-base text-white placeholder:text-neutral-500 transition-colors duration-150 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                placeholder="emër@kompani.al"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-neutral-300">
                Fjalëkalimi
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                enterKeyHint="go"
                value={password}
                onChange={(e) => onChangePassword(e.target.value)}
                required
                className="mt-2 w-full min-h-[48px] rounded-xl border border-neutral-600/80 bg-neutral-800/80 px-4 text-base text-white placeholder:text-neutral-500 transition-colors duration-150 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-100 ring-1 ring-red-500/30" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full min-h-[48px] items-center justify-center rounded-xl bg-emerald-600 text-base font-semibold text-white shadow-md shadow-emerald-950/30 ring-1 ring-emerald-400/20 transition-all duration-200 ease-out-soft hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 touch-manipulation"
            >
              {busy ? 'Po hyhet…' : 'Hyni'}
            </button>
          </form>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="mt-6 flex w-full min-h-[44px] items-center justify-center text-sm text-neutral-400 transition-colors duration-150 hover:text-white focus-visible:rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 touch-manipulation"
        >
          Kthehu në ballinë
        </button>
      </div>
    </div>
  );
}

export default function SustainabilityPlatform() {
  const [route, setRoute] = useState('home');
  const [user, setUser] = useState(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [toast, setToast] = useState({ message: '', variant: 'info' });

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DEMO_SESSION_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data?.email || !data?.name || (data.role !== 'client' && data.role !== 'admin')) return;
      setUser({ email: String(data.email), role: data.role, name: String(data.name) });
      setRoute(data.role === 'client' ? 'client' : 'admin');
    } catch {
      /* ignore corrupt session */
    }
  }, []);

  const dismissToast = useCallback(() => setToast({ message: '', variant: 'info' }), []);

  const notify = useCallback(
    (message, variant = 'success') => {
      setToast({ message, variant });
      window.setTimeout(dismissToast, 4500);
    },
    [dismissToast],
  );

  const openLogin = useCallback(() => {
    setLoginError('');
    setRoute('login');
  }, []);

  const backHome = useCallback(() => {
    setLoginError('');
    setRoute('home');
  }, []);

  const startSignup = useCallback(() => {
    setToast({ message: 'Faleminderit—do t’ju kontaktojmë së shpejti.', variant: 'success' });
    window.setTimeout(dismissToast, 4500);
  }, [dismissToast]);

  const handleLogin = useCallback(
    (e) => {
      e.preventDefault();
      setLoginError('');
      setLoginBusy(true);
      try {
        const loggedIn = authenticateDemoUser(loginEmail, loginPassword);
        if (!loggedIn) {
          setLoginError('E-posta ose fjalëkalimi nuk përputhen.');
          return;
        }
        try {
          sessionStorage.setItem(
            DEMO_SESSION_STORAGE_KEY,
            JSON.stringify({ email: loggedIn.email, role: loggedIn.role, name: loggedIn.name }),
          );
        } catch {
          /* storage full or disabled */
        }
        setUser(loggedIn);
        setRoute(loggedIn.role === 'client' ? 'client' : 'admin');
        setLoginEmail('');
        setLoginPassword('');
      } finally {
        setLoginBusy(false);
      }
    },
    [loginEmail, loginPassword],
  );

  const handleLogout = useCallback(() => {
    try {
      sessionStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setUser(null);
    setRoute('home');
  }, []);

  return (
    <div className="relative min-h-[100dvh] min-h-screen bg-white antialiased [text-size-adjust:100%]">
      {!user ? (
        route === 'home' ? (
          <PublicPage onOpenLogin={openLogin} onStartSignup={startSignup} />
        ) : (
          <LoginPage
            email={loginEmail}
            password={loginPassword}
            onChangeEmail={setLoginEmail}
            onChangePassword={setLoginPassword}
            onSubmit={handleLogin}
            onBack={backHome}
            error={loginError}
            busy={loginBusy}
          />
        )
      ) : route === 'client' ? (
        <ClientDashboard user={user} onLogout={handleLogout} onNotify={notify} />
      ) : (
        <AdminPanel user={user} onLogout={handleLogout} />
      )}
      <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
    </div>
  );
}
