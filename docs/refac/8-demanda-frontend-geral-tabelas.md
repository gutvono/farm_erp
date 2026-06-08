# Demanda 8 — Front-end Geral: Cards → Tabelas shadcn + Paginação (varredura final)

## Contexto
O cliente quer trocar os **cards** que listam informações por **tabelas elegantes** (shadcn),
mantendo o mesmo conteúdo e ações, com **paginação server-side**. A infra (`DataTable` + `Page[T]` +
`fetchPaginated`) já veio na **Demanda 0**. Esta é a **varredura final**, agora que D3/D4/D5/D6/D7 já
migraram boa parte. **Releia o estado real antes de mexer** — não regredir nada já migrado.

Releia: `docs/refac/0-demanda-infra-paginacao.md`, `docs/frontend/_shared-datatable.md`,
`docs/backend/_shared-paginacao.md`, e a doc de cada módulo afetado.

## Estado atual (survey 2026-06-08)
**✅ Já em DataTable + `Page[T]` (NÃO tocar):** Estoque/Movimentações, Financeiro
(Pagar/Receber/Movimentações), Folha/Cargos, Compras/Catálogo, Configurações/Categorias.

**🔴 Escopo real desta demanda (ainda em card/Row):**
| Módulo | Listas | Componentes atuais |
|--------|--------|--------------------|
| Comercial | Clientes, Vendas | `ClienteRow`, `VendaCard` |
| Compras | Ordens de Compra, Cotações | `OrdemCard`, `CotacaoCard` |
| Estoque | Itens, Recebimentos | `StockItemRow`, `EntryRow` |
| Folha | Funcionários | `FuncionarioCard` |

**Dívida herdada da D6 (backend):** `GET /fornecedores` ainda é `SuccessResponse`/skip-limit e a
`FornecedoresTable` (já DataTable) pagina **no cliente** → migrar o endpoint para `Page[T]` e a tabela
para paginação server-side.

## Decisões de produto (TRAVADAS)
- **Faturamento FORA da D8** → vai para a **D9** (refac de dinheiro/notas remodela o conceito de fatura:
  1 NF + N parcelas). Migrar a tabela de Faturas + filtros avançados agora seria retrabalho. A D9
  entrega essa tela já no modelo final.
- **PCP FORA da D8** → mantêm-se os **cards ricos** construídos na D5 (`OrdemProducaoCard`/`TalhaoCard`
  carregam hectares, requisitos por cargo, recursos, resultado por destino — não cabem numa linha sem
  perder leitura). Não migrar.
- **DBA: não há etapa** — survey confirmou que todos os índices de ordenação em escopo já existem
  (`name` em clients/suppliers/stock_items/employees; `idx_sales_sold_at`; `idx_purchase_orders_ordered_at`;
  `status` em sales/quotations). Sem migration.
- **Holerites (Folha):** continua **client-side** (escopo dado pelo período via
  `GET /folha/periodos/{id}/entries`); `useHolerites`/`HoleritesTable` já existem. **Não** paginar
  server-side nem mexer no backend. Fora do escopo de migração (no máximo restyle visual leve, se
  necessário, sem mudar a fonte de dados).
- **Não perder conteúdo:** tudo que o card mostrava aparece como coluna ou no detalhe (`Sheet`/`Dialog`
  ao clicar na linha). Manter botões (editar, cancelar, status, PDF, expandir).
- **Paginação server-side** (consumindo `Page[T]`) com ordenação por colunas-chave; `order_by` em
  allowlist (nunca 500 em coluna inválida); identidade visual shadcn/Tailwind; responsivo.

## Critérios de aceite
- [ ] Comercial (Clientes, Vendas), Compras (Ordens, Cotações), Estoque (Itens, Recebimentos) e
      Folha (Funcionários) em `DataTable` paginada server-side.
- [ ] `GET /fornecedores` retorna `Page[T]` e a `FornecedoresTable` pagina server-side (dívida D6 quitada).
- [ ] Conteúdo e ações preservados (nada some em relação aos cards); filtros existentes mantidos + busca
      onde fizer sentido.
- [ ] Faturamento e PCP **não** foram tocados.
- [ ] `npm run build` + `npm run lint` sem erros; sem `any`.

---

## ▶️ Etapa DBA — NÃO NECESSÁRIA
Survey de índices (2026-06-08) confirmou que todas as colunas de ordenação em escopo já estão indexadas
(D0/D2/D5/D6). Sem migration nesta demanda. (Exceções de sort sem índice, ex.: `quotations.created_at`
ou `sales.total_amount`, devem ser sinalizadas pelo Backend se ele optar por usá-las — não criar índice
sem necessidade comprovada.)

---

## ▶️ Prompt — Agente BACKEND
(gerado pelo PO sob demanda — ver chat; escopo: `GET clientes`, `GET vendas`, `GET ordens`,
`GET cotacoes`, `GET fornecedores`, `GET itens`, `GET recebimentos`, `GET funcionarios` → `Page[T]`.)

---

## ▶️ Prompt — Agente FRONTEND
(gerado pelo PO sob demanda após o Backend — escopo: `ClienteRow`, `VendaCard`, `OrdemCard`,
`CotacaoCard`, `StockItemRow`, `EntryRow`, `FuncionarioCard` → `DataTable` server-side; `FornecedoresTable`
passa a paginar server-side.)
</content>
