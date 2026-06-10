from __future__ import annotations

import calendar
from datetime import date, time
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
DEPENDENT_DEDUCTION = Decimal("189.59")
DEFAULT_IRRF_TABLE: tuple[dict[str, Decimal | None], ...] = (
    {
        "lower": Decimal("0.00"),
        "upper": Decimal("2259.20"),
        "rate": Decimal("0"),
        "deduction": Decimal("0.00"),
    },
    {
        "lower": Decimal("2259.20"),
        "upper": Decimal("2826.65"),
        "rate": Decimal("7.5"),
        "deduction": Decimal("169.44"),
    },
    {
        "lower": Decimal("2826.65"),
        "upper": Decimal("3751.05"),
        "rate": Decimal("15"),
        "deduction": Decimal("381.44"),
    },
    {
        "lower": Decimal("3751.05"),
        "upper": Decimal("4664.68"),
        "rate": Decimal("22.5"),
        "deduction": Decimal("662.77"),
    },
    {
        "lower": Decimal("4664.68"),
        "upper": None,
        "rate": Decimal("27.5"),
        "deduction": Decimal("896.00"),
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


def calculate_irrf(
    taxable_base: Decimal | int | float | str,
    inss_amount: Decimal | int | float | str,
    dependents: int = 0,
    table: Iterable[Mapping[str, Decimal | None]] | None = None,
) -> Decimal:
    taxable_base_dec = _decimal(taxable_base)
    inss_amount_dec = _decimal(inss_amount)
    _require_non_negative("taxable_base", taxable_base_dec)
    _require_non_negative("inss_amount", inss_amount_dec)
    if dependents < 0:
        raise ValueError("dependents must be greater than or equal to zero")

    base = taxable_base_dec - inss_amount_dec - (DEPENDENT_DEDUCTION * dependents)
    base = max(Decimal("0"), base)

    for bracket in table or DEFAULT_IRRF_TABLE:
        lower = _decimal(bracket["lower"])
        upper_raw = bracket["upper"]
        upper = None if upper_raw is None else _decimal(upper_raw)
        rate = _decimal(bracket["rate"])
        deduction = _decimal(bracket["deduction"])
        if base > lower and (upper is None or base <= upper):
            tax = (base * rate / Decimal("100")) - deduction
            return max(Decimal("0"), _money(tax))

    return Decimal("0.00")


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


def calculate_proportional_salary(
    base_salary: Decimal | int | float | str,
    hire_date: date,
    termination_date: date | None,
    month: int,
    year: int,
) -> Decimal:
    base_salary_dec = _decimal(base_salary)
    _require_non_negative("base_salary", base_salary_dec)

    days_in_month = calendar.monthrange(year, month)[1]
    period_start = date(year, month, 1)
    period_end = date(year, month, days_in_month)

    if hire_date > period_end:
        return Decimal("0.00")
    if termination_date and termination_date < period_start:
        return Decimal("0.00")

    start_date = max(period_start, hire_date)
    end_date = min(period_end, termination_date) if termination_date else period_end
    if end_date < start_date:
        return Decimal("0.00")

    worked_days = (end_date - start_date).days + 1
    factor = Decimal(worked_days) / Decimal(days_in_month)
    return _money(base_salary_dec * factor)
