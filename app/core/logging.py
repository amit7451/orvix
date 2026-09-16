"""Structured logging setup for ORVIX."""
from __future__ import annotations

import logging
import sys

from app.core.config import settings


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    fmt = "%(asctime)s | %(levelname)-8s | orvix.%(name)s | %(message)s"
    handler.setFormatter(logging.Formatter(fmt))

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(settings.log_level)

    # Quiet noisy libraries
    for noisy in ("uvicorn.access", "watchfiles"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
