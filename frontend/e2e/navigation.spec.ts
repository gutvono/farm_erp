import { test, expect } from "@playwright/test"

/**
 * Smoke-base: prova que o login (storageState) e o roteamento funcionam, abrindo
 * telas ESTÁVEIS (Financeiro e Folha) e asserindo elementos-chave. Read-only.
 */
test.describe("Auth + navegação (telas estáveis)", () => {
  test("Financeiro abre autenticado com as abas visíveis", async ({ page }) => {
    await page.goto("/financeiro")

    // Título da página (h2) — não confundir com o h1 do header nem o link da sidebar.
    await expect(
      page.getByRole("heading", { name: "Financeiro", level: 2 })
    ).toBeVisible()

    // Abas-chave da tela.
    await expect(page.getByRole("tab", { name: "Movimentações" })).toBeVisible()
    await expect(page.getByRole("tab", { name: "Aprovações" })).toBeVisible()

    // Continua em /financeiro (não foi redirecionado para /login).
    await expect(page).toHaveURL(/\/financeiro$/)
  })

  test("Folha abre autenticada com o seletor de período", async ({ page }) => {
    await page.goto("/folha")

    await expect(
      page.getByRole("heading", { name: "Folha de Pagamento", level: 2 })
    ).toBeVisible()
    await expect(page.getByRole("tab", { name: "Folha do Mês" })).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Abrir Período" })
    ).toBeVisible()

    await expect(page).toHaveURL(/\/folha$/)
  })
})
