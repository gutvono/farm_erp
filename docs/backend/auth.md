# Backend Module: Autenticação

## Overview

Módulo responsável pela autenticação de usuários via login/senha com sessão HTTP.

## Endpoints

- `POST /api/auth/login` — Autentica usuário
- `POST /api/auth/logout` — Encerra sessão
- `GET /api/auth/me` — Retorna usuário atual

## Integrations

Nenhuma integração com outros módulos.

## Database Schema

- `users` table com username, password_hash, role

## Business Rules

- Login com usuário + senha
- Sessão via cookie HTTP (httpOnly, secure)
- Estrutura preparada para futura migração para JWT

## Known Limitations

Documentação será preenchida durante o desenvolvimento do módulo.
