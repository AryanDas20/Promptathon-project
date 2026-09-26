# 🛡️ VAULT — Fault-Tolerant Distributed Object Storage Engine

> **Store. Replicate. Detect. Repair. Recover.**

Vault is a distributed object storage system designed to keep data available, consistent, and recoverable even when storage nodes fail, networks are partitioned, or data becomes corrupted.

It combines **N=3 replication, consistent hashing, Raft consensus, SHA-256 integrity checks, Merkle Trees, and automatic self-healing** into one interactive system.

## 🚀 Key Features

- 🗄️ 6-node cluster across 3 Availability Zones
- 🔀 Consistent Hash Ring with virtual nodes
- 📦 N=3 replication across independent nodes
- 🧩 64 MB object chunking
- 🔐 SHA-256 integrity verification
- 🌳 Merkle Tree anti-entropy
- 🧠 Raft consensus & leader election
- 🩹 Automatic replica repair & self-healing
- 🧪 Built-in Chaos Engineering
- 📊 Real-time telemetry & event logs

## 🧠 Architecture

                         CLIENT
                           │
                           ▼
                  ┌─────────────────┐
                  │  Object Router  │
                  │ Consistent Hash │
                  └────────┬────────┘
                           │
                           ▼
                     64 MB CHUNKS
                           │
                           ▼
                      N = 3 REPLICAS
                 ┌─────────┼─────────┐
                 ▼         ▼         ▼
               AZ-1       AZ-2       AZ-3
              N1 / N2    N3 / N4    N5 / N6
                 └─────────┼─────────┘
                           │
                           ▼
                 SHA-256 + MERKLE TREES
                           │
                           ▼
                    RAFT CONSENSUS
                           │
                           ▼
                   SELF-HEALING ENGINE
                 Detect → Repair → Verify

## 🔄 How Vault Works

### 1. Object Chunking
Large objects are divided into **64 MB chunks** for efficient distributed storage and recovery.

### 2. Consistent Hashing
Chunks are mapped across a **360° hash ring**, distributing data across nodes while reducing data movement when the cluster changes.

### 3. N=3 Replication
Each chunk is stored on **3 independent replicas** to provide fault tolerance.

### 4. Integrity Protection
Every chunk uses **SHA-256 checksums** to detect silent data corruption.

### 5. Merkle Anti-Entropy
Merkle Trees efficiently compare replica state and identify corrupted or missing chunks.

### 6. Automatic Self-Healing

Failure
   ↓
Detect
   ↓
Find Healthy Replica
   ↓
Repair
   ↓
Verify SHA-256
   ↓
Healthy Cluster

## 💥 Chaos Engineering

Vault allows failures to be intentionally injected and observed in real time.

| Failure | Recovery |
|---|---|
| 🔴 Kill Raft Leader | Leader election + quorum recovery |
| 🌐 Partition AZ-2 | Failure isolation + replica availability |
| 🦠 Silent Bit-Rot | Merkle detection + replica repair |
| 🩹 Automatic Recovery | Detect → Repair → Verify |

## 📊 Live Telemetry

| Metric | Dashboard |
|---|---:|
| Operations | **14,250 ops/s** |
| Read P99 | **1.42 ms** |
| Write P99 | **3.88 ms** |
| Storage Overhead | **3.0×** |
| Availability SLA | **99.999%** |

> Dashboard metrics shown by the application.

## 🎯 Problem → Solution

| Problem | Vault Solution |
|---|---|
| Node Failure | N=3 Replication + Failover |
| Network Partition | Quorum + Failure Isolation |
| Large Objects | 64 MB Chunking |
| Uneven Distribution | Consistent Hashing |
| Data Corruption | SHA-256 Verification |
| Replica Divergence | Merkle Anti-Entropy |
| Metadata Consistency | Raft Consensus |
| Missing/Corrupt Replicas | Automatic Repair |
| Unexpected Failures | Chaos Engineering |
| Recovery | Self-Healing Engine |

## 🏆 Why Vault?

Vault makes distributed-storage concepts **visible, interactive, and testable** instead of only theoretical.

### Judge Demo Flow

**Upload → Chunk → Replicate ×3 → Inject Failure → Detect → Repair → Verify**

## 🚀 Live Demo

👉 https://promptathon-eight.vercel.app/

### Recommended Demo

1. Open **Cluster Topology & Ring**
2. Upload an object
3. Inspect **Objects & Shards**
4. **Kill Raft Leader**
5. **Partition AZ-2**
6. **Inject Silent Bit-Rot**
7. Run **Automatic Recovery & Self-Healing**
8. Observe **Merkle Anti-Entropy & Telemetry**

## ⭐ One-Line Summary

> **Vault is a fault-tolerant distributed object storage system that uses replication, consistent hashing, Raft, SHA-256, Merkle Trees, and automated self-healing to remain reliable under real-world failures.**
