# E2E — Harness Playwright (infra de testes)

Infra de testes ponta a ponta (E2E) com **Playwright**, montada no **início da Demanda 5**
(antes da reescrita do PCP). Este passo entrega só o **harness calibrado e determinístico**
com um **smoke-base** contra telas estáveis (Financeiro e Folha). Specs de PCP/feature entram
**por camada**, conforme a D5 avança.

## Pré-requisitos (uma vez)

1. **Stack de pé:** `make up` (front em http://localhost:3000, API em http://localhost:8000).
2. **Browsers do Playwright** (inclui as libs de sistema; precisa de sudo uma vez):
   ```bash
   cd frontend
   npx playwright install --with-deps chromium
   ```
   - Em WSL2/Ubuntu sem sudo, `--with-deps` falha ao instalar as libs de sistema
     (libnss3, libnspr4, libasound2, …). Nesse caso, instale-as via apt
     (`sudo apt-get install libnss3 libnspr4 libasound2t64`) e rode
     `npx playwright install chromium` (só o browser, sem `--with-deps`).

## Como rodar

```bash
make e2e
```

O alvo `make e2e` (na raiz do repo) faz, **nesta ordem**:
1. `make reset-db` — recria o banco e aplica `scripts/seed.sql` (estado **determinístico**;
   o seed **não** fica escondido dentro do Playwright).
2. `cd frontend && npx playwright test` — roda a suíte contra a stack já no ar.

Rodar a suíte direto (sem reseed), durante o desenvolvimento:
```bash
cd frontend && npx playwright test            # tudo
cd frontend && npx playwright test e2e/navigation.spec.ts
```

## Estratégia (decisões travadas)

- **Login único (`storageState`):** `e2e/global-setup.ts` autentica **uma vez** via API
  (`POST /api/auth/login`, `admin/admin123`) e grava o cookie de sessão em
  `e2e/.auth/admin.json`. Todos os specs reusam esse `storageState` (em `playwright.config.ts`)
  — **nunca** logam por teste. O cookie `session_token` é host-only para `localhost`, então vale
  para o front (:3000) e para as chamadas à API (:8000). Prova de login único: a linha
  `[e2e] login único OK …` aparece **uma vez** por execução, antes dos testes.
- **Seed determinístico fora do Playwright:** sempre via `make reset-db` (idempotente), garantindo
  o mesmo estado a cada execução. Por isso `make e2e` reseta antes de testar.
- **Web-first assertions:** `expect(...).toBeVisible()`, `expect.poll(...)` etc. **Proibido**
  `waitForTimeout`/sleep fixo. `retries: 0` local; `trace: "on-first-retry"`.
- **Sem prints por padrão:** screenshots e vídeo desligados. Capturas para o **manual do usuário**
  ficam para outro momento (decisão travada da refatoração).
- **Seletores semânticos:** `getByRole`/`getByText`/`getByLabel` com os textos PT reais da UI
  (abas "Movimentações"/"Aprovações", botão "Abrir Período", opção "Saída"). Evitar CSS frágil.
- **Chromium headless**, projeto único.

## Smoke-base atual (telas estáveis, read-only)

| Spec | O que prova |
|------|-------------|
| `e2e/navigation.spec.ts` | Login + roteamento: abre `/financeiro` e `/folha` autenticado e vê título (h2), abas e o seletor de período. |
| `e2e/financeiro-movimentacoes.spec.ts` | Interação **read-only**: aba Movimentações → filtro **Tipo = Saída** → o total cai e a tabela não mostra mais linhas "Entrada" (filtro server-side reflete na UI). **Não muta dados.** |

## Arquivos

| Caminho | Papel |
|---------|-------|
| `frontend/playwright.config.ts` | Config: `baseURL`, `globalSetup`, `storageState`, projeto Chromium, sem prints |
| `frontend/e2e/global-setup.ts` | Login único via API → grava `e2e/.auth/admin.json` |
| `frontend/e2e/*.spec.ts` | Specs do smoke-base |
| `frontend/e2e/tsconfig.json` | TS dos specs (isolado do `tsconfig.json` do Next, que exclui `e2e/`) |
| `Makefile` → `e2e` | `reset-db` + `playwright test` |

**Versionamento:** specs, `playwright.config.ts` e `e2e/tsconfig.json` são **commitados**.
São **ignorados** (`.gitignore`): `e2e/.auth/` (cookie de sessão — nunca commitar),
`test-results/`, `playwright-report/`, `playwright/.cache/`.

## Próximos passos (NÃO neste passo)

- Specs de **PCP** e de **fluxos com mutação** (ex.: folha solicitar → aprovar) entram por camada
  conforme a D5 reescreve o PCP.
- Captura de **screenshots para o manual** e **CI/pipeline** ficam para depois do harness estável.
