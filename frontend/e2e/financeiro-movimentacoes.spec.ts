import { test, expect, type Page } from "@playwright/test"

/**
 * Lê o total exibido no rodapé da tabela paginada ("Mostrando X–Y de N").
 * Retorna 0 quando ainda não há total (estado de carregamento) ou não parseável.
 */
async function readTotal(page: Page): Promise<number> {
  const footer = page.getByText(/Mostrando/)
  const txt = await footer.innerText().catch(() => "")
  const match = txt.match(/de\s+(\d+)/)
  return match ? Number(match[1]) : 0
}

/**
 * Interação read-only: na aba Movimentações do Financeiro, aplicar o filtro
 * Tipo=Saída e provar que a tabela reflete o filtro (server-side) — o total cai
 * e nenhuma linha "Entrada" permanece. NÃO muta dados.
 */
test("Movimentações: filtro Tipo=Saída reflete na tabela (read-only)", async ({
  page,
}) => {
  await page.goto("/financeiro")
  await page.getByRole("tab", { name: "Movimentações" }).click()

  const table = page.getByRole("table")
  await expect(table).toBeVisible()

  // Espera os dados carregarem (total > 0) e captura o total sem filtro.
  let totalBefore = 0
  await expect
    .poll(async () => {
      totalBefore = await readTotal(page)
      return totalBefore
    }, { timeout: 15_000 })
    .toBeGreaterThan(0)

  // Abre o Select "Tipo" (mostra "Todos os tipos") e escolhe "Saída".
  await page
    .getByRole("combobox")
    .filter({ hasText: "Todos os tipos" })
    .click()
  await page.getByRole("option", { name: "Saída" }).click()

  // O total deve cair (há entradas no seed) e ser positivo — prova o filtro server-side.
  await expect
    .poll(async () => {
      const t = await readTotal(page)
      return t > 0 && t < totalBefore ? t : -1
    }, { timeout: 15_000 })
    .toBeGreaterThan(0)

  // A tabela não deve conter nenhuma linha "Entrada" e deve mostrar "Saída".
  await expect(table.getByText("Entrada", { exact: true })).toHaveCount(0)
  await expect(table.getByText("Saída", { exact: true }).first()).toBeVisible()
})
