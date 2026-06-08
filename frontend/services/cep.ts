import { onlyDigits } from "@/lib/br-documents"

/**
 * Endereço retornado pela busca de CEP (ViaCEP). Apenas os campos que o
 * formulário de fornecedor aproveita para autopreencher.
 */
export interface CepLookupResult {
  cep: string
  street: string
  neighborhood: string
  city: string
  state: string
}

interface ViaCepResponse {
  cep?: string
  logradouro?: string
  bairro?: string
  localidade?: string
  uf?: string
  erro?: boolean
}

/**
 * Consulta um CEP no ViaCEP (`https://viacep.com.br/ws/{cep}/json/`).
 *
 * Best-effort (decisão #3 da Demanda 6): se o CEP não existir o ViaCEP responde
 * `{ erro: true }` → retornamos `null`. Falha de rede também propaga o erro para
 * o chamador tratar com toast, **sem** travar o formulário. Não usa `apiFetch`
 * porque é uma API externa (sem sessão do ERP).
 */
export async function lookupCep(cep: string): Promise<CepLookupResult | null> {
  const digits = onlyDigits(cep)
  if (digits.length !== 8) return null

  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
  if (!response.ok) {
    throw new Error("Não foi possível consultar o CEP")
  }

  const data = (await response.json()) as ViaCepResponse
  if (data.erro) return null

  return {
    cep: data.cep ?? cep,
    street: data.logradouro ?? "",
    neighborhood: data.bairro ?? "",
    city: data.localidade ?? "",
    state: data.uf ?? "",
  }
}
