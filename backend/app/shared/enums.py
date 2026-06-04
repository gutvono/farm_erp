import enum


class NotificationType(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    SUCCESS = "success"


class ContractType(str, enum.Enum):
    CLT = "clt"
    PJ = "pj"
    TEMPORARIO = "temporario"


class StockCategory(str, enum.Enum):
    CAFE = "cafe"
    INSUMO = "insumo"
    VEICULO = "veiculo"
    EQUIPAMENTO = "equipamento"
    OUTRO = "outro"


class StockUnit(str, enum.Enum):
    SACA = "saca"
    LITRO = "litro"
    KG = "kg"
    UNIDADE = "unidade"


class SystemRole(str, enum.Enum):
    """Papel de sistema atribuído a uma categoria de estoque (Demanda 3 / D3).

    Como as categorias passam a ser livres (tabela `stock_categories`), o
    sistema não consegue "adivinhar" o que é máquina/veículo/insumo etc. Este
    enum é o vocabulário fixo que o admin mapeia para cada categoria
    (`category_role_assignments`), e que PCP/Comercial consomem para entender
    os itens. A ORDEM aqui define a ordem dos valores no tipo Postgres
    `system_role` (via `sa_enum_values`) — espelhada na migration 0015.
    """

    MAQUINA = "maquina"
    VEICULO = "veiculo"
    EMBALAGEM = "embalagem"
    INSUMO = "insumo"
    PRODUTO_FINAL = "produto_final"
    PRODUTO_INACABADO = "produto_inacabado"
    PRODUTO_DESCARTADO = "produto_descartado"
    PRODUTO_VENDAVEL = "produto_vendavel"


class MovementType(str, enum.Enum):
    ENTRADA = "entrada"
    SAIDA = "saida"


class FinancialCategory(str, enum.Enum):
    VENDA = "venda"
    COMPRA = "compra"
    FOLHA = "folha"
    PRODUCAO = "producao"
    AJUSTE = "ajuste"
    RECEBIMENTO = "recebimento"
    PAGAMENTO = "pagamento"
    SALDO_INICIAL = "saldo_inicial"
    OUTRO = "outro"


class AccountPayableStatus(str, enum.Enum):
    EM_ABERTO = "em_aberto"
    PAGA = "paga"
    CANCELADA = "cancelada"


class AccountReceivableStatus(str, enum.Enum):
    EM_ABERTO = "em_aberto"
    QUITADO = "quitado"
    PARCIALMENTE_PAGO = "parcialmente_pago"
    CANCELADA = "cancelada"


class SaleStatus(str, enum.Enum):
    REALIZADA = "realizada"
    ENTREGUE = "entregue"
    CANCELADA = "cancelada"


class PurchaseOrderStatus(str, enum.Enum):
    EM_ANDAMENTO = "em_andamento"
    AGUARDANDO_APROVACAO_FINANCEIRO = "aguardando_aprovacao_financeiro"
    APROVADA = "aprovada"
    EM_CONFERENCIA = "em_conferencia"
    AGUARDANDO_PAGAMENTO = "aguardando_pagamento"
    CONCLUIDA = "concluida"
    CANCELADA = "cancelada"


class PurchaseOrderReceiptStatus(str, enum.Enum):
    PENDENTE = "pendente"
    CONFERIDO = "conferido"


class QuotationStatus(str, enum.Enum):
    EM_ANDAMENTO = "em_andamento"
    AGUARDANDO_APROVACAO_FINANCEIRO = "aguardando_aprovacao_financeiro"
    APROVADO_FINANCEIRO = "aprovado_financeiro"
    CONCLUIDA = "concluida"
    CANCELADA = "cancelada"


class InvoiceStatus(str, enum.Enum):
    EMITIDA = "emitida"
    PAGA = "paga"
    CANCELADA = "cancelada"


class PayrollPeriodStatus(str, enum.Enum):
    ABERTA = "aberta"
    FECHADA = "fechada"


class PayrollEntryStatus(str, enum.Enum):
    PENDENTE = "pendente"
    PAGO = "pago"


class PayrollEventType(str, enum.Enum):
    PROVENTO = "provento"
    DESCONTO = "desconto"
    INFORMATIVO = "informativo"


class PayrollCalculationType(str, enum.Enum):
    MANUAL = "manual"
    OVERTIME = "overtime"
    NIGHT_SHIFT = "night_shift"
    INSS = "inss"
    FGTS = "fgts"
    TRANSPORT_VOUCHER = "transport_voucher"


class PayrollItemSource(str, enum.Enum):
    MANUAL = "manual"
    AUTOMATIC = "automatic"


class ProductionOrderStatus(str, enum.Enum):
    PLANEJADA = "planejada"
    EM_PRODUCAO = "em_producao"
    EM_EXECUCAO = "em_execucao"
    PAUSADA = "pausada"
    CONCLUIDA = "concluida"
    CANCELADA = "cancelada"


class PlotActivityType(str, enum.Enum):
    PLANTIO = "plantio"
    ADUBACAO = "adubacao"
    PODA = "poda"
    COLHEITA = "colheita"
    IRRIGACAO = "irrigacao"
    OUTRA = "outra"


class LaborType(str, enum.Enum):
    INTERNA = "interna"
    EXTERNA = "externa"


class CoffeeQuality(str, enum.Enum):
    ESPECIAL = "especial"
    SUPERIOR = "superior"
    TRADICIONAL = "tradicional"


class PaymentMethod(str, enum.Enum):
    A_VISTA = "a_vista"
    PARCELADO = "parcelado"
    PIX = "pix"
    BOLETO = "boleto"


def sa_enum_values(enum_cls):
    """Helper for SAEnum values_callable so DB stores the lowercase .value."""
    return [member.value for member in enum_cls]
