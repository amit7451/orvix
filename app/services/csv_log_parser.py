"""Structured CSV log parser and incident scenario extractor.

Parses CSV log files with configurable column mappings for timestamp,
severity level, component, and message content.  Extracts incident
scenarios suitable for feeding into the ORVIX agent pipeline by detecting
patterns such as error bursts, anomalous response times, lifecycle
failures, and resource contention signals.
"""
from __future__ import annotations

import csv
import re
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------
@dataclass
class ParsedLogEntry:
    line_id: int
    source: str
    timestamp: datetime
    pid: int
    level: str
    component: str
    address: str
    content: str
    event_id: str
    event_template: str


@dataclass
class DetectedScenario:
    """An incident scenario detected from log analysis."""
    scenario_id: str
    title: str
    description: str
    severity: str
    affected_components: list[str]
    symptoms: list[str]
    evidence: dict[str, Any]
    log_entries: list[dict[str, Any]] = field(default_factory=list)
    anomaly_count: int = 0
    time_window: str = ""


# ---------------------------------------------------------------------------
# Column mapping configuration
# ---------------------------------------------------------------------------
DEFAULT_COLUMN_MAP = {
    "line_id": "LineId",
    "source": "Logrecord",
    "date": "Date",
    "time": "Time",
    "pid": "Pid",
    "level": "Level",
    "component": "Component",
    "address": "ADDR",
    "content": "Content",
    "event_id": "EventId",
    "event_template": "EventTemplate",
}


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------
class CSVLogParser:
    """Parse structured CSV log files and extract incident scenarios."""

    def __init__(self, column_map: dict[str, str] | None = None) -> None:
        self.column_map = column_map or DEFAULT_COLUMN_MAP

    # --- public API --------------------------------------------------------
    def parse_file(self, path: str | Path) -> list[ParsedLogEntry]:
        """Read a CSV log file and return parsed entries."""
        path = Path(path)
        entries: list[ParsedLogEntry] = []
        with path.open(encoding="utf-8", errors="replace") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                entry = self._parse_row(row)
                if entry is not None:
                    entries.append(entry)
        return entries

    def extract_scenarios(self, entries: list[ParsedLogEntry]) -> list[DetectedScenario]:
        """Analyse parsed log entries and detect incident scenarios."""
        scenarios: list[DetectedScenario] = []
        scenarios.extend(self._detect_error_bursts(entries))
        scenarios.extend(self._detect_slow_responses(entries))
        scenarios.extend(self._detect_lifecycle_anomalies(entries))
        scenarios.extend(self._detect_resource_contention(entries))
        scenarios.extend(self._detect_event_distribution_anomalies(entries))

        # Deduplicate by scenario_id
        seen: set[str] = set()
        unique: list[DetectedScenario] = []
        for s in scenarios:
            if s.scenario_id not in seen:
                seen.add(s.scenario_id)
                unique.append(s)
        return unique

    def parse_and_extract(self, path: str | Path) -> dict[str, Any]:
        """Convenience: parse a file and extract scenarios in one call."""
        entries = self.parse_file(path)
        scenarios = self.extract_scenarios(entries)

        # Build a summary suitable for the testing harness.
        level_dist = Counter(e.level for e in entries)
        component_dist = Counter(e.component for e in entries)
        event_dist = Counter(e.event_id for e in entries)

        return {
            "total_log_entries": len(entries),
            "level_distribution": dict(level_dist),
            "component_distribution": dict(component_dist.most_common(15)),
            "unique_event_templates": len(event_dist),
            "event_distribution": dict(event_dist.most_common(20)),
            "time_range": {
                "start": entries[0].timestamp.isoformat() if entries else None,
                "end": entries[-1].timestamp.isoformat() if entries else None,
            },
            "scenarios": [self._scenario_to_dict(s) for s in scenarios],
        }

    # --- row parsing -------------------------------------------------------
    def _parse_row(self, row: dict[str, str]) -> ParsedLogEntry | None:
        try:
            date_str = row.get(self.column_map["date"], "")
            time_str = row.get(self.column_map["time"], "")
            ts = self._parse_timestamp(date_str, time_str)
            return ParsedLogEntry(
                line_id=int(row.get(self.column_map["line_id"], 0)),
                source=row.get(self.column_map["source"], ""),
                timestamp=ts,
                pid=int(row.get(self.column_map["pid"], 0)),
                level=row.get(self.column_map["level"], "INFO").upper(),
                component=row.get(self.column_map["component"], ""),
                address=row.get(self.column_map["address"], ""),
                content=row.get(self.column_map["content"], ""),
                event_id=row.get(self.column_map["event_id"], ""),
                event_template=row.get(self.column_map["event_template"], ""),
            )
        except Exception:
            return None

    @staticmethod
    def _parse_timestamp(date_str: str, time_str: str) -> datetime:
        combined = f"{date_str} {time_str}".strip()
        for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(combined, fmt)
            except ValueError:
                continue
        return datetime(2000, 1, 1)

    # --- scenario detectors ------------------------------------------------
    def _detect_error_bursts(self, entries: list[ParsedLogEntry]) -> list[DetectedScenario]:
        """Detect bursts of ERROR/WARNING level log entries."""
        error_entries = [e for e in entries if e.level in ("ERROR", "WARNING")]
        if len(error_entries) < 3:
            return []

        # Group errors by 60-second windows
        windows: dict[str, list[ParsedLogEntry]] = defaultdict(list)
        for e in error_entries:
            window_key = e.timestamp.strftime("%Y-%m-%d %H:%M")
            windows[window_key].append(e)

        scenarios: list[DetectedScenario] = []
        for window, errs in windows.items():
            if len(errs) >= 3:
                components = list(set(e.component for e in errs))
                scenarios.append(DetectedScenario(
                    scenario_id=f"error-burst-{window}",
                    title=f"Error burst detected ({len(errs)} errors in 1-minute window)",
                    description=f"A burst of {len(errs)} error/warning log entries was detected "
                                f"within a 1-minute window starting at {window}, indicating "
                                f"potential system instability.",
                    severity="HIGH" if len(errs) >= 5 else "MEDIUM",
                    affected_components=components,
                    symptoms=[f"{len(errs)} errors in 1-minute window",
                              f"Affected components: {', '.join(components[:5])}"],
                    evidence={
                        "error_count": len(errs),
                        "time_window": window,
                        "sample_messages": [e.content[:200] for e in errs[:5]],
                    },
                    log_entries=[self._entry_to_dict(e) for e in errs[:10]],
                    anomaly_count=len(errs),
                    time_window=window,
                ))
        return scenarios

    def _detect_slow_responses(self, entries: list[ParsedLogEntry]) -> list[DetectedScenario]:
        """Detect abnormally slow HTTP response times from API logs."""
        time_pattern = re.compile(r'time:\s*([\d.]+)')
        status_pattern = re.compile(r'status:\s*(\d+)')
        response_times: list[tuple[ParsedLogEntry, float]] = []

        for e in entries:
            tm = time_pattern.search(e.content)
            if tm:
                response_times.append((e, float(tm.group(1))))

        if len(response_times) < 10:
            return []

        times = [t for _, t in response_times]
        mean_time = statistics.mean(times)
        stdev_time = statistics.stdev(times) if len(times) > 1 else 0

        threshold = mean_time + 2 * stdev_time if stdev_time > 0 else mean_time * 2
        slow = [(e, t) for e, t in response_times if t > threshold and t > 0.3]

        if not slow:
            return []

        # Detect error status codes
        error_responses: list[tuple[ParsedLogEntry, int]] = []
        for e in entries:
            sm = status_pattern.search(e.content)
            if sm:
                status = int(sm.group(1))
                if status >= 400:
                    error_responses.append((e, status))

        scenarios: list[DetectedScenario] = []
        components = list(set(e.component for e, _ in slow))
        scenarios.append(DetectedScenario(
            scenario_id="slow-api-responses",
            title=f"API latency anomaly ({len(slow)} slow responses detected)",
            description=f"{len(slow)} API responses exceeded the baseline latency threshold "
                        f"of {threshold:.3f}s (mean={mean_time:.3f}s, stdev={stdev_time:.3f}s). "
                        f"This may indicate backend congestion or resource exhaustion.",
            severity="HIGH" if len(slow) > 10 else "MEDIUM",
            affected_components=components,
            symptoms=[
                f"{len(slow)} responses above {threshold:.3f}s threshold",
                f"Mean response time: {mean_time:.3f}s",
                f"Max response time: {max(t for _, t in slow):.3f}s",
            ] + ([f"{len(error_responses)} HTTP error responses (4xx/5xx)"] if error_responses else []),
            evidence={
                "slow_response_count": len(slow),
                "mean_response_time": round(mean_time, 4),
                "stdev_response_time": round(stdev_time, 4),
                "threshold": round(threshold, 4),
                "max_response_time": round(max(t for _, t in slow), 4),
                "error_response_count": len(error_responses),
                "sample_slow": [{"content": e.content[:200], "time": t} for e, t in slow[:5]],
            },
            log_entries=[self._entry_to_dict(e) for e, _ in slow[:10]],
            anomaly_count=len(slow),
        ))

        if error_responses:
            status_counts = Counter(s for _, s in error_responses)
            scenarios.append(DetectedScenario(
                scenario_id="http-error-responses",
                title=f"HTTP error responses detected ({len(error_responses)} errors)",
                description=f"Detected {len(error_responses)} HTTP error responses (status >= 400). "
                            f"Status distribution: {dict(status_counts)}",
                severity="MEDIUM",
                affected_components=list(set(e.component for e, _ in error_responses)),
                symptoms=[f"{count}x HTTP {status}" for status, count in status_counts.most_common()],
                evidence={
                    "error_count": len(error_responses),
                    "status_distribution": dict(status_counts),
                    "sample_errors": [{"content": e.content[:200], "status": s} for e, s in error_responses[:5]],
                },
                log_entries=[self._entry_to_dict(e) for e, _ in error_responses[:10]],
                anomaly_count=len(error_responses),
            ))

        return scenarios

    def _detect_lifecycle_anomalies(self, entries: list[ParsedLogEntry]) -> list[DetectedScenario]:
        """Detect VM/instance lifecycle anomalies (stuck spawning, unexpected terminations)."""
        instance_pattern = re.compile(r'\[instance:\s*([a-f0-9-]+)\]')
        instance_events: dict[str, list[tuple[ParsedLogEntry, str]]] = defaultdict(list)

        lifecycle_keywords = {
            "spawning": "SPAWNING", "spawned": "SPAWNED", "terminated": "TERMINATED",
            "terminating": "TERMINATING", "destroyed": "DESTROYED", "started": "STARTED",
            "paused": "PAUSED", "resumed": "RESUMED", "sync_power_state": "SYNC_POWER",
        }

        for e in entries:
            m = instance_pattern.search(e.content)
            if m:
                instance_id = m.group(1)
                content_lower = e.content.lower()
                for kw, event_type in lifecycle_keywords.items():
                    if kw in content_lower:
                        instance_events[instance_id].append((e, event_type))
                        break

        scenarios: list[DetectedScenario] = []
        rapid_terminations: list[str] = []
        spawn_issues: list[str] = []

        for instance_id, events in instance_events.items():
            event_types = [et for _, et in events]

            # Detect rapid create-then-destroy patterns
            if "SPAWNED" in event_types and "TERMINATED" in event_types:
                spawn_time = next((e.timestamp for e, et in events if et == "SPAWNED"), None)
                term_time = next((e.timestamp for e, et in events if et in ("TERMINATED", "TERMINATING")), None)
                if spawn_time and term_time:
                    delta = abs((term_time - spawn_time).total_seconds())
                    if delta < 30:
                        rapid_terminations.append(instance_id)

            # Detect stuck in spawning (multiple sync_power_state while spawning)
            sync_count = event_types.count("SYNC_POWER")
            if sync_count >= 2 and "SPAWNING" in event_types:
                spawn_issues.append(instance_id)

        if rapid_terminations:
            scenarios.append(DetectedScenario(
                scenario_id="rapid-instance-termination",
                title=f"Rapid instance create-destroy cycles ({len(rapid_terminations)} instances)",
                description=f"{len(rapid_terminations)} VM instances were created and terminated "
                            f"within 30 seconds, suggesting possible failed provisioning, "
                            f"autoscaler thrashing, or test-environment cleanup anomalies.",
                severity="HIGH" if len(rapid_terminations) >= 3 else "MEDIUM",
                affected_components=["nova.compute.manager", "nova.virt.libvirt.driver"],
                symptoms=[
                    f"{len(rapid_terminations)} instances with < 30s lifetime",
                    "Possible autoscaler or provisioning anomaly",
                ],
                evidence={
                    "rapid_termination_count": len(rapid_terminations),
                    "instance_ids": rapid_terminations[:10],
                },
                log_entries=[],
                anomaly_count=len(rapid_terminations),
            ))

        if spawn_issues:
            scenarios.append(DetectedScenario(
                scenario_id="spawn-sync-issues",
                title=f"Instance spawn synchronization issues ({len(spawn_issues)} instances)",
                description=f"{len(spawn_issues)} instances showed repeated power state sync "
                            f"checks during spawning, indicating potential compute node "
                            f"performance issues or hypervisor delays.",
                severity="MEDIUM",
                affected_components=["nova.compute.manager"],
                symptoms=[
                    f"{len(spawn_issues)} instances with repeated sync_power_state during spawn",
                    "Possible hypervisor or network delays",
                ],
                evidence={
                    "affected_instance_count": len(spawn_issues),
                    "instance_ids": spawn_issues[:10],
                },
                log_entries=[],
                anomaly_count=len(spawn_issues),
            ))

        return scenarios

    def _detect_resource_contention(self, entries: list[ParsedLogEntry]) -> list[DetectedScenario]:
        """Detect resource contention signals (high CPU, memory, connection pools)."""
        vcpu_pattern = re.compile(r'total usable vcpus:\s*(\d+),\s*total allocated vcpus:\s*(\d+)', re.I)
        ram_pattern = re.compile(r'phys_ram=(\d+)MB\s+used_ram=(\d+)MB', re.I)
        disk_pattern = re.compile(r'phys_disk=(\d+)GB\s+used_disk=(\d+)GB', re.I)

        resource_entries: list[dict[str, Any]] = []
        for e in entries:
            resource_data: dict[str, Any] = {}
            vm = vcpu_pattern.search(e.content)
            if vm:
                total, alloc = int(vm.group(1)), int(vm.group(2))
                resource_data["vcpu_total"] = total
                resource_data["vcpu_allocated"] = alloc
                resource_data["vcpu_utilization"] = round(alloc / total, 3) if total else 0

            rm = ram_pattern.search(e.content)
            if rm:
                phys, used = int(rm.group(1)), int(rm.group(2))
                resource_data["ram_total_mb"] = phys
                resource_data["ram_used_mb"] = used
                resource_data["ram_utilization"] = round(used / phys, 3) if phys else 0

            dm = disk_pattern.search(e.content)
            if dm:
                phys, used = int(dm.group(1)), int(dm.group(2))
                resource_data["disk_total_gb"] = phys
                resource_data["disk_used_gb"] = used
                resource_data["disk_utilization"] = round(used / phys, 3) if phys else 0

            if resource_data:
                resource_data["entry"] = e
                resource_entries.append(resource_data)

        if not resource_entries:
            return []

        # Check for high utilization
        high_util: list[dict[str, Any]] = []
        for r in resource_entries:
            issues = []
            if r.get("vcpu_utilization", 0) > 0.8:
                issues.append(f"vCPU: {r['vcpu_allocated']}/{r['vcpu_total']}")
            if r.get("ram_utilization", 0) > 0.8:
                issues.append(f"RAM: {r['ram_used_mb']}MB/{r['ram_total_mb']}MB")
            if r.get("disk_utilization", 0) > 0.8:
                issues.append(f"Disk: {r['disk_used_gb']}GB/{r['disk_total_gb']}GB")
            if issues:
                high_util.append({"issues": issues, **{k: v for k, v in r.items() if k != "entry"}})

        # Over-provisioned disk (used > physical - can happen with thin provisioning)
        overcommit: list[dict[str, Any]] = []
        for r in resource_entries:
            if r.get("disk_used_gb", 0) > r.get("disk_total_gb", float("inf")):
                overcommit.append(r)

        scenarios: list[DetectedScenario] = []
        if high_util:
            scenarios.append(DetectedScenario(
                scenario_id="resource-high-utilization",
                title=f"High resource utilization detected ({len(high_util)} entries)",
                description=f"Resource tracking data shows {len(high_util)} entries with "
                            f"utilization above 80% for one or more resources (vCPU, RAM, disk).",
                severity="HIGH" if len(high_util) >= 3 else "MEDIUM",
                affected_components=["nova.compute.resource_tracker"],
                symptoms=[issue for h in high_util for issue in h["issues"]],
                evidence={
                    "high_utilization_count": len(high_util),
                    "samples": high_util[:5],
                },
                log_entries=[],
                anomaly_count=len(high_util),
            ))

        if overcommit:
            scenarios.append(DetectedScenario(
                scenario_id="disk-overcommit",
                title=f"Disk over-commitment detected",
                description=f"Disk used exceeds physical disk capacity, indicating "
                            f"thin provisioning overcommit that could lead to I/O failures.",
                severity="CRITICAL",
                affected_components=["nova.compute.resource_tracker"],
                symptoms=["Disk used exceeds physical capacity"],
                evidence={
                    "overcommit_entries": len(overcommit),
                },
                log_entries=[],
                anomaly_count=len(overcommit),
            ))

        return scenarios

    def _detect_event_distribution_anomalies(self, entries: list[ParsedLogEntry]) -> list[DetectedScenario]:
        """Detect unusual event template distributions indicating abnormal system behavior."""
        if not entries:
            return []

        event_counts = Counter(e.event_id for e in entries if e.event_id)
        total = sum(event_counts.values())
        if total < 50:
            return []

        # Check for dominant events (potential flood / log storm)
        scenarios: list[DetectedScenario] = []
        for event_id, count in event_counts.most_common(3):
            ratio = count / total
            if ratio > 0.4:
                sample_entries = [e for e in entries if e.event_id == event_id][:3]
                template = sample_entries[0].event_template if sample_entries else "Unknown"
                scenarios.append(DetectedScenario(
                    scenario_id=f"event-flood-{event_id}",
                    title=f"Log event concentration: {event_id} accounts for {ratio:.0%} of all logs",
                    description=f"Event template '{event_id}' ({template}) comprises {ratio:.0%} "
                                f"({count}/{total}) of all log entries. This concentration may "
                                f"indicate a repetitive operation, retry loop, or log storm.",
                    severity="MEDIUM",
                    affected_components=list(set(e.component for e in sample_entries)),
                    symptoms=[
                        f"{event_id} represents {ratio:.0%} of all log events",
                        f"Template: {template}",
                    ],
                    evidence={
                        "event_id": event_id,
                        "count": count,
                        "total_events": total,
                        "ratio": round(ratio, 4),
                        "template": template,
                    },
                    log_entries=[self._entry_to_dict(e) for e in sample_entries],
                    anomaly_count=1,
                ))

        return scenarios

    # --- utility -----------------------------------------------------------
    @staticmethod
    def _entry_to_dict(entry: ParsedLogEntry) -> dict[str, Any]:
        return {
            "line_id": entry.line_id,
            "timestamp": entry.timestamp.isoformat(),
            "level": entry.level,
            "component": entry.component,
            "content": entry.content[:300],
            "event_id": entry.event_id,
        }

    @staticmethod
    def _scenario_to_dict(scenario: DetectedScenario) -> dict[str, Any]:
        return {
            "scenario_id": scenario.scenario_id,
            "title": scenario.title,
            "description": scenario.description,
            "severity": scenario.severity,
            "affected_components": scenario.affected_components,
            "symptoms": scenario.symptoms,
            "evidence": scenario.evidence,
            "log_entries": scenario.log_entries,
            "anomaly_count": scenario.anomaly_count,
            "time_window": scenario.time_window,
        }
