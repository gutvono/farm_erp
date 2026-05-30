from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.shared.enums import LaborType, PlotActivityType, ProductionOrderStatus


# ---------------------------------------------------------------------------
# Plots
# ---------------------------------------------------------------------------


class PlotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    location: Optional[str] = Field(default=None, max_length=255)
    variety: str = Field(min_length=1, max_length=100)
    capacity_sacas: Decimal = Field(ge=0)
    notes: Optional[str] = None


class PlotUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    location: Optional[str] = Field(default=None, max_length=255)
    variety: Optional[str] = Field(default=None, min_length=1, max_length=100)
    capacity_sacas: Optional[Decimal] = Field(default=None, ge=0)
    notes: Optional[str] = None


class PlotOut(BaseModel):
    id: UUID
    name: str
    location: Optional[str] = None
    variety: str
    capacity_sacas: Decimal
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
# Production Inputs
# ---------------------------------------------------------------------------


class ProductionInputCreate(BaseModel):
    stock_item_id: UUID
    quantity: Decimal = Field(gt=0)


class ProductionInputOut(BaseModel):
    id: UUID
    stock_item_id: UUID
    stock_item_name: str
    unit: str
    quantity: Decimal
    unit_cost: Decimal
    subtotal: Decimal

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_model(cls, pi, stock_item_name: str, unit: str) -> "ProductionInputOut":
        return cls(
            id=pi.id,
            stock_item_id=pi.stock_item_id,
            stock_item_name=stock_item_name,
            unit=unit,
            quantity=pi.quantity,
            unit_cost=pi.unit_cost,
            subtotal=pi.subtotal,
        )


# ---------------------------------------------------------------------------
# Production Harvests
# ---------------------------------------------------------------------------


class HarvestCreate(BaseModel):
    percentage_harvested: Decimal = Field(gt=0, le=100)


class HarvestOut(BaseModel):
    id: UUID
    production_order_id: UUID
    harvest_number: int
    percentage_harvested: Decimal
    sacks_total: Decimal
    sacks_especial: Decimal
    sacks_superior: Decimal
    sacks_tradicional: Decimal
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
            sacks_total=harvest.sacks_total,
            sacks_especial=harvest.sacks_especial,
            sacks_superior=harvest.sacks_superior,
            sacks_tradicional=harvest.sacks_tradicional,
            inputs_consumed=harvest.inputs_consumed or [],
            is_final=harvest.is_final,
            harvested_at=harvest.harvested_at,
        )


# ---------------------------------------------------------------------------
# Production Orders
# ---------------------------------------------------------------------------


class ProductionOrderWorkerCreate(BaseModel):
    employee_id: UUID
    is_responsible: bool = False


class ProductionOrderWorkerOut(BaseModel):
    id: UUID
    employee_id: UUID
    employee_name: str
    salary_snapshot: Decimal
    is_responsible: bool

    model_config = ConfigDict(from_attributes=True)


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


class ProductionOrderCreate(BaseModel):
    plot_id: UUID
    planned_date: Optional[date] = None
    start_date: Optional[date] = None
    expected_end_date: Optional[date] = None
    notes: Optional[str] = None
    inputs: list[ProductionInputCreate] = Field(default_factory=list)
    workers: list[ProductionOrderWorkerCreate] = Field(default_factory=list)
    services: list[ProductionOrderServiceCreate] = Field(default_factory=list)


class ProductionOrderOut(BaseModel):
    id: UUID
    plot_id: UUID
    plot_name: str
    order_number: Optional[str] = None
    planned_date: Optional[date] = None
    start_date: Optional[date] = None
    expected_end_date: Optional[date] = None
    executed_at: Optional[datetime] = None
    total_sacas: Decimal
    especial_sacas: Decimal
    superior_sacas: Decimal
    tradicional_sacas: Decimal
    total_cost: Decimal
    estimated_cost: Decimal
    realized_cost: Decimal
    harvest_progress: Decimal
    status: ProductionOrderStatus
    is_overdue: bool
    notes: Optional[str] = None
    inputs: list[ProductionInputOut]
    harvests: list[HarvestOut] = Field(default_factory=list)
    workers: list[ProductionOrderWorkerOut] = Field(default_factory=list)
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
        workers: list["ProductionOrderWorkerOut"] = None,
        services: list["ProductionOrderServiceOut"] = None,
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
            planned_date=order.planned_date,
            start_date=order.start_date,
            expected_end_date=order.expected_end_date,
            executed_at=order.executed_at,
            total_sacas=order.total_sacas,
            especial_sacas=order.especial_sacas,
            superior_sacas=order.superior_sacas,
            tradicional_sacas=order.tradicional_sacas,
            total_cost=order.total_cost,
            estimated_cost=order.estimated_cost,
            realized_cost=order.realized_cost,
            harvest_progress=order.harvest_progress,
            status=order.status,
            is_overdue=is_overdue,
            notes=order.notes,
            inputs=inputs,
            harvests=harvests,
            workers=workers or [],
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


class ProducaoPorTalhaoItem(BaseModel):
    plot_id: UUID
    plot_name: str
    total_sacas: Decimal
    especial_sacas: Decimal
    superior_sacas: Decimal
    tradicional_sacas: Decimal
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

    model_config = ConfigDict(use_enum_values=True)


class PCPReportOut(BaseModel):
    producao_por_talhao: list[ProducaoPorTalhaoItem]
    consumo_insumos: list[ConsumoInsumoItem]
    ordens_resumo: OrdensResumo
    custo_previsto_vs_realizado: list[CustoPrevistoVsRealizadoItem]
    generated_at: datetime
