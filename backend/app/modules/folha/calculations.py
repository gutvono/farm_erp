from __future__ import annotations

from datetime import time
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Mapping, Sequence


MONEY_QUANT = Decimal("0.01")
DEFAULT_MONTHLY_DIVISOR = Decimal("220")
DEFAULT_INSS_TABLE: tuple[dict[str, Decimal], ...] = (
    {
        "lower": Decimal("0.00"),
        "upper": Decimal("1621.00"),
        "rate": Decimal("7.5"),
    },
    {
        "lower": Decimal("1621.00"),
        "upper": Decimal("2902.84"),
        "rate": Decimal("9"),
    },
    {
        "lower": Decimal("2902.84"),
        "upper": Decimal("4354.27"),
        "rate": Decimal("12"),
    },
    {
        "lower": Decimal("4354.27"),
        "upper": Decimal("8475.55"),
        "rate": Decimal("14"),
    },
)


def _decimal(value: Decimal | int | float | str) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def _require_non_negative(name: str, value: Decimal) -> None:
    if value < 0:
        raise ValueError(f"{name} must be greater than or equal to zero")


def _require_positive(name: str, value: Decimal) -> None:
    if value <= 0:
        raise ValueError(f"{name} must be greater than zero")


def _parse_time(value: time | str) -> time:
    if isinstance(value, time):
        return value
    try:
        hour, minute = value.split(":", maxsplit=1)
        return time(hour=int(hour), minute=int(minute))
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError(f"invalid time value: {value!r}") from exc


def calculate_overtime(
    base_salary: Decimal | int | float | str,
    hours: Decimal | int | float | str,
    percentage: Decimal | int | float | str,
    divisor: Decimal | int | float | str = DEFAULT_MONTHLY_DIVISOR,
) -> Decimal:
    base_salary_dec = _decimal(base_salary)
    hours_dec = _decimal(hours)
    percentage_dec = _decimal(percentage)
    divisor_dec = _decimal(divisor)

    _require_non_negative("base_salary", base_salary_dec)
    _require_non_negative("hours", hours_dec)
    _require_non_negative("percentage", percentage_dec)
    _require_positive("divisor", divisor_dec)

    hourly_rate = base_salary_dec / divisor_dec
    multiplier = Decimal("1") + (percentage_dec / Decimal("100"))
    return _money(hourly_rate * hours_dec * multiplier)


def calculate_night_shift(
    base_salary: Decimal | int | float | str,
    start_time: time | str,
    end_time: time | str,
    percentage: Decimal | int | float | str,
    rule: str = "urbana",
    divisor: Decimal | int | float | str = DEFAULT_MONTHLY_DIVISOR,
) -> Decimal:
    base_salary_dec = _decimal(base_salary)
    percentage_dec = _decimal(percentage)
    divisor_dec = _decimal(divisor)

    _require_non_negative("base_salary", base_salary_dec)
    _require_non_negative("percentage", percentage_dec)
    _require_positive("divisor", divisor_dec)

    start = _parse_time(start_time)
    end = _parse_time(end_time)
    start_minutes = start.hour * 60 + start.minute
    end_minutes = end.hour * 60 + end.minute
    if end_minutes <= start_minutes:
        end_minutes += 24 * 60
    real_minutes = Decimal(end_minutes - start_minutes)

    if rule == "urbana":
        equivalent_hours = real_minutes / Decimal("52.5")
    elif rule == "rural":
        equivalent_hours = real_minutes / Decimal("60")
    else:
        raise ValueError("rule must be 'urbana' or 'rural'")

    hourly_rate = base_salary_dec / divisor_dec
    return _money(hourly_rate * equivalent_hours * percentage_dec / Decimal("100"))


def _bracket_value(
    bracket: Mapping[str, Decimal] | Sequence[Decimal | int | float | str],
    key: str,
    index: int,
) -> Decimal:
    if isinstance(bracket, Mapping):
        return _decimal(bracket[key])
    return _decimal(bracket[index])


def calculate_inss(
    base_amount: Decimal | int | float | str,
    table: Iterable[
        Mapping[str, Decimal] | Sequence[Decimal | int | float | str]
    ]
    | None = None,
) -> Decimal:
    base_amount_dec = _decimal(base_amount)
    _require_non_negative("base_amount", base_amount_dec)

    inss = Decimal("0")
    for bracket in table or DEFAULT_INSS_TABLE:
        lower = _bracket_value(bracket, "lower", 0)
        upper = _bracket_value(bracket, "upper", 1)
        rate = _bracket_value(bracket, "rate", 2)
        if base_amount_dec > lower:
            bracket_base = min(base_amount_dec, upper) - lower
            if bracket_base > 0:
                inss += bracket_base * rate / Decimal("100")

    return _money(inss)


def calculate_fgts(
    base_amount: Decimal | int | float | str,
    percentage: Decimal | int | float | str = Decimal("8"),
) -> Decimal:
    base_amount_dec = _decimal(base_amount)
    percentage_dec = _decimal(percentage)
    _require_non_negative("base_amount", base_amount_dec)
    _require_non_negative("percentage", percentage_dec)
    return _money(base_amount_dec * percentage_dec / Decimal("100"))


def calculate_transport_voucher(
    base_salary: Decimal | int | float | str,
    real_transport_cost: Decimal | int | float | str,
) -> Decimal:
    base_salary_dec = _decimal(base_salary)
    real_transport_cost_dec = _decimal(real_transport_cost)
    _require_non_negative("base_salary", base_salary_dec)
    _require_non_negative("real_transport_cost", real_transport_cost_dec)

    legal_cap = base_salary_dec * Decimal("0.06")
    return _money(min(real_transport_cost_dec, legal_cap))
