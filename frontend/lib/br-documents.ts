/**
 * Validação e máscara de documentos brasileiros (CPF/CNPJ) e CEP.
 *
 * Espelha a regra de dígito verificador do backend
 * (`backend/app/shared/br_documents.py`): ignora a máscara (pontos, traço,
 * barra) e valida os DVs oficiais. Usado hoje pelo cadastro de fornecedor
 * (Compras); a intenção é reaproveitar no Comercial (cliente) sem duplicar a
 * regra.
 *
 * Regra de negócio (Demanda 6): o documento é **opcional**; quando informado,
 * precisa ser um CPF **ou** CNPJ válido.
 */

/** Remove tudo que não for dígito (máscara: `.`, `-`, `/`, espaços). */
export function onlyDigits(value: string): string {
  return (value ?? "").replace(/\D/g, "")
}

/**
 * Valida um CPF pelos dois dígitos verificadores oficiais. Aceita com ou sem
 * máscara. Rejeita comprimento ≠ 11 e sequências de dígitos repetidos.
 */
export function isValidCpf(value: string): boolean {
  const digits = onlyDigits(value)
  if (digits.length !== 11) return false
  if (digits === digits[0].repeat(11)) return false

  for (const length of [9, 10]) {
    let total = 0
    let weight = length + 1
    for (let i = 0; i < length; i++) {
      total += Number(digits[i]) * weight
      weight--
    }
    const remainder = (total * 10) % 11
    const check = remainder === 10 ? 0 : remainder
    if (check !== Number(digits[length])) return false
  }
  return true
}

/**
 * Valida um CNPJ pelos dois dígitos verificadores oficiais. Aceita com ou sem
 * máscara. Rejeita comprimento ≠ 14 e sequências de dígitos repetidos.
 */
export function isValidCnpj(value: string): boolean {
  const digits = onlyDigits(value)
  if (digits.length !== 14) return false
  if (digits === digits[0].repeat(14)) return false

  const firstWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const secondWeights = [6, ...firstWeights]
  for (const weights of [firstWeights, secondWeights]) {
    const length = weights.length
    let total = 0
    for (let i = 0; i < length; i++) {
      total += Number(digits[i]) * weights[i]
    }
    const remainder = total % 11
    const check = remainder < 2 ? 0 : 11 - remainder
    if (check !== Number(digits[length])) return false
  }
  return true
}

/**
 * Valida um documento que pode ser CPF **ou** CNPJ. Decide pelo número de
 * dígitos (11 → CPF, 14 → CNPJ); qualquer outro comprimento é inválido.
 */
export function validateDocument(value: string): boolean {
  const digits = onlyDigits(value)
  if (digits.length === 11) return isValidCpf(digits)
  if (digits.length === 14) return isValidCnpj(digits)
  return false
}

/**
 * Aplica a máscara de CPF (`000.000.000-00`) ou CNPJ (`00.000.000/0000-00`)
 * conforme a quantidade de dígitos digitados. Pensada para uso no `onChange`
 * de um input controlado.
 */
export function maskDocument(value: string): string {
  const digits = onlyDigits(value).slice(0, 14)
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
  }
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2")
}

/** Aplica a máscara de CEP (`00000-000`). */
export function maskCep(value: string): string {
  const digits = onlyDigits(value).slice(0, 8)
  return digits.replace(/(\d{5})(\d{1,3})$/, "$1-$2")
}
