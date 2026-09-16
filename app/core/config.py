"""ORVIX core configuration.

Centralized, environment-driven settings. Nothing secret is hard-coded.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Identity ---
    app_name: str = "ORVIX"
    app_tagline: str = "Observe, Reason, Verify & Execute Intelligence"
    environment: Literal["local", "staging", "production"] = "local"
    log_level: str = "INFO"

    # --- Database ---
    database_url: str = "sqlite+aiosqlite:///./orvix.db"

    # --- LLM ---
    llm_provider: Literal["openai", "gemini", "groq", "mock"] = "mock"
    openai_api_key: str | None = None
    gemini_api_key: str | None = None
    groq_api_key: str | None = None
    llm_model: str = "gpt-4o-mini"
    llm_timeout_seconds: float = 30.0
    llm_max_retries: int = 2

    # --- Vector store / RAG ---
    vector_store: Literal["memory", "chroma", "pgvector"] = "memory"
    embedding_dim: int = 256
    retrieval_top_k: int = 5
    rerank_enabled: bool = True

    # --- Notifications ---
    slack_webhook_url: str | None = None
    teams_webhook_url: str | None = None
    notification_email_from: str | None = None

    # --- Safety / automation ---
    enable_auto_remediation: bool = True
    dry_run: bool = False
    approval_timeout_seconds: int = 900

    # --- Security ---
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    secret_key: str = "change-me-in-production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
