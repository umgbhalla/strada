---
title: Tinybird Pricing Breakdown
description: How Tinybird pricing works for OTel observability workloads, cost estimates, retention strategies, and auto-deletion via TTL.
---

# Tinybird Pricing Breakdown

Tinybird bills on a **reserved capacity + pay-per-use** model. You pick a plan that reserves a vCPU ceiling and QPS limit, then pay for actual usage (active minutes, storage, data transfer) within that ceiling. There is no per-query pricing or per-GB-ingested pricing.

Sources: https://www.tinybird.co/pricing, https://www.tinybird.co/docs/forward/pricing, https://www.tinybird.co/docs/forward/pricing/shared-infrastructure

## Plans overview

| Plan | Base price | vCPUs | Storage included | QPS included |
|------|-----------|-------|-----------------|-------------|
| Free | $0 | 0.25 | 10 GB | 10 |
| Developer | $25-$299/mo | 0.25-3 | 25 GB | 10-55 |
| SaaS | Custom | 4-32 | 500 GB+ | 55-200 |
| Enterprise | Custom | Unlimited | Bottomless | 80+ |

## What you pay for

### 1. Fixed monthly base fee

The **Free plan costs $0** and includes 0.25 vCPU, 10 GB storage, 10 QPS, and 300 vCPU hours/month. No credit card required, no time limit.

Paid Developer plans start at $25/mo (0.25 vCPU, 25 GB storage). The base fee reserves your vCPU capacity ceiling and QPS limit. You pay it even if you do nothing.

### 2. Active vCPU minutes (usage-based)

An **active minute** is any calendar minute where at least one operation (query, ingestion, materialized view) used a vCPU. If nobody is querying and nothing is being ingested, **zero active minutes are consumed**.

Each plan includes a bundle of active minutes. Overage beyond that: **$0.162/vCPU-hour**.

Burst mode allows temporarily using 2x your plan's vCPU without overage charges. For batch operations (populates, copies), the entire job is allowed to finish even if it exceeds the per-minute limit.

### 3. Storage (usage-based)

**$0.058/GB/month** for compressed data beyond the included amount. This is the average of daily maximum usage across all data sources.

### 4. QPS overages (usage-based)

Each plan has a QPS limit. Requests above that limit (up to 4x the plan's QPS ceiling) cost **$0.0005/request**. Beyond 4x, you get rate-limited.

### 5. Data transfer (usage-based)

- Intra-cloud: **$0.01/GB**
- Inter-cloud: **$0.10/GB**

## What happens when nobody is querying

You pay **only the fixed base fee (or $0 on Free) + storage**. Zero active minutes are consumed. No compute overage.

For an OTel use case like Strada, you're almost never truly idle because data is continuously ingested. Every ingestion batch burns active minutes. Materialized views firing on insert burn more. But if traffic goes quiet (e.g. overnight for a dev tool), active minutes stop accumulating.

## Cost estimates for OTel log storage

Assumptions for a **typical mid-size SaaS backend** (10 microservices, ~5000 RPM):
- ~50M log records/day
- Average compressed size per log record: ~200 bytes (ClickHouse ZSTD compression; raw OTel JSON is ~1-2 KB per record with `ResourceAttributes`, `LogAttributes` maps, `Body`, `TraceId`, etc.)
- ~10 GB/day compressed storage growth for logs alone

### Logs only

| Retention | Storage | Monthly cost (storage only) |
|-----------|---------|---------------------------|
| 1 month | ~300 GB | **$17/mo** |
| 3 months | ~900 GB | **$52/mo** |
| 6 months | ~1.8 TB | **$104/mo** |

### Full OTel stack (logs + traces + metrics + errors)

Traces and metrics typically add 2-3x the log volume.

| Retention | Total storage | Monthly cost (storage only) |
|-----------|--------------|---------------------------|
| 1 month | ~700 GB | **$41/mo** |
| 3 months | ~2.1 TB | **$122/mo** |
| 6 months | ~4.2 TB | **$244/mo** |

These are **storage costs only**. Add the base plan fee and compute overage from continuous ingestion + MV processing + user queries on top.

### Comparison to Datadog

Datadog charges **$0.10/GB ingested** for logs plus **$1.70/million events** for indexing. For 50M logs/day at ~1 KB each = ~50 GB/day ingested = ~$150/day = **~$4,500/mo** just for log ingestion. Tinybird storage is dramatically cheaper. But Tinybird doesn't include the Datadog UI, alerting, or APM features.

## Auto-deleting old data (TTL)

Tinybird supports ClickHouse's native **TTL** (Time To Live) per data source. You set `ENGINE_TTL` in each `.datasource` file independently. ClickHouse enforces the TTL during background merges automatically. No cron jobs needed.

### Per-table TTL example

```
# otel_logs.datasource — delete logs after 30 days
ENGINE_TTL "Timestamp + toIntervalDay(30)"

# otel_traces.datasource — keep traces for 90 days  
ENGINE_TTL "Timestamp + toIntervalDay(90)"

# otel_errors.datasource — keep errors for 180 days
ENGINE_TTL "Timestamp + toIntervalDay(180)"

# otel_metrics_gauge.datasource — keep metrics for 90 days
ENGINE_TTL "TimeUnix + toIntervalDay(90)"
```

Each table has its own TTL. This lets you delete bulky logs sooner (30 days) while keeping lightweight error summaries and traces longer (90-180 days).

You can modify TTL on an existing datasource by updating the `.datasource` file and running `tb deploy`. Tinybird treats TTL changes as automatic `ALTER` operations (no full data rewrite needed).

### Recommended retention strategy for Strada

| Table | Data size | Suggested TTL | Rationale |
|-------|-----------|--------------|-----------|
| `otel_logs` | Large (big Body strings, attribute maps) | 30 days | Logs are the bulk of storage; rarely needed after a month |
| `otel_traces` | Medium | 90 days | Traces are useful for debugging recent issues |
| `otel_errors` | Small (denormalized summaries) | 180 days | Error trends matter over longer periods |
| `otel_metrics_*` | Small per row, high volume | 90 days | Metrics are compact; 90 days covers most trend analysis |
| `otel_traces_trace_id_ts` | Very small (MV aggregate) | 90 days | Matches trace retention |

With 30-day log retention and 90-day everything else, a mid-size SaaS backend would use roughly **400-500 GB total**, costing about **$23-29/mo in storage** plus the base plan fee.

## Key takeaways

- **Storage is cheap** ($0.058/GB/mo). Even at TB scale, it's a fraction of Datadog/Sentry.
- **Compute is the hidden cost driver.** Continuous ingestion + MV processing + dashboard queries all burn active minutes.
- **No idle compute cost.** If nothing is running, only the base plan fee and storage are charged.
- **Per-table TTL is fully supported.** Use shorter retention for logs, longer for errors. This is the main lever for controlling storage costs.
- **Self-hosted ClickHouse** ($150-300/mo for a small VM) is the cheapest option if you don't need Tinybird's managed infra, JWT row-level filtering, or Events API.
