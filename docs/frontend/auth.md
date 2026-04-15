# Frontend Module: Autenticação

## Overview

Módulo responsável pela interface de login e gerenciamento de sessão via cookie HTTP.

## Páginas

| Rota | Arquivo | Descrição |
|------|---------|-----------|
| `/login` | `app/(auth)/login/page.tsx` | Tela de login |

## Middleware

`middleware.ts` (raiz do projeto):
- Intercepta todas as rotas exceto `_next/static`, `_next/image` e `favicon.ico`
- Se rota **não pública** e sem cookie `session_token` → redireciona para `/login`
- Se rota **pública** (`/login`) e com cookie válido → redireciona para `/dashboard`

## Serviços (`services/auth.ts`)

| Função | Descrição |
|--------|-----------|
| `login(payload)` | POST `/api/auth/login`, define cookie via backend |
| `logout()` | POST `/api/auth/logout`, limpa cookie via backend |
| `getMe()` | GET `/api/auth/me`, retorna `User` da sessão atual |

## Fluxo

```
LoginPage → services/auth.ts → lib/api.ts (apiFetch) → Backend /api/auth/*
```

A página não acessa a API diretamente — usa sempre `services/auth.ts`.

## Tela de Login

- React Hook Form + Zod para validação
- Campos: `username` e `password`
- Loading state no botão durante requisição
- Toast de sucesso após login
- Toast de erro em credenciais inválidas (mensagem vinda do backend)
- Após sucesso: `router.replace("/dashboard")`

## Tipos (`types/index.ts`)

```typescript
interface User {
  id: string
  username: string
  is_active: boolean
  created_at: string
}
```

## Dependency: Proteger rotas em Server Components

Em Server Components que precisam do usuário atual, usar `getMe()` de `services/auth.ts`:

```typescript
import { getMe } from "@/services/auth"

export default async function ProtectedPage() {
  const user = await getMe() // redireciona para /login se 401
  return <div>Olá, {user.username}</div>
}
```

O `apiFetch` já redireciona para `/login` ao receber `401`.
