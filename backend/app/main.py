import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.shared.exceptions import add_exception_handlers

app = FastAPI(
    title="Coffee Farm ERP",
    version="1.0.0",
    description="Sistema de gestão integrado para fazendas de café",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handlers
add_exception_handlers(app)

# Static files for uploads
os.makedirs(settings.upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

# ---------------------------------------------------------------------------
# Module routers — uncomment as each module is implemented
# ---------------------------------------------------------------------------
from app.modules.auth.router import router as auth_router
from app.modules.comercial.router import router as comercial_router
from app.modules.compras.router import router as compras_router
from app.modules.estoque.router import router as estoque_router
from app.modules.faturamento.router import router as faturamento_router
from app.modules.financeiro.router import router as financeiro_router
from app.modules.folha.router import router as folha_router
from app.modules.pcp.router import router as pcp_router
# from app.modules.dashboard.router import router as dashboard_router

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(comercial_router, prefix="/api/comercial", tags=["comercial"])
app.include_router(compras_router, prefix="/api/compras", tags=["compras"])
app.include_router(estoque_router, prefix="/api/estoque", tags=["estoque"])
app.include_router(faturamento_router, prefix="/api/faturamento", tags=["faturamento"])
app.include_router(financeiro_router, prefix="/api/financeiro", tags=["financeiro"])
app.include_router(folha_router, prefix="/api/folha", tags=["folha"])
app.include_router(pcp_router, prefix="/api/pcp", tags=["pcp"])
# app.include_router(dashboard_router, prefix="/api/dashboard", tags=["dashboard"])
# ---------------------------------------------------------------------------


@app.get("/", tags=["health"])
def health_check() -> dict:
    return {"status": "ok", "message": "Coffee Farm ERP API"}
