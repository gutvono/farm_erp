from decimal import Decimal
from datetime import date
from types import SimpleNamespace

import pytest

from app.modules.folha.calculations import (
    calculate_fgts,
    calculate_inss,
    calculate_irrf,
    calculate_night_shift,
    calculate_overtime,
    calculate_proportional_salary,
    calculate_transport_voucher,
)


def test_inss_first_bracket() -> None:
    assert calculate_inss(Decimal("1000.00")) == Decimal("75.00")


def test_inss_crossing_two_brackets() -> None:
    assert calculate_inss(Decimal("2000.00")) == Decimal("155.69")


def test_inss_above_cap_uses_table_limit() -> None:
    assert calculate_inss(Decimal("10000.00")) == Decimal("988.09")


def test_fgts_default_percentage() -> None:
    assert calculate_fgts(Decimal("3000.00")) == Decimal("240.00")


def test_transport_voucher_uses_legal_cap_when_cost_is_higher() -> None:
    assert calculate_transport_voucher(Decimal("3000.00"), Decimal("250.00")) == Decimal(
        "180.00"
    )


def test_transport_voucher_uses_real_cost_when_lower_than_cap() -> None:
    assert calculate_transport_voucher(Decimal("3000.00"), Decimal("100.00")) == Decimal(
        "100.00"
    )


def test_overtime_with_default_divisor_and_50_percent() -> None:
    assert calculate_overtime(Decimal("2200.00"), Decimal("10"), Decimal("50")) == Decimal(
        "150.00"
    )


def test_night_shift_urban_crossing_day_boundary() -> None:
    assert calculate_night_shift(
        Decimal("2200.00"),
        "22:00",
        "05:00",
        Decimal("20"),
        "urbana",
    ) == Decimal("16.00")


def test_night_shift_rural_crossing_day_boundary() -> None:
    assert calculate_night_shift(
        Decimal("2200.00"),
        "22:00",
        "05:00",
        Decimal("20"),
        "rural",
    ) == Decimal("14.00")


def test_negative_values_are_rejected() -> None:
    with pytest.raises(ValueError):
        calculate_fgts(Decimal("-1.00"))


def test_irrf_exempt_bracket_returns_zero() -> None:
    assert calculate_irrf(Decimal("2259.20"), Decimal("0.00")) == Decimal("0.00")


@pytest.mark.parametrize(
    ("taxable_base", "expected"),
    [
        (Decimal("2500.00"), Decimal("18.06")),
        (Decimal("3000.00"), Decimal("68.56")),
        (Decimal("4000.00"), Decimal("237.23")),
        (Decimal("5000.00"), Decimal("479.00")),
    ],
)
def test_irrf_brackets(taxable_base: Decimal, expected: Decimal) -> None:
    assert calculate_irrf(taxable_base, Decimal("0.00")) == expected


def test_irrf_subtracts_inss_and_dependents() -> None:
    assert calculate_irrf(
        Decimal("5000.00"),
        Decimal("500.00"),
        dependents=2,
    ) == Decimal("264.41")


def employee(base_salary: str, hire_date: date, termination_date: date | None = None):
    return SimpleNamespace(
        base_salary=Decimal(base_salary),
        hire_date=hire_date,
        termination_date=termination_date,
    )


def test_proportional_salary_full_month_when_admitted_on_first_day() -> None:
    emp = employee("2800.00", date(2026, 2, 1))
    assert calculate_proportional_salary(
        emp.base_salary, emp.hire_date, emp.termination_date, 2, 2026
    ) == Decimal("2800.00")


def test_proportional_salary_mid_month_admission() -> None:
    emp = employee("2800.00", date(2026, 2, 16))
    assert calculate_proportional_salary(
        emp.base_salary, emp.hire_date, emp.termination_date, 2, 2026
    ) == Decimal("1300.00")


def test_proportional_salary_termination_in_month() -> None:
    emp = employee("3100.00", date(2024, 1, 1), date(2026, 3, 10))
    assert calculate_proportional_salary(
        emp.base_salary, emp.hire_date, emp.termination_date, 3, 2026
    ) == Decimal("1000.00")


def test_proportional_salary_admission_and_termination_same_month() -> None:
    emp = employee("3000.00", date(2026, 4, 10), date(2026, 4, 20))
    assert calculate_proportional_salary(
        emp.base_salary, emp.hire_date, emp.termination_date, 4, 2026
    ) == Decimal("1100.00")


def test_proportional_salary_zero_when_admitted_after_competency() -> None:
    emp = employee("3000.00", date(2026, 5, 1))
    assert calculate_proportional_salary(
        emp.base_salary, emp.hire_date, emp.termination_date, 4, 2026
    ) == Decimal("0.00")
