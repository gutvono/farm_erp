import { test, expect, type Locator, type Page } from "@playwright/test"

/**
 * Happy-path do PCP — Demanda 5.1 (capacidade: planejar é LIVRE; a validação é
 * no INICIAR). Mutação de estado → roda SERIAL (workers: 1) e DEPOIS dos specs
 * read-only (ordem alfabética). `make e2e` reseta o banco antes (determinístico:
 * seed tem 1 OP `concluida` e uma única Colheitadeira com saldo 1).
 *
 * Cobre: criar talhão → criar OP-A (SKU visível; máquina mostra "N disponíveis",
 * sem ocultar) → planejar LIVRE acima do disponível (cargo) com aviso, salva →
 * iniciar A consome a máquina (disponível reflete: 0) → iniciar B excede →
 * toast 409 → encerrar A libera → iniciar B passa → colher B por destino.
 *
 * Cards são escopados pelo badge de hectares (A=4, B=2, C=1 — valores distintos).
 */

const PLOT_NAME = `PCP E2E ${Date.now()}`

function card(page: Page, hectares: number): Locator {
  return page.locator(".border-slate-200").filter({ hasText: `${hectares} ha` })
}

async function selectOption(
  page: Page,
  triggerName: string,
  optionName: string | RegExp
) {
  await page.getByRole("combobox", { name: triggerName }).click()
  await page.getByRole("option", { name: optionName }).click()
}

test.describe.serial("PCP — capacidade (Demanda 5.1)", () => {
  test("criar talhão com hectares → aparece na lista", async ({ page }) => {
    await page.goto("/pcp")
    await page.getByRole("tab", { name: "Talhões" }).click()
    await page.getByRole("button", { name: "Novo Talhão" }).click()

    await page.getByLabel(/Nome/).fill(PLOT_NAME)
    await page.getByLabel(/Variedade/).fill("Arábica Bourbon")
    await page.getByLabel(/Capacidade/).fill("100")
    await page.getByLabel(/Área/).fill("10")
    await page.getByRole("button", { name: "Criar talhão" }).click()

    await expect(page.getByText(PLOT_NAME)).toBeVisible()
    const talhao = page.locator(".border-slate-200").filter({ hasText: PLOT_NAME })
    await expect(talhao.getByText("10 ha")).toBeVisible()
  })

  test("criar OP-A: SKU visível e máquina mostra disponível (não some)", async ({
    page,
  }) => {
    await page.goto("/pcp")
    await page.getByRole("button", { name: "Nova Ordem" }).click()

    await selectOption(page, "Talhão", new RegExp(PLOT_NAME))
    await page.getByLabel(/Hectares usados/).fill("4")

    // Insumo — SKU visível na opção.
    await page.getByRole("button", { name: "Adicionar insumo" }).click()
    await page.getByRole("combobox", { name: "Insumo 1" }).click()
    await expect(page.getByRole("option", { name: /INS-FERT/ })).toBeVisible()
    await page.getByRole("option", { name: /INS-FERT/ }).click()
    await page.getByPlaceholder("Qtd").first().fill("10")

    // Cargo (quantidade dentro do disponível).
    await page.getByRole("button", { name: "Adicionar cargo" }).click()
    await page.getByRole("combobox", { name: "Cargo 1" }).click()
    await page.getByRole("option").first().click()

    // Máquina — NÃO some; a opção mostra o disponível.
    await page.getByRole("button", { name: "Adicionar máquina" }).click()
    await page.getByRole("combobox", { name: "Máquina 1" }).click()
    await expect(
      page.getByRole("option", { name: /Colheitadeira.*dispon/ })
    ).toBeVisible()
    await page.getByRole("option", { name: /Colheitadeira/ }).click()

    await page.getByRole("button", { name: "Criar ordem" }).click()
    await expect(card(page, 4).first()).toBeVisible()
  })

  test("planejar é livre: cargo acima do disponível salva (com aviso)", async ({
    page,
  }) => {
    await page.goto("/pcp")
    await page.getByRole("button", { name: "Nova Ordem" }).click()
    await selectOption(page, "Talhão", new RegExp(PLOT_NAME))
    await page.getByLabel(/Hectares usados/).fill("1")

    await page.getByRole("button", { name: "Adicionar cargo" }).click()
    await page.getByRole("combobox", { name: "Cargo 1" }).click()
    await page.getByRole("option").first().click()
    // Quantidade muito acima do disponível → aviso inline, sem bloquear.
    await page.getByPlaceholder("Qtd").first().fill("999")
    await expect(page.getByText(/será validado ao iniciar/)).toBeVisible()

    await page.getByRole("button", { name: "Criar ordem" }).click()
    // Salvou (planejar é livre): a OP de 1 ha aparece na lista.
    await expect(card(page, 1).first()).toBeVisible()
  })

  test("iniciar consome capacidade; excedente bloqueia (409); liberar e iniciar", async ({
    page,
  }) => {
    await page.goto("/pcp")

    // Inicia a OP-A (4 ha) — consome a única Colheitadeira.
    await card(page, 4).getByRole("button", { name: "Iniciar Produção" }).click()
    await page.getByRole("button", { name: "Confirmar", exact: true }).click()
    await expect(card(page, 4).getByText("Em Execução")).toBeVisible()

    // Disponível reflete o uso: ao criar nova OP, a máquina aparece com 0 disponíveis.
    await page.getByRole("button", { name: "Nova Ordem" }).click()
    await selectOption(page, "Talhão", new RegExp(PLOT_NAME))
    await page.getByLabel(/Hectares usados/).fill("2")
    await page.getByRole("button", { name: "Adicionar máquina" }).click()
    await page.getByRole("combobox", { name: "Máquina 1" }).click()
    await expect(
      page.getByRole("option", { name: /Colheitadeira.*0 disponíve/ })
    ).toBeVisible()
    await page.getByRole("option", { name: /Colheitadeira/ }).click()
    await page.getByRole("button", { name: "Criar ordem" }).click()
    await expect(card(page, 2).first()).toBeVisible()

    // Iniciar OP-B (2 ha) excede a capacidade da máquina → toast 409.
    await card(page, 2).getByRole("button", { name: "Iniciar Produção" }).click()
    await page.getByRole("button", { name: "Confirmar", exact: true }).click()
    await expect(
      page.getByText(/Capacidade insuficiente para iniciar/)
    ).toBeVisible()
    await expect(card(page, 2).getByText("Planejada")).toBeVisible()

    // Encerrar A (por praga) libera a máquina.
    await card(page, 4).getByRole("button", { name: "Encerrar (praga)" }).click()
    await page.getByLabel("Motivo *").fill("Praga (E2E) — libera capacidade")
    await page.getByRole("button", { name: "Confirmar encerramento" }).click()
    await expect(card(page, 4).getByText("Concluída")).toBeVisible()

    // Agora iniciar B passa.
    await card(page, 2).getByRole("button", { name: "Iniciar Produção" }).click()
    await page.getByRole("button", { name: "Confirmar", exact: true }).click()
    await expect(card(page, 2).getByText("Em Execução")).toBeVisible()
  })

  test("colher OP-B por destino → resultado + custo discriminado", async ({
    page,
  }) => {
    await page.goto("/pcp")

    // Só a OP-B (2 ha) está em execução → botão único.
    await card(page, 2).getByRole("button", { name: "Registrar Colheita" }).click()
    await page.getByLabel(/Percentual a colher/).fill("100")
    await expect(page.getByText("2.00 hectares")).toBeVisible()
    await page.getByLabel("Indústria").fill("8")
    await page.getByLabel("Embalagem").fill("4")
    await page.getByLabel("Descarte").fill("1")
    await page.getByRole("button", { name: "Confirmar colheita" }).click()

    await expect(page.getByText(/Resultado da Colheita/)).toBeVisible()
    await expect(page.getByText("Custo discriminado")).toBeVisible()
    await expect(page.getByText("Pessoal")).toBeVisible()
    await page.getByRole("button", { name: "Fechar" }).click()
  })
})
