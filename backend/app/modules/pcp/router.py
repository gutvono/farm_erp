from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.model import User
from app.modules.auth.router import get_current_user
from app.modules.estoque.schemas import StockItemOut
from app.modules.pcp import service as pcp_service
from app.modules.pcp.schemas import (
    EncerrarOrdemRequest,
    HarvestCreate,
    PlotActivityCreate,
    PlotCreate,
    PlotOut,
    PlotUpdate,
    ProductionOrderCreate,
    ProductionOrderUpdate,
)
from app.shared.enums import ProductionOrderStatus, SystemRole
from app.shared.responses import SuccessResponse, success

router = APIRouter()


# ---------------------------------------------------------------------------
# Talhões (Plots)
# ---------------------------------------------------------------------------


@router.get("/talhoes", response_model=SuccessResponse)
def list_plots(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    plots = pcp_service.list_plots(db, skip=skip, limit=limit)
    data = [PlotOut.model_validate(p).model_dump(mode="json") for p in plots]
    return success("Talhões listados com sucesso", data)


@router.post("/talhoes", response_model=SuccessResponse, status_code=201)
def create_plot(
    body: PlotCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    plot = pcp_service.create_plot(db, body)
    return success(
        "Talhão criado com sucesso",
        PlotOut.model_validate(plot).model_dump(mode="json"),
    )


@router.get("/talhoes/{plot_id}", response_model=SuccessResponse)
def get_plot(
    plot_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    plot = pcp_service.get_plot(db, plot_id)
    return success(
        "Talhão obtido com sucesso",
        PlotOut.model_validate(plot).model_dump(mode="json"),
    )


@router.put("/talhoes/{plot_id}", response_model=SuccessResponse)
def update_plot(
    plot_id: UUID,
    body: PlotUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    plot = pcp_service.update_plot(db, plot_id, body)
    return success(
        "Talhão atualizado com sucesso",
        PlotOut.model_validate(plot).model_dump(mode="json"),
    )


@router.delete("/talhoes/{plot_id}", response_model=SuccessResponse)
def delete_plot(
    plot_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    pcp_service.soft_delete_plot(db, plot_id)
    return success("Talhão removido com sucesso")


# ---------------------------------------------------------------------------
# Atividades
# ---------------------------------------------------------------------------


@router.get("/atividades", response_model=SuccessResponse)
def list_activities(
    plot_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    activities = pcp_service.list_activities(db, plot_id=plot_id, skip=skip, limit=limit)
    data = [pcp_service.serialize_activity(db, a) for a in activities]
    return success("Atividades listadas com sucesso", data)


@router.post("/atividades", response_model=SuccessResponse, status_code=201)
def create_activity(
    body: PlotActivityCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    activity = pcp_service.add_activity(db, body)
    return success(
        "Atividade registrada com sucesso",
        pcp_service.serialize_activity(db, activity),
    )


# ---------------------------------------------------------------------------
# Recursos e insumos disponíveis (selects do front)
# ---------------------------------------------------------------------------


@router.get("/insumos-disponiveis", response_model=SuccessResponse)
def insumos_disponiveis(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    items = pcp_service.insumos_disponiveis(db)
    data = [StockItemOut.from_model(i).model_dump(mode="json") for i in items]
    return success("Insumos disponíveis listados com sucesso", data)


@router.get("/recursos-disponiveis", response_model=SuccessResponse)
def recursos_disponiveis(
    role: SystemRole,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    items = pcp_service.recursos_disponiveis(db, role)
    data = []
    for item, available in items:
        payload = StockItemOut.from_model(item).model_dump(mode="json")
        payload["available_quantity"] = str(available)
        data.append(payload)
    return success("Recursos disponíveis listados com sucesso", data)


@router.get("/cargos-disponiveis", response_model=SuccessResponse)
def cargos_disponiveis(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    data = pcp_service.cargos_disponiveis(db)
    return success("Cargos disponíveis listados com sucesso", data)


# ---------------------------------------------------------------------------
# Ordens de produção
# ---------------------------------------------------------------------------


@router.get("/ordens", response_model=SuccessResponse)
def list_orders(
    status: Optional[ProductionOrderStatus] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    orders = pcp_service.list_orders(db, status=status, skip=skip, limit=limit)
    data = [pcp_service.serialize_order(db, o) for o in orders]
    return success("Ordens de produção listadas com sucesso", data)


@router.post("/ordens", response_model=SuccessResponse, status_code=201)
def create_order(
    body: ProductionOrderCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    order = pcp_service.create_order(db, body)
    return success(
        "Ordem de produção criada com sucesso",
        pcp_service.serialize_order(db, order),
    )


@router.get("/ordens/{order_id}", response_model=SuccessResponse)
def get_order(
    order_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    order = pcp_service.get_order(db, order_id)
    return success(
        "Ordem obtida com sucesso",
        pcp_service.serialize_order(db, order),
    )


@router.put("/ordens/{order_id}", response_model=SuccessResponse)
def update_order(
    order_id: UUID,
    body: ProductionOrderUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    order = pcp_service.update_order(db, order_id, body)
    return success(
        "Ordem atualizada com sucesso",
        pcp_service.serialize_order(db, order),
    )


@router.post("/ordens/{order_id}/iniciar", response_model=SuccessResponse)
def iniciar_producao(
    order_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    order = pcp_service.iniciar_producao(db, order_id)
    return success("Produção iniciada com sucesso", pcp_service.serialize_order(db, order))


@router.post("/ordens/{order_id}/colher", response_model=SuccessResponse)
def colher_safra(
    order_id: UUID,
    body: HarvestCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    result = pcp_service.registrar_colheita(db, order_id, body)
    return success("Colheita registrada com sucesso", result.model_dump(mode="json"))


@router.post("/ordens/{order_id}/encerrar", response_model=SuccessResponse)
def encerrar_ordem(
    order_id: UUID,
    body: EncerrarOrdemRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    order = pcp_service.encerrar_ordem(db, order_id, body.reason)
    return success(
        "Ordem encerrada com sucesso",
        pcp_service.serialize_order(db, order),
    )


@router.delete("/ordens/{order_id}", response_model=SuccessResponse)
def delete_order(
    order_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    pcp_service.soft_delete_order(db, order_id)
    return success("Ordem removida com sucesso")


# ---------------------------------------------------------------------------
# Relatórios
# ---------------------------------------------------------------------------


@router.get("/relatorios", response_model=SuccessResponse)
def relatorios(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    report = pcp_service.gerar_relatorios(db)
    return success("Relatórios gerados com sucesso", report.model_dump(mode="json"))
