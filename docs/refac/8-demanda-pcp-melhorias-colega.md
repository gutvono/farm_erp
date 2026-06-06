# Demanda 8 — PCP: Avaliar/absorver melhorias da branch do colega (parking lot)

> **Status: BACKLOG / AVALIAÇÃO.** Não é trabalho priorizado ainda. Aqui ficam registradas as
> melhorias que o colega (Ggiovani047) fez em paralelo no PCP, para a gente decidir **depois**
> se reimplementa **do nosso jeito** (alinhado ao modelo da Demanda 5) ou descarta.

## Contexto
Durante a Demanda 5 (refac do PCP), descobrimos trabalho paralelo do colega em várias branches de
PCP — a mais avançada é **`feature/pcp-recursos-op`** (recursos da OP + um fix de login). Esse
trabalho **não foi mergeado** porque:
1. **Colisão de migration:** ele criou `0018_pcp_resources` e nosso DBA criou `0018_pcp_refac`,
   ambos com `down_revision = 0017_payroll_approval` → duas heads de Alembic.
2. **Base de schema divergente:** a branch dele foi construída sobre o schema **antigo** (mantém
   `production_order_workers` nominais e as colunas de qualidade especial/superior/tradicional),
   enquanto a Demanda 5 **remove** workers (→ requisitos por cargo) e troca qualidade por **destino**
   (indústria/embalagem/descarte). Mergear quebraria em runtime.
3. **Build docker da branch dele não sobe nem o login** (confirmado pelo usuário) — o approach de
   proxy precisa de `BACKEND_URL` no container e não está wired.

Por isso: **parquear aqui** e avaliar com calma.

## O que o colega fez (resumo factual — `feature/pcp-recursos-op`)
- **Recursos da OP em 3 tabelas concretas:** `production_equipments`, `production_vehicles`,
  `production_packagings` (cada uma: `order_id`, `stock_item_id`, `quantity`; embalagem com
  `unit_cost`/`subtotal`). Relacionamentos + constraints + índices no model.
- **Integração com Configurações (D3):** valida que o item pertence ao papel correto
  (`maquina`/`veiculo`/`embalagem`) via `get_item_ids_by_role` → 400 se fora do papel.
- **Insumos restritos ao papel `insumo`** no cálculo de custo.
- **Reserva por QUANTIDADE:** disponível = `quantity_on_hand − Σ(em uso em OPs ativas)`; 409 só
  quando a demanda excede o disponível (permite o mesmo item em 2 OPs se houver unidades).
- **Custo estimado** = insumos + workers + serviços + **embalagens**. Máquina/veículo **não** entram
  no custo (são só reserva — sem horas/`hourly_cost`).
- **Fix de login no Chrome:** troca chamadas de API de URL absoluta (`NEXT_PUBLIC_API_URL`) para
  **URL relativa + rewrite proxy do Next** (`/api/* → backend`), resolvendo cookie cross-origin;
  + auth-gating no `layout.tsx` (bloqueia render até `getMe()`), `folha.ts` relativo, alias de rota
  sem barra no `dashboard/router.py`. **Exige `BACKEND_URL` no compose/Railway** (não wired → quebra).
- Mantém `random` na colheita (não tocou em determinístico/destino/pragas/hectares).

## Divergências vs. modelo da Demanda 5

| Tema | Demanda 5 (nosso) | Branch do colega |
|------|-------------------|------------------|
| Modelo de recurso | 1 tabela `production_order_resources` (papel + `accumulated_hours`) | 3 tabelas concretas, só `quantity` |
| Custo máquina/veículo | `Σ(horas × hourly_cost)` incremental null-safe | zero (só reserva) |
| Reserva | item exclusivo (não pode em 2 OPs ativas) | por quantidade (conta unidades) |
| Pessoas | requisitos por cargo (remove workers) | mantém workers nominais |
| Colheita | determinística por destino | ainda aleatória |
| Hectares / pragas / SKU / custo discriminado | sim | não tocou |

## ✅ Já absorvido
- **Reserva por quantidade → ABSORVIDA E EVOLUÍDA na Demanda 5.1.** Em vez de "reserva exclusiva" (D5)
  ou "reserva por quantidade que bloqueia no criar" (colega), a D5.1 adotou **planejar livre + ocupação
  derivada validada no INICIAR**: disponível = `on_hand − Σ(em uso em OPs INICIADAS)` para máquina/veículo
  e `headcount ativo − Σ` para pessoas por cargo; planejar nunca trava (só avisa), o `iniciar` bloqueia
  com **409**, e concluir/encerrar libera. Sem migration (somatório derivado). Cobre o caso de "frota com
  várias unidades iguais" (conta unidades via `on_hand`). Front+backend+E2E entregues na 5.1.

## Candidatos a absorver (decisão PENDENTE — avaliar quando priorizar)
1. **Login: URL relativa + proxy do Next.** Resolve o cookie cross-origin no Chrome — MAS precisa de
   `BACKEND_URL=http://backend:8000` no `docker-compose.yml` (dev) e o valor interno na **Railway**
   (prod). Reimplementar do nosso jeito **com o wiring correto** + smoke (login Chrome, módulos sem
   401-loop, `make e2e` verde). Arquivos-núcleo da referência: `frontend/lib/api.ts`,
   `frontend/next.config.mjs`, `frontend/app/(modules)/layout.tsx`, `frontend/services/folha.ts`,
   `backend/app/modules/dashboard/router.py`.
3. **`OrdemProducaoForm` dele** como referência visual da UI de recursos (não copiar — D5 reescreve).

## Decisões em aberto (a destravar com o time/colega antes de implementar)
- ~~Reserva: exclusiva (D5) vs. por quantidade (colega).~~ **RESOLVIDO na D5.1** (planejar livre +
  ocupação derivada validada no iniciar — ver "Já absorvido").
- Pessoas: a D5 já decidiu **requisitos por cargo** (remove nominais) — confirmar com o colega.
- Recurso: modelo unificado por papel (D5) vs. 3 tabelas concretas (colega).

## Branches do colega para referência
`feature/pcp-recursos-op` (a mais avançada), `feature/pcp-refac`, `feature/pcp-updates`,
`feature/pcp-bloquear-talhao`, `fix/estoque_pcp_values`. Mapear o que cada uma traz se/quando esta
demanda for priorizada.

## Critérios de aceite
A definir quando a demanda for priorizada (depende das decisões em aberto acima).

> **Sem prompts de agente por enquanto** — é parking lot. Quando priorizar, o PO gera os prompts
> reaproveitando o que fizer sentido do trabalho do colega, no modelo da Demanda 5.
