# Backend Module: Autenticação

## Overview

Módulo responsável pela autenticação de usuários via login/senha com sessão HTTP baseada em cookie.

## Endpoints

| Método | Rota | Descrição | Auth obrigatória |
|--------|------|-----------|-----------------|
| `POST` | `/api/auth/login` | Autentica usuário e cria sessão | Não |
| `POST` | `/api/auth/logout` | Encerra sessão e limpa cookie | Não |
| `GET`  | `/api/auth/me` | Retorna usuário da sessão atual | Sim |

### POST /api/auth/login

**Body:**
```json
{ "username": "admin", "password": "admin123" }
```

**Resposta (200):**
```json
{
  "success": true,
  "message": "Login realizado com sucesso",
  "data": { "id": "...", "username": "admin", "is_active": true, "created_at": "..." }
}
```

Define o cookie `session_token` (httpOnly, SameSite=Lax, max_age=86400s).

**Erros:**
- `401` — Usuário ou senha inválidos
- `403` — Usuário inativo

### POST /api/auth/logout

Lê o cookie `session_token`, remove a sessão do banco e deleta o cookie.

### GET /api/auth/me

Requer cookie `session_token` válido. Retorna o usuário autenticado.

## Arquitetura

```
router.py → service.py → repository.py → PostgreSQL
```

- **router.py** — validação de entrada (Pydantic), leitura/escrita de cookies, dependency `get_current_user`
- **service.py** — lógica: valida credenciais, cria/valida/expira sessões
- **repository.py** — acesso ao banco (sem lógica de negócio)

## Dependency: `get_current_user`

```python
from app.modules.auth.router import get_current_user

@router.get("/rota-protegida")
def rota(current_user: User = Depends(get_current_user)):
    ...
```

Lança `401` se cookie ausente ou sessão inválida/expirada.

## Database Schema

### `users`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | Identificador único |
| `username` | VARCHAR(150) unique | Login do usuário |
| `hashed_password` | VARCHAR(255) | Senha bcrypt (rounds=12) |
| `is_active` | BOOLEAN | Usuário ativo? |
| `created_at` | TIMESTAMPTZ | Criação automática |
| `updated_at` | TIMESTAMPTZ | Atualização automática |
| `deleted_at` | TIMESTAMPTZ | Soft delete (NULL = ativo) |

### `user_sessions`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | Identificador único |
| `session_token` | VARCHAR(255) unique | Token UUID da sessão |
| `user_id` | UUID FK → users.id | Usuário proprietário |
| `expires_at` | TIMESTAMPTZ | Expiração (padrão: 24h) |
| `created_at` | TIMESTAMPTZ | Criação automática |

## Regras de Negócio

- Credenciais inválidas retornam `401` com mensagem genérica (sem indicar qual campo está errado)
- Sessões expiradas são removidas do banco na próxima tentativa de validação
- Cookie `secure=True` em produção, `secure=False` em development (controlado via `ENVIRONMENT`)
- Estrutura preparada para migração para JWT: basta trocar `create_session_token()` e `validate_session()` sem reescrever router/service

## Stack de Hashing

O hashing de senha usa a biblioteca **`bcrypt`** diretamente (`app/core/security.py`):
`bcrypt.hashpw` / `bcrypt.checkpw` com `gensalt(rounds=12)`. Não há dependência de
`passlib`/`CryptContext`.

| Item | Valor |
|------|-------|
| Biblioteca | `bcrypt = "^5.0.0"` (declarada direta no `pyproject.toml`) |
| Algoritmo | bcrypt, prefixo `$2b$`, custo (rounds) = 12 |
| Tamanho do hash | 60 caracteres |

### Limitações conhecidas / Débito técnico

- **Resolvido (2026-06-07): remoção do `passlib`.** O projeto declarava
  `passlib = {extras=["bcrypt"], version="^1.7.4"}`, mas `passlib` nunca era importado —
  o código sempre usou `bcrypt` diretamente. Como `passlib` 1.7.4 (última release, sem
  manutenção) não reconhece a API do `bcrypt ≥ 4.1`, ele emitia o warning
  `(trapped) error reading bcrypt version` ao carregar seu backend. A correção foi
  **remover a dependência morta `passlib`** e declarar `bcrypt` diretamente, em vez de
  fixar o `bcrypt` numa versão antiga para agradar uma lib sem manutenção. Isso elimina o
  caminho de código do warning na raiz e mantém o `bcrypt` 5.0.0 (mantido). Login e
  verificação de hash permanecem idênticos.
- bcrypt trunca senhas em 72 bytes (limitação do algoritmo); não é validado no input hoje.

## Seed

Usuário padrão para desenvolvimento:
- **username:** `admin`
- **password:** `admin123`
- Hash: `$2b$12$Qu/tWbeyYlYlaj/zppVJiu86YgptYIPbe1RRvUnxOlkG3i.DCxxFq`
