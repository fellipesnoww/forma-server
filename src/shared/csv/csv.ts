/**
 * Serializacao CSV (RFC 4180) para exportacoes. Primeiro uso: export do audit log (painel
 * admin); a Fase 6.2 reaproveita para o historico de treinos.
 */

export type CsvValue = string | number | boolean | null | undefined;

const UTF8_BOM = String.fromCharCode(0xfeff);

/**
 * Celula que comeca com `= + - @` (ou tab/CR) vira formula ao abrir no Excel/Sheets. Os dados
 * exportados incluem texto controlado por usuarios (email, metadata), entao o valor ganha um
 * apostrofo na frente — padrao OWASP contra CSV injection.
 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeCell(value: CsvValue): string {
  if (value === null || value === undefined) {
    return '';
  }

  const raw = String(value);
  const text = typeof value === 'string' && FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;

  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** CRLF entre linhas (RFC 4180) e BOM UTF-8, para o Excel abrir acentos corretamente. */
export function toCsv(header: string[], rows: CsvValue[][]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCell).join(','));

  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`;
}
