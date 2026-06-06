import fs from "node:fs"
import path from "node:path"

import { request, type FullConfig } from "@playwright/test"

const AUTH_FILE = "e2e/.auth/admin.json"
const API_BASE = process.env.E2E_API_URL ?? "http://localhost:8000"

/**
 * Login ÚNICO do harness E2E. Roda uma vez antes de toda a suíte:
 * autentica `admin/admin123` via API (cookie de sessão `session_token`) e grava
 * o estado em `e2e/.auth/admin.json`. Os specs reusam esse `storageState` — nunca
 * logam por teste. O cookie é host-only para `localhost`, então vale tanto para o
 * front (:3000) quanto para as chamadas à API (:8000).
 */
async function globalSetup(_config: FullConfig): Promise<void> {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true })

  const ctx = await request.newContext()
  const res = await ctx.post(`${API_BASE}/api/auth/login`, {
    data: { username: "admin", password: "admin123" },
  })
  if (!res.ok()) {
    throw new Error(
      `[e2e] Login falhou (${res.status()}): ${await res.text()}. ` +
        "A stack está de pé (make up) e o banco semeado (make reset-db)?"
    )
  }

  await ctx.storageState({ path: AUTH_FILE })
  await ctx.dispose()
  // Marca observável de que o login aconteceu UMA vez (aparece 1x na saída).
  console.log(`[e2e] login único OK — storageState salvo em ${AUTH_FILE}`)
}

export default globalSetup
