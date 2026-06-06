# Coffee Farm ERP — Documentação do Schema

## Visão Geral

O banco de dados do Coffee Farm ERP é modelado em PostgreSQL, acessado via
SQLAlchemy 2.0, com migrações via Alembic. Todas as tabelas seguem os
mesmos padrões de chave primária, auditoria e, quando aplicável, soft delete.

---

## Padrões Globais

### Tipos e campos obrigatórios

Todas as tabelas aplicam estes mixins (definidos em `app/shared/base_model.py`):

- **`UUIDMixin`** — `id UUID PRIMARY KEY` (gerado via `uuid4()`).
- **`TimestampMixin`** — `created_at` e `updated_at` `TIMESTAMPTZ` preenchidos
  automaticamente pelo banco (`NOW()`), com `onupdate` em `updated_at`.
- **`SoftDeleteMixin`** — `deleted_at TIMESTAMPTZ NULL` (apenas tabelas de
  negócio). Consultas normais **devem** filtrar `deleted_at IS NULL`.

### Nomenclatura

| Elemento | Padrão | Exemplo |
|----------|--------|---------|
| Tabelas | plural snake_case | `stock_items`, `accounts_payable` |
| Colunas | snake_case | `total_amount`, `hire_date` |
| FKs | `<entidade>_id` | `client_id`, `stock_item_id` |
| Índices FK | automáticos (via `index=True`) | — |

### Enums

Definidos em `app/shared/enums.py` como subclasses de `(str, enum.Enum)`, são
materializados como tipos `ENUM` nativos do PostgreSQL. O helper `sa_enum_values`
garante que o banco armazene o valor **lowercase** (`.value`) do membro, não o
nome do enum.

### Monetário e quantidades

- Valores em reais: `NUMERIC(12, 2)` (até R$ 9.999.999.999,99).
- Quantidades: `NUMERIC(12, 3)` — suporta três casas decimais para unidades
  como sacas, litros e kg.

### Soft Delete vs Hard Delete

| Tabela | Soft delete | Observação |
|--------|-------------|------------|
| `users`, `clients`, `suppliers`, `employees`, `job_positions` | ✅ | entidades cadastrais |
| `stock_items`, `plots`, `stock_categories` | ✅ | cadastros base |
| `sales`, `purchase_orders`, `invoices`, `accounts_payable`, `accounts_receivable`, `production_orders`, `plot_activities`, `payroll_periods`, `payroll_events`, `payroll_payment_requests` | ✅ | operações de negócio e catálogos |
| `sale_items`, `purchase_order_items`, `purchase_order_receipts`, `invoice_items`, `production_inputs`, `production_order_position_requirements`, `production_order_resources`, `production_order_services`, `production_harvests`, `payroll_entries`, `payroll_entry_items`, `payroll_payment_request_entries` | ❌ | itens filhos (cascateados pelo pai) |
| `stock_movements`, `financial_movements` | ❌ | ledger imutável — auditoria |
| `category_role_assignments` | ❌ | tabela de ligação M:N (hard delete; CASCADE da categoria) |
| `app_settings` | ❌ | key-value de configuração |
| `notifications` | ❌ | efêmeras por design |

---

## Tabelas por Módulo

### Auth

#### `users`
Usuários do sistema com autenticação por senha (bcrypt).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `email` | `VARCHAR(255)` UNIQUE | Login único |
| `name` | `VARCHAR(255)` | Nome de exibição |
| `hashed_password` | `VARCHAR(255)` | Hash bcrypt |
| `is_admin` | `BOOLEAN` | Acesso total |
| `is_active` | `BOOLEAN` | Ativo para login |

---

### Notifications (shared)

#### `notifications`
Notificações persistidas exibidas no sino do header.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `type` | ENUM `notification_type` | `info` \| `warning` \| `error` \| `success` |
| `title` | `VARCHAR(255)` | Título curto |
| `message` | `VARCHAR(1000)` | Mensagem completa |
| `module` | `VARCHAR(50)` | Módulo de origem |
| `link` | `VARCHAR(500)` | Rota frontend opcional |
| `is_read` | `BOOLEAN` | Status lida/não lida |
| `user_id` | FK `users.id` (nullable) | Destinatário (NULL = broadcast) |

---

### Comercial

#### `clients`
Clientes compradores de café.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `name` | `VARCHAR(255)` | Razão social / nome |
| `document` | `VARCHAR(32)` | CPF ou CNPJ |
| `email`, `phone`, `address` | `VARCHAR` | Contato |
| `is_delinquent` | `BOOLEAN` | Inadimplência (definida no cancelamento de AR) |
| `notes` | `TEXT` | Observações |

#### `sales`
Vendas realizadas. Segue fluxo `realizada → entregue → cancelada`.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `client_id` | FK `clients.id` | Cliente comprador |
| `status` | ENUM `sale_status` | `realizada` \| `entregue` \| `cancelada` |
| `total_amount` | `NUMERIC(12,2)` | Soma dos itens |
| `sold_at` | `TIMESTAMPTZ` | Data da venda |
| `delivered_at` | `TIMESTAMPTZ` NULL | Data de entrega |
| `installments` | `INTEGER` default 1 | Número de parcelas |
| `first_due_date` | `DATE` NULL | Vencimento da primeira parcela |
| `installment_interval_days` | `INTEGER` default 30 | Intervalo entre parcelas (dias) |
| `payment_method` | ENUM `payment_method` NULL | Forma de pagamento (`a_vista`, `parcelado`, `pix`, `boleto`) |

#### `sale_items`
Itens de uma venda.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `sale_id` | FK `sales.id` (CASCADE) | Venda pai |
| `stock_item_id` | FK `stock_items.id` | Produto vendido |
| `quantity` | `NUMERIC(12,3)` | Quantidade |
| `unit_price` | `NUMERIC(12,2)` | Preço unitário |
| `subtotal` | `NUMERIC(12,2)` | Subtotal |

---

### Compras

#### `suppliers`
Fornecedores de insumos, café verde e equipamentos.

#### `purchase_orders`
Ordens de compra. Fluxo expandido:
`em_andamento → aguardando_aprovacao_financeiro → aprovada → em_conferencia → aguardando_pagamento → concluida → cancelada`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `supplier_id` | FK `suppliers.id` | Fornecedor |
| `status` | ENUM `purchase_order_status` | Estado da ordem |
| `total_amount` | `NUMERIC(12,2)` | Valor total dos itens pedidos |
| `receipt_total_amount` | `NUMERIC(10,2)` | Valor total dos itens aceitos na conferência |
| `financial_approval_note` | `TEXT` NULL | Motivo de recusa pelo financeiro |
| `ordered_at`, `received_at` | `TIMESTAMPTZ` | Datas |
| `installments` | `INTEGER` default 1 | Número de parcelas |
| `first_due_date` | `DATE` NULL | Vencimento da primeira parcela |
| `installment_interval_days` | `INTEGER` default 30 | Intervalo entre parcelas (dias) |
| `order_type` | `VARCHAR(10)` default `produto` | Tipo: `produto` \| `servico` |
| `service_description` | `TEXT` NULL | Descrição do serviço (preenchida quando `order_type = servico`) |
| `payment_method` | ENUM `payment_method` NULL | Forma de pagamento definida na aprovação financeira |

**Novos valores do enum `purchase_order_status` (migration 0004):**
- `aguardando_aprovacao_financeiro` — aguardando análise do setor financeiro
- `aprovada` — aprovada pelo financeiro
- `em_conferencia` — recebimento físico em conferência
- `aguardando_pagamento` — conferência concluída, aguardando pagamento

#### `purchase_order_items`
Itens da ordem (CASCADE no pai).

#### `purchase_order_receipts`
Conferência de recebimento por item da ordem. Criada durante a etapa `em_conferencia`.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `purchase_order_id` | FK `purchase_orders.id` (CASCADE) | Ordem pai |
| `purchase_order_item_id` | FK `purchase_order_items.id` (CASCADE) | Item conferido |
| `quantity_ordered` | `NUMERIC(10,3)` | Quantidade pedida (cópia do item) |
| `quantity_accepted` | `NUMERIC(10,3)` default 0 | Quantidade aceita na conferência |
| `quantity_rejected` | `NUMERIC(10,3)` default 0 | Quantidade recusada |
| `rejection_reason` | `TEXT` NULL | Motivo da recusa |
| `status` | ENUM `purchase_order_receipt_status` | `pendente` \| `conferido` |

---

### Estoque

#### `stock_items`
Itens de estoque (café, insumos, veículos, equipamentos).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `sku` | `VARCHAR(64)` UNIQUE | Código interno |
| `category_id` | `UUID` FK → `stock_categories.id` (`fk_stock_items_category`, índice `ix_stock_items_category_id`) | Categoria do item (NOT NULL). Um item tem **uma** categoria (D2) |
| `unit` | ENUM `stock_unit` | `saca` \| `litro` \| `kg` \| `unidade` |
| `minimum_stock` | `NUMERIC(12,3)` | Gatilho de alerta |
| `unit_cost` | `NUMERIC(12,2)` | Custo médio por unidade |
| `hourly_cost` | `NUMERIC(10,2)` NULL | Custo por hora (para itens como mão de obra e máquinas) |
| `quantity_on_hand` | `NUMERIC(12,3)` | Saldo atual (denormalizado; ledger é `stock_movements`) |

##### Relacionamentos
- `stock_items.category_id → stock_categories.id` (N:1) — a categoria do item.

#### `stock_movements`
Ledger imutável de entradas/saídas de estoque.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `stock_item_id` | FK `stock_items.id` | Item |
| `movement_type` | ENUM `stock_movement_type` | `entrada` \| `saida` |
| `quantity` | `NUMERIC(12,3)` | Quantidade |
| `unit_cost`, `total_value` | `NUMERIC(12,2)` | Valor da movimentação |
| `source_module`, `reference_id` | `VARCHAR`, `UUID` | Rastreabilidade |
| `occurred_at` | `TIMESTAMPTZ` | Quando ocorreu |

---

### Configurações (Estoque/Sistema)

Módulo introduzido na Demanda 3 (decisões D2 e D3). As categorias de estoque
deixam de ser um enum fixo e viram tabela cadastrável pelo usuário; um mapeamento
M:N categoria→papel de sistema permite que PCP/Comercial continuem "entendendo" o
que é máquina/veículo/insumo/etc.; e um key-value guarda configurações globais.

#### `stock_categories`
Categorias de estoque cadastráveis (entidade de negócio → soft delete). Substituem
o enum `stock_category`.

| Coluna | Tipo | Nulo? | Default | Significado (negócio) |
|--------|------|-------|---------|-----------------------|
| `id` | `UUID` PK | não | — | Identificador da categoria |
| `name` | `VARCHAR(120)` UNIQUE | não | — | Nome (ex.: "Café", "Insumo") |
| `description` | `TEXT` | sim | — | Descrição livre |
| `is_active` | `BOOLEAN` | não | true | Disponível para uso |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | não | `now()` | Auditoria |
| `deleted_at` | `TIMESTAMPTZ` | sim | — | **Soft delete** (NULL = ativa) |

Índices: `ix_stock_categories_name` (UNIQUE), `ix_stock_categories_deleted_at`.

#### `category_role_assignments`
Mapeamento **M:N** categoria ↔ papel de sistema. Tabela de ligação (sem soft
delete). Uma categoria pode ter **vários** papéis (ex.: "Café" → `produto_final`
**e** `produto_vendavel`).

| Coluna | Tipo | Nulo? | Significado (negócio) |
|--------|------|-------|-----------------------|
| `id` | `UUID` PK | não | Identificador |
| `category_id` | `UUID` FK → `stock_categories.id` (`fk_cra_category`, **ON DELETE CASCADE**) | não | Categoria |
| `role` | ENUM `system_role` | não | Papel atribuído (ver enum abaixo) |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | não | Auditoria |

Constraint: `uq_category_role` UNIQUE (`category_id`, `role`) — impede papel
duplicado na mesma categoria. Índices: `ix_category_role_assignments_category_id`,
`ix_category_role_assignments_role`.

**Enum `system_role`** (vocabulário fixo de papéis; ordem dos valores no tipo
Postgres): `maquina`, `veiculo`, `embalagem`, `insumo`, `produto_final`,
`produto_inacabado`, `produto_descartado`, `produto_vendavel`. Consumido por
PCP/Comercial para interpretar os itens de cada categoria.

Papéis default semeados pela migration 0015: Café → `produto_final` +
`produto_vendavel`; Insumo → `insumo`; Veículo → `veiculo`; Equipamento →
`maquina`; Outro → (nenhum). O seed acrescenta Outro → `produto_descartado`
(para hospedar o item-destino de Descarte da colheita — ver `app_settings`).

#### `app_settings`
Configuração **key-value** (sem soft delete). Guarda configurações globais; nesta
demanda, os 3 itens-destino da colheita (D1).

| Coluna | Tipo | Nulo? | Significado (negócio) |
|--------|------|-------|-----------------------|
| `id` | `UUID` PK | não | Identificador |
| `key` | `VARCHAR(100)` UNIQUE | não | Chave da configuração |
| `value` | `VARCHAR(500)` | sim | Valor (ex.: UUID de um `stock_item` como texto) |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | não | Auditoria |

Índice: `ix_app_settings_key` (UNIQUE). Chaves desta demanda:
`harvest_destination_industria_item_id`, `harvest_destination_embalagem_item_id`,
`harvest_destination_descarte_item_id` → cada uma aponta (por `value` = UUID em
texto, **sem FK**) para o `stock_item` que recebe a produção daquele destino.

---

### Faturamento

#### `invoices`
Faturas emitidas (automáticas ou avulsas). Fluxo `emitida → paga → cancelada`.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `number` | `VARCHAR(32)` UNIQUE | Número sequencial |
| `client_id` | FK `clients.id` NULL | Cliente (NULL em NFs de recebimento/devolução) |
| `sale_id` | FK `sales.id` NULL | Venda de origem |
| `issue_date`, `due_date` | `DATE` | Datas |
| `total_amount` | `NUMERIC(12,2)` | Total |
| `invoice_type` | `VARCHAR(50)` default `venda` | Tipo: `venda`, `recebimento`, `transporte`, `devolucao`, `folha_pagamento` (NF de folha, Demanda 4). Indexado (`idx_invoices_invoice_type`) para o despacho do cancelamento |
| `installment_number` | `INTEGER` NULL | Número desta parcela (ex.: 2) |
| `installment_total` | `INTEGER` NULL | Total de parcelas (ex.: 3) |
| `parent_invoice_id` | FK `invoices.id` NULL | Fatura-pai em parcelamentos (indexado `ix_invoices_parent_invoice_id`, usado para achar a cadeia parcelada) |
| `cancelled_at` | `TIMESTAMPTZ` NULL | Quando a NF foi cancelada (auditoria do estorno) |
| `cancellation_reason` | `TEXT` NULL | Motivo/observação do cancelamento |

> **Cancelamento (Demanda 1, migration `0012_invoice_cancel_fields`):** `cancelled_at`
> e `cancellation_reason` auditam o cancelamento com estorno. São **distintos** de
> `deleted_at` (soft delete) — o cancelamento mantém a NF visível com `status = cancelada`.
> Nenhuma tabela nova foi necessária: os estornos reusam `financial_movements`,
> `stock_movements` e `stock_items` (item AVARIADO).

#### `invoice_items`
Itens da fatura (CASCADE).

---

### Financeiro

#### `financial_movements`
Ledger imutável de todas as movimentações financeiras. Saldo da conta corrente
é `SUM(entrada) - SUM(saida)`.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `movement_type` | ENUM `financial_movement_type` | `entrada` \| `saida` |
| `category` | ENUM `financial_category` | venda, compra, folha, produção, ajuste, recebimento, pagamento, saldo_inicial, outro |
| `amount` | `NUMERIC(12,2)` | Valor (pode ser 0 para registros sem impacto) |
| `source_module`, `reference_id` | Rastreabilidade |
| `occurred_at` | `TIMESTAMPTZ` | Data efetiva |

#### `accounts_payable`
Contas a pagar. Status: `em_aberto → paga → cancelada`.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `installment_number` | `INTEGER` NULL | Número desta parcela |
| `installment_total` | `INTEGER` NULL | Total de parcelas |
| `payment_method` | ENUM `payment_method` NULL | Forma de pagamento utilizada |

#### `accounts_receivable`
Contas a receber. Status: `em_aberto → quitado | parcialmente_pago → cancelada`.
O cancelamento por inadimplência marca `clients.is_delinquent = TRUE`.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `installment_number` | `INTEGER` NULL | Número desta parcela |
| `installment_total` | `INTEGER` NULL | Total de parcelas |
| `payment_method` | ENUM `payment_method` NULL | Forma de pagamento utilizada |

---

### Folha

#### `job_positions`
Cargos cadastráveis da folha (entidade de negócio → soft delete). Substituem o
antigo texto livre `employees.role`. O PCP (Demanda 5) usará esta entidade para
pedir "X funcionários do cargo Y" — a contagem por cargo sai de
`COUNT(employees) GROUP BY position_id` (relação 1:N, **não** M:N).

| Coluna | Tipo | Nulo? | Default | Significado (negócio) |
|--------|------|-------|---------|-----------------------|
| `id` | `UUID` PK | não | — | Identificador do cargo |
| `name` | `VARCHAR(120)` UNIQUE | não | — | Nome do cargo (ex.: "Gerente Agrícola") |
| `description` | `TEXT` | sim | — | Descrição livre do cargo |
| `base_salary` | `NUMERIC(12,2)` | não | 0 | Salário base **sugerido**: prefilla `employees.base_salary` na criação do funcionário (editável; o valor efetivo fica no funcionário e pode divergir) |
| `is_active` | `BOOLEAN` | não | true | Cargo disponível para uso |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | não | `now()` | Auditoria |
| `deleted_at` | `TIMESTAMPTZ` | sim | — | **Soft delete** (NULL = ativo) |

Índices/constraints: `ix_job_positions_name` (UNIQUE — unicidade e busca por nome),
`ix_job_positions_deleted_at` (filtro de soft delete).

#### `employees`
Funcionários. Contratos: CLT, PJ, Temporário.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `document` | `VARCHAR(32)` UNIQUE | CPF |
| `position_id` | `UUID` FK → `job_positions.id` (`fk_employees_position`, índice `ix_employees_position_id`) | Cargo do funcionário (NOT NULL). Um funcionário tem **um** cargo por vez |
| `contract_type` | ENUM `contract_type` | `clt` \| `pj` \| `temporario` |
| `base_salary` | `NUMERIC(12,2)` | Salário base (efetivo; prefillado a partir do cargo na criação) |
| `hire_date`, `termination_date` | `DATE` | Admissão e demissão |
| `photo_path` | `VARCHAR(500)` | Caminho em `/uploads` |
| `is_active` | `BOOLEAN` | Ativo (FALSE após demissão) |

##### Relacionamentos
- `employees.position_id → job_positions.id` (N:1) — o cargo do funcionário.
  Contagem por cargo (uso do PCP): `COUNT(employees) GROUP BY position_id`.

#### `payroll_periods`
Competências mensais. UNIQUE (`competency_year`, `competency_month`).
Status: `aberta → fechada`.

#### `payroll_entries`
Lançamentos por funcionário/competência. UNIQUE
(`payroll_period_id`, `employee_id`). Status (`payroll_entry_status`):
`pendente → aguardando_aprovacao → pago` (volta a `pendente` na recusa da
aprovação financeira — Demanda 4). O valor `aguardando_aprovacao` foi adicionado
ao enum na migration 0017.

Fórmula do `net_amount`:
```
net = base_salary + extras_value - absences_value - deductions_value
```

Quando o holerite possui itens detalhados, `payroll_entries` mantém esses campos
como agregados de compatibilidade e o líquido passa a ser recalculado por eventos:

```
net = max(0, soma(proventos que afetam líquido) - soma(descontos que afetam líquido))
```

#### `payroll_events`
Catálogo de eventos usados nos holerites.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `description` | `VARCHAR(255)` UNIQUE | Nome do evento |
| `event_type` | ENUM `payroll_event_type` | `provento` \| `desconto` \| `informativo` |
| `calculation_type` | ENUM `payroll_calculation_type` | `manual`, `overtime`, `night_shift`, `inss`, `fgts`, `transport_voucher` |
| `is_automatic` | `BOOLEAN` | Calculado pelo sistema |
| `affects_net` | `BOOLEAN` | Entra no cálculo do líquido |
| `is_active` | `BOOLEAN` | Disponível para lançamento |

Eventos padrão: Salario base, Hora extra, Adicional noturno, INSS,
Vale transporte, FGTS e Descontos manuais.

#### `payroll_entry_items`
Itens de folha por holerite. UNIQUE (`payroll_entry_id`, `payroll_event_id`).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `payroll_entry_id` | `UUID` FK | Holerite |
| `payroll_event_id` | `UUID` FK | Evento |
| `amount` | `NUMERIC(12,2)` | Valor do item, `CHECK amount >= 0` |
| `calculation_base` | `NUMERIC(12,2)` NULL | Base usada no cálculo |
| `quantity` | `NUMERIC(12,4)` NULL | Horas/quantidade |
| `percentage` | `NUMERIC(7,2)` NULL | Percentual aplicado |
| `metadata` | `JSONB` | Parâmetros específicos, ex.: horário noturno |
| `source` | ENUM `payroll_item_source` | `manual` \| `automatic` |

#### `payroll_payment_requests`
Solicitação de aprovação de pagamento de folha (Demanda 4 / D6 — entidade de
negócio → soft delete). Pagar funcionário(s) deixa de sair direto da conta: gera
uma solicitação que aparece na aba *Aprovações* do Financeiro (igual a uma
compra). Só após a aprovação o dinheiro sai e é emitida 1 NF de folha por
funcionário.

| Coluna | Tipo | Nulo? | Default | Significado (negócio) |
|--------|------|-------|---------|-----------------------|
| `id` | `UUID` PK | não | — | Identificador da solicitação |
| `payroll_period_id` | `UUID` FK → `payroll_periods.id` | não | — | Competência da folha |
| `request_type` | `VARCHAR(20)` | não | — | `individual` (um holerite) \| `lote` (vários) |
| `status` | `VARCHAR(40)` (texto, não enum) | não | `aguardando_aprovacao_financeiro` | `aguardando_aprovacao_financeiro` → `aprovada` \| `recusada` |
| `total_amount` | `NUMERIC(12,2)` | não | 0 | Valor total solicitado |
| `approval_note` | `TEXT` | sim | — | Observação/motivo (ex.: recusa) |
| `requested_at` | `TIMESTAMPTZ` | não | `now()` | Quando a solicitação foi criada |
| `decided_at` | `TIMESTAMPTZ` | sim | — | Quando o Financeiro decidiu |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | não | `now()` | Auditoria |
| `deleted_at` | `TIMESTAMPTZ` | sim | — | **Soft delete** (NULL = ativa) |

FK: `payroll_payment_requests_payroll_period_id_fkey`. Índices:
`ix_payroll_payment_requests_payroll_period_id`,
`ix_payroll_payment_requests_status`, `ix_payroll_payment_requests_deleted_at`.

#### `payroll_payment_request_entries`
Junção solicitação ↔ holerite (sem soft delete) — quais holerites compõem a
solicitação.

| Coluna | Tipo | Nulo? | Significado (negócio) |
|--------|------|-------|-----------------------|
| `id` | `UUID` PK | não | Identificador |
| `payment_request_id` | `UUID` FK → `payroll_payment_requests.id` (`fk_ppre_request`, **ON DELETE CASCADE**) | não | Solicitação pai |
| `payroll_entry_id` | `UUID` FK → `payroll_entries.id` (`fk_ppre_entry`) | não | Holerite incluído |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | não | Auditoria |

Constraint: `uq_ppre_request_entry` UNIQUE (`payment_request_id`,
`payroll_entry_id`) — impede o mesmo holerite duplicado numa solicitação.
Índices: `ix_payroll_payment_request_entries_payment_request_id`,
`ix_payroll_payment_request_entries_payroll_entry_id`.

> **NF de folha (sem migration).** Ao aprovar, o Backend emite 1 NF por
> funcionário com `invoices.invoice_type = 'folha_pagamento'`. Como `invoice_type`
> já é `VARCHAR(50)`, esse é apenas um **novo valor de string** — não exigiu
> alteração de schema nesta demanda.

---

### PCP (Produção)

> **Demanda 5 (PCP refac, migration `0018_pcp_refac`):** o talhão passa a ter
> **área em hectares**; a OP usa uma **fração de hectares** do talhão e pode ser
> **encerrada por praga** antes de 100%; a colheita deixa de ser por qualidade
> (especial/superior/tradicional) e passa a ser **por destino**
> (Indústria/Embalagem/Descarte), cada destino apontando para um item-destino
> configurado em `app_settings` (D1); a alocação de pessoas deixa de ser nominal
> (`production_order_workers` foi **removida**) e vira **requisitos por cargo**; e
> a OP passa a referenciar **recursos de estoque** (máquinas/veículos reservados,
> embalagens consumidas).

#### `plots`
Talhões da fazenda.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `name`, `location`, `variety` | `VARCHAR` | Identificação |
| `capacity_sacas` | `NUMERIC(12,3)` | Capacidade em sacas de 60kg |
| `total_hectares` | `NUMERIC(10,2)` NOT NULL default 0 | **Área total do talhão (ha).** Base do controle de área: `Σ(hectares_used das OPs ativas) ≤ total_hectares` |

#### `production_orders`
Execuções de safra. Suporta colheitas parciais com acompanhamento de progresso.

Status (`production_order_status`): `planejada → em_producao → em_execucao | pausada → concluida | cancelada`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `plot_id` | FK `plots.id` | Talhão |
| `order_number` | `VARCHAR(20)` UNIQUE NULL | Número sequencial da ordem |
| `start_date` | `DATE` NULL | Data de início |
| `expected_end_date` | `DATE` NULL | Previsão de conclusão |
| `executed_at` | `TIMESTAMPTZ` | Data da produção (preenchida ao concluir) |
| `hectares_used` | `NUMERIC(10,2)` NOT NULL default 0 | **Fração de área do talhão alocada à OP.** Validada contra `plot.total_hectares` (regra no Backend) |
| `total_sacas` | `NUMERIC(12,3)` | Total produzido |
| `industria_sacas`, `embalagem_sacas`, `descarte_sacas` | `NUMERIC(12,3)` NOT NULL default 0 | **Sacas colhidas acumuladas por destino** (substituem `especial/superior/tradicional`). Cada destino = um item-destino de `app_settings` |
| `estimated_cost` | `NUMERIC(12,2)` default 0 | Custo estimado |
| `realized_cost` | `NUMERIC(12,2)` default 0 | Custo realizado |
| `total_cost` | `NUMERIC(12,2)` | Custo total dos insumos consumidos |
| `harvest_progress` | `NUMERIC(5,2)` default 0 | Percentual colhido (0–100) |
| `early_closed_reason` | `TEXT` NULL | **Motivo do encerramento antecipado (praga).** Preenchido quando a OP é concluída antes de 100%; NULL = encerramento normal |

#### `production_harvests`
Registra cada colheita parcial de uma ordem. Append-only — sem soft delete.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `production_order_id` | FK `production_orders.id` CASCADE | Ordem pai |
| `harvest_number` | `INTEGER` | Sequencial da colheita (1, 2, 3…) |
| `percentage_harvested` | `NUMERIC(5,2)` | % colhida nesta rodada |
| `hectares_harvested` | `NUMERIC(10,2)` NULL | Área colhida na rodada = `production_order.hectares_used × pct/100` |
| `sacks_total` | `NUMERIC(8,2)` default 0 | Total de sacas desta colheita |
| `sacks_industria`, `sacks_embalagem`, `sacks_descarte` | `NUMERIC(8,2)` NOT NULL default 0 | **Sacas desta colheita por destino** (substituem `especial/superior/tradicional`) |
| `inputs_consumed` | `JSON` NULL | Snapshot dos insumos consumidos |
| `is_final` | `BOOLEAN` default false | `true` quando atinge 100% |
| `harvested_at` | `TIMESTAMPTZ` default now() | Data/hora da colheita |

#### `production_inputs`
Insumos consumidos na produção (CASCADE). A partir da Demanda 5, o item escolhido deve pertencer a uma categoria com o papel `insumo` (validação no Backend).

#### `production_order_position_requirements`
**Requisitos de mão de obra por CARGO** de uma OP (substitui a alocação nominal de funcionários do antigo `production_order_workers`). Em vez de nomear pessoas, a OP declara de quantas pessoas de cada cargo precisa e com qual vínculo (ex.: `MOTORISTA × 2 (clt)`). O custo de pessoal estimado/realizado sai de `Σ(quantidade × job_position.base_salary / 22 × max(1, dias))` (regra no Backend). Append-only — sem soft delete.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `production_order_id` | FK `production_orders.id` CASCADE (`fk_popr_order`) | Ordem pai |
| `position_id` | FK `job_positions.id` RESTRICT (`fk_popr_position`) | Cargo requerido |
| `quantity` | `INTEGER` NOT NULL | Quantidade de pessoas do cargo (`ck_popr_quantity_positive`: `> 0`) |
| `contract_type` | `contract_type` (enum) NOT NULL | Vínculo: `clt`/`pj`/`temporario` (reusa a enum da Folha) |

Índices: `ix_production_order_position_requirements_production_order_id`, `ix_production_order_position_requirements_position_id`.

#### `production_order_resources`
**Recursos de estoque** alocados a uma OP, com papel de sistema (`system_role`):
- `maquina`/`veiculo` → **reservados** enquanto a OP está ativa (não baixam estoque). Acumulam horas de uso em `accumulated_hours` de forma incremental; custo da OP = `Σ(accumulated_hours × stock_item.hourly_cost)`.
- `embalagem` → **consumo**: baixa do estoque proporcional à colheita (como insumo).

A reserva exclusiva ("item em OP ativa") é validada na **service** — não há constraint no banco; o índice em `stock_item_id` apenas acelera essa checagem. Append-only — sem soft delete.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `production_order_id` | FK `production_orders.id` CASCADE (`fk_por_order`) | Ordem pai |
| `stock_item_id` | FK `stock_items.id` RESTRICT (`fk_por_stock_item`) | Item de estoque do recurso |
| `resource_role` | `system_role` (enum) NOT NULL | Papel: `maquina`/`veiculo`/`embalagem` |
| `quantity` | `NUMERIC(12,3)` NULL | Quantidade (usada para embalagem) |
| `accumulated_hours` | `NUMERIC(10,2)` NOT NULL default 0 | Horas de uso acumuladas (máquina/veículo); somadas de forma incremental durante a produção |

Índices: `ix_production_order_resources_production_order_id`, `ix_production_order_resources_stock_item_id`.

#### `production_order_services`
Serviços externos contratados para a ordem (equipes terceirizadas), com valor fixo e conta a pagar opcional. Append-only — sem soft delete.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `production_order_id` | FK `production_orders.id` CASCADE (`fk_pos_order`) | Ordem pai |
| `supplier_id` | FK `suppliers.id` RESTRICT (`fk_pos_supplier`) | Fornecedor do serviço |
| `description` | `VARCHAR(500)` | Descrição do serviço |
| `amount` | `NUMERIC(12,2)` | Valor contratado |
| `due_date` | `DATE` | Vencimento |
| `accounts_payable_id` | FK `accounts_payable.id` SET NULL (`fk_pos_ap`) NULL | Conta a pagar vinculada (opcional) |

Índices: `idx_pos_production_order`, `idx_pos_supplier`.

#### `plot_activities`
Atividades em talhões (plantio, adubação, poda, colheita etc.).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `hours_spent` | `NUMERIC(6,2)` NULL | Horas trabalhadas na atividade |
| `employee_id` | FK `employees.id` NULL | Funcionário responsável |
| `quantity_applied` | `NUMERIC(10,3)` NULL | Quantidade de insumo aplicado |
| `quantity_unit` | `VARCHAR(20)` NULL | Unidade da quantidade aplicada |
| `result` | `VARCHAR(20)` NULL | Resultado: `concluida`, `parcial`, `reagendada` |

---

## Diagrama de Relacionamentos

```
users ──────────────┐ (notification user_id)
                    ▼
            notifications

clients ──────┬───── sales ──── sale_items ─── stock_items
              │                                    ▲
              ├───── accounts_receivable ──┐       │
              │                            │       │
              └───── invoices ─────── invoice_items│
                         ▲                         │
                         └── sale_id (nullable) ──▶sales

suppliers ────┬──── purchase_orders ──┬── purchase_order_items ──▶ stock_items
              │                       └── purchase_order_receipts ──▶ purchase_order_items
              └──── accounts_payable

stock_categories ──◀ stock_items ──── stock_movements (ledger)
       └──◀ category_role_assignments (M:N categoria↔system_role)

app_settings (key-value; harvest_destination_*_item_id → stock_items, sem FK)

job_positions ──◀ employees ──── payroll_entries ──── payroll_periods
                       │                  ▲                  ▲
                       │                  │                  │
                       │   payroll_payment_request_entries   │
                       │                  └── payroll_payment_requests ──┘
                       └──── payroll_entry_items ──── payroll_events

plots ──┬──── production_orders ──┬── production_inputs ──▶ stock_items
        │                        ├── production_harvests
        │                        ├── production_order_workers ──▶ employees
        │                        └── production_order_services ──▶ suppliers, accounts_payable (opcional)
        └──── plot_activities ──▶ employees (opcional)

financial_movements (ledger, referencia opcional por source_module + reference_id)
```

---

## Decisões de Design

### Por que `Base.metadata.create_all` na migration inicial?

A revisão `0001_initial_schema` usa `Base.metadata.create_all(bind)` em vez de
operações `op.create_table()` explícitas. Motivos:

1. **Evita duplicação**: os modelos já são a fonte de verdade no SQLAlchemy;
   reescrever cada `op.create_table()` seria ~700 linhas duplicadas.
2. **Bootstrap limpo**: para a primeira revisão, onde ainda não há schema
   versionado, `create_all` produz exatamente o mesmo DDL que Alembic geraria.
3. **Migrations futuras usam autogenerate**: a partir daí, toda alteração deve
   vir de `alembic revision --autogenerate -m "..."` com diffs explícitos.

> ⚠️ **Consequência (banco novo vs. prod).** `create_all` reflete os models
> **atuais**, não o histórico. Num banco novo ele "salta" direto para o estado
> final do schema, enquanto em prod cada migration roda em sequência sobre o
> estado da época. Duas regras nascem disso:
> - **Idempotência obrigatória**: toda migration após a `0001` deve usar
>   `IF NOT EXISTS`/`IF EXISTS`/`ON CONFLICT`/DO-block (a tabela/coluna pode já
>   ter sido criada pelo `create_all`).
> - **Colunas removidas do model**: se uma migration **lê/escreve** uma coluna
>   que o model atual já não declara (ex.: foi dropada por uma migration
>   posterior), o `create_all` num banco novo não a cria e a migration quebra.
>   Proteja com `ADD COLUMN IF NOT EXISTS` antes do uso (ver `0013_job_positions`,
>   coluna `role`).

### Enum `payment_method` (migration 1cd82e8905ef)

Criado na migration `add_payment_method_and_service_orders`. Valores:

| Valor | Descrição |
|-------|-----------|
| `a_vista` | Pagamento à vista |
| `parcelado` | Parcelamento (vinculado ao campo `installments`) |
| `pix` | Pix |
| `boleto` | Boleto bancário |

Usado em: `sales.payment_method`, `purchase_orders.payment_method`,
`accounts_payable.payment_method`, `accounts_receivable.payment_method`.

---

### Enum nativo do Postgres

Usamos `SAEnum(..., values_callable=sa_enum_values)` para:

- Ter **validação em nível de banco** (falha no INSERT com valor fora da lista).
- Armazenar o **valor lowercase** (`.value`), mais natural para joins, filtros
  e API responses.
- Permitir introspecção via `information_schema.`

### Ledgers imutáveis

`financial_movements` e `stock_movements` não têm `deleted_at` nem UPDATE: são
anexadas (append-only), e representam a fonte de verdade histórica. Saldos
denormalizados (`stock_items.quantity_on_hand`) podem ser recalculados a
partir delas.

### Saldo e inadimplência

- `clients.is_delinquent` é flag manual/gatilho de processo — setado quando
  AR é cancelada por não pagamento, revertível via UI.
- `stock_items.quantity_on_hand` deve ser mantido pela service layer ao
  registrar cada `stock_movement`.

### Índices de ordenação (Demanda 0 — paginação)

A infra de paginação (`docs/refac/0-demanda-infra-paginacao.md`) ordena as listas
por colunas-chave. Para evitar full scan no `ORDER BY` quando o volume crescer,
a migration **`0011_add_sort_indexes`** adicionou índices btree às colunas que
servem de **ordenação default** das listagens e que ainda não tinham índice:

| Índice | Tabela.coluna | Ordenação default da lista |
|--------|---------------|----------------------------|
| `idx_stock_movements_occurred_at` | `stock_movements.occurred_at` | Estoque → Movimentações (desc) |
| `idx_purchase_orders_ordered_at` | `purchase_orders.ordered_at` | Compras (desc) |
| `idx_sales_sold_at` | `sales.sold_at` | Vendas (desc) |
| `idx_invoices_issue_date` | `invoices.issue_date` | Faturamento (desc) |

Índices btree comuns atendem tanto `ASC` quanto `DESC` (o Postgres faz backward
scan), por isso não foram criados índices direcionais. Os índices também são
declarados nos models (`__table_args__`) com o mesmo nome, mantendo
`alembic check` limpo.

**Colunas candidatas que já possuíam índice** (nenhuma ação necessária):
`financial_movements.occurred_at`, `accounts_payable.due_date`,
`accounts_receivable.due_date`, e as colunas `name` de `clients`, `suppliers`,
`stock_items` e `employees` (todas via `index=True` no model).

### Cargos da folha — `role` texto → FK (Demanda 2)

A migration **`0013_job_positions`** (`down_revision`
`0012_invoice_cancel_fields`) cria a tabela `job_positions` e migra o cargo do
funcionário de texto livre para FK:

1. Cria `job_positions` + índices (`ix_job_positions_name` unique,
   `ix_job_positions_deleted_at`).
2. Insere **um cargo por valor DISTINTO** de `employees.role` (`base_salary = 0`;
   o ajuste fino dos salários sugeridos fica para a UI). Igualdade **exata** de
   texto — `"Colhedor"` e `"Colhedora"` viram **cargos distintos** (não há
   normalização de gênero/caixa; isso é decisão de UI, não do banco).
3. Adiciona `employees.position_id` (nullable) + FK `fk_employees_position` +
   `ix_employees_position_id`.
4. **Backfill** vinculando cada funcionário ao cargo cujo `name` = seu `role`.
5. Torna `position_id` **NOT NULL**.
6. Torna `employees.role` **NULLABLE** (DEPRECATED) — **não** dropa.

**Decisão (integridade entre passos):** `role` foi mantida viva e nullable para o
Backend conseguir lê-la entre os passos DBA→Backend. O **DROP físico** foi feito
no passo Backend (migration **`0014_drop_employee_role`**, head atual), depois que
o código parou de ler/escrever o campo — o dado canônico do cargo é `position_id`.

`0013.downgrade()` repopula `role` a partir de `job_positions.name`, restaura
`role NOT NULL`, remove `position_id` (índice/FK/coluna) e dropa `job_positions`
(reversibilidade testada localmente). A migration é idempotente
(`IF NOT EXISTS`/`ON CONFLICT`/DO-block).

**Guard de `create_all` no `0013` (banco novo).** Como o passo Backend removeu o
atributo `role` do model `Employee`, o `0001` (`create_all`) num banco novo passou
a criar `employees` **sem** a coluna `role`. O passo 2 do `0013` lê
`employees.role`, então sem proteção o `alembic upgrade head` quebrava em banco
novo com *"column role does not exist"* (e o `reset_db` junto). Por isso o
`0013.upgrade()` começa com `ALTER TABLE employees ADD COLUMN IF NOT EXISTS role
VARCHAR(100)`: em banco novo recria a coluna efêmera (que o `0014` dropa em
seguida → **net-schema-neutral**); em prod, onde `0013` já rodou com a coluna
presente, é no-op. Caso geral desta regra: *toda migration que lê uma coluna que
o model atual já não declara precisa de guard `ADD COLUMN IF NOT EXISTS`, senão
o caminho `create_all` quebra* (ver "Por que `create_all`").

A migration **`0014_drop_employee_role`** (`down_revision` `0013_job_positions`)
faz `DROP COLUMN IF EXISTS role`; o `downgrade()` recria `role VARCHAR(100)`
NULLABLE (sem repopular — quem precisar do texto resolve via `JOIN job_positions`).
O atributo `role` também foi removido do model `Employee`, mantendo
`alembic check` limpo (model × banco em sincronia).

### Categorias de estoque — enum → tabela (Demanda 3)

A migration **`0015_stock_categories`** (`down_revision` `0014_drop_employee_role`)
cria `stock_categories`, o tipo `system_role`,
`category_role_assignments` e `app_settings`, e migra a categoria do item de enum
para FK:

1. **Guard de `create_all`** (mesmo padrão do `0013`): garante o tipo
   `stock_category` e a coluna `stock_items.category` antes de lê-los no backfill.
   O passo Backend removerá `category` do model; sem o guard, num banco novo o
   `0001` (`create_all`) não criaria tipo nem coluna e o backfill quebraria. No-op
   em prod. Net-schema-neutral (o Backend dropa coluna + tipo depois).
2. Insere as 5 categorias do enum (`Café/Insumo/Veículo/Equipamento/Outro`) com
   **ids fixos** (referenciados pelo seed e pelo backfill) + os papéis default.
   As linhas de `category_role_assignments` também usam **ids fixos iguais aos do
   seed**, para que no `reset_db` (onde migration **e** seed rodam) o
   `ON CONFLICT (id)` do seed deduplique — senão bateria na `UNIQUE(category_id,
   role)`, repetindo o incidente do `job_positions`.
3. Adiciona `stock_items.category_id` (FK + índice), faz o **backfill** a partir do
   enum (`cafe`→Café, …) e torna NOT NULL.
4. Torna `stock_items.category` **NULLABLE** (deprecated) — sem dropar coluna nem
   tipo `stock_category` (DROP físico feito pelo Backend na 0016).

`0015.downgrade()` repopula `category` a partir de `category_id`, restaura NOT NULL,
remove `category_id` e dropa `app_settings`, `category_role_assignments`,
`stock_categories` e o tipo `system_role` (reversibilidade testada).

A migration **`0016_drop_stock_category`** (`down_revision` `0015_stock_categories`)
faz o **DROP físico** de `stock_items.category` e, em seguida, do
tipo `stock_category` (nessa ordem — `DROP TYPE` falha com coluna dependente). O
`downgrade()` recria o tipo e a coluna (nullable, sem repopular). O atributo
`StockItem.category` foi **removido** do model (substituído por uma relationship
`category` → `StockCategory`), mantendo `alembic check` limpo (model × banco em
sincronia). O **guard de `create_all`** da 0015 continua necessário: em banco novo
ele recria tipo+coluna para o backfill e a 0016 os remove logo após.

### Aprovação da folha — solicitações + novo status (Demanda 4)

A migration **`0017_payroll_approval`** (`down_revision` `0016_drop_stock_category`)
introduz o fluxo de aprovação financeira da folha:

1. Adiciona o valor `aguardando_aprovacao` ao enum `payroll_entry_status` via
   `ALTER TYPE … ADD VALUE IF NOT EXISTS`, dentro de um `autocommit_block`
   (`ADD VALUE` não pode rodar em transação no Postgres — mesmo padrão da `0002`).
2. Cria `payroll_payment_requests` e `payroll_payment_request_entries`.

**Idempotência do enum × `create_all`:** o valor também está na classe enum
Python (`PayrollEntryStatus`, por último para casar com o append do `ADD VALUE`).
Em banco novo, o `0001` (`create_all`) já cria o tipo COM `aguardando_aprovacao`,
então o `ADD VALUE IF NOT EXISTS` da 0017 é **no-op** — sem o `IF NOT EXISTS` o
`reset_db` quebraria por valor duplicado.

`0017.downgrade()` dropa as 2 tabelas mas **deixa o valor `aguardando_aprovacao`
no enum**: o Postgres não remove valores de enum de forma simples/segura (mesma
estratégia documentada na `0002`); é inócuo, pois nenhuma linha o referencia após
o drop.

### PCP refac — hectares, cargos, recursos, colheita por destino (Demanda 5)

A migration **`0018_pcp_refac`** (`down_revision` `0017_payroll_approval`,
**head atual**) é a maior mudança de schema do PCP. Numa única migration,
coerente, idempotente e reversível:

1. **`plots.total_hectares`** e **`production_orders.hectares_used` /
   `early_closed_reason`** (colunas `NOT NULL DEFAULT 0` via o padrão
   add-default-backfill-set-not-null; `early_closed_reason TEXT NULL`).
2. **Qualidade → destino:** adiciona `industria/embalagem/descarte` em
   `production_orders` e `sacks_industria/embalagem/descarte` (+ `hectares_harvested`)
   em `production_harvests`, **copia os dados históricos best-effort**
   (`especial→industria`, `superior→embalagem`, `tradicional→descarte`) e **remove**
   as colunas antigas. A cópia roda dentro de um `DO`-block que só dispara se a
   coluna legada ainda existe (`information_schema.columns`) — assim é no-op em
   banco novo (`create_all`, que já nasce sem as colunas antigas).
3. **Remove `production_order_workers`** (`DROP TABLE IF EXISTS`) e cria
   **`production_order_position_requirements`** (requisitos por cargo, reusa a enum
   `contract_type`) e **`production_order_resources`** (recursos de estoque, reusa a
   enum `system_role`).

**Idempotência × `create_all`:** o `model.py` do PCP já reflete o estado novo, então
em banco novo o `0001` cria tudo no formato final. Constraints/índices das tabelas
novas usam **os mesmos nomes que o `create_all` geraria** (FKs `fk_popr_*`/`fk_por_*`,
PKs `*_pkey`, `ck_popr_quantity_positive`, índices `ix_*`), de modo que os
`CREATE … IF NOT EXISTS` viram no-op e `alembic check` fecha limpo nos dois caminhos
(upgrade sobre banco antigo **e** `reset_db` sobre banco novo).

`0018.downgrade()` reverte integralmente: recria `production_order_workers`
(com `uq_pow_order_employee` e índices `idx_pow_*`), restaura as colunas de qualidade
legadas copiando de volta dos destinos, e remove as novas tabelas/colunas. Testado
localmente: `upgrade head → downgrade -1 → upgrade head`, com os valores históricos
preservados no ida-e-volta.

> As enums `contract_type` e `system_role` **não** são criadas aqui — já existem
> (Demandas 2 e 3); a migration apenas as referencia nas colunas novas.

---

## Como rodar

### Pré-requisitos

- PostgreSQL 14+ rodando em `localhost:5432`
- Usuário `postgres` / senha `postgres` (ou ajustar `.env`)
- Poetry instalado e dependências via `poetry install`

### Resetar e popular o banco

```bash
cd backend
python -m poetry run python scripts/reset_db.py
```

Esse script:
1. Termina conexões existentes;
2. Drop/recreate do database `coffee_farm_erp`;
3. Roda `alembic upgrade head` (aplica `0001_initial_schema`);
4. Aplica `scripts/seed.sql` via `psql`.

### Alternativa via Make

```bash
make reset-db
```

### Re-semeadura sem drop (`seed_only.py`) e limpeza de tabelas

O deploy (Railway) **não** dropa o banco: roda
`alembic upgrade head && python scripts/seed_only.py`. O `seed_only.py` **limpa**
todas as tabelas e reaplica `seed.sql`.

**A limpeza é DERIVADA DO SCHEMA** (desde o hardening `chore/seed-only-dynamic-clear`).
O script consulta o catálogo (`information_schema.tables`, `BASE TABLE` do schema
`public`), remove o conjunto de preservação e executa **um único
`TRUNCATE … CASCADE`** (ordem-independente — o `CASCADE` resolve as FKs). Assim,
**qualquer tabela nova futura entra na limpeza automaticamente**, sem editar o
script.

Conjunto de preservação (constante `PRESERVE_TABLES` em `seed_only.py`):
- **`alembic_version`** — estado das migrations; limpá-la faria o próximo
  `alembic upgrade head` re-rodar a cadeia inteira e quebrar.

> **SUPERSEDE a regra antiga.** Antes havia uma lista manual `TABLES_TO_CLEAR`
> (ordem de FK, filhas antes das pais) e a diretriz "toda tabela de negócio nova
> precisa entrar na lista". Essa lista era um campo minado: esquecer uma tabela
> quebrava o re-seed em prod por colisão de `UNIQUE(name)` quando uma
> data-migration populava a tabela com os mesmos nomes do seed (incidente
> `job_positions` na Demanda 2; quase-incidente `stock_categories` na Demanda 3).
> A derivação pelo schema elimina a classe inteira de bug — **não é mais preciso
> manter lista nem pensar em ordem de FK**.

`reset_db.py` (uso local) é independente: dropa/recria o banco inteiro, então não
tem lista de limpeza e não foi afetado por esta mudança.

### Adicionar novas migrations

```bash
cd backend
python -m poetry run alembic revision --autogenerate -m "adicionar_campo_x"
python -m poetry run alembic upgrade head
```

---

## Credenciais iniciais (seed)

| Usuário | Senha |
|---------|-------|
| `admin@fazenda.com` | `admin123` |

---

## Inventário do seed

- **1** usuário admin
- **3** clientes (1 inadimplente: Mercearia Dona Rita)
- **3** fornecedores
- **8** cargos (`job_positions`) com salário sugerido (R$ 1.800–6.000)
- **8** funcionários — 3 CLT (R$ 2.200–6.000), 3 PJ (R$ 4.000–5.500), 2 Temporários (R$ 1.800); cada um vinculado a um cargo via `position_id` (campo legado `role` fica NULL)
- **5** categorias de estoque (`stock_categories`: Café, Insumo, Veículo, Equipamento, Outro) + **6** atribuições de papel (`category_role_assignments`; Café com 2 papéis, Outro com `produto_descartado`)
- **3** configurações (`app_settings`): itens-destino da colheita (indústria/embalagem/descarte)
- **10** itens de estoque — 3 qualidades de café, 4 insumos, 1 trator, 1 colheitadeira, 1 Café Descarte (refugo); cada item com `category_id` (enum `category` legado fica NULL)
- **2** talhões e **3** atividades registradas
- **1** ordem de produção concluída (100 sacas: 19 especial, 52 superior, 29 tradicional)
- **1** ordem de compra concluída (R$ 7.600)
- **2** vendas (1 entregue quitada, 1 realizada em aberto)
- **2** faturas
- **2** contas a pagar (1 paga, 1 em aberto)
- **3** contas a receber (1 quitada, 1 em aberto, 1 cancelada)
- **3** períodos de folha (01/2026 e 02/2026 fechadas e pagas, 03/2026 aberta) — **24** lançamentos
- **17** movimentações de estoque
- **25** movimentações financeiras cobrindo os últimos 3 meses
- **3** notificações

**Saldo inicial:** R$ 150.000,00 (movimentação `saldo_inicial` em 2026-01-01)
**Saldo projetado ao final do seed:** ~R$ 103.156,67
