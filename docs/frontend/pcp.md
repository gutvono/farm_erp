# Módulo: PCP — Planejamento e Controle de Produção (uso)

## Visão geral da tela

O PCP controla **talhões** (áreas da fazenda, em **hectares**), **atividades** agrícolas e as
**ordens de produção** (OP) de cada safra. A partir da **Demanda 5**, a OP deixou de ser aleatória:
você informa quantos **hectares** vai usar, quais **insumos**, a **equipe por cargo**, as **máquinas/
veículos** (recursos) e **embalagens**, e a colheita é **determinística por destino** — você lança
as sacas em **Indústria**, **Embalagem** e **Descarte**. O custo aparece **discriminado** (insumos,
pessoal, máquinas, embalagens, serviços).

A página `/pcp` tem 4 abas: **Ordens de Produção**, **Talhões**, **Atividades** e **Relatórios**.

## Fluxos passo a passo (ótica do usuário)

### Cadastrar um talhão (com área em hectares)
1. Aba **Talhões** → **"Novo Talhão"**.
2. Preencha **Nome**, **Variedade**, **Capacidade (sacas)** e **Área (hectares)** (obrigatória, > 0).
   Opcional: Localização e Observações.
3. **"Criar talhão"**. O card do talhão passa a mostrar **Variedade**, **Área** (ex.: "10 ha") e
   **Capacidade**.

[SCREENSHOT: aba Talhões com um card mostrando a Área em hectares]

### Criar uma ordem de produção
1. Aba **Ordens de Produção** → **"Nova Ordem"**.
2. **Talhão**: escolha no menu (mostra a área do talhão). Ao escolher, aparece **"Disponível no
   talhão: X ha de Y ha"** — o que ainda não está reservado por outras OPs ativas.
3. **Hectares usados**: informe a área desta OP (> 0; o sistema valida contra o disponível).
4. **Insumos** (opcional): **"Adicionar insumo"**, escolha no menu (mostra o **SKU**, nome e estoque)
   e a quantidade.
5. **Equipe — requisitos por cargo**: **"Adicionar cargo"**, escolha o **cargo** (o menu mostra o
   **disponível**, ex.: "Colhedor — 8 disponíveis"), a **quantidade** de pessoas e o **vínculo**
   (CLT / PJ / Temporário). Não se escolhe mais funcionário por nome.
6. **Máquinas** e **Veículos**: **"Adicionar máquina/veículo"**, escolha no menu — que mostra o
   **SKU**, o nome e quantos estão **disponíveis** (ex.: "Colheitadeira Jacto — 0 disponíveis").
   Opcional: **horas a adicionar** (incremental; em branco não altera).
7. **Embalagens**: **"Adicionar embalagem"**, escolha a embalagem (SKU) e a quantidade.
8. **Serviços Externos** (opcional): fornecedor, descrição, valor e vencimento (a conta a pagar é
   gerada ao iniciar a produção).
9. **"Criar ordem"**. A OP nasce **Planejada**.

[SCREENSHOT: formulário Nova Ordem com cargo/máquina mostrando "N disponíveis"]

### Planejar é livre; a capacidade é validada ao iniciar (Demanda 5.1)
- **Planejar não bloqueia por capacidade.** Os menus de máquina/veículo **mostram** o disponível mas
  **não escondem** itens em uso; e os campos de quantidade aceitam **qualquer valor > 0** — você pode
  planejar acima do que há hoje.
- Quando você planeja **acima do disponível**, aparece um **aviso informativo** (sem travar o salvar),
  ex.: *"Planejado 9; há 8 disponíveis hoje — será validado ao iniciar"* (cargo) ou *"0 disponíveis
  hoje — será validado ao iniciar"* (máquina/veículo).
- O **disponível diminui** conforme outras OPs são **iniciadas** (não ao planejar). Ex.: com uma única
  Colheitadeira, depois de iniciar uma OP que a usa, a próxima OP mostra "Colheitadeira — 0 disponíveis".
- A **validação real** acontece em **Iniciar Produção**: se a capacidade (máquinas/veículos ou pessoas
  por cargo) não cobrir o necessário, o início é **bloqueado** com um toast de erro listando o que
  faltou (ver *Mensagens*). Concluir/encerrar uma OP **libera** a capacidade para as demais.

[SCREENSHOT: menu de Máquinas mostrando "Colheitadeira — 0 disponíveis" e o aviso inline]

### Iniciar a produção
1. No card da OP **Planejada**, clique **"▶ Iniciar Produção"** e confirme.
2. **Se houver capacidade**, o status vira **Em Execução** e a colheita pode ser registrada. Um
   talhão **pode** ter várias OPs ao mesmo tempo, dentro do limite de **hectares**.
3. **Se a capacidade não cobrir** o necessário, o início é **bloqueado** e aparece um toast com a
   mensagem do sistema (ex.: *"Capacidade insuficiente para iniciar — Colheitadeira: requer 1,
   disponível 0"*). Conclua/encerre outra OP para liberar e tente de novo.

### Registrar a colheita (por destino)
1. No card da OP em execução, clique **"Registrar Colheita"**.
2. Informe o **Percentual a colher** — ao digitar, aparece **"= X hectares"** (percentual × hectares
   da OP).
3. Lance as **sacas por destino**: **Indústria**, **Embalagem** e **Descarte** (ao menos uma > 0).
4. **"Confirmar colheita"**. Abre o **Resultado da Colheita** com a produção **por destino** e o
   **custo discriminado** (Insumos, Pessoal, Máquinas, Embalagens, Serviços e Total).
5. Repita até 100% (cada colheita soma ao progresso; a que fecha 100% é a **Final**).

[SCREENSHOT: modal de colheita com "= X hectares" e as 3 caixas de destino]
[SCREENSHOT: diálogo Resultado da Colheita com destinos + custo discriminado]

### Encerrar por praga (antes de 100%)
1. No card da OP em execução, clique **"Encerrar (praga)"**.
2. Informe o **Motivo** (obrigatório) e confirme.
3. A OP vira **Concluída**, registra o motivo ("Encerrada por praga: …"), libera os recursos e a
   **área restante** — que você pode usar em uma **nova OP** do mesmo talhão.

[SCREENSHOT: diálogo Encerrar por praga com o campo de motivo]

### Relatórios
Aba **Relatórios**: **Resumo de Ordens** por status, **Custo da Safra (discriminado)**
(insumos/pessoal/máquinas/embalagens/serviços/total), **Produção por Talhão** (Indústria/Embalagem/
Descarte) e **Custo Previsto vs. Realizado** por ordem.

[SCREENSHOT: aba Relatórios com o card de custo discriminado e produção por destino]

## Glossário de status / badges

| Status da OP | Significado |
|--------------|-------------|
| **Planejada** | Criada (planejar é livre); pode iniciar (valida capacidade) ou excluir |
| **Em Execução** | Produção iniciada (capacidade ocupada); pode registrar colheita ou encerrar por praga |
| **Pausada** | Em andamento, pausada; ainda pode colher/encerrar |
| **Concluída** | 100% colhido **ou** encerrada por praga; capacidade liberada (final) |
| **Cancelada** | Cancelada (final) |
| **Atrasada** | Marcador quando passou do término previsto e não está finalizada |

Outros badges no card: **hectares** (ex.: "4 ha"), papel do recurso (**Máquina/Veículo/Embalagem**),
**reservado** (máquina/veículo, no card da OP que o ocupa) e o **vínculo** do cargo (CLT/PJ/Temporário).

## Ações e botões

- **Talhões:** Novo Talhão, Editar, Excluir, Ver Atividades.
- **Ordens:** filtro por status; Nova Ordem; por card: ▶ Iniciar Produção (planejada), Registrar
  Colheita (em execução/pausada), Encerrar (praga), Excluir (planejada), expandir/recolher.
- **Colheita:** percentual + sacas por destino → Confirmar colheita.

## Mensagens e confirmações

- "Ordem de produção criada com sucesso" · "Produção iniciada!"
- **Iniciar bloqueado (capacidade):** toast de erro com a mensagem do sistema —
  *"Capacidade insuficiente para iniciar — &lt;item/cargo&gt;: requer X, disponível Y; …"*.
- Colheita: "Colheita #N registrada — X sacas" (e "· Estoque baixo: …" se algum insumo ficou abaixo
  do mínimo). **Estoque insuficiente:** toast de erro *"Estoque insuficiente para: &lt;item&gt;. …"*.
- "Ordem encerrada (praga). Status: concluída."
- Aviso inline (não é toast) ao planejar acima do disponível: *"… será validado ao iniciar"*.
- Demais erros do backend (ex.: hectares acima do disponível) também aparecem em toast.

---

## Notas técnicas (resumo)

- **Página → Service → API.** Decimais chegam como string e são convertidos (`toNumber`) no service.
- **`services/pcp.ts`:** `getInsumosDisponiveis()`, `getRecursosDisponiveis(role)` →
  `ResourceAvailable[]` (cada item com **`available_quantity`**; nada é ocultado),
  `getCargosDisponiveis()` → `CargoDisponivel[]` (`total_headcount`/`used`/`available_quantity`),
  `createOrdem(payload)` (`hectares_used`, `inputs`, `position_requirements`, `resources`, `services`),
  `iniciarProducao(id)` (pode dar **409** "Capacidade insuficiente…"),
  `registrarColheita(id, {…})` (pode dar **400** "Estoque insuficiente…"),
  `encerrarOrdem(id, reason)`, `getRelatorios()`.
  Os erros 409/400 chegam como `Error(detail)` via `apiFetch` e são exibidos pelos componentes em toast.
- **Tipos (`types/index.ts`):** `Plot.total_hectares`; `ProductionOrder` com `hectares_used`,
  `industria_sacas`/`embalagem_sacas`/`descarte_sacas`, `position_requirements`, `resources`,
  `early_closed_reason`; `ProductionHarvest` com destinos + `hectares_harvested`; `CustoDiscriminado`;
  **`ResourceAvailable`** (StockItem + `available_quantity`) e **`CargoDisponivel`** (D5.1).
  Não há mais workers nominais nem qualidades especial/superior/tradicional.
- **Componentes:** `TalhaoForm`/`TalhaoCard`, `OrdemProducaoForm`, `OrdemProducaoCard`,
  `ColheitaModal`, `ResultadoSafraDialog`, `RelatoriosPCP`.
- **Detalhe de UX:** o diálogo de resultado da colheita só recarrega a lista ao **fechar** (evita
  desmontar o card durante o spinner de carregamento).
- **E2E:** `frontend/e2e/pcp.spec.ts` cobre o fluxo D5.1 (talhão → OP com SKU e máquina mostrando
  disponível → **planejar livre** acima do disponível com aviso → iniciar consome capacidade
  (disponível reflete 0) → iniciar excedente **bloqueia (409)** → encerrar libera → iniciar passa →
  colheita por destino + custo discriminado). Roda em `make e2e` (ver `docs/frontend/_e2e-playwright.md`).
