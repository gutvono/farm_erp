"""Backfill detailed payroll items for existing payslips.

Usage:
    poetry run python scripts/backfill_payroll_items.py
    poetry run python scripts/backfill_payroll_items.py --include-paid
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import joinedload

from app.core.database import SessionLocal
from app.modules.folha import repository as folha_repo
from app.modules.folha import service as folha_service
from app.modules.folha.model import PayrollEntry, PayrollEntryItem
from app.shared.enums import PayrollEntryStatus, PayrollPeriodStatus


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--include-paid",
        action="store_true",
        help="Recalcula também holerites pagos/fechados; por padrão o líquido deles é preservado.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        entries = (
            db.query(PayrollEntry)
            .options(
                joinedload(PayrollEntry.period),
                joinedload(PayrollEntry.items).joinedload(PayrollEntryItem.event),
            )
            .order_by(PayrollEntry.created_at.asc())
            .all()
        )
        recalculated = 0
        informative_only = 0
        skipped = 0

        for entry in entries:
            employee = folha_repo.get_employee_any(db, entry.employee_id)
            if not employee or not entry.period:
                skipped += 1
                continue

            folha_repo.ensure_entry_legacy_items(db, entry)
            is_open_pending = (
                entry.status == PayrollEntryStatus.PENDENTE
                and entry.period.status == PayrollPeriodStatus.ABERTA
            )

            if is_open_pending or args.include_paid:
                folha_service._apply_automatic_items(db, entry, employee)
                recalculated += 1
            else:
                folha_service.apply_informative_items_for_entry(db, entry, employee)
                informative_only += 1

        print(
            "[backfill-payroll] "
            f"recalculados={recalculated} "
            f"informativos={informative_only} "
            f"ignorados={skipped}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
