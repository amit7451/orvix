"""Data Cleaning & Preprocessing Pipeline for OpenStack Log Telemetry.

Transforms raw structured LogHub CSV logs into NLP-ready training samples
for sequence classification and instruction fine-tuning.
Uses only Python Standard Library (csv, json, re) - zero dependencies needed.
"""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path


def clean_log_content(content: str) -> str:
    """Normalize dynamic entities in raw log messages."""
    if not content:
        return ""
    
    # Normalize UUIDs (e.g. 54fadb412c4e40cdbaed9335e4c35a9e or hyphenated)
    content = re.sub(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "<UUID>", content, flags=re.IGNORECASE)
    content = re.sub(r"\b[0-9a-f]{32}\b", "<HEX32>", content, flags=re.IGNORECASE)
    
    # Normalize IPv4 addresses
    content = re.sub(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b", "<IP>", content)
    
    # Normalize system paths
    content = re.sub(r"(/[a-zA-Z0-9_\-\.]+)+", "<PATH>", content)
    
    # Normalize request IDs
    content = re.sub(r"req-[0-9a-f\-]+", "<REQ_ID>", content, flags=re.IGNORECASE)
    
    # Normalize floating point seconds / latencies
    content = re.sub(r"\b\d+\.\d+\b", "<FLOAT>", content)
    
    # Strip excess quotes and whitespace
    content = content.replace('""', '"').strip()
    return content


def derive_sre_annotation(level: str, component: str, content: str) -> tuple[str, str, str, bool]:
    """Heuristic mapping from raw system logs to SRE Ground Truth diagnosis."""
    level = (level or "INFO").upper()
    comp = (component or "unknown").lower()
    c_low = content.lower()

    if level == "WARNING" or "unknown base file" in c_low or "too young to remove" in c_low:
        severity = "MEDIUM"
        root_cause = f"Orphaned or transient base image cache file detected in {component}"
        tool = "restart_pod"
        is_anomaly = True
    elif level in ("ERROR", "CRITICAL") or "404" in c_low or "failed" in c_low or "exception" in c_low:
        severity = "HIGH"
        root_cause = f"API or Compute resource failure in {component}"
        tool = "restart_service"
        is_anomaly = True
    elif "deleting" in c_low or "destroy" in c_low or "terminating" in c_low:
        severity = "LOW"
        root_cause = "Lifecycle VM teardown or network deallocation"
        tool = "verify_recovery"
        is_anomaly = False
    elif "spawning" in c_low or "build" in c_low or "creating" in c_low:
        severity = "LOW"
        root_cause = "Normal VM provisioning and hypervisor resource claim"
        tool = "verify_recovery"
        is_anomaly = False
    else:
        severity = "LOW"
        root_cause = "Routine WSGI HTTP API heartbeat and metadata transaction"
        tool = "none"
        is_anomaly = False

    return severity, root_cause, tool, is_anomaly


def process_dataset(csv_path: str | Path, output_jsonl: str | Path) -> None:
    """Full preprocessing pipeline:
    1. Reads OpenStack CSV line-by-line.
    2. Imputes missing fields.
    3. Normalizes dynamic tokens (IPs, UUIDs, Request IDs, Paths).
    4. Generates SRE Ground Truth annotations.
    5. Exports to ChatML JSONL format for HuggingFace / SFTTrainer.
    """
    csv_file = Path(csv_path)
    output_file = Path(output_jsonl)

    records = []
    anomalies_count = 0

    with open(csv_file, mode="r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            line_id = row.get("LineId", "")
            component = row.get("Component", "") or "unknown.component"
            level = row.get("Level", "") or "INFO"
            content = row.get("Content", "") or ""
            event_id = row.get("EventId", "")
            event_template = row.get("EventTemplate", "")

            clean_content = clean_log_content(content)
            severity, root_cause, tool, is_anomaly = derive_sre_annotation(level, component, clean_content)

            if is_anomaly:
                anomalies_count += 1

            system_prompt = (
                "You are an SRE Diagnostic NLP Model. Analyze the provided infrastructure log entry "
                "and output a structured JSON diagnosis with severity, root cause, and recommended action."
            )
            user_input = (
                f"Service Component: {component}\n"
                f"Log Level: {level}\n"
                f"Log Message: {clean_content}"
            )
            assistant_output = json.dumps({
                "severity": severity,
                "root_cause": root_cause,
                "recommended_tool": tool,
                "anomaly": is_anomaly
            })

            records.append({
                "line_id": line_id,
                "event_id": event_id,
                "system": system_prompt,
                "user": user_input,
                "target": assistant_output,
                "text": f"<|im_start|>system\n{system_prompt}<|im_end|>\n<|im_start|>user\n{user_input}<|im_end|>\n<|im_start|>assistant\n{assistant_output}<|im_end|>"
            })

    with open(output_file, mode="w", encoding="utf-8") as out:
        for r in records:
            out.write(json.dumps(r) + "\n")

    total = len(records)
    print(f"Preprocessed {total} records from {csv_file.name}")
    print(f"Saved processed ChatML training samples to: {output_file.name}")
    print(f"Detected anomalies/warnings: {anomalies_count}/{total} ({anomalies_count/total:.2%})")


if __name__ == "__main__":
    base_dir = Path(__file__).resolve().parent
    csv_path = base_dir / "openstack_logs.csv"
    jsonl_path = base_dir / "openstack_training_data.jsonl"
    process_dataset(csv_path, jsonl_path)
