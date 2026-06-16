# Primitivos de UI: Calendário de Data, Seletor de Período e Combobox

Fundação reutilizável de seleção de **datas** e de **registros por busca**,
consumida pelos módulos (Financeiro, Comercial, Compras, Faturamento, Folha,
PCP, Estoque) em vez de cada tela reimplementar o seu próprio campo.

Substituem os antigos `<input type="date">` (que exibiam o calendário nativo do
navegador) e o **campo de UUID digitado** para vincular cliente/fornecedor.

Arquitetura respeitada: **Page → Service → API**. Os componentes são "burros"
(recebem `value`/emitem `onChange`); quem busca os dados (clientes, fornecedores)
é sempre o **service** do módulo — nunca há `fetch` dentro do componente.

## Para o usuário

### Seleção de data (calendário)
Onde antes havia uma caixa de data do navegador, agora há um **botão com a data
selecionada** (formato **dd/mm/aaaa**). Ao clicar, abre um **calendário**:
- **Mês e ano por dropdown** no topo — troque rapidamente para qualquer mês/ano
  sem precisar clicar seta a seta.
- Clique no dia desejado para confirmar; o calendário fecha e o botão passa a
  mostrar a data escolhida.
- A data exibida é sempre em **português (dd/mm/aaaa)**; internamente o sistema
  continua gravando no mesmo formato de antes — **sem mudança no que é salvo**.

[SCREENSHOT: botão de data fechado mostrando dd/mm/aaaa e, ao lado, o calendário aberto com os dropdowns de mês e ano]

### Seleção de período (intervalo)
Os filtros que antes tinham **dois campos de data** ("início" e "fim") agora têm
um **único seletor de período**: clique, escolha a **data inicial** e depois a
**data final** num calendário de **dois meses** lado a lado. O botão passa a
mostrar `dd/mm/aaaa – dd/mm/aaaa`. O filtro aplicado é **idêntico** ao de antes
(mesma consulta ao servidor).

[SCREENSHOT: seletor de período aberto com dois meses e um intervalo selecionado]

### Seleção de cliente/fornecedor por busca (Combobox)
Onde antes era preciso **digitar o UUID** do cliente/fornecedor, agora há uma
**lista com busca**: clique, digite parte do **nome** ou do **documento
(CPF/CNPJ)** e selecione na lista. O nome aparece com o documento abaixo para
conferência. Campos opcionais (ex.: fornecedor em conta avulsa) oferecem a opção
**"Sem fornecedor (avulsa)"**.

[SCREENSHOT: combobox de cliente aberto com a busca "Grão" filtrando a lista]

## Componentes (referência técnica)

| Arquivo | Descrição |
|---------|-----------|
| `components/ui/popover.tsx` | Primitivo Popover (Radix) — base do calendário e do combobox |
| `components/ui/calendar.tsx` | Calendário `react-day-picker` v9, locale **pt-BR**, `captionLayout="dropdown"` (mês/ano) |
| `components/ui/command.tsx` | Primitivo de busca em lista (`cmdk`) |
| `components/ui/date-picker.tsx` | **`<DatePicker>`** — data única; expõe/retorna `YYYY-MM-DD` |
| `components/ui/date-range-picker.tsx` | **`<DateRangePicker>`** — intervalo `{ from, to }` em `YYYY-MM-DD` |
| `components/ui/combobox.tsx` | **`<Combobox>`** — busca por nome/documento; submete o **UUID** |
| `lib/date.ts` | `parseISODate`/`toISODate` — conversão `YYYY-MM-DD` ↔ `Date` pelos **componentes locais** (evita off-by-one de fuso) |

**Contrato (não muda nada na API):** o texto é exibido em pt-BR, mas o valor
trafegado continua em **ISO `YYYY-MM-DD`** — igual ao `type="date"` nativo. Em
filtros de período, `from`→início e `to`→fim mapeiam para os **mesmos params**
(`due_after`/`due_before`, `start_date`/`end_date` etc.).

**Integração com formulários:** como não são `<input>` nativos, ligam-se ao
React Hook Form via `Controller`, preservando a validação Zod e as mensagens em
PT já existentes.

**Dentro de diálogos (`Dialog`):** os Popovers de data/combobox são abertos em
modo `modal` para permanecerem clicáveis sobre o overlay do diálogo.

Smoke E2E: `e2e/ui-primitives-smoke.spec.ts` (prova data em ISO sem off-by-one,
combobox submetendo UUID, cliente obrigatório e filtro de período em ISO).
