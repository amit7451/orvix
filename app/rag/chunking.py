"""Document normalization + chunking for the RAG ingestion pipeline."""
from __future__ import annotations

import re


def normalize(text: str) -> str:
    text = text.replace("\r\n", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 120) -> list[str]:
    """Simple sliding-window chunker over normalized text, splitting on
    paragraph boundaries where possible to keep chunks semantically coherent."""
    text = normalize(text)
    if len(text) <= chunk_size:
        return [text] if text else []

    paragraphs = [p for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        if len(current) + len(para) + 2 <= chunk_size:
            current = f"{current}\n\n{para}" if current else para
        else:
            if current:
                chunks.append(current.strip())
            if len(para) > chunk_size:
                # hard-split an overly long paragraph with overlap
                start = 0
                while start < len(para):
                    end = start + chunk_size
                    chunks.append(para[start:end].strip())
                    start = end - overlap
                current = ""
            else:
                current = para
    if current:
        chunks.append(current.strip())
    return [c for c in chunks if c]
