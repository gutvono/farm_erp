from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.shared.enums import (
    ContractType,
    LaborType,
    PlotActivityType,
    ProductionOrderStatus,
    SystemRole,
)


# ---------------------------------------------------------------------------
# Plots
# ---------------------------------------------------------------------------


class PlotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    location: Optional[str] = Field(default=None, max_length=255)
    variety: str = Field(min_length=1, max_length=100)
    capacity_sacas: Decimal = Field(ge=0)
    # Área total do talhão em hectares (obrigatória, > 0). Base do controle de
    # área: a soma de hectares_used das OPs ativas não pode exceder este valor.
    total_hectares: Decimal = Field(gt=0)
    notes: Optional[str] = None


class PlotUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    location: Optional[str] = Field(default=None, max_length=255)
    variety: Optional[str] = Field(default=None, min_length=1, max_length=100)
    capacity_sacas: Optional[Decimal] = Field(default=None, ge=0)
    total_hectares: Optional[Decimal] = Field(default=None, gt=0)
    notes: Optional[str] = None


class PlotOut(BaseModel):
    id: UUID
    name: str
    location: Optional[str] = None
    variety: str
    capacity_sacas: Decimal
    total_hectares: Decimal
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Plot Activities
# ---------------------------------------------------------------------------


class PlotActivityCreate(BaseModel):
    plot_id: UUID
    activity_type: PlotActivityType
    activity_date: date
    labor_type: LaborType = LaborType.INTERNA
    cost: Decimal = Field(default=Decimal("0"), ge=0)
    details: Optional[str] = None
    hours_spent: Optional[Decimal] = Field(default=None, ge=0)
    employee_id: Optional[UUID] = None
    quantity_applied: Optional[Decimal] = Field(default=None, ge=0)
    quantity_unit: Optional[str] = Field(default=None, max_length=20)
    result: Optional[str] = Field(default=None, max_length=20)


class PlotActivityOut(BaseModel):
    id: UUID
    plot_id: UUID
    plot_name: str
    activity_type: PlotActivityType
    activity_date: date
    labor_type: LaborType
    cost: Decimal
    details: Optional[str] = None
    hours_spent: Optional[Decimal] = None
    employee_id: Optional[UUID] = None
    employee_name: Optional[str] = None
    quantity_applied: Optional[Decimal] = None
    quantity_unit: Optional[str] = None
    result: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(
        cls,
        activity,
        plot_name: str,
        employee_name: Optional[str] = None,
    ) -> "PlotActivityOut":
        return cls(
            id=activity.id,
            plot_id=activity.plot_id,
            plot_name=plot_name,
            activity_type=activity.activity_type,
            activity_date=activity.activity_date,
            labor_type=activity.labor_type,
            cost=activity.cost,
            details=activity.details,
            hours_spent=activity.hours_spent,
            employee_id=activity.employee_id,
            employee_name=employee_name,
            quantity_applied=activity.quantity_applied,
            quantity_unit=activity.quantity_unit,
            result=activity.result,
            created_at=activity.created_at,
            updated_at=activity.updated_at,
        )


# ---------------------------------------------------------------------------
# Production Inputs (insumos — papel `insumo`)
# ---------------------------------------------------------------------------


class ProductionInputCreate(BaseModel):
    stock_item_id: UUID
    quantity: Decimal = Field(gt=0)


class ProductionInputOut(BaseModel):
    id: UUID
    stock_item_id: UUID
    stock_item_name: str
    sku: str
    unit: str
    quantity: Decimal
    unit_cost: Decimal
    subtotal: Decimal

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_model(
        cls, pi, stock_item_name: str, sku: str, unit: str
    ) -> "ProductionInputOut":
        return cls(
            id=pi.id,
            stock_item_id=pi.stock_item_id,
            stock_item_name=stock_item_name,
            sku=sku,
            unit=unit,
            quantity=pi.quantity,
            unit_cost=pi.unit_cost,
            subtotal=pi.subtotal,
        )


# ---------------------------------------------------------------------------
# Production Order Position Requirements (requisitos por cargo)
# ---------------------------------------------------------------------------


class PositionRequirementCreate(BaseModel):
    position_id: UUID
    quantity: int = Field(gt=0)
    contract_type: ContractType


class PositionRequirementOut(BaseModel):
    id: UUID
    position_id: UUID
    position_name: str
    quantity: int
    contract_type: ContractType
    base_salary: Decimal

    model_config = ConfigDict(use_enum_values=True)


# ---------------------------------------------------------------------------
# Production Order Resources (máquinas/veículos/embalagens)
# ---------------------------------------------------------------------------


class ProductionResourceCreate(BaseModel):
    stock_item_id: UUID
    resource_role: SystemRole
    # Quantidade — usada para embalagens (consumo). Ignorada para máquina/veículo.
    quantity: Optional[Decimal] = Field(default=None, gt=0)
    # Horas a adicionar ao criar o recurso (incremental). Campo nulo = 0 inicial.
    hours: Optional[Decimal] = Field(default=None, ge=0)


class ProductionResourceOut(BaseModel):
    id: UUID
    stock_item_id: UUID
    stock_item_name: str
    sku: str
    unit: str
    resource_role: SystemRole
    quantity: Optional[Decimal] = None
    accumulated_hours: Decimal
    hourly_cost: Optional[Decimal] = None
    # Custo do recurso = accumulated_hours × hourly_cost (0 para embalagem/sem custo/hora).
    cost: Decimal

    model_config = ConfigDict(use_enum_values=True)


class ResourceHoursIncrement(BaseModel):
    """Incremento de horas para um recurso de máquina/veículo (null-safe).

    `hours` informado é SOMADO ao `accumulated_hours` do recurso; `hours` nulo/
    omitido NÃO altera o acumulado (espelha o padrão incremental geral).
    """

    resource_id: UUID
    hours: Optional[Decimal] = Field(default=None, ge=0)


# ---------------------------------------------------------------------------
# Production Order Services (serviços externos)
# ---------------------------------------------------------------------------


class ProductionOrderServiceCreate(BaseModel):
    supplier_id: UUID
    description: str = Field(min_length=1, max_length=500)
    amount: Decimal = Field(gt=0)
    due_date: date


class ProductionOrderServiceOut(BaseModel):
    id: UUID
    supplier_id: UUID
    supplier_name: str
    description: str
    amount: Decimal
    due_date: date
    accounts_payable_id: Optional[UUID] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Production Harvests (colheita determinística por destino)
# ---------------------------------------------------------------------------


class HarvestCreate(BaseModel):
    percentage_harvested: Decimal = Field(gt=0, le=100)
    sacks_industria: Decimal = Field(default=Decimal("0"), ge=0)
    sacks_embalagem: Decimal = Field(default=Decimal("0"), ge=0)
    sacks_descarte: Decimal = Field(default=Decimal("0"), ge=0)
    # Horas a adicionar a recursos de máquina/veículo nesta colheita (incremental).
    resource_hours: list[ResourceHoursIncrement] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_total_sacks(self) -> "HarvestCreate":
        total = self.sacks_industria + self.sacks_embalagem + self.sacks_descarte
        if total <= 0:
            raise ValueError(
                "Informe ao menos uma saca em algum destino "
                "(indústria, embalagem ou descarte)"
            )
        return self


class HarvestOut(BaseModel):
    id: UUID
    production_order_id: UUID
    harvest_number: int
    percentage_harvested: Decimal
    hectares_harvested: Optional[Decimal] = None
    sacks_total: Decimal
    sacks_industria: Decimal
    sacks_embalagem: Decimal
    sacks_descarte: Decimal
    inputs_consumed: list[dict[str, Any]] = Field(default_factory=list)
    is_final: bool
    harvested_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_model(cls, harvest) -> "HarvestOut":
        return cls(
            id=harvest.id,
            production_order_id=harvest.production_order_id,
            harvest_number=harvest.harvest_number,
            percentage_harvested=harvest.percentage_harvested,
            hectares_harvested=harvest.hectares_harvested,
            sacks_total=harvest.sacks_total,
            sacks_industria=harvest.sacks_industria,
            sacks_embalagem=harvest.sacks_embalagem,
            sacks_descarte=harvest.sacks_descarte,
            inputs_consumed=harvest.inputs_consumed or [],
            is_final=harvest.is_final,
            harvested_at=harvest.harvested_at,
        )


# ---------------------------------------------------------------------------
# Production Orders
# ---------------------------------------------------------------------------


class ProductionOrderCreate(BaseModel):
    plot_id: UUID
    hectares_used: Decimal = Field(gt=0)
    planned_date: Optional[date] = None
    start_date: Optional[date] = None
    expected_end_date: Optional[date] = None
    notes: Optional[str] = None
    inputs: list[ProductionInputCreate] = Field(default_factory=list)
    position_requirements: list[PositionRequirementCreate] = Field(default_factory=list)
    resources: list[ProductionResourceCreate] = Field(default_factory=list)
    services: list[ProductionOrderServiceCreate] = Field(default_factory=list)


class ProductionOrderUpdate(BaseModel):
    """Atualização da OP durante a produção.

    Aceita campos editáveis e incrementos de horas por recurso (null-safe).
    """

    planned_date: Optional[date] = None
    start_date: Optional[date] = None
    expected_end_date: Optional[date] = None
    notes: Optional[str] = None
    resource_hours: list[ResourceHoursIncrement] = Field(default_factory=list)


class EncerrarOrdemRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class ProductionOrderOut(BaseModel):
    id: UUID
    plot_id: UUID
    plot_name: str
    order_number: Optional[str] = None
    hectares_used: Decimal
    planned_date: Optional[date] = None
    start_date: Optional[date] = None
    expected_end_date: Optional[date] = None
    executed_at: Optional[datetime] = None
    total_sacas: Decimal
    industria_sacas: Decimal
    embalagem_sacas: Decimal
    descarte_sacas: Decimal
    total_cost: Decimal
    estimated_cost: Decimal
    realized_cost: Decimal
    harvest_progress: Decimal
    status: ProductionOrderStatus
    is_overdue: bool
    early_closed_reason: Optional[str] = None
    notes: Optional[str] = None
    inputs: list[ProductionInputOut]
    harvests: list[HarvestOut] = Field(default_factory=list)
    position_requirements: list[PositionRequirementOut] = Field(default_factory=list)
    resources: list[ProductionResourceOut] = Field(default_factory=list)
    services: list[ProductionOrderServiceOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    @classmethod
    def from_model(
        cls,
        order,
        plot_name: str,
        inputs: list[ProductionInputOut],
        harvests: list[HarvestOut],
        position_requirements: Optional[list[PositionRequirementOut]] = None,
        resources: Optional[list[ProductionResourceOut]] = None,
        services: Optional[list[ProductionOrderServiceOut]] = None,
    ) -> "ProductionOrderOut":
        final_statuses = {
            ProductionOrderStatus.CONCLUIDA,
            ProductionOrderStatus.CANCELADA,
        }
        is_overdue = (
            order.expected_end_date is not None
            and order.expected_end_date < datetime.now(timezone.utc).date()
            and order.status not in final_statuses
        )
        return cls(
            id=order.id,
            plot_id=order.plot_id,
            plot_name=plot_name,
            order_number=order.order_number,
            hectares_used=order.hectares_used,
            planned_date=order.planned_date,
            start_date=order.start_date,
            expected_end_date=order.expected_end_date,
            executed_at=order.executed_at,
            total_sacas=order.total_sacas,
            industria_sacas=order.industria_sacas,
            embalagem_sacas=order.embalagem_sacas,
            descarte_sacas=order.descarte_sacas,
            total_cost=order.total_cost,
            estimated_cost=order.estimated_cost,
            realized_cost=order.realized_cost,
            harvest_progress=order.harvest_progress,
            status=order.status,
            is_overdue=is_overdue,
            early_closed_reason=order.early_closed_reason,
            notes=order.notes,
            inputs=inputs,
            harvests=harvests,
            position_requirements=position_requirements or [],
            resources=resources or [],
            services=services or [],
            created_at=order.created_at,
            updated_at=order.updated_at,
        )


class ProductionResult(BaseModel):
    order_id: UUID
    harvest: "HarvestOut"
    order: "ProductionOrderOut"
    items_below_minimum: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------


class CustoDiscriminado(BaseModel):
    """Custo da OP/safra quebrado por tipo (decisão TRAVADA da Demanda 5)."""

    insumos: Decimal = Decimal("0")
    pessoal: Decimal = Decimal("0")
    maquinas: Decimal = Decimal("0")
    embalagens: Decimal = Decimal("0")
    servicos: Decimal = Decimal("0")
    total: Decimal = Decimal("0")


class ProducaoPorTalhaoItem(BaseModel):
    plot_id: UUID
    plot_name: str
    total_sacas: Decimal
    industria_sacas: Decimal
    embalagem_sacas: Decimal
    descarte_sacas: Decimal
    orders_count: int


class ConsumoInsumoItem(BaseModel):
    stock_item_id: UUID
    stock_item_name: str
    unit: str
    total_quantity: Decimal
    total_cost: Decimal


class OrdensResumo(BaseModel):
    planejada: int = 0
    em_producao: int = 0
    em_execucao: int = 0
    pausada: int = 0
    concluida: int = 0
    cancelada: int = 0
    atrasadas: int = 0


class CustoPrevistoVsRealizadoItem(BaseModel):
    order_id: UUID
    order_number: Optional[str] = None
    plot_name: str
    status: ProductionOrderStatus
    estimated_cost: Decimal
    realized_cost: Decimal
    diferenca: Decimal
    custo_realizado_discriminado: CustoDiscriminado

    model_config = ConfigDict(use_enum_values=True)


class PCPReportOut(BaseModel):
    producao_por_talhao: list[ProducaoPorTalhaoItem]
    consumo_insumos: list[ConsumoInsumoItem]
    ordens_resumo: OrdensResumo
    custo_previsto_vs_realizado: list[CustoPrevistoVsRealizadoItem]
    custo_safra_discriminado: CustoDiscriminado
    generated_at: datetime
