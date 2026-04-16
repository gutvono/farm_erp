from sqlalchemy.orm import Session


def criar_notificacao(
    db: Session,
    title: str,
    message: str,
    type: str,
    module: str,
) -> None:
    """Placeholder — será implementado no módulo Dashboard."""
    pass
