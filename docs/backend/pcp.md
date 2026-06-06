# Backend Module: PCP (Planejamento e Controle de Produção)

## Overview

Módulo responsável pela gestão de **talhões** (em hectares), atividades de campo e
**ordens de produção (OP)** de safra. A partir da Demanda 5 o modelo é realista:

- O talhão tem uma **área total em hectares**; cada OP aloca uma **fração de hectares**
  e a soma das OPs ativas não pode exceder a área do talhão.
- A mão de obra é declarada por **requisitos de cargo** (`cargo × quantidade × vínculo`),
  não por funcionários nominais.
- A OP usa **recursos de estoque** por papel de sistema: **máquinas/veículos** (recurso
  **reutilizável**, custo por hora) e **embalagens** (consumo proporcional à colheita).
- **Planejar é livre; a capacidade é checada no INICIAR** (Demanda 5.1): criar/editar uma OP
  não tem teto — só valida existência/papel/quantidade. O bloqueio por capacidade real
  (recursos reutilizáveis e pessoas por cargo) acontece ao **iniciar** a produção. A ocupação é
  **derivada** do somatório das OPs já iniciadas (sem boolean de "ocupado", sem migration).
- Os **insumos** da OP ficam restritos a itens com o papel `insumo`.
- A colheita é **determinística por destino** — o usuário informa **sacas por destino**
  (Indústria/Embalagem/Descarte), que entram em 3 itens-destino configuráveis. Não há mais
  aleatoriedade nem distribuição por qualidade (Especial/Superior/Tradicional).
- **Pragas:** é possível **encerrar a OP antes de 100%** com motivo; a área restante volta a
  ficar livre para uma nova OP.
- Os **custos** são **discriminados por tipo**: insumos / pessoal / máquinas-veículos /
  embalagens / serviços.

## Arquitetura

```
router.py → service.py → repository.py → PostgreSQL
```

Integra com: **Estoque** (baixa de insumos/embalagens, entrada do café por destino),
**Financeiro** (movimentos de produção e contas a pagar de serviços externos),
**Folha** (`job_positions.base_salary` para o custo de pessoal) e **Configurações**
(papéis `insumo`/`maquina`/`veiculo`/`embalagem` e os 3 itens-destino da colheita).

## Endpoints

Todos exigem autenticação via cookie `session_token` (dependency `get_current_user`).

### Talhões

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/pcp/talhoes` | Lista talhões |
| `POST` | `/api/pcp/talhoes` | Cria talhão (**`total_hectares` obrigatório, > 0**) |
| `GET` | `/api/pcp/talhoes/{id}` | Detalhe do talhão |
| `PUT` | `/api/pcp/talhoes/{id}` | Atualiza talhão |
| `DELETE` | `/api/pcp/talhoes/{id}` | Soft delete |

### Atividades

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/pcp/atividades` | Lista atividades (filtro: `plot_id`) |
| `POST` | `/api/pcp/atividades` | Registra atividade |

### Recursos e insumos disponíveis (selects do front)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/pcp/insumos-disponiveis` | Itens com papel `insumo` (elegíveis como insumo da OP) |
| `GET` | `/api/pcp/recursos-disponiveis?role=maquina\|veiculo\|embalagem` | Itens do papel, **cada um com `available_quantity`** (= saldo − Σ em OPs iniciadas, p/ reutilizáveis; saldo em estoque p/ embalagem). Nada é ocultado |
| `GET` | `/api/pcp/cargos-disponiveis` | Cargos com `total_headcount`, `used` e `available_quantity` (headcount ativo − Σ em OPs iniciadas) |

> O front também pode reusar `GET /api/estoque/itens?role=insumo`. A escolha do PCP foi
> expor endpoints dedicados (`/insumos-disponiveis`, `/recursos-disponiveis`,
> `/cargos-disponiveis`) para já entregar a **disponibilidade derivada** (`available_quantity`)
> que o front mostra ao planejar/iniciar. Itens/cargos **lotados aparecem com disponível 0** (não
> são ocultados) — planejar é livre; o bloqueio é no iniciar.

### Ordens de Produção

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/pcp/ordens` | Lista ordens (filtro: `status`) |
| `POST` | `/api/pcp/ordens` | Cria OP planejada com hectares, insumos, requisitos de cargo, recursos e serviços; gera `order_number` e calcula `estimated_cost` |
| `GET` | `/api/pcp/ordens/{id}` | Detalhe (inputs, harvests, requisitos, recursos, serviços) — itens com **SKU** |
| `PUT` | `/api/pcp/ordens/{id}` | Atualiza campos editáveis e **soma horas** aos recursos (incremental, null-safe); recalcula custos |
| `POST` | `/api/pcp/ordens/{id}/iniciar` | Inicia a produção (`planejada → em_execucao`); cria `accounts_payable` para cada serviço externo |
| `POST` | `/api/pcp/ordens/{id}/colher` | Registra colheita por destino (ver schema) |
| `POST` | `/api/pcp/ordens/{id}/encerrar` | **Encerra por praga** antes de 100% (body `{ reason }`) |
| `DELETE` | `/api/pcp/ordens/{id}` | Soft delete (apenas `planejada`) |

### Relatórios

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/pcp/relatorios` | Consolidado: produção por talhão (por destino), consumo de insumos, resumo de status, custo previsto vs realizado (**com custo realizado discriminado**) e **custo da safra discriminado** |

> **Removidos na Demanda 5:** `GET /api/pcp/ordens/funcionarios-em-producao` e
> `POST /api/pcp/ordens/{id}/produzir` (dependia da colheita aleatória).

## Schemas

### PlotCreate / PlotUpdate / PlotOut
`total_hectares` é obrigatório (> 0) no create; opcional (> 0) no update; sempre presente no out.

```json
{ "name": "Talhão C", "variety": "Catuaí", "capacity_sacas": "100", "total_hectares": "20" }
```

### ProductionOrderCreate
```json
{
  "plot_id": "uuid",
  "hectares_used": "120",
  "start_date": "2026-06-01",
  "expected_end_date": "2026-06-23",
  "inputs": [{ "stock_item_id": "uuid-insumo", "quantity": "100" }],
  "position_requirements": [
    { "position_id": "uuid-cargo", "quantity": 2, "contract_type": "clt" }
  ],
  "resources": [
    { "stock_item_id": "uuid-maquina", "resource_role": "maquina", "hours": "4" },
    { "stock_item_id": "uuid-embalagem", "resource_role": "embalagem", "quantity": "40" }
  ],
  "services": [
    { "supplier_id": "uuid", "description": "Colheita terceirizada", "amount": "3500", "due_date": "2026-06-20" }
  ]
}
```

- `hectares_used` > 0; `contract_type` ∈ `clt|pj|temporario`; `resource_role` ∈ `maquina|veiculo|embalagem`.
- Para **máquina/veículo** use `hours` (horas iniciais, incremental); `quantity` é ignorada.
- Para **embalagem** use `quantity` (> 0, obrigatória); `hours` é ignorada.

### ProductionOrderUpdate (`PUT /ordens/{id}`)
```json
{
  "notes": "obs",
  "resource_hours": [{ "resource_id": "uuid-recurso", "hours": "3" }]
}
```
`hours` informado é **somado** ao `accumulated_hours` do recurso; `hours` nulo/omisso **não altera**.

### HarvestCreate (`POST /ordens/{id}/colher`)
```json
{
  "percentage_harvested": "50",
  "sacks_industria": "60",
  "sacks_embalagem": "30",
  "sacks_descarte": "10",
  "resource_hours": [{ "resource_id": "uuid", "hours": "2" }]
}
```
- `percentage_harvested` ∈ (0, 100]; a soma das sacas dos 3 destinos deve ser **> 0**.
- `resource_hours` (opcional) soma horas às máquinas/veículos nesta colheita (mesma regra null-safe).

### ProductionOrderOut (campos relevantes)
`hectares_used`, `industria_sacas`/`embalagem_sacas`/`descarte_sacas`, `harvest_progress`,
`estimated_cost`, `realized_cost`, `early_closed_reason`, e as listas `inputs` (com `sku`),
`position_requirements` (com `position_name`/`base_salary`), `resources`
(com `sku`, `accumulated_hours`, `hourly_cost`, `cost`), `harvests` (com `hectares_harvested`),
`services`.

## Fluxos de negócio (passo a passo)

### Criar OP (`POST /ordens`)
1. Valida o talhão (404 se inexistente).
2. **Hectares (P2):** `Σ(hectares_used das OPs ativas do talhão) + novo ≤ plot.total_hectares`,
   senão **400** informando o disponível.
3. **Insumos:** cada `stock_item_id` deve existir e pertencer ao papel `insumo` (senão **400**).
4. **Requisitos de cargo (P3):** valida cada `position_id` (404).
5. **Recursos (P4):** cada item deve pertencer à categoria do papel informado (senão **400**);
   `quantity > 0` (máquina/veículo default 1; embalagem obrigatória). **Planejar é livre — sem
   reserva exclusiva e sem teto de capacidade aqui** (Demanda 5.1).
6. **Serviços:** valida cada `supplier_id` (404).
7. Persiste a OP em `planejada`, gera `order_number` e calcula `estimated_cost` (ver custos).

### Iniciar (`POST /ordens/{id}/iniciar`) — bloqueio por capacidade (Demanda 5.1)
1. Exige status `planejada` (400 caso contrário). **Não há trava de "uma produção por talhão"**:
   o mesmo talhão pode ter várias OPs em andamento dentro do limite de hectares (validado no criar).
2. **Capacidade real (409):** para cada **recurso reutilizável** (máquina/veículo) e cada
   **cargo** requisitado, valida `requerido ≤ disponível`, onde
   `disponível = TOTAL − Σ(quantity do mesmo item/cargo em OPs JÁ INICIADAS)`. `TOTAL`: item =
   `quantity_on_hand`; cargo = nº de funcionários ativos com aquele `position_id`. A própria OP
   está planejada, então **não conta contra si mesma**. Se faltar capacidade, retorna **409**
   listando cada item/cargo com o requerido e o disponível.
3. `planejada → em_execucao`; define `start_date` se vazio; cria **conta a pagar** para cada
   serviço externo (grava `accounts_payable_id`).

> **Consumíveis (insumo/embalagem) NÃO bloqueiam no iniciar** — planejar e iniciar são livres
> para eles; o controle é a baixa de estoque no `/colher` (passo abaixo). A liberação de recursos/
> pessoas é automática: ao concluir/encerrar, a OP sai do conjunto "iniciada" e some do somatório.

### Colher (`POST /ordens/{id}/colher`)
1. Bloqueia OP `concluida`/`cancelada` (400) e valida `harvest_progress + pct ≤ 100`.
2. Calcula consumo proporcional (`× pct/100`) de **insumos** e **embalagens** e **valida saldo —
   barra com 400 se o estoque atual não cobrir a quantidade a consumir** (nunca deixa estoque
   negativo).
3. Valida que há item-destino configurado para cada destino com sacas > 0 (senão **400**).
4. **Baixa** insumos e embalagens do Estoque; registra **entrada** das sacas nos 3 itens-destino.
5. Aplica `resource_hours` (incremental, null-safe).
6. Cria `ProductionHarvest` com `hectares_harvested = hectares_used × pct/100`; acumula sacas e
   progresso na OP.
7. Ao atingir **100%**: OP → `concluida`, `executed_at` preenchido, calcula `realized_cost` e
   registra o movimento financeiro do custo realizado.

### Encerrar por praga (`POST /ordens/{id}/encerrar`)
Marca a OP `concluida` mesmo com `harvest_progress < 100`, grava `early_closed_reason`,
preenche `executed_at` e calcula `realized_cost` (proporcional ao colhido + custos fixos).
A OP deixa de ser "iniciada", **liberando** os recursos reutilizáveis e as pessoas (somem do
somatório de ocupação) e a **área restante** para uma nova OP no mesmo talhão (validada pela regra
de hectares). Não consome o restante dos insumos.

## Máquina de estados / status (`production_order_status`)

| Status | Significado | Transições |
|--------|-------------|------------|
| `planejada` | Criada, ainda não iniciada | → `em_execucao` (iniciar) ; pode ser excluída (soft delete) ; → `concluida` (encerrar) |
| `em_execucao` | Em produção | → `concluida` (colheita atinge 100% ou encerrar) |
| `em_producao` / `pausada` | Estados intermediários legados (contam como **ativos**) | → `concluida` |
| `concluida` | **Final/irreversível** — safra colhida ou encerrada por praga | — |
| `cancelada` | **Final/irreversível** | — |

> **Ativos** (contam para o controle de hectares do talhão): `planejada`, `em_producao`,
> `em_execucao`, `pausada`.
>
> **Iniciados** (ocupam capacidade de recursos reutilizáveis e pessoas — Demanda 5.1):
> `em_producao`, `em_execucao`, `pausada`. **`planejada` NÃO ocupa** (planejar é livre);
> `concluida`/`cancelada` liberam.

## Custos (discriminados por tipo)

| Tipo | Fórmula |
|------|---------|
| **Insumos** | `Σ(input.subtotal)` (realizado: `× progresso/100`) |
| **Pessoal** | `Σ(quantity × job_position.base_salary / 22 × max(1, dias))`, `dias = fim − início` |
| **Máquinas/Veículos** | `Σ(accumulated_hours × stock_item.hourly_cost)` (`hourly_cost` nulo = 0) |
| **Embalagens** | `Σ(quantity × unit_cost)` (realizado: `× progresso/100`) |
| **Serviços** | `Σ(service.amount)` |

- **`estimated_cost`** (na criação/atualização): usa fração 100%, datas `start_date → expected_end_date`.
- **`realized_cost`** (no fechamento/encerramento): usa `progresso/100` para insumos/embalagens,
  `start_date → executed_at` para pessoal, e as horas acumuladas reais para máquinas.
- O relatório expõe `custo_realizado_discriminado` por OP e `custo_safra_discriminado` agregado.

## Integrações entre módulos

- **Estoque:** `registrar_saida` (insumos/embalagens) e `registrar_entrada` (sacas por destino);
  `verificar_disponibilidade` antes de baixar.
- **Financeiro:** `registrar_movimento` (consumo, café produzido e custo realizado — inclusive R$ 0,00)
  e `criar_conta_pagar` (serviços externos, no iniciar).
- **Folha:** `job_positions.base_salary` (via `folha_repo.get_position`) para o custo de pessoal.
- **Configurações:** `get_item_ids_by_role` (insumo/maquina/veiculo/embalagem) e
  `get_harvest_destination_item_ids` (Indústria/Embalagem/Descarte).

## Regras de negócio (travadas)

- **Hectares (único constraint de terra):** soma das OPs ativas ≤ `total_hectares` do talhão
  (validado no criar). **Várias OPs por talhão são válidas** dentro desse limite — inclusive
  várias em andamento ao mesmo tempo (não há trava de "uma produção por talhão").
- **Planejar livre × bloquear no iniciar (5.1):** criar/editar não tem teto de capacidade nem
  reserva; o **iniciar** bloqueia (409) por **capacidade derivada** dos recursos **reutilizáveis**
  (máquina/veículo — `disponível = on_hand − Σ em OPs iniciadas`, não baixam estoque) e das
  **pessoas por cargo** (`disponível = headcount ativo − Σ em OPs iniciadas`). Ocupação derivada,
  sem boolean, sem migration; pessoas seguem **anônimas por cargo**.
- **Reutilizável × consumível:** máquina/veículo **ocupam** capacidade enquanto a OP está iniciada
  (e liberam ao concluir/encerrar); insumo/embalagem são **consumidos** — não bloqueiam no iniciar,
  mas a baixa no `/colher` **barra (400)** se o estoque atual não cobrir o consumo (nunca negativo).
- **Embalagem = consumo:** baixa do estoque proporcional à colheita.
- **Insumos restritos ao papel `insumo`.**
- **Horas incrementais (null-safe):** todo dado "alimentado durante a produção" (horas) é somado;
  campo nulo no update **preserva** o acumulado (espelha o `percentage_harvested`, que acumula).
- **Colheita determinística por destino** (sem aleatoriedade): as sacas informadas entram nos 3
  itens-destino configurados.
- **Status finais** `concluida`/`cancelada` são irreversíveis.

## Limitações conhecidas / Débito técnico

- **Encerramento de OP planejada:** se uma OP for encerrada antes de ser iniciada, os serviços
  externos ainda não geraram conta a pagar (as APs são criadas no `iniciar`); o `realized_cost`
  ainda soma os serviços contratados. Avaliar gerar/cancelar as APs no encerramento.
- **`realized_cost` do seed:** OPs do seed têm `realized_cost = 0` (não populado), enquanto o
  relatório calcula o `custo_realizado_discriminado` ao vivo a partir do estado atual — os dois
  podem divergir para dados de seed.
- O custo de pessoal usa `job_position.base_salary` (sugestão do cargo), não o salário efetivo do
  funcionário (a OP não nomeia funcionários — é por requisito de cargo).
