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


class ProductionOrderStatus(str, enum.Enum):
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


def sa_enum_values(enum_cls):
    """Helper for SAEnum values_callable so DB stores the lowercase .value."""
    return [member.value for member in enum_cls]
