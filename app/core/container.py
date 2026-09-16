"""Lightweight dependency container.

ORVIX avoids a heavy DI framework; this module wires singleton
infrastructure objects once at process start and exposes them via FastAPI
`Depends`-friendly getter functions.
"""
from __future__ import annotations

from functools import lru_cache

from app.core.config import settings
from app.llm.client import LLMClient, build_llm_client
from app.observability.anomaly import AnomalyDetector, anomaly_detector
from app.observability.events_provider import MockEventsProvider
from app.observability.logs import MockLogsProvider
from app.observability.metrics import MockMetricsProvider
from app.observability.tracing import MockTracesProvider
from app.rag.embeddings import HashingEmbeddingProvider
from app.rag.ingestion import IngestionPipeline
from app.rag.retriever import OperationalRetriever
from app.rag.vector_store import InMemoryVectorStore
from app.simulation.engine import SimulationRegistry, simulation_registry


@lru_cache
def get_simulation_registry() -> SimulationRegistry:
    return simulation_registry


@lru_cache
def get_metrics_provider() -> MockMetricsProvider:
    return MockMetricsProvider(get_simulation_registry())


@lru_cache
def get_logs_provider() -> MockLogsProvider:
    return MockLogsProvider(get_simulation_registry())


@lru_cache
def get_traces_provider() -> MockTracesProvider:
    return MockTracesProvider(get_simulation_registry())


@lru_cache
def get_events_provider() -> MockEventsProvider:
    return MockEventsProvider(get_simulation_registry())


@lru_cache
def get_anomaly_detector() -> AnomalyDetector:
    return anomaly_detector


@lru_cache
def get_vector_store() -> InMemoryVectorStore:
    return InMemoryVectorStore()


@lru_cache
def get_embedder() -> HashingEmbeddingProvider:
    return HashingEmbeddingProvider(dim=settings.embedding_dim)


@lru_cache
def get_ingestion_pipeline() -> IngestionPipeline:
    return IngestionPipeline(get_embedder(), get_vector_store())


@lru_cache
def get_retriever() -> OperationalRetriever:
    return OperationalRetriever(get_embedder(), get_vector_store())


@lru_cache
def get_llm_client() -> LLMClient:
    return build_llm_client()
