from decimal import Decimal

import pytest

from app.modules.folha.calculations import (
    calculate_fgts,
    calculate_inss,
    calculate_night_shift,
    calculate_overtime,
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
