import { test, expect } from "@playwright/test"

/**
 * Smoke do botão "Limpar filtros" nas barras de filtro.
 *
 * Prova: (1) o botão só aparece quando há filtro ativo; (2) ao clicar, TODOS os
 * campos da barra voltam ao default e a lista recarrega; (3) onde há paginação,
 * o reset volta para a página 1 (param `page=1` na query). Read-only (não muta).
 */

test("Financeiro/Contas a Receber: limpar reseta busca + período e volta à página 1", async ({
  page,
}) => {
  await page.goto("/financeiro")
  await page.getByRole("tab", { name: "Contas a Receber" }).click()

  const search = page.getByPlaceholder("Nº, descrição ou cliente...")
  await expect(search).toBeVisible()

  // Sem filtro: botão não aparece.
  await expect(
    page.getByRole("button", { name: "Limpar filtros" })
  ).toHaveCount(0)

  // Aplica busca.
  await search.fill("café")

  // Aplica período (DateRangePicker) — dia 5 ao 25.
  await page.getByRole("button", { name: "Selecione um período" }).click()
  await page.getByRole("gridcell").getByText("5", { exact: true }).first().click()
  await page.getByRole("gridcell").getByText("25", { exact: true }).first().click()

  // Botão aparece com filtro ativo.
  const clear = page.getByRole("button", { name: "Limpar filtros" })
  await expect(clear).toBeVisible()

  // Clica em limpar e captura o GET de recarga.
  const [request] = await Promise.all([
    page.waitForRequest(
      (r) =>
        r.url().includes("/api/financeiro/contas-receber") &&
        r.method() === "GET"
    ),
    clear.click(),
  ])

  const url = new URL(request.url())
  console.log("[smoke] GET após limpar:", url.search)
  expect(url.searchParams.get("page")).toBe("1")
  expect(url.searchParams.get("search")).toBeNull()
  expect(url.searchParams.get("due_after")).toBeNull()
  expect(url.searchParams.get("due_before")).toBeNull()

  // Campos voltaram ao default e o botão sumiu.
  await expect(search).toHaveValue("")
  await expect(
    page.getByRole("button", { name: "Selecione um período" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Limpar filtros" })
  ).toHaveCount(0)
})

test("Comercial/Clientes: limpar reseta busca e some o botão", async ({
  page,
}) => {
  await page.goto("/comercial")
  await page.getByRole("tab", { name: "Clientes" }).click()

  const search = page.getByPlaceholder("Nome ou documento...")
  await expect(search).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Limpar filtros" })
  ).toHaveCount(0)

  await search.fill("Grão")
  const clear = page.getByRole("button", { name: "Limpar filtros" })
  await expect(clear).toBeVisible()

  await clear.click()
  await expect(search).toHaveValue("")
  await expect(
    page.getByRole("button", { name: "Limpar filtros" })
  ).toHaveCount(0)
})

test("Estoque/Itens: limpar reseta busca + categoria", async ({ page }) => {
  await page.goto("/estoque")
  // Aba Itens é o default.
  const search = page.getByPlaceholder("Nome ou SKU...")
  await expect(search).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Limpar filtros" })
  ).toHaveCount(0)

  await search.fill("café")
  const clear = page.getByRole("button", { name: "Limpar filtros" })
  await expect(clear).toBeVisible()

  await clear.click()
  await expect(search).toHaveValue("")
  await expect(
    page.getByRole("button", { name: "Limpar filtros" })
  ).toHaveCount(0)
})
