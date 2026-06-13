# Frontend Module: Configurações (uso)

> Esta documentação serve de base para o **Manual do Usuário Final**. Descreve, na
> ótica do usuário, o que a tela **Configurações** mostra e o que o sistema faz em
> resposta. A referência técnica está ao final.

## Visão geral da tela

**Configurações** (item **Configurações** no menu lateral, ícone de engrenagem) é onde
o administrador define os dados da empresa, como o estoque é organizado e como o
sistema "entende" cada item. Tem seis abas:

- **Empresa** — dados do emitente (a fazenda) que aparecem no cabeçalho da nota fiscal
  (Demanda 11.1).
- **Impostos** — alíquotas de ICMS, PIS, COFINS e IPI usadas no cálculo de imposto
  exibido no PDF da nota fiscal (Demanda 11.2).
- **Categorias** — cadastro das categorias de estoque (ex.: Café, Insumo, Veículo).
- **Papéis de Sistema** — para cada categoria, marca o que aquela categoria habilita
  no sistema (ex.: aparecer na venda, ser tratada como produção de café…).
- **Destinos da Colheita** — define quais itens de estoque recebem o café conforme o
  destino na colheita (Indústria / Embalagem / Descarte).
- **Encargos por Atraso** — define a **multa por atraso (%)** e os **juros de mora ao
  mês (%)** cobrados quando uma parcela vencida é quitada (Demanda 9.B).

> Antes, a categoria era uma lista fixa embutida no sistema. Agora a categoria é
> **livre/cadastrável**, e são os **papéis** que dizem ao sistema o que cada categoria
> significa. Por isso, depois de criar uma categoria, normalmente você também define
> os papéis dela.

[SCREENSHOT: tela Configurações com as três abas (Categorias, Papéis de Sistema, Destinos da Colheita)]

---

## 1. Fluxos passo a passo

### 1.0 Preencher os dados da empresa (Emitente da fazenda)

A aba **Empresa** é a **primeira** da tela e guarda os dados da fazenda que aparecem no
cabeçalho do PDF da nota fiscal.

1. Abra **Configurações → Empresa**.
2. O formulário carrega já preenchido com os dados salvos, agrupados em duas seções:
   - **Identificação** — Razão social, Nome fantasia, CNPJ e Inscrição Estadual.
   - **Endereço** — CEP, Logradouro, Número, Complemento, Bairro, Município, UF,
     Telefone e Email.
3. Edite os campos desejados. A **Razão social** é **obrigatória**; os demais campos são
   opcionais e podem ficar em branco.
4. Clique em **"Salvar dados"**. Em caso de sucesso aparece o toast *"Dados do emitente
   salvos com sucesso"* e o formulário recarrega com os valores atualizados.
   - Se a **Razão social** estiver vazia, o salvamento é bloqueado e aparece a mensagem
     *"Razão social é obrigatória"* abaixo do campo.

[SCREENSHOT: aba Empresa com as seções Identificação e Endereço preenchidas]

### 1.0.1 Definir os impostos (alíquotas da nota fiscal)

A aba **Impostos** guarda as alíquotas usadas no cálculo de imposto que aparece no PDF
da nota fiscal. Elas valem para as notas de **venda**, **recebimento** e **devolução**
(as que têm o detalhamento fiscal). Notas de transporte, serviço e folha não têm bloco
de impostos e não são afetadas.

1. Abra **Configurações → Impostos**.
2. O formulário carrega com os valores atuais — por padrão **ICMS 12%**, **PIS 0,65%**,
   **COFINS 3%** e **IPI 0%**.
3. Ajuste os percentuais desejados (cada um entre 0 e 100).
4. Clique em **"Salvar alíquotas"**. Em caso de sucesso aparece o toast *"Alíquotas
   salvas com sucesso"*.
   - Valores **negativos** ou **acima de 100%** são bloqueados com a mensagem de erro
     abaixo do campo (*"Não pode ser negativo"* / *"Não pode passar de 100%"*).
5. A partir daí, **toda nota fiscal gerada** (botão **PDF** no Faturamento) passa a
   exibir o imposto calculado com as novas alíquotas. Ex.: alterar o ICMS para 18% faz
   o bloco fiscal e a coluna **ICMS** do PDF refletirem 18%.

[SCREENSHOT: aba Impostos com os quatro campos ICMS / PIS / COFINS / IPI]

### 1.1 Gerenciar categorias

1. Abra **Configurações → Categorias**.
2. A tabela lista as categorias com **Nome**, **Descrição**, **Papéis** e **Situação**
   (Ativa/Inativa). Use a busca **"Buscar categoria por nome..."** ou clique no
   cabeçalho **Nome** para ordenar.
3. Clique em **"Nova Categoria"**, preencha **Nome** (obrigatório), **Descrição**
   (opcional) e **Situação** (Ativa por padrão) e clique em **"Cadastrar categoria"**.
4. Para alterar, clique em **"Editar"** na linha; para remover, clique em **"Excluir"**
   e confirme.
   - Se a categoria **tiver itens de estoque vinculados**, a exclusão é **bloqueada**
     com a mensagem *"Não é possível excluir uma categoria com itens vinculados"*; a
     categoria **permanece**.
   - Depois de remover/reclassificar os itens daquela categoria, a exclusão funciona.

[SCREENSHOT: aba Categorias com a tabela e os botões Nova Categoria / Editar / Excluir]

### 1.2 Mapear os papéis de uma categoria

Os **papéis** conectam a categoria aos efeitos no sistema. Uma categoria pode ter
**vários** papéis ao mesmo tempo.

1. Abra **Configurações → Papéis de Sistema**.
2. No topo há o quadro **"O que cada papel faz"** — a explicação de cada papel.
3. Cada categoria aparece num cartão com os 8 papéis como **botões**. Clique para
   **marcar/desmarcar** (o botão marcado fica destacado com um ✓).
4. Clique em **"Salvar papéis"** no cartão da categoria. O botão fica disponível
   somente quando houver mudança.
5. O conjunto é **substituído** por inteiro ao salvar (o que estiver marcado vira o
   novo conjunto; desmarcar tudo remove os papéis).

   Exemplo: a categoria **"Café"** pode ter **Produto final** **e** **Produto vendável**
   marcados ao mesmo tempo — assim o PCP registra a produção da safra nesses itens e o
   Comercial consegue vendê-los.

[SCREENSHOT: aba Papéis de Sistema, cartão de uma categoria com vários papéis marcados e o botão Salvar papéis]

### 1.3 Definir os destinos da colheita

1. Abra **Configurações → Destinos da Colheita**.
2. Em **Indústria**, **Embalagem** e **Descarte**, escolha o item de estoque que
   recebe o café em cada destino.
3. Clique em **"Salvar destinos"** (disponível quando os três estiverem escolhidos).
4. Ao reabrir a aba, os destinos aparecem **pré-carregados** com o que foi salvo.

[SCREENSHOT: aba Destinos da Colheita com os três seletores preenchidos]

### 1.4 Definir os encargos por atraso

1. Abra **Configurações → Encargos por Atraso**.
2. Informe a **Multa por atraso (%)** — percentual fixo cobrado **uma vez** sobre o
   saldo devedor quando uma parcela vencida é quitada.
3. Informe os **Juros de mora ao mês (%)** — aplicados **pro-rata** pelos dias de
   atraso (ex.: 1% ao mês ≈ 0,033% ao dia). Ambos os campos aceitam **0** (sem encargo).
4. Clique em **"Salvar taxas"**. Ao reabrir, os valores aparecem **pré-carregados**.

> As taxas alimentam o cálculo do encargo na **baixa de parcela vencida** (módulo
> Financeiro → Contas a Receber). O encargo só é cobrado na **quitação total** da
> parcela e entra como um **movimento financeiro separado** do principal.

[SCREENSHOT: aba Encargos por Atraso com multa e juros preenchidos]

---

## 2. Glossário

### Papéis de sistema (o que cada um habilita)

| Papel | O que habilita |
|-------|----------------|
| **Máquina** | Itens de máquina/equipamento; habilita o campo **Custo por Hora** no cadastro do item. |
| **Veículo** | Veículos da frota; habilita o campo **Custo por Hora** no cadastro do item. |
| **Embalagem** | Material de embalagem do café (pode ser destino de Embalagem da colheita). |
| **Insumo** | Insumos consumidos na produção (adubo, defensivo, calcário…); o PCP baixa do estoque ao produzir a safra. |
| **Produto final** | Café produzido na safra; o PCP registra o resultado da colheita nesses itens. |
| **Produto inacabado** | Produto em processamento, ainda não finalizado. |
| **Produto descartado** | Itens de descarte/refugo (pode ser destino de Descarte da colheita). |
| **Produto vendável** | O item **aparece na tela de Venda do Comercial** para ser vendido a clientes. |

### Situação da categoria

| Badge | Significado |
|-------|-------------|
| **Ativa** (verde) | Categoria disponível para uso no cadastro de itens. |
| **Inativa** (cinza) | Categoria desativada. |

---

## 3. Ações da tela

| Aba | Ação | O que faz |
|-----|------|-----------|
| Categorias | **Buscar / Ordenar (Nome)** | Filtra/ordena server-side |
| Categorias | **Nova Categoria / Editar / Excluir** | Cadastra, altera ou remove (exclusão bloqueada se houver itens) |
| Papéis | **Marcar/desmarcar papel** | Ajusta o conjunto de papéis da categoria |
| Papéis | **Salvar papéis** | Substitui o conjunto de papéis no servidor |
| Destinos | **Selecionar Indústria/Embalagem/Descarte** | Escolhe o item de cada destino |
| Destinos | **Salvar destinos** | Persiste os três destinos |
| Encargos | **Multa por atraso (%) / Juros de mora ao mês (%)** | Edita as taxas de encargo (ambas ≥ 0) |
| Encargos | **Salvar taxas** | Persiste as taxas em `app_settings` |

---

## 4. Mensagens e confirmações

- *"Categoria cadastrada com sucesso"* / *"Categoria atualizada com sucesso"*
- *"Categoria \"X\" excluída com sucesso"*
- Exclusão bloqueada (do backend, verbatim): *"Não é possível excluir uma categoria com itens vinculados"* — a categoria permanece.
- Nome duplicado (do backend): *"Já existe uma categoria com este nome"*.
- *"Papéis de \"X\" atualizados"*
- *"Destinos da colheita salvos com sucesso"*
- *"Taxas de encargo salvas com sucesso"*
- Diálogo de exclusão: *"A categoria deixará de aparecer nas listagens e no cadastro de itens. Categorias com itens vinculados não podem ser excluídas."*

---

## Referência técnica

### Page e componentes

- `app/(modules)/configuracoes/page.tsx` — quatro abas (`Tabs` shadcn).
- `CategoriasTab` + `useCategorias` — listagem paginada server-side (`DataTable` da
  Demanda 0; estado de query no hook, espelhando `useMovimentacoes`/`useCargos`);
  detém `CategoriaForm` (criar/editar) e o `AlertDialog` de exclusão. Ordenação só em
  `name` (allowlist do backend).
- `PapeisTab` — carrega `GET /papeis` (vocabulário) + categorias; multi-seleção dos 8
  papéis por categoria via botões-toggle; salva com `updateCategoriaPapeis` (replace).
- `DestinosTab` — 3 `Select` de itens (`getItens`), pré-carregados de
  `getDestinosColheita`; salva com `updateDestinosColheita`.
- `EncargosTab` — form RHF + Zod (multa % e juros %/mês, ambos ≥ 0); carrega de
  `getEncargos`, salva com `updateEncargos`; loading/saving + toasts.
- `roleLabels.ts` — `ROLE_LABELS`/`ROLE_HELP` (rótulos e ajuda em PT). Os **valores**
  dos papéis vêm de `GET /api/configuracoes/papeis` (fonte da verdade); a UI só
  apresenta/explica.

### Service (`services/configuracoes.ts`)

```typescript
getCategorias(params): Promise<Paginated<Category>>   // envelope Page[T] cru (fetchPaginated)
createCategoria({ name, description?, is_active }): Promise<Category>
updateCategoria(id, data): Promise<Category>
deleteCategoria(id): Promise<void>                     // 400 se houver item vinculado
updateCategoriaPapeis(id, roles: SystemRole[]): Promise<Category>  // PUT .../papeis (replace)
getPapeis(): Promise<SystemRole[]>                     // GET /papeis (SuccessResponse)
getDestinosColheita(): Promise<HarvestDestinations>
updateDestinosColheita({ industria_item_id, embalagem_item_id, descarte_item_id })
getEncargos(): Promise<EncargosTaxas>                 // GET /encargos
updateEncargos({ multa_atraso_percent, juros_mora_mensal_percent })  // PUT /encargos
getEmitente(): Promise<EmitenteData>                  // GET /emitente
updateEmitente(data: EmitenteData): Promise<EmitenteData>  // PUT /emitente (13 campos)
getImpostos(): Promise<ImpostosTaxas>                 // GET /impostos
updateImpostos(data: ImpostosTaxas): Promise<ImpostosTaxas>  // PUT /impostos (4 alíquotas)
```

`GET /categorias` responde o **envelope `Page[T]` cru** (por isso `fetchPaginated`);
as demais rotas usam `SuccessResponse` via `apiFetch`. Cada categoria já traz `roles`.

### Tipos (`types/index.ts`)

```typescript
type SystemRole =
  | "maquina" | "veiculo" | "embalagem" | "insumo"
  | "produto_final" | "produto_inacabado" | "produto_descartado" | "produto_vendavel"

interface Category { id; name; description; is_active; roles: SystemRole[] }
interface HarvestDestinations { industria_item_id; embalagem_item_id; descarte_item_id }  // cada um string | null
interface EncargosTaxas { multa_atraso_percent: number; juros_mora_mensal_percent: number }
interface EmitenteData {
  legal_name; trade_name; cnpj; state_registration
  cep; street; number; complement; neighborhood; city; state; phone; email
}  // todos string; só legal_name é obrigatório no form
interface ImpostosTaxas { icms_percent; pis_percent; cofins_percent; ipi_percent }  // 4 number (0–100)
```

> **Impostos × Faturamento:** a aba **Impostos** é a fonte das alíquotas que o PDF da
> nota fiscal usa. Ao gerar um PDF (venda/recebimento/devolução), o Faturamento lê
> `getImpostos()` e calcula ICMS/PIS/COFINS/IPI com esses valores. Se a leitura falhar,
> usa um fallback-padrão (12 / 0,65 / 3 / 0) para não impedir a geração do PDF.

### Integração com outros módulos

- **Estoque** consome as categorias no cadastro de item (`category_id`) e no filtro da
  aba Itens.
- **Comercial** lista itens vendáveis via `getItens({ role: "produto_vendavel" })`.
- **PCP** lista insumos via `getItens({ role: "insumo" })` e localiza o café pelo papel
  `produto_final` (backend).
