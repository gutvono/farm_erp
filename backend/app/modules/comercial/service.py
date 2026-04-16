from datetime import date, timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.modules.comercial import repository as comercial_repo
from app.modules.comercial.model import Client, Sale
from app.modules.comercial.schemas import (
    ClientCreate,
    ClientUpdate,
    SaleCreate,
)
from app.modules.estoque import repository as estoque_repo
from app.modules.estoque import service as estoque_service
from app.modules.faturamento import service as faturamento_service
from app.modules.financeiro import service as fin_service
from app.shared.enums import FinancialCategory, MovementType, SaleStatus


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_client_or_404(db: Session, client_id: UUID) -> Client:
    client = comercial_repo.get_client(db, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return client


def _get_sale_or_404(db: Session, sale_id: UUID) -> Sale:
    sale = comercial_repo.get_sale(db, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Venda não encontrada")
    return sale


# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------


def create_client(db: Session, data: ClientCreate) -> Client:
    return comercial_repo.create_client(db, data)


def list_clients(
    db: Session,
    *,
    is_delinquent: Optional[bool] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[Client]:
    return comercial_repo.list_clients(db, is_delinquent=is_delinquent, skip=skip, limit=limit)


def get_client(db: Session, client_id: UUID) -> Client:
    return _get_client_or_404(db, client_id)


def update_client(db: Session, client_id: UUID, data: ClientUpdate) -> Client:
    _get_client_or_404(db, client_id)
    return comercial_repo.update_client(db, client_id, data)


def update_client_delinquent(db: Session, client_id: UUID, is_delinquent: bool) -> Client:
    _get_client_or_404(db, client_id)
    return comercial_repo.update_client_delinquent(db, client_id, is_delinquent)


def soft_delete_client(db: Session, client_id: UUID) -> Client:
    _get_client_or_404(db, client_id)
    return comercial_repo.soft_delete_client(db, client_id)


# ---------------------------------------------------------------------------
# Sales
# ---------------------------------------------------------------------------


def create_sale(db: Session, data: SaleCreate) -> Sale:
    # 1. Validate client exists
    client = _get_client_or_404(db, data.client_id)

    # 2. Validate stock availability for each item
    for item_data in data.items:
        stock_item = estoque_repo.get_item(db, item_data.stock_item_id)
        if not stock_item:
            raise HTTPException(
                status_code=404,
                detail=f"Item de estoque não encontrado: {item_data.stock_item_id}",
            )
        available = estoque_service.verificar_disponibilidade(
            db, item_data.stock_item_id, item_data.quantity
        )
        if not available:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Estoque insuficiente para o item: {stock_item.name}. "
                    f"Disponível: {stock_item.quantity_on_hand} {stock_item.unit}"
                ),
            )

    # 3. Create the sale record
    sale = comercial_repo.create_sale(db, data)

    # 4. Deduct stock for each item
    for item in sale.items:
        estoque_service.registrar_saida(
            db,
            stock_item_id=item.stock_item_id,
            quantity=Decimal(item.quantity),
            description=f"Venda #{sale.id}",
            source_module="comercial",
            reference_id=sale.id,
        )

    # 5. Create invoice (placeholder — will be implemented in Faturamento module)
    faturamento_service.criar_fatura(
        db,
        sale_id=sale.id,
        client_id=sale.client_id,
        items=sale.items,
        total_amount=Decimal(sale.total_amount),
        source_module="comercial",
    )

    # 6. Create account receivable (due in 30 days)
    fin_service.criar_conta_receber(
        db,
        client_id=sale.client_id,
        description=f"Venda — {client.name}",
        amount=Decimal(sale.total_amount),
        due_date=date.today() + timedelta(days=30),
        source_module="comercial",
        reference_id=sale.id,
    )

    # 7. Register financial movement (entrada/venda)
    fin_service.registrar_movimento(
        db,
        movement_type=MovementType.ENTRADA,
        category=FinancialCategory.VENDA,
        amount=Decimal(sale.total_amount),
        description=f"Venda — {client.name}",
        source_module="comercial",
        reference_id=sale.id,
    )

    return sale


def list_sales(
    db: Session,
    *,
    status: Optional[SaleStatus] = None,
    client_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[Sale]:
    return comercial_repo.list_sales(
        db, status=status, client_id=client_id, skip=skip, limit=limit
    )


def get_sale(db: Session, sale_id: UUID) -> Sale:
    return _get_sale_or_404(db, sale_id)


def update_status(db: Session, sale_id: UUID, new_status: SaleStatus) -> Sale:
    sale = _get_sale_or_404(db, sale_id)

    if sale.status == SaleStatus.CANCELADA:
        raise HTTPException(
            status_code=400,
            detail="Venda cancelada não pode ter status alterado",
        )

    if sale.status == SaleStatus.ENTREGUE and new_status == SaleStatus.REALIZADA:
        raise HTTPException(
            status_code=400,
            detail="Venda entregue não pode retornar ao status Realizada",
        )

    return comercial_repo.update_sale_status(db, sale_id, new_status)


def soft_delete_sale(db: Session, sale_id: UUID) -> Sale:
    sale = _get_sale_or_404(db, sale_id)

    if sale.status != SaleStatus.REALIZADA:
        raise HTTPException(
            status_code=400,
            detail="Apenas vendas com status 'Realizada' podem ser excluídas",
        )

    return comercial_repo.soft_delete_sale(db, sale_id)
