# Botão "Limpar filtros" (barras de filtro)

Padrão reutilizável para zerar os filtros de uma listagem sem precisar dar **F5**.

## Para o usuário

Toda barra de filtro do sistema tem um botão **"Limpar filtros"** (ícone de funil
com X). Ao clicar, **todos** os filtros daquela barra voltam ao estado inicial de
uma vez — busca vazia, status/tipo em "Todos", **período** (seletor de intervalo)
limpo, e qualquer outro select/atalho de filtro — e a lista **recarrega
automaticamente** já sem os filtros.

- O botão **só aparece quando há pelo menos um filtro ativo** — quando não há nada
  para limpar, ele fica oculto para não poluir a barra.
- Onde a listagem é paginada, limpar também **volta para a página 1** (você não cai
  numa página vazia).
- No **histórico de movimentações de um item** (Estoque), limpar mantém o item em
  foco (que é o contexto da tela), zerando apenas busca, período, tipo e módulo.

[SCREENSHOT: barra de filtros com filtros aplicados e o botão "Limpar filtros" visível]

## Referência técnica

| Arquivo | Descrição |
|---------|-----------|
| `components/ui/clear-filters-button.tsx` | **`<ClearFiltersButton>`** — `active` (mostra só quando há filtro) + `onClear` (reseta a barra). Ghost, ícone `FilterX`, texto "Limpar filtros". |

Cada barra define o que é "ativo" e o que o `onClear` reseta. Quando o estado dos
filtros vive em um **hook** (`useContasReceber`, `useMovimentacoes`, etc.), o
`setFilters`/`setSearch` já **reseta a paginação para 1**; o `onClear` apenas chama
esses setters com o valor default. Barras cobertas:

- **Financeiro:** Contas a Pagar, Contas a Receber, Movimentações.
- **Estoque:** Itens, Movimentações (e o histórico por item preserva o `stock_item_id`).
- **Comercial:** Vendas (status), Clientes (busca + "apenas inadimplentes").
- **Compras:** Ordens (busca + status + fornecedor), Cotações (status + tipo), Fornecedores (busca).
- **Folha:** Funcionários (busca + contrato + "apenas ativos"), Holerites (status + contrato), Cargos (busca).
- **Configurações:** Categorias (busca).
- **Faturamento:** status das faturas.
- **PCP:** Ordens (status), Atividades (talhão).

Smoke E2E: `e2e/clear-filters-smoke.spec.ts` (botão aparece/some conforme filtro,
limpa busca + período, e a recarga volta com `page=1` sem os params de filtro).
