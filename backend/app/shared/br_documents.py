"""Validação de documentos brasileiros (CPF/CNPJ).

Utilitário reutilizável e sem dependência de banco/framework: valida os dígitos
verificadores oficiais, ignorando máscara (pontos, traço, barra). Hoje é usado
pelo Compras (cadastro de fornecedor); a intenção é reaproveitá-lo no Comercial
(cadastro de cliente) sem duplicar a regra.

Regra de negócio (Demanda 6): o documento do fornecedor continua **opcional**;
mas, quando informado, precisa ser um CPF **ou** CNPJ válido.
"""

from __future__ import annotations

import re

_NON_DIGITS = re.compile(r"\D")


def _only_digits(value: str) -> str:
    """Remove tudo que não for dígito (máscara: ``.``, ``-``, ``/``, espaços)."""
    return _NON_DIGITS.sub("", value or "")


def is_valid_cpf(value: str) -> bool:
    """Valida um CPF pelos dois dígitos verificadores oficiais.

    Aceita o número com ou sem máscara. Rejeita comprimento ≠ 11 e as sequências
    de dígitos repetidos (ex.: ``000...``, ``111...``), que passam na conta mas
    não são CPFs válidos.
    """
    digits = _only_digits(value)
    if len(digits) != 11:
        return False
    if digits == digits[0] * 11:
        return False

    for length in (9, 10):
        weights = range(length + 1, 1, -1)
        total = sum(int(d) * w for d, w in zip(digits, weights))
        remainder = (total * 10) % 11
        check = 0 if remainder == 10 else remainder
        if check != int(digits[length]):
            return False
    return True


def is_valid_cnpj(value: str) -> bool:
    """Valida um CNPJ pelos dois dígitos verificadores oficiais.

    Aceita o número com ou sem máscara. Rejeita comprimento ≠ 14 e as sequências
    de dígitos repetidos.
    """
    digits = _only_digits(value)
    if len(digits) != 14:
        return False
    if digits == digits[0] * 14:
        return False

    first_weights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    second_weights = [6] + first_weights
    for weights in (first_weights, second_weights):
        length = len(weights)
        total = sum(int(d) * w for d, w in zip(digits, weights))
        remainder = total % 11
        check = 0 if remainder < 2 else 11 - remainder
        if check != int(digits[length]):
            return False
    return True


def validate_document(value: str) -> bool:
    """Valida um documento que pode ser CPF **ou** CNPJ.

    Decide pelo número de dígitos (11 → CPF, 14 → CNPJ); qualquer outro
    comprimento é inválido. Máscara é ignorada.
    """
    digits = _only_digits(value)
    if len(digits) == 11:
        return is_valid_cpf(digits)
    if len(digits) == 14:
        return is_valid_cnpj(digits)
    return False
