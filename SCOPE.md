# Coffee Farm ERP - Escopo Completo do Produto

## 1. Core / Layout Global

### Sidebar Navegação
- Menu lateral com ícones e labels dos módulos
- Collapse/expand responsivo
- Módulos: Dashboard, Autenticação, Comercial, Compras, Estoque, Faturamento, Financeiro, Folha de Pagamento, PCP

### Sino de Notificações
- Ícone de sino no header
- Badge com contagem de notificações não lidas
- Painel ao clicar:
  - Lista de notificações com timestamp
  - Botão "Marcar como lida" por notificação
  - Clique em notificação navega ao módulo correspondente
  - Notificações persistem no banco

### Dashboard
- **KPIs visíveis:**
  - Faturamento do mês (R$)
  - Saldo atual em Financeiro (R$)
  - Estoque crítico (quantidade de itens abaixo do mínimo)
  - Ordens em aberto (total de pedidos/compras não finalizados)
- Gráficos: receitas × despesas por mês, tendência de estoque
- Acesso rápido aos módulos principais

---

## 2. Autenticação

### Login
- Tela de login com usuário + senha
- Validação de credenciais
- Sessão via cookie HTTP (seguro, httpOnly)
- Redirecionamento automático após login

### Proteção de Rotas
- Middleware que valida sessão
- Redirecionamento para login se inativo
- Estrutura preparada para migração futura para JWT (sem reescrita)

### Gerenciamento de Sessão
- Cookie seguro com TTL configurável
- Logout limpa sessão

---

## 3. Financeiro

### Conta Corrente
- Saldo = Total Entradas − Total Saídas
- Toda operação do sistema gera linha na tabela de movimentações:
  - Vendas geram movimentação
  - Compras geram movimentação
  - Pagamentos geram movimentação
  - Até movimentos internos (ex: ajuste de estoque) geram movimentação com valor R$0,00

### Contas a Pagar
- Lista com filtros: fornecedor, status, período
- Card por conta com:
  - Detalhes: número, fornecedor, valor, vencimento, descrição
  - Botão "Pagar": valida saldo em Conta Corrente, deduz e marca como Pago
  - Botão "Cancelar": marca como Cancelada (status final, sem retorno)
- Status: Em aberto → Paga → Cancelada

### Contas a Receber
- Lista com filtros: cliente, status, período
- Card por conta com:
  - Detalhes: número, cliente, valor, vencimento, descrição
  - Campo "Valor Recebido" (pode ser parcial)
  - Botão "Recebido": atualiza status para Quitado ou Parcialmente pago (conforme valor)
  - Botão "Cliente não vai pagar": marca conta como Cancelada E marca cliente como inadimplente
- Status: Em aberto → Quitado / Parcialmente pago → Cancelada

### Inadimplência
- Cliente marcado como inadimplente quando conta é cancelada por não pagamento
- Campo `inadimplente` na tabela customers
- Reversão manual: botão na tela de clientes
- Relatório de inadimplência: lista clientes e total devido

### Fluxo de Caixa
- Período selecionável (mês, trimestre, ano)
- Gráfico: receitas (azul) × despesas (vermelho) por período
- Tabela: entrada e saída por tipo
- Filtros por categoria de movimentação

### Relatório de Inadimplência
- Clientes inadimplentes
- Total devido por cliente
- Data da última transação

---

## 4. Comercial

### CRUD de Clientes
- Nome, email, telefone, endereço, CPF/CNPJ
- Campo `inadimplente` visível e revertível (botão)
- Saldo total de pendências
- Histórico de vendas

### Venda Direta
- Sem pedido intermediário
- Criação com:
  - Cliente (seleção)
  - Itens: tipo/qualidade de café, quantidade, preço unitário, subtotal
  - Status inicial: Realizada
- Botão "Criar Venda"

### Gestão de Status
- Dropdown de status: **Realizada → Entregue → Cancelada**
- Realizada: status padrão, operação completa
- Entregue: venda entregue ao cliente
- Cancelada: **status final, sem retorno**

### Ao Criar Venda (Status Realizada)
1. **Baixa no Estoque:** reduz quantidade de cada café vendido
2. **Gera Fatura:** cria entrada na tabela invoices (estado Emitida)
3. **Lança Conta a Receber:** cria entrada em accounts_receivable
4. **Gera Movimentação:** entry na tabela financial_movements com descrição da venda

---

## 5. Compras

### CRUD de Fornecedores
- Nome, email, telefone, endereço, CNPJ
- Saldo total de compras
- Histórico de compras

### Ordem de Compra
- Fornecedor (seleção)
- Itens: produto, quantidade, preço unitário
- Status inicial: Em andamento
- Botão "Criar Compra"

### Gestão de Status
- Dropdown de status: **Em andamento → Concluída → Cancelada**
- Em andamento: padrão, aguardando recebimento
- Concluída: **status final**, entrada registrada
- Cancelada: **status final**, sem retorno

### Ao Mudar para Concluída
1. **Entrada no Estoque:** aumenta quantidade de cada item
2. **Lança Conta a Pagar:** cria entrada em accounts_payable
3. **Gera Movimentação:** entry na tabela financial_movements

---

## 6. Estoque

### CRUD de Itens
- Categoria: qualquer tipo (café, insumo, veículo, equipamento)
- Nome, SKU, unidade (sacas, litros, kg, etc.)
- Estoque mínimo (threshold para alerta)
- Custo unitário (para cálculo de valor total)
- Quantidade em estoque (somente leitura, calculado das movimentações)

### Entrada Manual
- Item (seleção)
- Quantidade e custo
- Gera movimentação no Financeiro (mesmo que R$0,00 se for ajuste interno)

### Tela de Movimentações
- Filtros: item, tipo (entrada/saída), período, descrição
- Ordenação por todos os campos
- Colunas: data, item, tipo, quantidade, valor unitário, valor total, descrição, módulo origem

### Alerta de Estoque Mínimo
- Consulta automática ao abrir dashboard
- Se quantidade < estoque_mínimo:
  - Gera notificação no sino
  - Alerta na tela de estoque

### Relatório de Inventário (PDF)
- Botão "Gerar Inventário"
- PDF com:
  - Todos os itens
  - Quantidade em estoque
  - Custo unitário
  - Valor total (quantidade × custo)
  - Grand total do inventário

---

## 7. Faturamento

### Geração Automática
- Criada automaticamente ao vender (Comercial)
- Status: Emitida

### Criação Manual
- Fatura avulsa sem venda associada
- Campos: cliente, itens, data de emissão, vencimento
- Status: Emitida

### Gestão de Status
- Status: **Emitida → Paga → Cancelada**
- Emitida: padrão
- Paga: quando conta a receber é quitada
- Cancelada: manual, status final

### Exportação de Fatura
- Botão por fatura: "Exportar PDF"
- PDF com: cabeçalho, cliente, itens, total, data de emissão, assinatura (preparado para assinatura digital)

---

## 8. Folha de Pagamento

### Cadastro de Funcionários
- Nome, CPF, email, telefone
- Cargo
- Salário base
- Tipo de contrato: CLT / PJ / Temporário
- Data de admissão
- Foto (salva em `/uploads`, silhueta SVG default se ausente)
- Status: Ativo / Demitido

### Demissão
- Botão "Demitir funcionário"
- Custo de demissão por tipo:
  - CLT: cálculo completo (13º proporcional, FGTS, aviso prévio indenizado)
  - PJ: sem obrigações
  - Temporário: sem obrigações
- Lança saída no Financeiro
- Marca como Demitido, mas mantém histórico

### Lançamentos Mensais
- Por funcionário/mês:
  - Extras (horas + valor/hora)
  - Faltas (quantidade + desconto)
  - Descontos manuais (vale, adiantamento, etc.)

### Cálculo Automático da Folha
- Por competência (mês)
- Fórmula: salário_base + extras − faltas − descontos
- Resultado: valor líquido por funcionário
- Status: Aberta → Fechada

### Holerite Individual
- Visualização: resumo de salário, descontos, extras, total
- Botão "Exportar PDF"
- PDF com assinatura digital preparada

### Fechamento de Folha
- Status muda de Aberta para Fechada
- Sem alterações após fechamento (auditoria)

### Pagamento
- **Individual:** botão "Pagar" por funcionário
- **Em lote:** botão "Pagar todos"
- Validação: saldo em Conta Corrente
- Deduz do Financeiro
- Marca como Pago
- Gera movimentação por funcionário

---

## 9. PCP (Planejamento e Controle de Produção)

### Cadastro de Talhões/Áreas
- Nome (ex: "Talhão A - Arábica")
- Localização
- Variedade (Arábica, Robusta, Bourbon, etc.)
- Capacidade (sacas de 60kg por safra)

### Registro de Atividades
- Talhão (seleção)
- Atividade: plantio, adubação, poda, colheita, etc.
- Data
- Detalhes (mão de obra interna/externa, custo)
- Se mão de obra interna: gera movimentação no Financeiro com valor R$0,00

### Produção de Safra
- Botão "Produzir Safra" por talhão
- Execução instantânea:

  **Passo 1:** Baixa Insumos
  - Gera movimentação no Financeiro (valor R$0,00)
  
  **Passo 2:** Simula Resultado
  - Algoritmo: distribui sacas entre qualidades:
    - Especial: ~20% (±10% aleatório)
    - Superior: ~50% (±10% aleatório)
    - Tradicional: ~30% (±10% aleatório)
  - Exemplo: capacidade 100 sacas → ~20 especial, ~50 superior, ~30 tradicional
  
  **Passo 3:** Insere Café Produzido
  - Cria 3 entradas de estoque (uma por qualidade)
  - Unidade: sacas de 60kg
  - Gera movimentação no Financeiro
  
  **Passo 4:** Verifica Insumos
  - Se algum insumo cair abaixo do mínimo → gera notificação no sino

### Histórico de Safras
- Talhão (seleção)
- Listagem com: data, quantidade colhida por qualidade, custo, resultado
- Card com detalhes expandíveis

---

## 10. Seed e Reset

### Dados Iniciais (scripts/seed.sql)
- **1 usuário admin** (user: admin, password: hardcoded temporário para desenvolvimento)
- **5-8 funcionários** com contratos variados:
  - 2 CLT
  - 1 PJ
  - 2 Temporários
  - Com fotos ou silhueta default
- **Produtos de café:**
  - 3 qualidades: Especial, Superior, Tradicional
  - Sacas de 60kg, com custo base
- **Insumos:**
  - Fertilizante, adubo, pesticida com quantidades e custos
- **Clientes:**
  - 10-15 clientes com histórico de vendas
- **Fornecedores:**
  - 5-8 fornecedores de insumos e café
- **Histórico de Movimentações:**
  - 30-50 entradas com saldo inicial, vendas, compras, ajustes
- **Saldo Inicial:**
  - R$ 50.000,00 em Conta Corrente
- **1 Safra Registrada:**
  - Histórico com resultado de produção anterior

### Reset do Banco
**Comando:** `make reset-db`
- Dropa o banco
- Recria schema (via alembic upgrade head)
- Popula com seed.sql
- Saída: "Database reset complete" com contagem de records criados

**Alternativa:** `python scripts/reset_db.py`
- Mesmo resultado do make

---

## Resumo de Módulos e Integrações

| Módulo | Cria | Lê | Atualiza | Deleta | Integra com |
|--------|------|-----|----------|--------|-------------|
| Comercial | Vendas | Clientes | Status venda | (soft) | Estoque, Faturamento, Financeiro |
| Compras | Ordens | Fornecedores | Status ordem | (soft) | Estoque, Financeiro |
| Estoque | Itens | Movimentações | Quantidades | (nunca) | Comercial, Compras, Financeiro, PCP |
| Faturamento | Faturas | Vendas | Status fatura | (soft) | Comercial, Financeiro |
| Financeiro | Movimentações | Contas | Saldo | (nunca) | Todos |
| Folha | Funcionários | Lançamentos | Folha | (soft) | Financeiro |
| PCP | Talhões, Safras | Atividades | Safras | (soft) | Estoque, Financeiro |

---

## Critério de Conclusão

Cada módulo é considerado completo quando:
- ✅ CRUD completo ou operações definidas
- ✅ Validações de negócio implementadas
- ✅ Integrações com outros módulos funcionando
- ✅ Testes unitários + integração passando
- ✅ Documentação em docs/[backend|frontend]/[modulo].md
- ✅ Build passando (npm run build + backend health check)
- ✅ Demonstração de happy path funcionando end-to-end
