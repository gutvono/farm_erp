# Primitivo de UI: Larguras padronizadas dos painéis Sheet

Os **painéis laterais** (Sheet) deslizam pela direita da tela e mostram detalhes
de um registro ou um histórico sem trocar de página. Para que o conteúdo caiba de
forma confortável — em especial **tabelas largas**, que antes apareciam cortadas
com barra de rolagem horizontal — a largura do painel é **padronizada por tipo de
conteúdo**, e não escolhida arquivo a arquivo com números soltos.

## Onde fica o padrão

A largura é definida uma única vez em `components/ui/sheet.tsx`, na variante
`size` do `SheetContent`. Cada tela apenas escolhe o **tipo** via prop `size`,
sem repetir classes de largura.

| `size`    | Largura máxima (desktop) | Quando usar |
|-----------|--------------------------|-------------|
| `default` | `sm:max-w-sm` (≈ 384px)  | Painel estreito: listas curtas, notificações. É o padrão se nada for informado. |
| `detail`  | `sm:max-w-xl` (≈ 576px)  | **Ficha de um registro**: campos e blocos de detalhe (sem tabela larga). |
| `table`   | `sm:max-w-4xl` (≈ 896px) | Conteúdo com **TABELA larga** (5–6 colunas), que precisa caber **sem barra de rolagem horizontal** no desktop. |

Em telas pequenas (mobile) **todos** continuam ocupando `w-full` — a largura
máxima só passa a valer a partir do breakpoint `sm`, então o painel não estoura
a tela do celular.

## Como aplicar

```tsx
// Painel com tabela larga (ex.: histórico do item no Estoque)
<SheetContent size="table" className="w-full overflow-y-auto">

// Painel de detalhe de um registro (ex.: conta a receber/pagar)
<SheetContent size="detail" className="flex w-full flex-col gap-0 overflow-y-auto">

// Painel estreito (padrão) — basta omitir o size
<SheetContent className="w-96">
```

Regra: **nunca** colocar `sm:max-w-*` solto no `className` de um `SheetContent`.
Escolha o `size` adequado; se um caso novo não couber em nenhum dos três,
ajuste/estenda a variante `size` no `sheet.tsx` (fonte única da verdade).

## Onde cada tipo é usado hoje

**`size="table"` (painéis com tabela larga):**
- Estoque → histórico de um item (`app/(modules)/estoque/page.tsx`) — **caso-prova**:
  a tabela de movimentações (Data, Tipo, Quantidade, Valor unit., Valor total)
  agora cabe sem rolagem horizontal.
- Estoque → conferência de recebimento (`components/modules/estoque/RecebimentosTable.tsx`).
- Comercial → detalhes da venda (`components/modules/comercial/VendasTable.tsx`).
- Compras → detalhes da ordem (`components/modules/compras/OrdensTable.tsx`).
- Compras → detalhes da cotação (`components/modules/compras/CotacoesTable.tsx`).

**`size="detail"` (ficha de registro):**
- Financeiro → conta a receber (`components/modules/financeiro/ContaReceivableDetail.tsx`).
- Financeiro → conta a pagar (`components/modules/financeiro/ContaPayableDetail.tsx`).

**`size="default"` (estreito, mantidos de propósito):**
- Cabeçalho → painel de notificações (`components/layout/Header.tsx`, usa `w-96`):
  lista curta, deve permanecer estreita.
- PCP → atividades do talhão (`components/modules/pcp/TalhaoCard.tsx`, `sm:max-w-lg`):
  é uma **lista de atividades**, não uma tabela larga; a largura média atual já é
  confortável, então foi mantida.
