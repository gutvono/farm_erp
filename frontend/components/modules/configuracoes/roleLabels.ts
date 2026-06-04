import { SystemRole } from "@/types/index"

/**
 * Rótulos e textos de ajuda (em PT) dos papéis de sistema. Os VALORES dos papéis
 * vêm de `GET /api/configuracoes/papeis` (fonte da verdade); aqui ficam apenas a
 * apresentação e a explicação do que cada papel habilita no sistema.
 */
export const ROLE_LABELS: Record<SystemRole, string> = {
  maquina: "Máquina",
  veiculo: "Veículo",
  embalagem: "Embalagem",
  insumo: "Insumo",
  produto_final: "Produto final",
  produto_inacabado: "Produto inacabado",
  produto_descartado: "Produto descartado",
  produto_vendavel: "Produto vendável",
}

export const ROLE_HELP: Record<SystemRole, string> = {
  maquina:
    "Itens de máquina/equipamento. Habilitam o campo de custo por hora no cadastro do item.",
  veiculo:
    "Veículos da frota. Habilitam o campo de custo por hora no cadastro do item.",
  embalagem:
    "Material usado para embalar o café (pode ser usado como destino de Embalagem da colheita).",
  insumo:
    "Insumos consumidos na produção (adubo, defensivo, calcário…). O PCP baixa estes itens do estoque ao produzir a safra.",
  produto_final:
    "Café produzido na safra. O PCP enxerga estes itens como produção de café e registra o resultado da colheita neles.",
  produto_inacabado:
    "Produto ainda em processamento, não finalizado.",
  produto_descartado:
    "Itens de descarte/refugo (pode ser usado como destino de Descarte da colheita).",
  produto_vendavel:
    "O item aparece na tela de Venda do Comercial para ser vendido a clientes.",
}

export function roleLabel(role: SystemRole): string {
  return ROLE_LABELS[role] ?? role
}
