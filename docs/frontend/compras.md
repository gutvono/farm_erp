# Frontend Module: Compras

## Visão Geral

Página única com 2 abas (Tabs shadcn): **Ordens de Compra** e **Fornecedores**. Ordens são criadas com itens dinâmicos e gerenciadas via cards expandíveis com dropdown de status protegido por AlertDialog.

## Arquivos

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `app/(modules)/compras/page.tsx` | Page | Página em abas; carrega ordens, fornecedores e itens de estoque |
| `services/compras.ts` | Service | Orquestra chamadas a `/api/compras/*`; converte Decimal → number |
| `types/index.ts` | Tipos | `Supplier`, `PurchaseOrderItem`, `PurchaseOrder`, `PurchaseOrderStatus` |
| `components/modules/compras/FornecedorForm.tsx` | Componente | Dialog (criar/editar) com React Hook Form + Zod |
| `components/modules/compras/FornecedorRow.tsx` | Componente | Linha com nome, doc, email, telefone, endereço; ações editar/excluir |
| `components/modules/compras/OrdemForm.tsx` | Componente | Dialog com seção de itens dinâmica (`useFieldArray`), subtotais e total calculados |
| `components/modules/compras/OrdemCard.tsx` | Componente | Card expandível com tabela de itens e dropdown de status + AlertDialogs |

## Campos reais do backend (vs. spec original)

| Spec | Backend real |
|------|-------------|
| `contact_name` | Inexistente — campo não existe em `Supplier` |
| `total_price` (item) | `subtotal` |
| — | `ordered_at`, `received_at` em `PurchaseOrder` |

## Abas

### 1. Ordens de Compra
- Select de filtro por status (`all`, `em_andamento`, `concluida`, `cancelada`)
- Botão "Nova Ordem" abre `OrdemForm`
- Lista de `OrdemCard`; card expandível mostra tabela de itens

### 2. Fornecedores
- Botão "Novo Fornecedor" abre `FornecedorForm`
- Lista de `FornecedorRow` com ações inline

## Componentes — Props

### `FornecedorForm`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `open` | `boolean` | Estado do Dialog |
| `onOpenChange` | `(open: boolean) => void` | Callback |
| `supplier` | `Supplier \| null` | `null` → criação; preenchido → edição |
| `onSuccess` | `() => void` | Recarrega lista |

### `FornecedorRow`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `supplier` | `Supplier` | Dados do fornecedor |
| `onEdit` | `() => void` | Abre form de edição |
| `onDeleted` | `() => void` | Recarrega lista |

### `OrdemForm`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `open` | `boolean` | Estado do Dialog |
| `onOpenChange` | `(open: boolean) => void` | Callback |
| `suppliers` | `Supplier[]` | Opções do Select de fornecedor |
| `stockItems` | `StockItem[]` | Opções do Select de item por linha |
| `onSuccess` | `() => void` | Recarrega lista |

### `OrdemCard`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `order` | `PurchaseOrder` | Dados da ordem |
| `onChanged` | `() => void` | Recarrega lista após mudança de status |

## Fluxo de status de Compras

```
em_andamento → concluida  (AlertDialog de confirmação: entra no estoque + conta a pagar)
em_andamento → cancelada  (AlertDialog de confirmação simples)
```
- `concluida` e `cancelada` são status finais — Select desabilitado
- Ao concluir: backend executa entrada no estoque para cada item + cria conta a pagar com vencimento em 30 dias + movimentação financeira (R$0,00 de rastreabilidade)
- Ao cancelar: nenhum efeito colateral

## Integração com Estoque

A página busca `getItens()` do service de Estoque ao montar para popular o Select de itens no `OrdemForm`.
