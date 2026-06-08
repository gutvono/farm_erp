"use client"

import { useEffect, useState } from "react"

/**
 * Retorna `value` com atraso de `delayMs` desde a última mudança. Usado para
 * a busca textual das tabelas paginadas (Demanda 8): o input atualiza na hora
 * (controlado), mas o valor que dispara o fetch server-side só muda após o
 * usuário parar de digitar, evitando uma requisição por tecla.
 */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(handle)
  }, [value, delayMs])

  return debounced
}
