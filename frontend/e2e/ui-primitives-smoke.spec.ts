import { test, expect } from "@playwright/test"

/**
 * Smoke dos primitivos de UI (Combobox + DatePicker + DateRangePicker).
 *
 * Prova as garantias do contrato:
 *  - DatePicker (data única) escolhe data por calendário com dropdown de mês/ano
 *    e ENVIA `YYYY-MM-DD` à API (sem off-by-one de fuso, sem ISO datetime).
 *  - Combobox busca cliente por nome/documento e submete o UUID (`client_id`).
 *  - DateRangePicker filtra um período e manda `due_after`/`due_before` em ISO.
 *
 * Cria 1 conta a receber (mutação leve); não depende de reset-db.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

test("Combobox + DatePicker: cria conta a receber e envia data em ISO + UUID", async ({
  page,
}) => {
  await page.goto("/financeiro")
  await page.getByRole("tab", { name: "Contas a Receber" }).click()
  await page.getByRole("button", { name: "Nova conta a receber" }).click()

  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()

  await dialog.getByLabel("Descrição").fill("Smoke recebível primitivos")
  await dialog.getByLabel("Valor (R$)").fill("199.90")

  // --- DatePicker: abrir calendário, trocar mês/ano pelo dropdown, escolher dia
  await dialog.locator("#due_date").click()

  // captionLayout="dropdown" → dois <select> nativos (mês e ano)
  const selects = page.locator("select")
  await expect(selects).toHaveCount(2)
  await selects.nth(0).selectOption({ label: "junho" })
  await selects.nth(1).selectOption({ label: "2027" })

  // Escolhe o dia 15 (mid-month — não é "outside day" em junho/2027)
  await page
    .getByRole("gridcell")
    .getByText("15", { exact: true })
    .first()
    .click()

  // Trigger reflete a data em pt-BR
  await expect(dialog.locator("#due_date")).toContainText("15/06/2027")

  // --- Combobox: buscar cliente por nome e selecionar
  await dialog.locator("#reference_id").click()
  await page
    .getByPlaceholder("Buscar por nome ou documento...")
    .fill("Grão")
  await page.getByRole("option", { name: /Grão Fino/ }).click()

  // --- Submete e captura o POST
  const [request] = await Promise.all([
    page.waitForRequest(
      (r) =>
        r.url().includes("/api/financeiro/contas-receber") &&
        r.method() === "POST"
    ),
    dialog.getByRole("button", { name: "Criar conta" }).click(),
  ])

  const body = JSON.parse(request.postData() ?? "{}")
  console.log("[smoke] POST contas-receber body:", JSON.stringify(body))

  // PROVA ANTI-REGRESSÃO: data no fio é YYYY-MM-DD, e é a escolhida (sem off-by-one)
  expect(body.due_date).toBe("2027-06-15")
  expect(body.due_date).toMatch(ISO_DATE)
  // Combobox submete o UUID do cliente
  expect(body.client_id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  )

  await expect(page.getByText("Conta criada com sucesso")).toBeVisible()
})

test("Combobox: cliente obrigatório bloqueia com mensagem em PT", async ({
  page,
}) => {
  await page.goto("/financeiro")
  await page.getByRole("tab", { name: "Contas a Receber" }).click()
  await page.getByRole("button", { name: "Nova conta a receber" }).click()

  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("Descrição").fill("Sem cliente")
  await dialog.getByLabel("Valor (R$)").fill("10")

  // due_date é obrigatório; preenche via calendário para chegar na validação do cliente
  await dialog.locator("#due_date").click()
  await page.getByRole("gridcell").getByText("10", { exact: true }).first().click()

  await dialog.getByRole("button", { name: "Criar conta" }).click()
  await expect(page.getByText("Selecione o cliente")).toBeVisible()
})

test("DateRangePicker: filtro de período manda due_after/due_before em ISO", async ({
  page,
}) => {
  await page.goto("/financeiro")
  await page.getByRole("tab", { name: "Contas a Receber" }).click()

  // Abre o seletor de intervalo
  await page.getByRole("button", { name: "Selecione um período" }).click()

  // Escolhe início (dia 1) e fim (dia 20) no calendário de 2 meses
  await page.getByRole("gridcell").getByText("1", { exact: true }).first().click()
  const [request] = await Promise.all([
    page.waitForRequest(
      (r) =>
        r.url().includes("/api/financeiro/contas-receber") &&
        r.url().includes("due_after") &&
        r.method() === "GET"
    ),
    page.getByRole("gridcell").getByText("20", { exact: true }).first().click(),
  ])

  const url = new URL(request.url())
  const dueAfter = url.searchParams.get("due_after")
  const dueBefore = url.searchParams.get("due_before")
  console.log("[smoke] GET filtro:", dueAfter, dueBefore)

  expect(dueAfter).toMatch(ISO_DATE)
  expect(dueBefore).toMatch(ISO_DATE)
})
