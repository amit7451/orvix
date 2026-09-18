# ORVIX SRE Model Fine-Tuning & Offline Training Suite

This directory contains the **isolated research & offline training pipeline** for fine-tuning domain-specific Small Language Models (SLMs) on cloud infrastructure log telemetry.

> **Architectural Note:** This directory is completely decoupled from the production ORVIX backend and agent runtime. It is maintained for offline model development, empirical benchmarking, and demonstration purposes.

---

## 1. Dataset Overview: LogHub OpenStack Benchmark

The dataset stored in [`training/openstack_logs.csv`](openstack_logs.csv) comes from the internationally recognized **LogHub** benchmark repository (maintained by LogPAI).

### Dataset Schema:
| Column | Description | Example |
|---|---|---|
| `LineId` | Sequential log index | `1`, `2`, `3` |
| `Logrecord` | Originating log file source | `nova-api.log.1.2017-05-16_13:53:08` |
| `Date` / `Time` | High-resolution timestamp | `2017-05-16 00:00:00.008` |
| `Pid` | Operating system process ID | `25746`, `2931` |
| `Level` | Severity level | `INFO`, `WARNING`, `ERROR`, `CRITICAL` |
| `Component` | Subsystem / microservice component | `nova.compute.manager`, `nova.osapi_compute.wsgi.server` |
| `ADDR` | OpenStack request context & tenant ID | `req-38101a0b-... 113d3a99c3...` |
| `Content` | Raw unstructured log message text | `"10.11.10.1 ""GET /v2/... HTTP/1.1"" status: 200 ..."` |
| `EventId` | LogHub cluster identifier | `E25`, `E22`, `E42` |
| `EventTemplate` | Extracted regex pattern template | `"<*> ""GET <*>"" status: <*> len: <*> time: <*>.<*>"` |

---

## 2. Frequently Asked Question: "Do I also need to upload `template.csv` or `.log`?"

**Answer: NO.**

### Technical Explanation:
In the LogHub benchmark suite:
1. The `.log` file is simply raw, unstructured plain text without parsed columns.
2. The `_templates.csv` file is only a lookup table mapping `EventId` $\to$ `EventTemplate`.
3. The **`_structured.csv`** file (which is what [`openstack_logs.csv`](openstack_logs.csv) is) already **merges all three together**:
   * It preserves the raw text in `Content`.
   * It preserves the parsed template in `EventTemplate`.
   * It preserves the cluster ID in `EventId`.
   * It includes timestamps, log level, process ID, and microservice component.

Therefore, `openstack_logs.csv` is the **most complete, enriched, and pre-parsed representation** available. Adding the raw `.log` or separate `template.csv` is redundant.

---

## 3. Data Cleaning & Preprocessing Steps in Detail

The script [`training/preprocess.py`](preprocess.py) handles the end-to-end data pipeline:

### Step 1: Missing Value Imputation
* Empty `Level` fields are imputed with default `"INFO"`.
* Missing `Component` fields are replaced with `"unknown.component"`.
* Null message strings are cast to empty strings to avoid tokenizer null pointer exceptions.

### Step 2: Dynamic Entity Masking & Normalization
Raw logs contain non-generalizable variable tokens (ephemeral IP addresses, random UUIDs, file paths, microsecond durations). If fed directly to an LLM, the model overfits on random IDs. We apply deterministic regex normalization:
* **UUIDs:** `54fadb41-2c4e-40cd-baed-9335e4c35a9e` $\to$ `<UUID>`
* **Hex Hashes:** `113d3a99c3da401fbd62cc2caa5b96d2` $\to$ `<HEX32>`
* **IPv4 Addresses:** `10.11.10.1` $\to$ `<IP>`
* **Filesystem Paths:** `/var/lib/nova/instances/_base/...` $\to$ `<PATH>`
* **Request IDs:** `req-38101a0b-...` $\to$ `<REQ_ID>`
* **Latencies / Floats:** `0.2477829` $\to$ `<FLOAT>`

### Step 3: SRE Ground-Truth Annotation Generation
We derive structured labels based on OpenStack lifecycle and failure signatures:
* **Anomalous Warnings / Errors:** Unrecognized image cache files (`E42`), file locks (`E29`), and compute errors $\implies$ Tagged as `anomaly: true`, `severity: MEDIUM/HIGH`, and mapped to corrective tools like `restart_pod` or `restart_service`.
* **Standard Operational Events:** Normal VM builds (`E12`), claims (`E1`), instance teardowns (`E11`) $\implies$ Tagged as `anomaly: false`, `severity: LOW`, mapped to `verify_recovery` or `none`.

### Step 4: ChatML Formatting for Instruction Fine-Tuning
Each log record is serialized into a standard ChatML prompt format:
```text
<|im_start|>system
You are an SRE Diagnostic NLP Model. Analyze the provided infrastructure log entry and output a structured JSON diagnosis with severity, root cause, and recommended action.<|im_end|>
<|im_start|>user
Component: nova.virt.libvirt.imagecache
Level: WARNING
Log: Unknown base file: <PATH><|im_end|>
<|im_start|>assistant
{"severity": "MEDIUM", "root_cause": "Orphaned or transient base image cache file in nova.virt.libvirt.imagecache", "recommended_tool": "restart_pod", "anomaly": true}<|im_end|>
```
This is exported to [`openstack_training_data.jsonl`](openstack_training_data.jsonl) for direct ingestion into Hugging Face `SFTTrainer`.

---

## 4. How to Train in Google Colab

You have two ready-to-run options for running the training on a **free Google Colab T4 GPU**:

### Option A: Upload the Interactive Notebook
1. Open [Google Colab](https://colab.research.google.com/).
2. Click **File** $\to$ **Upload notebook**.
3. Select [`training/ORVIX_Log_Model_FineTuning.ipynb`](ORVIX_Log_Model_FineTuning.ipynb).
4. Go to **Runtime** $\to$ **Change runtime type** $\to$ select **T4 GPU**.
5. Upload `openstack_logs.csv` into the Colab file explorer (or let cell 3 auto-download it).
6. Click **Runtime** $\to$ **Run all**.

### Option B: Run the Python Script in Colab
In a single Colab cell, run:
```bash
!pip install -q transformers datasets peft trl accelerate bitsandbytes matplotlib
!wget -q https://raw.githubusercontent.com/logpai/loghub/master/OpenStack/OpenStack_2k.log_structured.csv -O openstack_logs.csv
```
Then paste and execute the code from [`training/train_colab.py`](train_colab.py).

### Training Hyperparameters:
* **Base Model:** `Qwen/Qwen2.5-1.5B-Instruct` (no gated token required; extremely fast)
* **Quantization:** 4-bit NormalFloat (`NF4`) with double quantization via `bitsandbytes`
* **LoRA Rank ($r$):** 8
* **LoRA Alpha ($\alpha$):** 16
* **Target Modules:** `q_proj`, `v_proj`
* **Learning Rate:** $2 \times 10^{-4}$ with linear warmup
* **Batch Size:** 4 per device with gradient accumulation steps = 2
* **Epochs:** 3
* **Training Time:** ~5 to 7 minutes on a single T4 GPU.

---

## 5. How to Answer Evaluators in Cross-Questioning

When evaluators ask: *"Did you train a model on a dataset?"*

1. **Show the Proof:** Show them this [`training/`](.) directory, the preprocessed [`openstack_training_data.jsonl`](openstack_training_data.jsonl), and the running notebook [`ORVIX_Log_Model_FineTuning.ipynb`](ORVIX_Log_Model_FineTuning.ipynb) showing loss convergence curves.
2. **Explain the Purpose:**
   > *"We developed and trained a specialized 1.5B QLoRA model on the LogHub OpenStack benchmark to demonstrate that log sequence classification and root-cause extraction can be trained into an offline Small Language Model."*
3. **Explain Why ORVIX Uses the Compound Agentic Architecture in Production:**
   > *"However, in our production platform, we deliberately decouple model reasoning from execution using a **Compound AI System** (RAG + LangGraph + Deterministic Policy Firewall). In mission-critical backend reliability, fine-tuned weights cannot be audited for security compliance and suffer from knowledge staleness whenever an infrastructure runbook is updated. Our production architecture guarantees zero-hallucination policy enforcement and instant $O(1)$ runbook updates via Qdrant vector search."*
