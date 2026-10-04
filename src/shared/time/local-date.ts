/**
 * Datas locais `YYYY-MM-DD` (sem hora/fuso) usadas pelo calendario (2.2) e pela progressao
 * (2.4). A conversao data local -> instante UTC fica no SQL (`AT TIME ZONE`), aqui so ha
 * aritmetica de calendario, feita em UTC para nao depender do fuso do servidor.
 */

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** `true` para `YYYY-MM-DD` que existe no calendario (rejeita `2025-02-30`). */
export function isValidLocalDate(value: string): boolean {
  if (!LOCAL_DATE_PATTERN.test(value)) {
    return false;
  }

  const parsed = toUtcDate(value);

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export function addDays(date: string, days: number): string {
  return new Date(toUtcDate(date).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Dias entre duas datas locais (`to - from`), ambos `YYYY-MM-DD`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / DAY_MS);
}

/** Primeiro dia do mes e primeiro dia do mes seguinte (fim exclusivo). */
export function monthRange(year: number, month: number): { from: string; toExclusive: string } {
  const pad = (value: number) => String(value).padStart(2, '0');
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  return {
    from: `${String(year)}-${pad(month)}-01`,
    toExclusive: `${String(nextYear)}-${pad(nextMonth)}-01`,
  };
}

/** "Hoje" no fuso informado, como `YYYY-MM-DD`. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
