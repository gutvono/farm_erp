# Frontend Module: Autenticação

## Overview

Módulo responsável pela interface de login e gerenciamento de sessão.

## Pages

- `/login` — Tela de login

## Components

- `LoginForm` — Formulário com usuário e senha
- `ProtectedRoute` — Middleware que valida sessão

## Services

- `authService.login(username, password)` — Autentica usuário
- `authService.logout()` — Encerra sessão
- `authService.getCurrentUser()` — Retorna usuário atual

## Features

- Login com validação de formulário (React Hook Form + Zod)
- Redirecionamento para dashboard após login sucesso
- Redirecionamento para login se inativo
- Loading state e toast de erro

## Known Limitations

Documentação será preenchida durante o desenvolvimento do módulo.
