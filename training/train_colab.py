# ==============================================================================
# ORVIX SRE Log Model Fine-Tuning Script (Google Colab / Free T4 GPU)
#
# Task: Instruction fine-tune an SLM on OpenStack structured log telemetry
# Dataset: LogHub OpenStack 2k (openstack_logs.csv)
# Framework: Hugging Face (Transformers, PEFT, TRL, Datasets) + QLoRA
# ==============================================================================

# --- STEP 1: Install Dependencies (Uncomment in Colab) ---
# !pip install -q transformers datasets peft trl accelerate bitsandbytes matplotlib

import os
import re
import csv
import json
import torch
import matplotlib.pyplot as plt
from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    BitsAndBytesConfig,
    TrainingArguments
)
from peft import LoraConfig, get_peft_model
from trl import SFTTrainer

# Set device
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"--> Using compute device: {device}")

# --- STEP 2: Preprocess OpenStack CSV Dataset ---
CSV_FILE = "openstack_logs.csv"

def clean_log(content):
    if not content:
        return ""
    content = re.sub(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "<UUID>", content, flags=re.IGNORECASE)
    content = re.sub(r"\b[0-9a-f]{32}\b", "<HEX32>", content, flags=re.IGNORECASE)
    content = re.sub(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b", "<IP>", content)
    content = re.sub(r"(/[a-zA-Z0-9_\-\.]+)+", "<PATH>", content)
    content = re.sub(r"req-[0-9a-f\-]+", "<REQ_ID>", content, flags=re.IGNORECASE)
    content = re.sub(r"\b\d+\.\d+\b", "<FLOAT>", content)
    return content.replace('""', '"').strip()

def derive_annotation(level, component, content):
    lvl = (level or "INFO").upper()
    c_low = content.lower()
    if lvl == "WARNING" or "unknown base file" in c_low or "too young to remove" in c_low:
        return "MEDIUM", f"Orphaned or transient base image cache file in {component}", "restart_pod", True
    elif lvl in ("ERROR", "CRITICAL") or "404" in c_low or "failed" in c_low:
        return "HIGH", f"Resource failure in {component}", "restart_service", True
    elif "deleting" in c_low or "destroy" in c_low:
        return "LOW", "Lifecycle VM teardown or cleanup", "verify_recovery", False
    elif "spawning" in c_low or "build" in c_low:
        return "LOW", "Normal VM provisioning and hypervisor resource claim", "verify_recovery", False
    else:
        return "LOW", "Routine API transaction and heartbeat", "none", False

samples = []
if os.path.exists(CSV_FILE):
    with open(CSV_FILE, mode="r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            clean = clean_log(row.get("Content", ""))
            comp = row.get("Component", "nova.api")
            lvl = row.get("Level", "INFO")
            sev, cause, tool, is_anom = derive_annotation(lvl, comp, clean)
            
            system_msg = "You are an SRE Diagnostic NLP Model. Return strict JSON with severity, root_cause, recommended_tool, and anomaly."
            user_msg = f"Component: {comp}\nLevel: {lvl}\nLog: {clean}"
            assistant_msg = json.dumps({
                "severity": sev,
                "root_cause": cause,
                "recommended_tool": tool,
                "anomaly": is_anom
            })
            
            prompt = f"<|im_start|>system\n{system_msg}<|im_end|>\n<|im_start|>user\n{user_msg}<|im_end|>\n<|im_start|>assistant\n{assistant_msg}<|im_end|>"
            samples.append({"text": prompt})
    print(f"--> Processed {len(samples)} rows from {CSV_FILE}")
else:
    print(f"--> Warning: {CSV_FILE} not found. Creating synthetic fallback samples for testing.")
    samples = [{"text": "<|im_start|>system\nYou are SRE Model.<|im_end|>\n<|im_start|>user\nComponent: nova.api\nLevel: INFO\nLog: Heartbeat ok<|im_end|>\n<|im_start|>assistant\n{\"severity\":\"LOW\",\"root_cause\":\"Healthy\",\"recommended_tool\":\"none\",\"anomaly\":false}<|im_end|>"}] * 50

# Split dataset into 90% train, 10% eval
dataset = Dataset.from_list(samples)
split_dataset = dataset.train_test_split(test_size=0.1, seed=42)
train_data = split_dataset["train"]
eval_data = split_dataset["test"]

# --- STEP 3: Load Model & Tokenizer (4-bit QLoRA) ---
MODEL_ID = "Qwen/Qwen2.5-1.5B-Instruct"  # Open weights, no HuggingFace token needed
print(f"--> Loading base model: {MODEL_ID}")

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.float16,
    bnb_4bit_use_double_quant=True
) if torch.cuda.is_available() else None

tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
tokenizer.pad_token = tokenizer.eos_token

model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID,
    quantization_config=bnb_config,
    device_map="auto" if torch.cuda.is_available() else None
)

# --- STEP 4: Configure LoRA ---
peft_config = LoraConfig(
    r=8,
    lora_alpha=16,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM"
)

# --- STEP 5: Training Arguments ---
training_args = TrainingArguments(
    output_dir="./orvix_sre_finetuned",
    per_device_train_batch_size=4,
    gradient_accumulation_steps=2,
    num_train_epochs=3,
    learning_rate=2e-4,
    logging_steps=10,
    evaluation_strategy="steps",
    eval_steps=25,
    fp16=torch.cuda.is_available(),
    save_strategy="no",
    report_to="none"
)

trainer = SFTTrainer(
    model=model,
    train_dataset=train_data,
    eval_dataset=eval_data,
    peft_config=peft_config,
    dataset_text_field="text",
    max_seq_length=384,
    args=training_args
)

# --- STEP 6: Execute Training ---
print("--> Commencing LoRA Fine-Tuning...")
train_result = trainer.train()

# Plot & Save Loss Curve
log_history = trainer.state.log_history
train_loss = [x["loss"] for x in log_history if "loss" in x]
eval_loss = [x["eval_loss"] for x in log_history if "eval_loss" in x]

plt.figure(figsize=(8, 4))
plt.plot(train_loss, label="Training Loss", color="#3b82f6")
if eval_loss:
    plt.plot(eval_loss, label="Validation Loss", color="#ef4444")
plt.xlabel("Logging Step")
plt.ylabel("Cross-Entropy Loss")
plt.title("ORVIX SRE Log Model Training & Convergence")
plt.legend()
plt.grid(True, linestyle="--", alpha=0.5)
plt.savefig("loss_curve.png", dpi=150)
print("--> Training complete! Loss curve saved to loss_curve.png")

# --- STEP 7: Save LoRA Adapter Weights ---
OUTPUT_DIR = "./orvix_lora_adapter"
trainer.model.save_pretrained(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)
print(f"--> LoRA Adapter saved to {OUTPUT_DIR}")

# --- STEP 8: Sample Inference Demonstration ---
test_log = "Component: nova.virt.libvirt.imagecache\nLevel: WARNING\nLog: Unknown base file: <PATH>"
test_prompt = f"<|im_start|>system\nYou are an SRE Diagnostic NLP Model. Return strict JSON with severity, root_cause, recommended_tool, and anomaly.<|im_end|>\n<|im_start|>user\n{test_log}<|im_end|>\n<|im_start|>assistant\n"

inputs = tokenizer(test_prompt, return_tensors="pt").to(device)
with torch.no_grad():
    outputs = model.generate(**inputs, max_new_tokens=100, do_sample=False)
response = tokenizer.decode(outputs[0][inputs.input_ids.shape[1]:], skip_special_tokens=True)

print("\n--- SAMPLE INFERENCE ---")
print("Input Log:")
print(test_log)
print("Predicted Diagnosis:")
print(response)
