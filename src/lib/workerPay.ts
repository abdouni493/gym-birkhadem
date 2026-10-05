/**
 * Worker salary calculation.
 *
 * Pure functions only — no Supabase, no React. The Payment dialog feeds rows in
 * and renders what comes out, which keeps this testable in isolation.
 *
 * THE RULE (from the spec):
 *   pay = (unpaid periods x rate) - unsettled acomptes - unsettled absence costs
 * and the admin may override the final figure by hand.
 */

export type PayType = 'daily' | 'monthly';

export interface WorkerPayConfig {
  payEnabled: boolean;
  payType: PayType | null;
  payAmount: number;
  /** Date the worker started — nothing before this is ever owed. */
  startDate: string; // YYYY-MM-DD
}

export interface AcompteRow {
  id: string;
  acompte_date: string;
  description: string | null;
  amount: number;
  settled_payment_id: string | null;
}

export interface AbsenceRow {
  id: string;
  absence_date: string;
  description: string | null;
  cost: number;
  settled_payment_id: string | null;
}

export interface PaymentRow {
  id: string;
  period_start: string;
  period_end: string;
  final_amount: number;
  payment_date: string;
  description: string | null;
}

/** One unpaid month or day owed to the worker. */
export interface UnpaidPeriod {
  /** 'YYYY-MM' for monthly, 'YYYY-MM-DD' for daily. */
  key: string;
  label: string;
  start: string;
  end: string;
  amount: number;
}

// ---------------------------------------------------------------------------
// date helpers — all local-time and calendar-based.
// `new Date('YYYY-MM-DD')` parses as UTC and shifts the day in negative
// timezones, so dates are split manually instead.
// ---------------------------------------------------------------------------

const parse = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const toISO = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const lastDayOfMonth = (y: number, m: number): number => new Date(y, m + 1, 0).getDate();

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

/**
 * Every period from the worker's start date up to `asOf` that has not already
 * been covered by a payment.
 *
 * A period counts as paid when ANY existing payment's range overlaps it, so
 * re-paying the same month is not possible by accident.
 */
export function computeUnpaidPeriods(
  config: WorkerPayConfig,
  payments: PaymentRow[],
  asOf: Date = new Date(),
): UnpaidPeriod[] {
  if (!config.payEnabled || !config.payType || config.payAmount <= 0) return [];
  if (!config.startDate) return [];

  const start = parse(config.startDate);
  if (start > asOf) return [];

  const covered = (from: string, to: string): boolean =>
    payments.some((p) => p.period_start <= to && p.period_end >= from);

  const out: UnpaidPeriod[] = [];

  if (config.payType === 'monthly') {
    let y = start.getFullYear();
    let m = start.getMonth();
    const endY = asOf.getFullYear();
    const endM = asOf.getMonth();

    while (y < endY || (y === endY && m <= endM)) {
      const first = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const last = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDayOfMonth(y, m)).padStart(2, '0')}`;

      if (!covered(first, last)) {
        out.push({
          key: `${y}-${String(m + 1).padStart(2, '0')}`,
          label: `${MONTHS[m]} ${y}`,
          start: first,
          end: last,
          amount: config.payAmount,
        });
      }
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
    return out;
  }

  // Daily
  const cursor = new Date(start);
  // Guard against a runaway loop if startDate is far in the past.
  let guard = 0;
  while (cursor <= asOf && guard < 3660) {
    const iso = toISO(cursor);
    if (!covered(iso, iso)) {
      out.push({
        key: iso,
        label: iso,
        start: iso,
        end: iso,
        amount: config.payAmount,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return out;
}

export interface PayComputation {
  periods: UnpaidPeriod[];
  selectedPeriods: UnpaidPeriod[];
  acomptes: AcompteRow[];
  absences: AbsenceRow[];
  gross: number;
  acomptesTotal: number;
  absencesTotal: number;
  /** gross - acomptes - absences, floored at 0. */
  computed: number;
  /** True when deductions exceed what is owed. */
  isNegative: boolean;
  rawComputed: number;
  periodStart: string | null;
  periodEnd: string | null;
}

/**
 * Build the full settlement figure.
 *
 * `acomptes`/`absences` must be the UNSETTLED rows only (settled_payment_id
 * null) — those are the ones "not yet decreased from the payment".
 */
export function computePayment(
  selectedPeriods: UnpaidPeriod[],
  allPeriods: UnpaidPeriod[],
  acomptes: AcompteRow[],
  absences: AbsenceRow[],
): PayComputation {
  const gross = selectedPeriods.reduce((s, p) => s + p.amount, 0);
  const acomptesTotal = acomptes.reduce((s, a) => s + Number(a.amount || 0), 0);
  const absencesTotal = absences.reduce((s, a) => s + Number(a.cost || 0), 0);

  const rawComputed = gross - acomptesTotal - absencesTotal;

  const sorted = [...selectedPeriods].sort((a, b) => a.start.localeCompare(b.start));

  return {
    periods: allPeriods,
    selectedPeriods,
    acomptes,
    absences,
    gross,
    acomptesTotal,
    absencesTotal,
    // Never hand back a negative payslip; the shortfall is surfaced instead.
    computed: Math.max(0, rawComputed),
    rawComputed,
    isNegative: rawComputed < 0,
    periodStart: sorted.length ? sorted[0].start : null,
    periodEnd: sorted.length ? sorted[sorted.length - 1].end : null,
  };
}

/** Rows where settled_payment_id is null. */
export const unsettled = <T extends { settled_payment_id: string | null }>(rows: T[]): T[] =>
  rows.filter((r) => r.settled_payment_id === null);
