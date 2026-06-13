# Demanda 11 — Nota fiscal "cara de NF-e" (DANFE) + emitente/impostos configuráveis

> **Status: ESCOPO TRAVADO (2026-06-12).** Decisões fechadas com o usuário após análise da imagem de
> referência (DANFE do Bling). Roda **depois da D10** (relatório de vendas, já em prod). **Sem migration**
> — todo dado necessário já existe no banco ou cabe em `app_settings` (key-value, é só INSERT).
> Prompts (BACK/FRONT) gerados sob demanda, um por sub-etapa.

## Motivação
O PDF da NF (jsPDF no `FaturaCard.tsx → generatePdf`) tem "cara de recibo". O usuário quer **cara de
NF-e de verdade** (estilo DANFE). Referência: DANFE do Bling, com a **região verde** marcada como a meta
("se já tiver isso está ótimo; o que tiver a mais é lucro"). A região verde são **3 blocos**:
**Destinatário/Remetente**, **Faturas** (parcelas/duplicatas) e **Cálculo do imposto**.

## Estado atual × meta (mapa da região verde)
| Bloco | Imagem | Hoje no PDF |
|---|---|---|
| **A · Destinatário/Remetente** | Razão social, CNPJ, Insc. Estadual, endereço, bairro, CEP, município, UF, fone, datas emissão/saída | ⚠️ só `client_name` (1 linha) |
| **B · Faturas** (parcelas) | Nº / Vencimento / Valor (×N) | ✅ já existe (bloco "PARCELAS" da D9.0; status é bônus) |
| **C · Cálculo do imposto** | BC ICMS, Vlr ICMS, BC/Vlr ICMS-ST, Vlr total produtos, frete, seguro, desconto, outras desp., IPI, Vlr total da nota | ⚠️ valores existem (ICMS/PIS/COFINS calculados + subtotal/desconto/total), mas soltos — não na grade fiscal |

## ⚓ Invariante (NÃO REGREDIR)
- **Sem migration.** O dado do destinatário **já existe** no `clients` (D7 deu endereço estruturado:
  `document`, `cep`, `street`, `number`, `complement`, `neighborhood`, `city`, `state`, `phone`,
  `email`). Hoje a `InvoiceOut` só projeta `client_name` — basta **join em `clients` por `client_id`**.
- O bloco de **parcelas** da D9.0 e a linha de **desconto** da D9.C **continuam** aparecendo.
- A NF continua **emitida no ato da venda** (timing da D9) — esta demanda é **só apresentação + config**.

## Decisões travadas (2026-06-12)
1. **Emitente (a fazenda) = Configurações (`app_settings`).** Razão social, CNPJ, IE, endereço completo
   da fazenda em `app_settings` (sem migration; padrão `multa_atraso_percent`/harvest), editáveis numa
   **aba "Empresa/Emitente"** em Configurações. Default semeado no `seed.sql`.
2. **Impostos = editáveis em Configurações (`app_settings`).** As alíquotas hoje hardcoded
   (`FISCAL_ICMS_RATE=12`, `FISCAL_PIS_RATE=0.65`, `FISCAL_COFINS_RATE=3`, IPI=0) migram para
   `app_settings` + aba **"Impostos"**; a NF calcula a partir delas. Cumpre a 2ª dor original da D11.
3. **Layout = DANFE completo.** Redesenho do PDF com caixas/bordas, título **DANFE**, **"DOCUMENTO SEM
   VALOR FISCAL"**, série, natureza da operação, faixa de canhoto ("RECEBEMOS DE…"), chave de acesso
   fake. Visual de NF-e de verdade.

## Alcance por tipo de NF (TRAVADO — não espalhar o DANFE)
A "região verde" é intrinsecamente de **VENDA**: só a nota de venda tem `client_id` (destinatário +
endereço estruturado), parcelas (`accounts_receivable` por `invoice_id`) e desconto (9.C). Recebimento e
devolução são de **compra** → apontam pro **fornecedor** (hoje só **texto em `notes`**:
`order_id=… — supplier_name`, sem `supplier_id`/endereço estruturado) e têm `client_id` **nulo**; pôr
"Emitente = Fazenda / Destinatário = vazio" nelas é **fiscalmente invertido**. Logo:

| Tipo | Layout após D11 | Por quê |
|---|---|---|
| **venda** | **DANFE novo** (11.4) + emitente-fazenda (11.1) + destinatário (11.3) + parcelas + desconto | tem todos os dados e a semântica correta |
| recebimento · devolução | **mantém o layout rico atual** (`generatePdf`); **só herda as alíquotas configuráveis** (11.2) | papéis invertidos; sem `client_id`/parcelas. Inverter (fornecedor=emitente) seria outra demanda e pediria migration |
| transporte · serviço · folha | **mantém `generateSimplePdf`** (inalterado) | só descrição + total; nem bloco fiscal |

- **11.1 (emitente-fazenda)** aplica-se **só à venda**.
- **11.2 (impostos configuráveis)** é a **única** sub-etapa que cruza a fronteira: `calcTax` lê
  `app_settings` e **venda + recebimento + devolução** passam a usar as **MESMAS** alíquotas (fonte única
  da verdade — decisão 2026-06-12). Transporte/serviço/folha não têm bloco fiscal, não afetados.
- **11.3 (destinatário na `InvoiceOut`)** degrada com elegância: `client_id` nulo → campos nulos, PDF
  não quebra.

## Fora de escopo (exibir fixo/`0,00`, como o próprio exemplo Bling faz)
ICMS-ST, frete, seguro, IPI real, NCM por item editável, peso bruto/líquido, transportadora, **Inscrição
Estadual do cliente** (não há coluna — campo em branco/"ISENTO"). Trazer de verdade = migration + regra
fiscal = fora do "simples". O TCC ganha a **aparência** fiscal sem o peso.

## Sub-etapas (independentes e testáveis — gerar prompts uma por vez)

### 11.1 — Configurações: Emitente/Empresa (BACK + FRONT)
- **Backend:** chaves `emitter_*` em `app_settings` (razão social, CNPJ, IE, CEP, logradouro, número,
  complemento, bairro, município, UF, telefone) + get/set no `configuracoes/service.py` + schema/router.
- **DBA/seed:** defaults no `seed.sql` (dados realistas da fazenda).
- **Front:** aba "Empresa" em `configuracoes/page.tsx` (espelha `EncargosTab`).
- **Done:** editar emitente em Configurações → valor persiste (SELECT em `app_settings`).

### 11.2 — Configurações: Impostos (BACK + FRONT)
- **Backend:** chaves `icms_percent`, `pis_percent`, `cofins_percent`, `ipi_percent` em `app_settings` +
  get/set + defaults seedados com os valores hardcoded atuais (12 / 0,65 / 3 / 0).
- **Front:** aba "Impostos" em Configurações.
- **Alcance:** `calcTax` passa a ler as taxas → **venda + recebimento + devolução** usam as MESMAS
  alíquotas (fonte única). Transporte/serviço/folha inalterados.
- **Done:** alterar ICMS % → reflete no cálculo da próxima NF de venda **e** de recebimento gerada.

### 11.3 — Backend: Destinatário completo na `InvoiceOut` (BACK)
- **Backend:** `InvoiceOut` ganha os campos do cliente via join `clients` por `client_id`
  (document/endereço estruturado/telefone). **Sem migration.** Notas sem `client_id` (recebimento etc.)
  → campos nulos, PDF degrada com elegância.
- **Front (types):** `Invoice` ganha os campos opcionais.
- **Done:** GET fatura de venda traz o endereço do cliente; smoke com SELECT no `clients`.

### 11.4 — Front: redesenho DANFE do PDF (FRONT — headline)
- **Front:** reescrever `generatePdf` (NF de venda) no estilo DANFE com os 3 blocos da região verde +
  emitente (config 11.1) + grade de imposto (alíquotas da 11.2) + chrome DANFE. Consome emitente/impostos
  via service de Configurações. Mantém parcelas (D9.0) e desconto (D9.C). **Só a NF de venda** ganha o
  DANFE; recebimento/devolução **continuam no `generatePdf` atual** e transporte/serviço/folha no
  `generateSimplePdf` (ver "Alcance por tipo de NF").
- **Done:** PDF da NF de **venda** parcelada e à vista sai com cara de DANFE; parcelas + desconto
  presentes; cliente sem endereço não quebra; **as demais NFs continuam gerando igual a hoje** (regressão).

## Sequência sugerida
**11.1 + 11.2 (Configurações, base de dados de exibição) → 11.3 (destinatário no out) → 11.4 (PDF).**
11.1/11.2/11.3 são pré-requisito de dados do 11.4 (o redesenho).

## Relação com outras demandas
- Reusa `app_settings`/Configurações (padrão D9.B das taxas de encargo) e o endereço estruturado do
  cliente da D7. Mostra parcelas (D9.0) e desconto (D9.C). **Sem roles** (decisão do usuário — TCC).
- Ver [[project_d11_nf_impostos]], [[project_future_money_flow_refac]] (D9), [[project_d10_relatorio_vendas]].
