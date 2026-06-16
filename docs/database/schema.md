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

Endereço estruturado adicionado na **Demanda 7** (migration `0021_client_address`),
espelhando o que a Demanda 6 fez no fornecedor. Quando informado, o `document` passa
a ser validado (CPF/CNPJ por dígito verificador) pelo backend da D7.

| Coluna | Tipo | Nulo? | Descrição |
|--------|------|-------|-----------|
| `name` | `VARCHAR(255)` | não | Razão social / nome |
| `document` | `VARCHAR(32)` | sim | CPF ou CNPJ — **opcional**; quando informado, validado por DV (D7) |
| `email`, `phone` | `VARCHAR` | sim | Contato |
| `address` | `VARCHAR(500)` | sim | **Endereço legado (texto livre).** Mantido por compatibilidade |
| `cep` | `VARCHAR(9)` | sim | CEP no formato `00000-000` |
| `street` | `VARCHAR(255)` | sim | Logradouro (rua/avenida/rodovia) |
| `number` | `VARCHAR(20)` | sim | Número (texto: aceita `S/N`) |
| `complement` | `VARCHAR(120)` | sim | Complemento (conjunto, sala, galpão) |
| `neighborhood` | `VARCHAR(120)` | sim | Bairro / zona |
| `city` | `VARCHAR(120)` | sim | Cidade |
| `state` | `VARCHAR(2)` | sim | UF (sigla, ex.: `SP`) |
| `is_delinquent` | `BOOLEAN` | não | Inadimplência (definida no cancelamento de AR) |
| `notes` | `TEXT` | sim | Observações |

> **Decisão do PO (Demanda 7 — travada, igual à D6 do fornecedor):** a coluna `address`
> legada **não é dropada** e **não há backfill** parseando `address` → campos
> estruturados (texto livre, parsing não confiável). Linhas pré-existentes ficam com os
> 7 campos `NULL`; quem popula de verdade é o seed/cadastro. O ViaCEP fica no front
> (sem dependência nova no backend).

**Migration:** `0021_client_address` (`down_revision` `0020_supplier_items`). Upgrade:
`ALTER TABLE clients ADD COLUMN IF NOT EXISTS` para os 7 campos (idempotente — a `0001`
usa `create_all` e num banco novo o model já cria as colunas). Downgrade: `DROP COLUMN
IF EXISTS` dos 7 campos (preserva `address`). Head resultante: `0021_client_address`.

#### `sales`
Vendas realizadas. Segue fluxo `realizada → entregue → cancelada`.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `client_id` | FK `clients.id` | Cliente comprador |
| `status` | ENUM `sale_status` | `realizada` \| `entregue` \| `cancelada` |
| `total_amount` | `NUMERIC(12,2)` | Total **líquido** da venda (subtotal dos itens − `discount_amount`) |
| `discount_percent` | `NUMERIC(5,2)` NOT NULL default `0` | **Desconto de cabeçalho (Demanda 9.C):** percentual informado na venda (sobre o total, não por item) |
| `discount_amount` | `NUMERIC(12,2)` NOT NULL default `0` | Valor do desconto em R$ resultante do percentual. O preço de tabela dos itens (`sale_items.subtotal`) permanece intacto — o desconto vive só no cabeçalho |
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

Endereço estruturado adicionado na **Demanda 6** (migration `0019_supplier_address`).
Todos os campos abaixo são `NULL` (preenchidos no cadastro/seed).

| Coluna | Tipo | Nulo? | Descrição |
|--------|------|-------|-----------|
| `address` | `VARCHAR(500)` | sim | **Endereço legado (texto livre).** Mantido por compatibilidade |
| `cep` | `VARCHAR(9)` | sim | CEP no formato `00000-000` |
| `street` | `VARCHAR(255)` | sim | Logradouro (rua/avenida/rodovia) |
| `number` | `VARCHAR(20)` | sim | Número (texto: aceita `S/N`, `KM 500`) |
| `complement` | `VARCHAR(120)` | sim | Complemento (galpão, sala, fazenda) |
| `neighborhood` | `VARCHAR(120)` | sim | Bairro / zona |
| `city` | `VARCHAR(120)` | sim | Cidade |
| `state` | `VARCHAR(2)` | sim | UF (sigla, ex.: `MG`) |

> **Decisão do PO (Demanda 6 — travada):** a coluna `address` legada **não é dropada**
> e **não há backfill** parseando `address` → campos estruturados. O texto livre não é
> confiável para parsing (geraria dado sujo); nas linhas pré-existentes os novos campos
> ficam `NULL` e quem popula de verdade é o seed/cadastro. A partir da D6 os campos
> estruturados (`cep`..`state`) são a fonte da verdade do endereço.

#### `supplier_items`
**Catálogo do fornecedor** (Demanda 6, migration `0020_supplier_items`): liga um
fornecedor a um item de estoque que ele vende, com preço unitário. **Sem coluna de
quantidade** — o estoque do fornecedor é considerado infinito. Regra de negócio
(validada pelo Backend): toda ordem de compra de **produto** só pode conter itens
presentes no catálogo **ativo** do fornecedor daquela ordem.

| Coluna | Tipo | Nulo? | Default | Descrição |
|--------|------|-------|---------|-----------|
| `id` | `UUID` PK | não | `gen_random_uuid()` | Identificador |
| `supplier_id` | `UUID` FK → `suppliers.id` RESTRICT | não | | Fornecedor |
| `stock_item_id` | `UUID` FK → `stock_items.id` RESTRICT | não | | Item de estoque vendido |
| `unit_price` | `NUMERIC(12,2)` | não | | Preço unitário praticado pelo fornecedor |
| `is_active` | `BOOLEAN` | não | `true` | Item disponível no catálogo (oferta corrente) |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | não | `now()` | Auditoria |
| `deleted_at` | `TIMESTAMPTZ` | sim | | Soft delete (NULL = ativo) |

##### Relacionamentos
- `supplier_items.supplier_id → suppliers.id` (N:1) — fornecedor dono da oferta.
- `supplier_items.stock_item_id → stock_items.id` (N:1) — item de estoque ofertado.

##### Índices e constraints
- `uq_supplier_items_supplier_stock_active` — UNIQUE **parcial** em
  `(supplier_id, stock_item_id) WHERE deleted_at IS NULL`. Impede duplicar o **mesmo
  item ativo** no mesmo fornecedor; soft-deletes (histórico) **não colidem**, permitindo
  re-cadastrar o item depois de removido.
- `idx_supplier_items_supplier_id`, `idx_supplier_items_stock_item_id` — espelham as FKs.
- `ix_supplier_items_deleted_at` — herdado do `SoftDeleteMixin`.

##### Migration
- `0020_supplier_items` (revises `0019_supplier_address`). Upgrade: `CREATE TABLE IF NOT
  EXISTS supplier_items` + os quatro índices (`CREATE [UNIQUE] INDEX IF NOT EXISTS`).
  Downgrade: dropa índices e tabela. Idempotente (banco novo já cria via `create_all`,
  com os mesmos nomes de índice). Head resultante: `0020_supplier_items`.

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

Índice: `ix_app_settings_key` (UNIQUE). Chaves dos **itens-destino da colheita** (D1):
`harvest_destination_industria_item_id`, `harvest_destination_embalagem_item_id`,
`harvest_destination_descarte_item_id` → cada uma aponta (por `value` = UUID em
texto, **sem FK**) para o `stock_item` que recebe a produção daquele destino.

Chaves das **taxas de encargo por atraso** (Demanda 9.B) — `value` é a porcentagem
em texto; lidas pelo Backend na baixa de parcela vencida (se ausentes, ele usa os
defaults 2 / 1):

| `key` | Valor (seed) | Significado (negócio) |
|-------|--------------|-----------------------|
| `multa_atraso_percent` | `2` | Multa **única** por atraso, em % sobre o valor da parcela |
| `juros_mora_mensal_percent` | `1` | Juros de mora **ao mês**, em % (pro-rata pelos dias de atraso) |

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
| `installment_number` | `INTEGER` NULL | **Morto no fluxo de venda (D9.0)** — ver nota abaixo |
| `installment_total` | `INTEGER` NULL | **Morto no fluxo de venda (D9.0)** — ver nota abaixo |
| `parent_invoice_id` | FK `invoices.id` NULL | **Morto no fluxo de venda (D9.0)** — fatura-pai em parcelamentos legados (indexado `ix_invoices_parent_invoice_id`) |
| `cancelled_at` | `TIMESTAMPTZ` NULL | Quando a NF foi cancelada (auditoria do estorno) |
| `cancellation_reason` | `TEXT` NULL | Motivo/observação do cancelamento |

> **Venda parcelada = 1 invoice + N `accounts_receivable` (Demanda 9.0):** uma venda
> parcelada gera **UMA única nota** (`total_amount` = total cheio, itens uma vez,
> `status = emitida`) e **N contas a receber** (as parcelas), todas com `invoice_id`
> apontando para essa nota e `installment_number/total` na **AR**. A parcela vive na
> `accounts_receivable`, **não** na camada de nota. Por isso, no fluxo de venda, as
> colunas `installment_number`/`installment_total`/`parent_invoice_id` da `invoices`
> ficam **NULL/mortas** (mantidas no schema por compatibilidade/outros tipos de nota;
> sem migration nesta etapa — decisão: reusar a AR como bloco de parcelas). O status
> "paga" da nota passa a ser **derivado** das AR (emitida até todas as parcelas
> recebidas → paga). Venda à vista = caso degenerado: 1 nota + 1 AR.

> **Cancelamento (Demanda 1, migration `0012_invoice_cancel_fields`):** `cancelled_at`
> e `cancellation_reason` auditam o cancelamento com estorno. São **distintos** de
> `deleted_at` (soft delete) — o cancelamento mantém a NF visível com `status = cancelada`.
> Nenhuma tabela nova foi necessária: os estornos reusam `financial_movements`,
> `stock_movements` e `stock_items` (item AVARIADO). A partir da D9.0 o motor cancela
> **1 nota + todas as AR** da venda (antes iterava N notas pelo `sale_id`).

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
| `category` | ENUM `financial_category` | venda, compra, folha, produção, ajuste, recebimento, pagamento, saldo_inicial, `juros_multa` (encargo por atraso — multa+juros de mora, D9.B), outro |
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

A partir da **Demanda 9.0**, a `accounts_receivable` **é a parcela** da venda: numa
venda parcelada Nx há N linhas com o mesmo `invoice_id` (a nota única) e mesmo
`sale_id`, `installment_number` 1..N e `installment_total` N. O bloco de cobrança da
nota é a lista de AR dela (ver nota em `invoices`). Numa venda à vista há 1 AR (1/1).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `invoice_id` | FK `invoices.id` NULL (SET NULL) | Nota única da venda (todas as parcelas da venda apontam para ela) |
| `sale_id` | FK `sales.id` NULL (SET NULL) | Venda de origem |
| `installment_number` | `INTEGER` NULL | Número desta parcela (1..N) |
| `installment_total` | `INTEGER` NULL | Total de parcelas (N) |
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
| `termination_cost_override` | `NUMERIC(12,2)` NULL | Custo de rescisão customizado |
| `transport_voucher_cost` | `NUMERIC(12,2)` NULL | Custo real mensal de transporte |
| `meal_voucher_value` | `NUMERIC(12,2)` NULL | Vale refeição informativo |
| `pharmacy_voucher_value` | `NUMERIC(12,2)` NULL | Vale farmácia informativo |
| `life_insurance_value` | `NUMERIC(12,2)` NULL | Seguro de vida informativo |
| `dependents_count` | `INTEGER` default 0 | Dependentes para dedução de IRRF |
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
| `calculation_type` | ENUM `payroll_calculation_type` | `manual`, `overtime`, `night_shift`, `inss`, `irrf`, `fgts`, `transport_voucher` |
| `is_automatic` | `BOOLEAN` | Calculado pelo sistema |
| `affects_net` | `BOOLEAN` | Entra no cálculo do líquido |
| `is_active` | `BOOLEAN` | Disponível para lançamento |

Eventos padrão: Salario base, Hora extra, Adicional noturno, INSS, IRRF,
Vale transporte, Vale refeição, Vale farmácia, Seguro de vida, FGTS e Descontos manuais.

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
              ├──── supplier_items ──▶ stock_items (catálogo fornecedor↔item)
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

A migration **`0018_pcp_refac`** (`down_revision` `0017_payroll_approval`)
é a maior mudança de schema do PCP. Numa única migration,
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

### Compras — endereço do fornecedor e catálogo (Demanda 6)

Duas migrations encadeadas a partir de `0018_pcp_refac` (**head atual:
`0020_supplier_items`**):

1. **`0019_supplier_address`** (`down_revision` `0018_pcp_refac`) — adiciona em
   `suppliers` os sete campos de endereço estruturado (`cep`, `street`, `number`,
   `complement`, `neighborhood`, `city`, `state`), todos `NULL`, via
   `ADD COLUMN IF NOT EXISTS`. **Decisão do PO (travada):** a coluna `address` legada
   é **mantida** (não dropada) e **não há backfill** parseando o texto livre — nas
   linhas existentes os novos campos ficam `NULL`; o seed/cadastro popula. Downgrade
   dropa os sete campos e preserva `address`.
2. **`0020_supplier_items`** (`down_revision` `0019_supplier_address`) — cria
   `supplier_items` (catálogo fornecedor↔item de estoque, com `unit_price` e
   `is_active`, **sem quantidade**). UNIQUE **parcial**
   `uq_supplier_items_supplier_stock_active` em `(supplier_id, stock_item_id) WHERE
   deleted_at IS NULL` + índices das FKs e do `deleted_at`. Idempotente (`CREATE TABLE
   / INDEX IF NOT EXISTS`, mesmos nomes do `create_all`) e reversível.

Ambas testadas localmente: `upgrade head → downgrade -1 (×2) → upgrade head`,
`alembic check` limpo, `reset_db` + `seed_only` (×2) OK. O seed cobre o catálogo de
forma que **toda ordem de compra de produto** semeada tem seus itens no catálogo ativo
do fornecedor da ordem (regra do Backend), e os endereços dos fornecedores do seed são
preenchidos.

### Comercial — endereço do cliente (Demanda 7)

**`0021_client_address`** (`down_revision` `0020_supplier_items`) — espelha a
`0019_supplier_address`, adicionando em `clients` os mesmos sete campos de endereço
estruturado (`cep`, `street`, `number`, `complement`, `neighborhood`, `city`, `state`),
todos `NULL`, via `ADD COLUMN IF NOT EXISTS` (idempotente — num banco novo o `create_all`
da `0001` já cria as colunas, pois o model `Client` as reflete). **Decisão do PO
(travada, igual à D6):** a coluna `address` legada é **mantida** (não dropada) e **não
há backfill** parseando o texto livre. Downgrade dropa os sete campos e preserva
`address`. A validação de CPF/CNPJ do cliente é do **Backend** (reuso de
`app/shared/br_documents.py`); o ViaCEP é do **front** — nada disso entra no schema.

Testada localmente: `upgrade head → downgrade -1 → upgrade head`, `alembic check` limpo
(*No new upgrade operations detected*), `reset_db` OK. O seed dos 3 clientes ganhou os
campos de endereço (BR realistas) e teve os documentos corrigidos para CPF/CNPJ com **DV
válido** (a validação do Backend da D7 passaria a rejeitar os antigos).

### Faturamento/Financeiro — encargo por atraso (Demanda 9.B)

**Head atual: `0022_fin_cat_juros_multa`.**

**`0022_fin_cat_juros_multa`** (`down_revision` `0021_client_address`) — adiciona o valor
`juros_multa` ao enum `financial_category`, para classificar o movimento de encargo
(multa + juros de mora) cobrado na baixa de parcela vencida. `ALTER TYPE ... ADD VALUE IF
NOT EXISTS` roda em `autocommit_block` (ADD VALUE não roda em transação no Postgres),
espelhando a `0017_payroll_approval` (D4); o valor também está no enum Python
`FinancialCategory`, então num banco novo o `create_all` da `0001` já cria o tipo com ele
e o ADD VALUE vira no-op. **Downgrade é NO-OP** (Postgres não remove valor de enum de
forma segura; deixá-lo é inócuo). As **taxas** ficam em `app_settings`
(`multa_atraso_percent`=`2`, `juros_mora_mensal_percent`=`1`), semeadas — não há schema
para elas além da tabela key-value existente.

Testada localmente: `upgrade head → downgrade -1 → upgrade head`, `alembic check` limpo
(*No new upgrade operations detected*), `enum_range` mostra `juros_multa`, `reset_db` OK
(2 chaves de taxa presentes). O **cálculo** do encargo e o lançamento do movimento são da
etapa Backend.

### Venda — desconto de cabeçalho (Demanda 9.C)

**Head atual: `0025_sale_discount`.** (Os IDs `0022`/`0023` desta migration em revisões
anteriores deste doc foram **renumerados** para `0024`/`0025` ao integrar a cadeia da Folha
— `0022_folha_benefits`, `0023_folha_irrf_event` — entre `0021_client_address` e esta.)

**`0025_sale_discount`** (`down_revision` `0024_fin_cat_juros_multa`) — adiciona em `sales`
duas colunas para o **desconto de cabeçalho** (sobre o total da venda, não por item):
`discount_percent` `NUMERIC(5,2) NOT NULL DEFAULT 0` (percentual informado) e
`discount_amount` `NUMERIC(12,2) NOT NULL DEFAULT 0` (valor em R$). Modelo ERP correto: o
preço de tabela do item (`sale_items.subtotal`) **permanece intacto** e `total_amount` já é
o **líquido** (subtotal − `discount_amount`) — auditável de ponta a ponta (venda → nota →
AR derivam do líquido). **Upgrade:** `ADD COLUMN IF NOT EXISTS` das duas colunas (idempotente
— num banco novo o `create_all` da `0001` já as cria, pois o model `Sale` as reflete) +
`ALTER COLUMN ... SET DEFAULT 0` (necessário no caminho `create_all`, onde o `ADD` é no-op e
a coluna nasce sem default no banco — *server-default trap*; sem ele o seed que omite a
coluna violaria NOT NULL). Num banco existente o `ADD ... NOT NULL DEFAULT 0` preenche as
linhas com 0 (sem backfill manual). **Downgrade** dropa as duas colunas (`IF EXISTS`).

Testada localmente: `upgrade head → downgrade -1 → upgrade head` (colunas somem e voltam
com tipo/precisão/default corretos), `alembic check` limpo (*No new upgrade operations
detected*), `reset_db` OK. O seed ganhou a **Venda 4** (NF-0004): subtotal R$ 12.000,00 com
desconto de 10 (`discount_percent`=10,00 / `discount_amount`=1.200,00) → total líquido R$
10.800,00; a NF e a conta a receber (AR-0007) refletem o líquido. A aplicação do desconto no
`create_sale` e a propagação para a **nota** (coluna/linha de desconto na invoice) são da
etapa **Backend** da D9.C.

### Relatório de Vendas por período (Demanda 10) — **sem mudança estrutural**

**Head permanece `0025_sale_discount` — esta demanda não criou migration.** O Relatório de
Vendas (operacional + recebíveis) é puramente **analítico/agregação sobre o schema existente**;
a etapa DBA confirmou que o modelo já suporta todas as agregações, **sem novas colunas/tabelas**:

- **Operacional** (`sales` + `sale_items`): faturamento, nº de vendas, ticket médio, série
  temporal e por status, mix à vista×parcelado, top produtos e top clientes. Período filtra por
  `sales.sold_at` (já indexado por `idx_sales_sold_at`); valor líquido já em `sales.total_amount`
  (com `discount_amount` à parte); produto/quantidade/receita em `sale_items`
  (`stock_item_id`, `quantity`, `subtotal`); cliente em `sales.client_id`.
- **Recebíveis** (`accounts_receivable`): recebido × a receber no período e inadimplência em R$
  (aging) saem de `amount`, `amount_received`, `due_date` (indexado), `received_at`, `status`,
  `client_id`. Regra de arquitetura da D10: o relatório lê os recebíveis **via service do
  Financeiro**, nunca consultando `invoices` direto.

**Índice `received_at`:** avaliado e **decidido NÃO criar** `idx_ar_received_at`. A agregação
"recebido no período" filtra por `received_at`, mas o volume é trivial (seed ~13 linhas; mesmo
em produção este ERP de fazenda única é de baixa cardinalidade) → o planejador faz *seq scan* de
tabela pequena de qualquer forma, e o relatório roda sob demanda (não é *hot path*). Um índice
aqui seria otimização prematura, somando superfície de migration sem ganho mensurável. **Se** o
volume crescer materialmente no futuro, o passo certo é um índice **parcial**
`... (received_at) WHERE received_at IS NOT NULL` (a maioria das AR fica em aberto).

**`financial_movements`/saldo — intencionalmente NÃO alterados.** O relatório lê `sales` e
`accounts_receivable`; os movimentos financeiros (fonte do saldo) não são lidos por ele. O seed
atual já desacopla uma AR quitada de um movimento (AR-0004, R$1.000, sem `recebimento`), então
replicar movimentos para as AR novas só aumentaria a assimetria e arriscaria o saldo projetado
afinado (R$ 105.356,67) de que os smokes de dashboard/financeiro dependem. Coerência de caixa
real é responsabilidade do fluxo `create_sale`/baixa, não desta massa de demonstração.

#### Massa de seed de demonstração (D10)

Para o relatório ter o que mostrar, o `seed.sql` foi enriquecido **sem quebrar** a base D9
(Vendas 1–4 / NF-0001..0004 / AR-0001..0007 intactas). Adicionadas **Vendas 5–9** (→ 9 vendas,
9 NFs, 13 AR), mantendo o fluxo D9 (1 NF + N AR; soma das AR = `total_amount` da venda):

| Venda | Mês `sold_at` | Cliente | Status | Pgto | Total | Recebível |
|------|------|---------|--------|------|------|-----------|
| 5 | jan/26 | Cafeteria Grão Fino | entregue | à vista | 8.000 | AR-0008 **quitada** (`received_at` 20/01) |
| 6 | jan/26 | Mercearia Dona Rita | **cancelada** | à vista | 4.500 | AR-0009 cancelada (fora dos totais) |
| 7 | mai/26 | Aroma do Cerrado | realizada | **parcelado 2x** | 16.250 | AR-0010 quitada (22/05) + AR-0011 **a vencer** (20/06) |
| 8 | mai/26 | Cafeteria Grão Fino | entregue | à vista | 15.600 | AR-0012 **quitada** (24/05) — 2 produtos |
| 9 | mar/26 | Mercearia Dona Rita | realizada | à vista | 2.700 | AR-0013 **vencida** (28/04) → inadimplência |

Cobertura resultante (provada por SELECT em `reset-db`): **série temporal em 5 meses**
(jan..mai/26), **status** realizada(5)/entregue(3)/cancelada(1), **mix** à vista(6)×parcelado(2),
**3 produtos** distintos (CAFE-ESP/SUP/TRA) em top-produtos, **3 clientes** em top-clientes, e
**recebíveis nas 4 situações**: quitada com `received_at` (5), em aberto a vencer (2), em aberto
vencida (4) e cancelada (2) — inadimplência em R$ por cliente derivável das vencidas. *Stock
movements não foram tocados* (o relatório não lê estoque; segue o padrão das NF-0003/0004 da D9,
que também não geram saída de estoque no seed).

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

## Massa de seed — cobertura de produção e datas relativas (revisão DBA)

> **Datas RELATIVAS a `CURRENT_DATE` (decisão travada).** Todo o `seed.sql` deixou
> de usar datas fixas (`2026-…`) e passou a ancorar eventos em expressões SQL:
> `CURRENT_DATE - INTERVAL 'N days/months'` para o passado, `CURRENT_DATE + INTERVAL
> 'N days'` para vencimentos futuros, e `EXTRACT(... FROM CURRENT_DATE - INTERVAL 'N
> months')` para as competências de folha (sem hardcode de ano/mês). Assim o banco
> demo fica **sempre "fresco"**: ao rodar `reset-db` em qualquer data, há sempre
> contas vencidas em aberto, a vencer e quitadas; vendas distribuídas nos últimos
> ~5 meses; e a competência corrente da folha em aberto. As **únicas** datas fixas
> remanescentes são as admissões dos funcionários CLT/PJ de longo prazo
> (2020–2023), que por natureza são históricas; os dois temporários usam admissão
> relativa (`CURRENT_DATE - INTERVAL '5 months'`).
>
> **Gotcha do `%`:** qualquer `%` em `seed.sql` (mesmo em comentário) é tratado como
> placeholder pelo psycopg2 (`exec_driver_sql`) e quebra o `reset_db`. Todos os `%`
> estão escapados como `%%` (ex.: "100%%", "desconto 10%%").

### Inventário do seed (cobertura ponta a ponta de todos os fluxos)

- **1** usuário admin
- **3** clientes (1 inadimplente: Mercearia Dona Rita)
- **3** fornecedores; **10** itens de catálogo fornecedor↔item (`supplier_items`)
- **8** cargos (`job_positions`) + **8** funcionários (3 CLT, 3 PJ, 2 Temporários)
- **6** categorias de estoque + **7** atribuições de papel; **22** chaves `app_settings`
- **11** itens de estoque — 3 cafés, 4 insumos, 1 trator, 1 colheitadeira, 1 descarte,
  1 embalagem. **4 abaixo** do mínimo (CAFE-ESP/SUP/TRA + INS-PEST → dispara
  notificação) e **7 acima/igual** ao mínimo
- **2** talhões e **4** atividades registradas
- **2** ordens de produção: 1 concluída (100 sacas, 100%) + 1 em execução parcial
  (talhão B, 40%) com **1** colheita parcial (`production_harvests`); **5** insumos,
  **5** requisitos por cargo, **1** recurso de máquina, **1** serviço externo
- **4** ordens de compra: 2 concluídas (fertilizante/adubo R$ 7.600; trator
  R$ 182.000), 1 em conferência (`purchase_order_receipts` pendentes), 1 aprovada
  gerada pela Cotação 1
- **9** vendas — status `entregue`(3)/`realizada`(5)/`cancelada`(1); mix à vista(6) ×
  parcelado(2 — 3x e 2x) + 1 com desconto de cabeçalho; `sold_at` espalhado nos
  últimos ~5 meses (série temporal do Relatório de Vendas). **12** `sale_items`
- **9** faturas (3 pagas, 5 emitidas, 1 cancelada) — 1 NF por venda; **12**
  `invoice_items`. Soma das AR de cada NF = `total_amount` da nota (provado por SELECT)
- **7** contas a pagar — 3 pagas, 2 vencidas em aberto, 2 a vencer (inclui as 4
  parcelas do trator)
- **13** contas a receber — 5 quitadas (com `received_at`), 3 a vencer, 3 vencidas
  em aberto (inadimplência em R$ por cliente) e 2 canceladas
- **3** períodos de folha (mês-2 e mês-1 fechadas+pagas; mês atual aberta) — **24**
  lançamentos, **96** itens de holerite, **11** eventos
- **19** movimentações de estoque (ledger coerente com PCP/compras/vendas)
- **36** movimentações financeiras; **5** notificações
- **3** cotações (1 produto concluída, 1 produto aguardando financeiro, 1 serviço em
  andamento), **3** itens, **5** propostas, **6** itens de proposta

**Saldo inicial:** R$ 150.000,00 (movimentação `saldo_inicial` ~170 dias atrás).
**Saldo projetado ao final do seed:** **R$ 47.081,67** (positivo, mediano). A compra
do trator (R$ 182.000) com 2 das 4 parcelas (R$ 91.000) já pagas pesa no caixa, mas
os recebimentos das vendas já quitadas (AR-0004/0008/0010/0012 = R$ 32.725) mantêm um
saldo mediano — deixando margem para criar vendas/recebimentos ao vivo na apresentação.
Cada AR `quitado` no banco gera a entrada de caixa correspondente (respaldo histórico).

> **Integridade verificada (smoke SQL pós `reset-db`):** zero órfãos em todos os
> FKs principais (`sale_items`, `invoice_items`, AR/AP, recibos de compra, insumos/
> colheitas de PCP, holerites); soma dos `sale_items` − `discount_amount` = total da
> venda (0 divergências); soma das AR por NF = total da nota (0 divergências);
> vencimentos espalhados nas 3 faixas para AR **e** AP; ≥1 item abaixo e ≥1 acima do
> mínimo; saldo financeiro positivo. Idempotência: `reset_db` + `seed_only` (×2) sem
> erro de FK nem duplicação.
