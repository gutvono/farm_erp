/**
 * Helpers de conversão entre o formato ISO `YYYY-MM-DD` (contrato da API) e o
 * objeto `Date` usado pelo Calendar (react-day-picker).
 *
 * IMPORTANTE — fuso: `new Date("2026-06-15")` é interpretado como meia-noite
 * UTC, o que em fusos atrás de UTC (ex.: America/Sao_Paulo, -03:00) "volta" um
 * dia. Por isso construímos/extraímos a data sempre pelos componentes LOCAIS,
 * evitando o off-by-one.
 */

/** Converte `YYYY-MM-DD` em `Date` no horário local (00:00). */
export function parseISODate(iso?: string | null): Date | undefined {
  if (!iso) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return undefined
  const [, year, month, day] = match
  return new Date(Number(year), Number(month) - 1, Number(day))
}

/** Converte um `Date` para `YYYY-MM-DD` usando os componentes locais. */
export function toISODate(date?: Date | null): string {
  if (!date) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
