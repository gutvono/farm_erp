import { defineConfig, devices } from "@playwright/test"

/**
 * Harness E2E do Coffee Farm ERP (Demanda 5 — passo 0).
 *
 * - `baseURL` aponta para o front dockerizado (http://localhost:3000); a API roda
 *   em :8000. A stack precisa estar de pé (`make up`) e o banco semeado de forma
 *   determinística (`make reset-db`) — o alvo `make e2e` orquestra isso.
 * - **Login único:** `globalSetup` autentica UMA vez (via API) e grava o cookie em
 *   `e2e/.auth/admin.json`; todos os specs reusam esse `storageState` (sem re-login).
 * - **Determinístico:** web-first assertions (sem `waitForTimeout`), `retries: 0`.
 * - **Sem prints por padrão** (screenshots/vídeo desligados) — capturas ficam só
 *   para o manual final (decisão travada da refatoração).
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Specs de PCP mutam o estado compartilhado do banco; rodar SERIAL (workers: 1)
  // garante determinismo. `make e2e` reseta o banco antes (estado reproduzível).
  // Os arquivos rodam em ordem alfabética: as telas estáveis (financeiro,
  // navigation) vêm antes do pcp (mutação), que roda por último.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    storageState: "e2e/.auth/admin.json",
    trace: "on-first-retry",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
