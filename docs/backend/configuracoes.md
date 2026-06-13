# Backend Module: Configurações

## Overview

Módulo de **configurações do sistema** (Demanda 3). Centraliza três cadastros que antes eram enums fixos ou suposições do código:

1. **Categorias de estoque** (`stock_categories`) — categoria do item deixou de ser enum fixo e virou entidade cadastrável pelo usuário (decisão D2).
2. **Papéis de sistema** (`system_role` + `category_role_assignments`) — como as categorias são livres, o sistema não "adivinha" mais o que é máquina/insumo/produto final. O admin mapeia cada categoria para um conjunto de **papéis** de um vocabulário fixo (decisão D3); PCP/Comercial consomem esses papéis.
3. **Destinos da colheita** (`app_settings`) — os 3 itens de estoque para onde a colheita é direcionada (indústria, embalagem, descarte), persistidos como key-value (decisão D1).

```
router.py → service.py → repository.py → PostgreSQL
```

## Endpoints

Todos exigem autenticação via cookie `session_token` (`get_current_user`). Prefixo `/api/configuracoes`.

### Categorias de estoque

| Método | Rota | O que faz | Params / Body |
|--------|------|-----------|---------------|
| `GET` | `/categorias` | Lista categorias **paginadas** (envelope `Page[T]` cru) com seus papéis | `page`, `page_size`, `order_by` (`name`), `order_dir`, `search` (por `name`) |
| `POST` | `/categorias` | Cria categoria | `StockCategoryCreate` |
| `GET` | `/categorias/{id}` | Detalhe da categoria (com `roles`) | — |
| `PUT` | `/categorias/{id}` | Atualiza categoria | `StockCategoryUpdate` |
| `DELETE` | `/categorias/{id}` | Soft delete. **Bloqueado** (`400`) se houver item ativo vinculado | — |
| `PUT` | `/categorias/{id}/papeis` | **Substitui** o conjunto de papéis da categoria | `{ "roles": ["produto_final", ...] }` |

### Papéis

| Método | Rota | O que faz |
|--------|------|-----------|
| `GET` | `/papeis` | Lista os valores do enum `SystemRole` (vocabulário fixo de papéis) |

### Destinos da colheita

| Método | Rota | O que faz | Body |
|--------|------|-----------|------|
| `GET` | `/destinos-colheita` | Lê os 3 itens-destino (industria/embalagem/descarte) de `app_settings` | — |
| `PUT` | `/destinos-colheita` | Persiste os 3 itens-destino. Valida que os 3 `stock_items` existem (`404` se não) | `HarvestDestinationsUpdate` |

### Encargos de atraso (multa/juros — Demanda 9.B)

| Método | Rota | O que faz | Body |
|--------|------|-----------|------|
| `GET` | `/encargos` | Lê as taxas de encargo por atraso de `app_settings` (default `2`/`1` se ausentes) | — |
| `PUT` | `/encargos` | Persiste as 2 taxas (percentuais, validadas `≥ 0`) | `EncargosUpdate` |

Chaves em `app_settings`: `multa_atraso_percent` (multa única %) e `juros_mora_mensal_percent`
(juros de mora %/mês). Consumidas pelo Financeiro no cálculo do encargo na baixa de parcela
vencida (ver `docs/backend/financeiro.md` → "Juros/multa por atraso na baixa"). Semeadas pelo
DBA (9.B) com `2` e `1`.

### Emitente da fazenda (Demanda 11.1)

| Método | Rota | O que faz | Body |
|--------|------|-----------|------|
| `GET` | `/emitente` | Lê os 13 dados do emitente (a fazenda) de `app_settings` (defaults fictícios se ausentes) | — |
| `PUT` | `/emitente` | Persiste os 13 campos do emitente | `EmitenteUpdate` |

Dados do emitente exibidos no cabeçalho da NF de venda (razão social, CNPJ, IE e endereço
completo da fazenda). Persistidos como key-value em `app_settings`, uma chave por campo
(`emitter_legal_name`, `emitter_trade_name`, `emitter_cnpj`, `emitter_state_registration`,
`emitter_cep`, `emitter_street`, `emitter_number`, `emitter_complement`,
`emitter_neighborhood`, `emitter_city`, `emitter_state`, `emitter_phone`, `emitter_email`).
Semeados no `seed.sql` com dados fictícios de uma fazenda de café em MG. **Sem migration** —
mesmo padrão dos "Encargos de atraso". Consumidos pelo PDF da NF de venda (Demanda 11.4).

### Impostos (alíquotas fiscais — Demanda 11.2)

| Método | Rota | O que faz | Body |
|--------|------|-----------|------|
| `GET` | `/impostos` | Lê as 4 alíquotas fiscais de `app_settings` (defaults `12`/`0.65`/`3`/`0` se ausentes) | — |
| `PUT` | `/impostos` | Persiste as 4 alíquotas (percentuais, validadas `0 ≤ x ≤ 100`) | `ImpostosUpdate` |

Chaves em `app_settings`: `icms_percent`, `pis_percent`, `cofins_percent`, `ipi_percent`.
Substituem os valores antes hardcoded no frontend (`FaturaCard.tsx`: ICMS 12 %, PIS 0,65 %,
COFINS 3 %, IPI 0 %); os defaults seedados são exatamente esses. **Sem migration** — mesmo
padrão dos "Encargos de atraso"/"Emitente". Consumidas pelo cálculo de imposto da NF (a NF de
venda, recebimento e devolução passam a ler a mesma fonte na Demanda 11.4).

## Schemas

### StockCategoryCreate / StockCategoryUpdate (JSON)
```json
{ "name": "Café", "description": "Café verde e beneficiado", "is_active": true }
```
- `name` obrigatório (≤ 120), **único** entre categorias não-excluídas (duplicado → `400`).
- No `Update`, todos os campos são opcionais.

### StockCategoryOut
```json
{
  "id": "uuid",
  "name": "Café",
  "description": "...",
  "is_active": true,
  "roles": ["produto_final", "produto_vendavel"],
  "created_at": "...",
  "updated_at": "..."
}
```
- `roles` é resolvido das `category_role_assignments` (M:N).

### CategoryRolesUpdate (PUT `/categorias/{id}/papeis`)
```json
{ "roles": ["maquina", "produto_vendavel"] }
```
- Valores válidos: ver `GET /papeis`. **Semântica de SUBSTITUIÇÃO:** apaga as assignments atuais e insere o novo conjunto (deduplicado). Enviar `[]` remove todos os papéis.

### HarvestDestinationsUpdate / HarvestDestinationsOut
```json
{
  "industria_item_id": "uuid",
  "embalagem_item_id": "uuid",
  "descarte_item_id": "uuid"
}
```
- No `Out`, cada campo pode vir `null` se ainda não configurado.

### EncargosUpdate / EncargosOut (Demanda 9.B)
```json
{
  "multa_atraso_percent": 2,
  "juros_mora_mensal_percent": 1
}
```
- Percentuais (`Decimal`), validados `≥ 0` no `Update`. O `Out` devolve sempre as 2 taxas (com
  os defaults `2`/`1` quando a chave não existe em `app_settings`).

### EmitenteUpdate / EmitenteOut (Demanda 11.1)
```json
{
  "legal_name": "Fazenda Santa Esperança Café Ltda",
  "trade_name": "Café Santa Esperança",
  "cnpj": "12.345.678/0001-90",
  "state_registration": "062.307.831.0500",
  "cep": "35400-000",
  "street": "Rodovia MG-187, km 12",
  "number": "s/n",
  "complement": "Zona Rural",
  "neighborhood": "Distrito de São Bartolomeu",
  "city": "Ouro Preto",
  "state": "MG",
  "phone": "(31) 3551-7788",
  "email": "contato@cafesantaesperanca.com.br"
}
```
- Todos os campos são `str`. `legal_name` é **obrigatório** (1–255); os demais são opcionais
  (default `""`). Validação leve: `strip` em todos, `state` (UF) em maiúsculas e limitado a 2
  caracteres, limites de tamanho por campo. **Sem** validação de dígito verificador de CNPJ nem
  regra fiscal. O `Out` devolve sempre os 13 campos (defaults fictícios quando a chave não
  existe em `app_settings`).

### ImpostosUpdate / ImpostosOut (Demanda 11.2)
```json
{
  "icms_percent": 12,
  "pis_percent": 0.65,
  "cofins_percent": 3,
  "ipi_percent": 0
}
```
- 4 alíquotas percentuais (`Decimal`), validadas `0 ≤ x ≤ 100` no `Update`. O `Out` devolve
  sempre as 4 (com os defaults `12`/`0.65`/`3`/`0` quando a chave não existe em `app_settings`).

## Papéis de sistema (`SystemRole`)

Vocabulário fixo (enum Postgres `system_role`):

`maquina`, `veiculo`, `embalagem`, `insumo`, `produto_final`, `produto_inacabado`, `produto_descartado`, `produto_vendavel`.

Uma categoria pode ter **vários** papéis (ex.: "Café" → `produto_final` **e** `produto_vendavel`). É assim que o sistema continua "entendendo" os itens depois que a categoria virou texto livre.

## Helpers públicos (consumidos por outros módulos)

Importar de `app.modules.configuracoes.service`:

```python
from app.modules.configuracoes import service as config_service

# IDs de stock_items ativos cujas categorias têm o papel informado
# (join stock_items → stock_categories → category_role_assignments).
item_ids = config_service.get_item_ids_by_role(db, SystemRole.PRODUTO_FINAL)

# Categorias (ativas) que têm o papel informado.
categorias = config_service.get_categories_by_role(db, SystemRole.INSUMO)

# Os 3 itens-destino da colheita: {"industria": UUID|None, "embalagem": ..., "descarte": ...}
destinos = config_service.get_harvest_destination_item_ids(db)
```

- **PCP** usa `get_item_ids_by_role(db, PRODUTO_FINAL)` para localizar os itens de café (antes era `StockItem.category == StockCategory.CAFE`). Ver `docs/backend/pcp.md`.
- **Estoque** usa `get_item_ids_by_role` para o filtro `GET /itens?role=...`.

## Regras de negócio

- **Unicidade de categoria:** `name` único entre não-excluídas; criar/renomear para nome existente → `400 "Já existe uma categoria com este nome"`.
- **Exclusão bloqueada:** `DELETE /categorias/{id}` só faz soft delete se **nenhum** item ativo (`deleted_at IS NULL`) tiver aquele `category_id`. Com vínculo → `400 "Não é possível excluir uma categoria com itens vinculados"`.
- **Papéis (replace):** `PUT /categorias/{id}/papeis` é idempotente por conjunto — apaga as antigas e grava as novas (hard delete em `category_role_assignments`, que é tabela de ligação sem soft delete, com `CASCADE` da categoria).
- **Destinos da colheita:** os 3 `stock_items` referenciados devem existir (`404` por item ausente). Persistidos nas chaves `harvest_destination_{industria,embalagem,descarte}_item_id` de `app_settings`.

## Integrações entre módulos

| Consumidor | Helper | Uso |
|------------|--------|-----|
| PCP | `get_item_ids_by_role(PRODUTO_FINAL)` | localizar itens de café (`_find_quality_item`) |
| Estoque | `get_item_ids_by_role(role)` | filtro `GET /itens?role=...` |
| (futuro) Comercial/PCP | `get_categories_by_role`, `get_harvest_destination_item_ids` | consultas por papel / destinos |

Nenhum movimento financeiro é gerado por este módulo (é cadastro/configuração).

## Database Schema

### `stock_categories` (soft delete)
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `name` | VARCHAR(120) unique indexado (`ix_stock_categories_name`) |
| `description` | TEXT nullable |
| `is_active` | BOOLEAN NOT NULL |
| `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |

### `category_role_assignments` (M:N, hard delete, CASCADE da categoria)
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `category_id` | UUID FK → `stock_categories` (`fk_cra_category`, `ON DELETE CASCADE`), indexado |
| `role` | enum `system_role`, indexado |
| `created_at`, `updated_at` | TIMESTAMPTZ |

Unique `uq_category_role (category_id, role)`.

### `app_settings` (key-value, sem soft delete)
| Coluna | Tipo |
|--------|------|
| `id` | UUID PK |
| `key` | VARCHAR(100) unique indexado |
| `value` | VARCHAR(500) nullable |
| `created_at`, `updated_at` | TIMESTAMPTZ |

Chaves usadas: `harvest_destination_industria_item_id`, `harvest_destination_embalagem_item_id`, `harvest_destination_descarte_item_id`.

## Migrations

- **`0015_stock_categories`** (DBA): cria `stock_categories`, `category_role_assignments`, `app_settings` e o tipo `system_role`; insere as 5 categorias a partir do enum legado (ids fixos), atribui papéis default (Café → `produto_final` + `produto_vendavel`), adiciona `stock_items.category_id` (FK + backfill + NOT NULL) e rebaixa `stock_items.category` a NULLABLE. Tem um **GUARD create_all** que recria o tipo/coluna `stock_category` em banco novo (onde o Backend já removeu `category` do model) para viabilizar o backfill — **não remover**.
- **`0016_drop_stock_category`** (Backend, Demanda 3): DROP físico de `stock_items.category` e do tipo `stock_category` (nessa ordem). `downgrade` recria ambos (nullable, sem repopular).

## Limitações conhecidas / Débito técnico

- O vínculo categoria→papel é por enum fixo (`SystemRole`); adicionar um papel novo exige migration (alterar o tipo Postgres). É intencional — o vocabulário de papéis é controlado.
- A refatoração profunda do PCP para consumir papéis em todos os pontos é a **Demanda 5**; aqui apenas o ponto crítico (`_find_quality_item`) foi migrado para não quebrar.
