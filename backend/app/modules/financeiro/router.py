from datetime import date, datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.model import User
from app.modules.auth.router import get_current_user
from app.modules.financeiro import service as fin_service
from app.modules.financeiro.schemas import (
    AccountPayableCreate,
    AccountPayableOut,
    AccountPayableUpdate,
    AccountReceivableCreate,
    AccountReceivableOut,
    AccountReceivableUpdate,
    BalanceOut,
    CashFlowOut,
    DefaulterItem,
    FinancialMovementCreate,
    FinancialMovementOut,
    PayPayableRequest,
    ReceivePaymentRequest,
)
from app.shared.enums import (
    AccountPayableStatus,
    AccountReceivableStatus,
    FinancialCategory,
    MovementType,
)
from app.shared.responses import SuccessResponse, success

router = APIRouter()


# ---------------------------------------------------------------------------
# Balance & Cash Flow
# ---------------------------------------------------------------------------


@router.get("/saldo", response_model=SuccessResponse)
def get_balance(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    balance = fin_service.get_balance(db)
    return success("Saldo obtido com sucesso", balance.model_dump())


@router.get("/fluxo-caixa", response_model=SuccessResponse)
def get_cash_flow(
    months: int = Query(default=6, ge=1, le=36),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    flow = fin_service.get_cash_flow(db, months=months)
    return success("Fluxo de caixa obtido com sucesso", flow.model_dump())


# ---------------------------------------------------------------------------
# Movements
# ---------------------------------------------------------------------------


@router.get("/movimentacoes", response_model=SuccessResponse)
def list_movements(
    movement_type: Optional[MovementType] = None,
    category: Optional[FinancialCategory] = None,
    source_module: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    movements = fin_service.list_movements(
        db,
        movement_type=movement_type,
        category=category,
        source_module=source_module,
        start_date=start_date,
        end_date=end_date,
    )
    data = [FinancialMovementOut.model_validate(m).model_dump(mode="json") for m in movements]
    return success("Movimentações listadas com sucesso", data)


@router.post("/movimentacoes", response_model=SuccessResponse, status_code=201)
def create_movement(
    body: FinancialMovementCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    movement = fin_service.create_movement(db, body)
    return success(
        "Movimentação registrada com sucesso",
        FinancialMovementOut.model_validate(movement).model_dump(mode="json"),
    )


# ---------------------------------------------------------------------------
# Accounts Payable
# ---------------------------------------------------------------------------


@router.get("/contas-pagar", response_model=SuccessResponse)
def list_payables(
    status: Optional[AccountPayableStatus] = None,
    supplier_id: Optional[UUID] = None,
    due_before: Optional[date] = None,
    due_after: Optional[date] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    payables = fin_service.list_payables(
        db,
        status=status,
        supplier_id=supplier_id,
        due_before=due_before,
        due_after=due_after,
    )
    data = [AccountPayableOut.model_validate(p).model_dump(mode="json") for p in payables]
    return success("Contas a pagar listadas com sucesso", data)


@router.post("/contas-pagar", response_model=SuccessResponse, status_code=201)
def create_payable(
    body: AccountPayableCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    payable = fin_service.create_payable(db, body)
    return success(
        "Conta a pagar criada com sucesso",
        AccountPayableOut.model_validate(payable).model_dump(mode="json"),
    )


@router.get("/contas-pagar/{payable_id}", response_model=SuccessResponse)
def get_payable(
    payable_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    payable = fin_service.get_payable(db, payable_id)
    return success(
        "Conta a pagar obtida com sucesso",
        AccountPayableOut.model_validate(payable).model_dump(mode="json"),
    )


@router.put("/contas-pagar/{payable_id}", response_model=SuccessResponse)
def update_payable(
    payable_id: UUID,
    body: AccountPayableUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    payable = fin_service.update_payable(db, payable_id, body)
    return success(
        "Conta a pagar atualizada com sucesso",
        AccountPayableOut.model_validate(payable).model_dump(mode="json"),
    )


@router.put("/contas-pagar/{payable_id}/pagar", response_model=SuccessResponse)
def pay_payable(
    payable_id: UUID,
    body: PayPayableRequest = PayPayableRequest(),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    payable = fin_service.pay_payable(
        db, payable_id, paid_at=body.paid_at, notes=body.notes
    )
    return success(
        "Conta paga com sucesso",
        AccountPayableOut.model_validate(payable).model_dump(mode="json"),
    )


@router.put("/contas-pagar/{payable_id}/cancelar", response_model=SuccessResponse)
def cancel_payable(
    payable_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    payable = fin_service.cancel_payable(db, payable_id)
    return success(
        "Conta cancelada com sucesso",
        AccountPayableOut.model_validate(payable).model_dump(mode="json"),
    )


# ---------------------------------------------------------------------------
# Accounts Receivable
# ---------------------------------------------------------------------------


@router.get("/contas-receber", response_model=SuccessResponse)
def list_receivables(
    status: Optional[AccountReceivableStatus] = None,
    client_id: Optional[UUID] = None,
    due_before: Optional[date] = None,
    due_after: Optional[date] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    receivables = fin_service.list_receivables(
        db,
        status=status,
        client_id=client_id,
        due_before=due_before,
        due_after=due_after,
    )
    data = [AccountReceivableOut.model_validate(r).model_dump(mode="json") for r in receivables]
    return success("Contas a receber listadas com sucesso", data)


@router.post("/contas-receber", response_model=SuccessResponse, status_code=201)
def create_receivable(
    body: AccountReceivableCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    receivable = fin_service.create_receivable(db, body)
    return success(
        "Conta a receber criada com sucesso",
        AccountReceivableOut.model_validate(receivable).model_dump(mode="json"),
    )


@router.get("/contas-receber/{receivable_id}", response_model=SuccessResponse)
def get_receivable(
    receivable_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    receivable = fin_service.get_receivable(db, receivable_id)
    return success(
        "Conta a receber obtida com sucesso",
        AccountReceivableOut.model_validate(receivable).model_dump(mode="json"),
    )


@router.put("/contas-receber/{receivable_id}", response_model=SuccessResponse)
def update_receivable(
    receivable_id: UUID,
    body: AccountReceivableUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    receivable = fin_service.update_receivable(db, receivable_id, body)
    return success(
        "Conta a receber atualizada com sucesso",
        AccountReceivableOut.model_validate(receivable).model_dump(mode="json"),
    )


@router.put("/contas-receber/{receivable_id}/receber", response_model=SuccessResponse)
def receive_payment(
    receivable_id: UUID,
    body: ReceivePaymentRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    receivable = fin_service.receive_payment(
        db,
        receivable_id,
        amount=body.amount,
        received_at=body.received_at,
        notes=body.notes,
    )
    return success(
        "Pagamento registrado com sucesso",
        AccountReceivableOut.model_validate(receivable).model_dump(mode="json"),
    )


@router.put("/contas-receber/{receivable_id}/inadimplente", response_model=SuccessResponse)
def mark_as_defaulter(
    receivable_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    receivable = fin_service.mark_as_defaulter(db, receivable_id)
    return success(
        "Conta marcada como inadimplente",
        AccountReceivableOut.model_validate(receivable).model_dump(mode="json"),
    )


@router.put("/contas-receber/{receivable_id}/reverter-inadimplencia", response_model=SuccessResponse)
def revert_defaulter(
    receivable_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    receivable = fin_service.revert_defaulter(db, receivable_id)
    return success(
        "Inadimplência revertida com sucesso",
        AccountReceivableOut.model_validate(receivable).model_dump(mode="json"),
    )


@router.get("/relatorio-inadimplencia", response_model=SuccessResponse)
def list_defaulters(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SuccessResponse:
    items = fin_service.list_defaulters(db)
    data = [item.model_dump(mode="json") for item in items]
    return success("Relatório de inadimplência obtido com sucesso", data)
