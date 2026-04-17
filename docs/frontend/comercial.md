# Frontend Module: Comercial

## Visão Geral

Página única com 2 abas (Tabs shadcn): **Vendas** e **Clientes**. Vendas são criadas com itens dinâmicos de café; o form exibe aviso para clientes inadimplentes. Cards de venda têm dropdown de status protegido por AlertDialog.

## Arquivos

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `app/(modules)/comercial/page.tsx` | Page | Página em abas; carrega vendas, clientes e itens de estoque (categoria café) |
| `services/comercial.ts` | Service | Orquestra chamadas a `/api/comercial/*`; converte Decimal → number |
| `types/index.ts` | Tipos | `Client`, `SaleItem`, `Sale`, `SaleStatus` |
| `components/modules/comercial/ClienteForm.tsx` | Componente | Dialog (criar/editar) com React Hook Form + Zod |
| `components/modules/comercial/ClienteRow.tsx` | Componente | Linha com badge "Inadimplente" em vermelho; ações editar/excluir |
| `components/modules/comercial/VendaForm.tsx` | Componente | Dialog com aviso de inadimplência, itens dinâmicos, subtotais e total |
| `components/modules/comercial/VendaCard.tsx` | Componente | Card expandível com tabela de itens e dropdown de status + AlertDialogs |

## Campos reais do backend (vs. spec original)

| Spec | Backend real |
|------|-------------|
| `is_defaulter` | `is_delinquent` |
| `total_price` (item) | `subtotal` |
| — | `sold_at`, `delivered_at` em `Sale` |
| Filtro `is_defaulter` | `is_delinquent` |

## Abas

### 1. Vendas
- Select de filtro por status (`all`, `realizada`, `entregue`, `cancelada`)
- Botão "Nova Venda" abre `VendaForm`
- Lista de `VendaCard`; expandível mostra tabela de itens

### 2. Clientes
- Contador de clientes e inadimplentes (vermelho se > 0)
- Toggle "Apenas inadimplentes" filtra via `getClientes(true)`
- Botão "Novo Cliente" abre `ClienteForm`
- Lista de `ClienteRow`

## Componentes — Props

### `ClienteForm`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `open` | `boolean` | Estado do Dialog |
| `onOpenChange` | `(open: boolean) => void` | Callback |
| `client` | `Client \| null` | `null` → criação; preenchido → edição |
| `onSuccess` | `() => void` | Recarrega lista |

### `ClienteRow`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `client` | `Client` | Dados do cliente |
| `onEdit` | `() => void` | Abre form de edição |
| `onDeleted` | `() => void` | Recarrega lista |

### `VendaForm`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `open` | `boolean` | Estado do Dialog |
| `onOpenChange` | `(open: boolean) => void` | Callback |
| `clients` | `Client[]` | Opções do Select de cliente (com ⚠️ se inadimplente) |
| `stockItems` | `StockItem[]` | Itens de estoque de categoria café |
| `onSuccess` | `() => void` | Recarrega lista |

### `VendaCard`
| Prop | Tipo | Descrição |
|------|------|-----------|
| `sale` | `Sale` | Dados da venda |
| `onChanged` | `() => void` | Recarrega lista após mudança de status |

## Fluxo de status de Vendas

```
realizada → entregue  (AlertDialog de confirmação simples)
realizada → cancelada (AlertDialog: "venda será cancelada")
entregue  → cancelada (AlertDialog: "venda será cancelada")
```
- `cancelada` é status final — Select desabilitado
- Ao criar venda: backend valida estoque, registra saída, cria conta a receber (30 dias) e movimentação financeira (entrada/venda)
- Erro de estoque insuficiente: toast com mensagem exata do backend

## Aviso de inadimplência no VendaForm

- Ao selecionar um cliente, se `client.is_delinquent === true`, um banner amarelo aparece abaixo do Select: "⚠️ Este cliente está marcado como inadimplente"
- O sistema permite criar a venda mesmo assim (decisão de negócio do usuário)

## Integração com Estoque

A página busca `getItens({ category: "cafe" })` ao montar para listar apenas itens de café no `VendaForm`.
