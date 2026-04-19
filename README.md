# Coffee Farm ERP

Sistema integrado de gestão para fazendas de café, cobrindo operações comerciais, financeiras, de estoque, produção e folha de pagamento.

## Requisitos

- [Docker](https://docs.docker.com/get-docker/) e [Docker Compose](https://docs.docker.com/compose/install/)
- Git

## Como rodar

### 1. Clone o repositório

```bash
git clone <url-do-repositorio>
cd farm_erp
```

### 2. Suba os serviços

```bash
make build   # constrói as imagens (necessário apenas na primeira vez ou após mudanças)
make up      # sobe os 3 serviços: postgres, backend, frontend
```

### 3. Verifique que está funcionando

| Serviço  | URL                        |
|----------|----------------------------|
| Backend  | http://localhost:8000      |
| Frontend | http://localhost:3000      |
| Docs API | http://localhost:8000/docs |

O backend deve retornar `{"status": "ok"}` em `http://localhost:8000`.

### 4. Popule o banco com dados iniciais

```bash
make reset-db
```

Isso executa as migrations do Alembic e o seed com dados de exemplo (clientes, funcionários, movimentações financeiras, etc.).

## Comandos disponíveis

| Comando             | Descrição                                      |
|---------------------|------------------------------------------------|
| `make build`        | Constrói ou reconstrói as imagens Docker       |
| `make up`           | Sobe todos os serviços                         |
| `make down`         | Para e remove os containers                    |
| `make logs`         | Exibe logs em tempo real de todos os serviços  |
| `make reset-db`     | Reseta o banco e repopula com dados de seed    |
| `make shell-backend`| Abre shell dentro do container do backend      |
| `make shell-db`     | Abre psql dentro do container do postgres      |

## Deploy no Railway

### Variáveis de ambiente

Configure as seguintes variáveis no dashboard de cada serviço no Railway:

**Backend:**
| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Injetada automaticamente ao linkar o serviço Postgres |
| `SECRET_KEY` | Chave secreta para sessões (gere com `python -c "import secrets; print(secrets.token_hex(32))"`) |
| `ALLOWED_ORIGINS` | URL pública do frontend (ex: `https://meuapp.up.railway.app`) |

**Frontend:**
| Variável | Descrição |
|----------|-----------|
| `NEXT_PUBLIC_API_URL` | URL pública do backend (ex: `https://backend.up.railway.app`) |

### Pre-deploy command (Backend)

No serviço de backend do Railway, configure o **Pre-deploy command**:

```
poetry run alembic upgrade head && poetry run python scripts/seed_only.py
```

Esse comando:
1. Aplica todas as migrations pendentes
2. Limpa as tabelas na ordem correta (respeitando FK) e repopula com dados de seed

> O script `seed_only.py` **não dropa nem recria o banco** — é seguro rodar em produção com dados existentes, pois apenas trunca e repopula.

### Build local para produção

```bash
cp .env.prod.example .env.prod   # edite com suas variáveis reais
make build-prod
make up-prod
```

---

## Stack

- **Backend:** FastAPI + SQLAlchemy + Alembic + PostgreSQL
- **Frontend:** Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui
- **Infra:** Docker + Docker Compose

## Módulos

- Autenticação
- Comercial (vendas e clientes)
- Compras (ordens e fornecedores)
- Estoque
- Faturamento
- Financeiro (contas a pagar/receber, fluxo de caixa)
- Folha de Pagamento
- PCP (Planejamento e Controle de Produção)
- Dashboard
