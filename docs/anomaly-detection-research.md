# Anomaly Detection & Incident Detection Research

Research on how observability platforms detect incidents, what statistical methods they use, and how to implement this in ClickHouse/Tinybird SQL for Strada.

## Summary of approaches

| Platform | Method | Seasonality | Min data | False positive strategy |
|----------|--------|-------------|----------|------------------------|
| **Sentry** | Weighted 7-day baseline + spike/bursty limits | Day-of-week weighting | 7 days | Dual-limit system (spike + bursty) |
| **Sentry anomaly** | Matrix Profile + Prophet hybrid | Hourly + daily + weekly | 2-3 weeks | Only alert when both models agree or one has high confidence |
| **Datadog Agile** | Robust SARIMA | Daily + weekly | 3-6 weeks | Bounds parameter (2-3 sigma) |
| **Datadog Robust** | Seasonal-trend decomposition (STL) | Daily + weekly | 3-6 weeks | Ignores temporary spikes in baseline |
| **Vercel** | Synthetic monitoring + AI triage | N/A | N/A | Multi-signal confirmation |
| **Checkly** | Synthetic probes + retry logic | N/A | N/A | Retry before alerting |

## 1. Sentry's escalating issues algorithm

Sentry's core incident detection is the **escalating issues** system. It's simple, effective, and doesn't require ML.

**How it works:**

The algorithm runs daily per issue. It computes two limits from the previous 7 days of data, then uses the max of both as the escalation threshold for the current day.

```
limit_escalating = max(limit_spike, limit_bursty)
```

**Spike limit formula:**

```
limit_spike = avg_weighted + multiplier * avg_weighted

where:
  avg_weighted = weighted average hourly volume (weighted by day-of-week)
  std          = standard deviation of hourly volume over previous week
  multiplier   = min(max((avg + 5*std) / avg, 5), 8)
```

The multiplier is clamped between **5x and 8x** the average. This means an issue must see 5-8x its normal volume to escalate. The day-of-week weighting handles the common pattern where Monday traffic differs from Saturday traffic.

**Bursty limit:** Handles issues that naturally burst (cron jobs, batch processing). Prevents regular short bursts from triggering false escalations.

**Key design choices:**
- Per-issue thresholds, not global. Each issue has its own baseline.
- 7-day lookback captures weekly seasonality.
- Day-of-week weighting handles traffic patterns.
- Multiplier clamped to 5-8x prevents both over-sensitivity and under-sensitivity.
- Issues marked "archived until escalating" auto-unarchive when threshold is breached.

**Source:** https://docs.sentry.io/product/issues/escalating-issues/

### Sentry spike protection (quota management)

Separate from issue alerts. Protects against quota exhaustion.

1. Computes a **dynamic spike threshold per project** based on:
   - Minimum event count considered a spike (derived from project quota)
   - Weighted projection from the last **168 hours** (7 days)
2. Adjusts hourly thresholds for **daily seasonality** (peak hours get higher thresholds)
3. Adapts to shifting baselines; gradual upticks become the "new normal"
4. When spike is detected, applies **dynamic rate limiting** (discards excess events)
5. Rate limit is temporary; deactivates when spike passes

### Sentry anomaly detection (beta)

Uses two algorithms in a hybrid:

1. **Matrix Profile:** Computes Euclidean distance between current data subsequences and historical subsequences. Flags points where no historical match exists within a threshold distance.
2. **Prophet:** Meta's time-series forecasting model. Captures trend + daily/weekly seasonality + holidays. Flags points outside the predicted confidence interval.

Alert triggers when **either** model detects with high confidence, or **both** detect simultaneously. This reduces false positives significantly compared to either model alone.

### Sentry regression detection

- **Endpoint regression:** Monitors p95 transaction duration. Requires ≥50 events/hour. Two-stage pipeline: real-time trend detection, then breakpoint confirmation.
- **Function regression:** Monitors p95 function duration via profiling data.
- Both use **changepoint detection** (finding where the distribution shifts), not just threshold crossing.

## 2. Datadog anomaly detection

Datadog offers three algorithms, each suited to different metric shapes.

### Basic algorithm

- No seasonality awareness
- Best for new services or metrics without patterns
- Essentially a **rolling mean ± N standard deviations**
- Adjusts quickly to level shifts
- The `bounds` parameter (typically 2 or 3) controls the width of the normal band

### Agile algorithm (robust SARIMA)

- Handles **daily and weekly seasonality**
- Sensitive to level shifts (adapts quickly when the baseline moves)
- Uses a robust variant of SARIMA that down-weights outliers when fitting the seasonal model
- Needs **3+ weeks** of data for weekly patterns (6 weeks recommended)
- Best for metrics that shift over time but have predictable daily/weekly shapes

### Robust algorithm (STL decomposition)

- **Seasonal-trend decomposition using LOESS (STL)**
- Decomposes the time series into: trend + seasonal + residual
- The residual component is what gets checked for anomalies
- **Ignores temporary spikes** when computing the baseline (most robust against false positives)
- Best for metrics with stable, recurring patterns
- Needs the same 3-6 weeks of data

### How bounds work

The `bounds` parameter in all three algorithms controls how wide the "normal" band is. It maps roughly to standard deviations:

| Bounds | Approximate coverage | Use case |
|--------|---------------------|----------|
| 1 | ~68% | Very sensitive, many alerts |
| 2 | ~95% | Balanced |
| 3 | ~99.7% | Conservative, few alerts |

**Recommendation from Datadog:** Start with bounds=2 for most metrics, increase to 3 if too noisy.

**Source:** https://docs.datadoghq.com/monitors/monitor_types/anomaly/

## 3. Vercel / Checkly / Better Uptime

These are fundamentally different from error-rate anomaly detection. They use **synthetic monitoring**, not statistical analysis of production telemetry.

**Checkly:**
- Runs Playwright browser checks and API health checks from global locations on a schedule
- **Retry logic:** Verifies failures before alerting (re-runs the check from a different location)
- **Multi-signal confirmation:** Only alerts when multiple checks from different locations fail
- Monitoring-as-code: Checks defined in Playwright test files, version controlled

**Vercel:**
- Proactive anomaly detection watches for spikes in function duration, data transfer, 5xx errors
- No user configuration required (always on)
- When anomaly detected, "Vercel Agent" investigates by analyzing logs and metrics
- Separates signal from noise through AI triage, not statistical thresholds

**Better Uptime (now BetterStack):**
- HTTP(S) monitoring with configurable check intervals (30s-5min)
- Multi-location verification before incident creation
- Requires N consecutive failures from M locations before alerting

**Key insight for Strada:** Synthetic monitoring is complementary to statistical anomaly detection. Strada should focus on the statistical approach (analyzing production telemetry) since that's what the data naturally supports. Synthetic monitoring is a separate product category.

## 4. Statistical methods for anomaly detection

### Z-score (standard score)

The simplest and most widely used method. Measures how many standard deviations a value is from the mean.

```
z = (x - μ) / σ
```

**Rolling Z-score** (for time series): compute mean and stddev over a sliding window.

```sql
-- ClickHouse: Rolling Z-score over 60-minute window
SELECT
    toStartOfMinute(Timestamp) AS minute,
    count() AS error_count,
    avg(count()) OVER (
        ORDER BY toStartOfMinute(Timestamp)
        ROWS BETWEEN 59 PRECEDING AND CURRENT ROW
    ) AS rolling_mean,
    stddevPop(count()) OVER (
        ORDER BY toStartOfMinute(Timestamp)
        ROWS BETWEEN 59 PRECEDING AND CURRENT ROW
    ) AS rolling_std,
    (count() - avg(count()) OVER (
        ORDER BY toStartOfMinute(Timestamp)
        ROWS BETWEEN 59 PRECEDING AND CURRENT ROW
    )) / nullIf(stddevPop(count()) OVER (
        ORDER BY toStartOfMinute(Timestamp)
        ROWS BETWEEN 59 PRECEDING AND CURRENT ROW
    ), 0) AS z_score
FROM otel_errors
WHERE Timestamp >= now() - INTERVAL 24 HOUR
GROUP BY minute
ORDER BY minute
```

**Thresholds in practice:**
| Z-score | Meaning | Recommended use |
|---------|---------|-----------------|
| > 2.0 | Warning | Low-priority notification |
| > 3.0 | Anomaly | Standard alert threshold |
| > 4.0 | Severe | High-confidence incident |

**Limitations:**
- Assumes roughly normal distribution (error counts are often Poisson/skewed)
- Sensitive to outliers contaminating the baseline
- Unreliable with < 30 data points in the window
- Doesn't handle seasonality

### Modified Z-score (MAD-based)

More robust than standard Z-score. Uses median and Median Absolute Deviation instead of mean and stddev.

```
modified_z = 0.6745 * (x - median) / MAD

where MAD = median(|x_i - median(x)|)
```

The constant 0.6745 makes the MAD consistent with standard deviation for normal distributions. More resistant to outliers pulling the baseline.

### EWMA (Exponentially Weighted Moving Average)

Gives more weight to recent data. Good for detecting gradual shifts.

```
EWMA_t = λ * x_t + (1 - λ) * EWMA_{t-1}
```

**Key parameters:**
- **λ (lambda/alpha):** Smoothing factor, 0-1. Higher = more reactive. Recommended: 0.1-0.3
- **Coefficient (k):** Width of control limits in standard deviations. Recommended: 2.7-3.0

**Control limits:**
```
UCL = μ + k * σ * sqrt(λ / (2 - λ))
LCL = μ - k * σ * sqrt(λ / (2 - λ))
```

**When EWMA beats Z-score:**
- Detecting **gradual shifts** (Z-score misses slow drifts because the baseline absorbs them)
- Noisy data where raw values oscillate but the underlying trend is moving
- When you want configurable memory (λ controls how quickly old data is forgotten)

**GitHub reference:** https://github.com/Tencent/Metis (Tencent's time-series anomaly detection library, includes EWMA implementation)

### CUSUM (Cumulative Sum)

Accumulates deviations from the expected value. Fires when the cumulative deviation exceeds a threshold.

```
S_t = max(0, S_{t-1} + (x_t - μ) - k)
```

Where `k` is the "allowance" (slack). Typically set to half the shift you want to detect.

**When CUSUM beats Z-score:**
- Detecting **sustained small shifts** that individually are within normal range
- A sequence of "slightly elevated" values that together indicate a problem
- Example: error rate goes from 0.1% to 0.3%. Each minute looks normal individually, but the sustained elevation is meaningful

**SQL approximation in ClickHouse:**
```sql
-- CUSUM-style cumulative deviation tracking
SELECT
    minute,
    error_count,
    error_count - avg_baseline AS deviation,
    sum(greatest(0, error_count - avg_baseline - slack))
        OVER (ORDER BY minute) AS cusum
FROM (
    SELECT
        toStartOfMinute(Timestamp) AS minute,
        count() AS error_count,
        avg(count()) OVER (
            ORDER BY toStartOfMinute(Timestamp)
            ROWS BETWEEN 120 PRECEDING AND 61 PRECEDING
        ) AS avg_baseline,
        2.0 AS slack  -- allowance parameter
    FROM otel_errors
    WHERE Timestamp >= now() - INTERVAL 4 HOUR
    GROUP BY minute
)
ORDER BY minute
```

The key insight: **CUSUM uses a gap between the baseline window and current window** (ROWS 120..61 PRECEDING for the baseline, then the current value). This prevents the current spike from contaminating the baseline.

### Percentile-based detection

Instead of mean/stddev, use percentiles. More robust for skewed distributions.

```sql
-- Flag minutes where error count exceeds the p99 of the last 24 hours
SELECT
    minute,
    error_count,
    quantile(0.99)(error_count) OVER (
        ORDER BY minute
        ROWS BETWEEN 1440 PRECEDING AND 1 PRECEDING
    ) AS p99_threshold
FROM (
    SELECT
        toStartOfMinute(Timestamp) AS minute,
        count() AS error_count
    FROM otel_errors
    WHERE Timestamp >= now() - INTERVAL 25 HOUR
    GROUP BY minute
)
WHERE error_count > p99_threshold
ORDER BY minute
```

**When to use:** Error counts, latency values, and other metrics with heavy right tails where mean + 3*stddev gives absurdly wide bounds.

## 5. Detecting page view drops

Page view drops can indicate DNS issues, CDN outages, deployment failures, or JS bundle errors. Detection is the inverse of spike detection: you're looking for **unexpected dips**.

**Approach: Compare current hour to same hour last week**

```sql
SELECT
    toStartOfHour(Timestamp) AS hour,
    countMerge(Hits) AS current_hits,
    -- Get same hour last week
    (
        SELECT countMerge(Hits)
        FROM otel_analytics_pages
        WHERE Date = toDate(now() - INTERVAL 7 DAY)
        AND toHour(Date) = toHour(now())
    ) AS last_week_hits,
    current_hits / nullIf(last_week_hits, 0) AS ratio
FROM otel_analytics_pages
WHERE Date = toDate(now())
GROUP BY hour
HAVING ratio < 0.5  -- less than 50% of last week = alert
ORDER BY hour
```

**Better approach: Rolling ratio with day-of-week awareness**

Compare the current 1-hour window against the average of the same hour on the same day-of-week for the last 4 weeks. A drop below 40-50% of that baseline is a strong signal.

**Thresholds for page view drop detection:**
| Drop ratio | Interpretation | Action |
|------------|---------------|--------|
| < 80% | Minor dip | Log, no alert |
| < 50% | Significant drop | Warning alert |
| < 20% | Near-total outage | Critical alert |
| 0 | Complete outage | Immediate incident |

**Important:** Page view drop detection requires a **minimum baseline volume**. If a project gets < 100 page views per hour, drops are noisy and unreliable. Set a minimum threshold (e.g., baseline must be ≥ 50 events/hour) before enabling drop alerts.

## 6. Handling low-traffic projects

This is the hardest problem. Statistical methods need sufficient sample sizes to produce reliable results. Most observability platforms simply don't offer anomaly detection for low-traffic services.

**The problem:** With 10 errors/day, a single error burst of 5 looks like a 50% spike but is completely meaningless statistically.

### Strategies that work

**1. Minimum volume gates**

Don't run anomaly detection unless the baseline exceeds a minimum. Recommended minimums:

| Signal | Minimum for detection | Minimum for reliable detection |
|--------|----------------------|-------------------------------|
| Error count | 10/hour | 50/hour |
| Page views | 50/hour | 200/hour |
| Request count | 100/hour | 500/hour |
| Latency p95 | 50 requests/window | 200 requests/window |

Below these thresholds, fall back to **simple threshold alerts** (e.g., "alert if > 5 errors in 5 minutes") instead of statistical anomaly detection.

**2. Wider time windows**

Instead of per-minute detection (need ~60 data points per window), aggregate to per-hour or per-6-hour. This accumulates enough data points for statistics to work.

**3. Poisson-based detection for rare events**

For very low-traffic scenarios (< 10 events/hour), model the count as a Poisson process. The expected count is λ (the average rate), and a count of `x` is anomalous if:

```
P(X >= x | λ) < threshold

-- Approximation: flag if x > λ + 3*sqrt(λ)
-- For λ=2: flag if x > 2 + 3*1.41 = 6.24, so flag at 7+
-- For λ=5: flag if x > 5 + 3*2.24 = 11.72, so flag at 12+
```

This is more appropriate than Z-score for count data because Poisson naturally models "number of events in a time period."

**4. Categorical alerts as fallback**

For very low traffic, use categorical rules instead of statistical detection:
- "Any FATAL error" → alert immediately
- "Any new error type not seen before" → alert
- "Any error after 24h of zero errors" → alert (the project was healthy, now it's not)
- "Unhandled exception rate > 0" → alert

These don't need baselines or statistics. They work even for 1 event/day projects.

**5. Bayesian approach**

Use prior knowledge to regularize estimates. For a project with unknown baseline, use the org-wide average as a prior. As data accumulates, the prior fades and the project-specific baseline dominates.

## 7. Best practices for low false-positive detection

### Design principles

1. **Require sustained anomalies, not single spikes.** A single anomalous minute means nothing. Require 3-5 consecutive anomalous windows before alerting. Sentry's endpoint regression uses a two-stage pipeline (detect then confirm) for this reason.

2. **Separate baseline window from detection window.** Never include current data in baseline computation. Use a gap (e.g., baseline = 2h-24h ago, detect = last 5 min). This prevents the anomaly from inflating the baseline.

3. **Day-of-week and hour-of-day awareness.** Monday 3am traffic is not comparable to Wednesday 2pm traffic. At minimum, compare same-hour same-day-of-week. Sentry and Datadog both do this.

4. **Use multiple signals.** Don't alert on error count alone. Combine:
   - Error rate spike + new error types appearing = likely real incident
   - Error rate spike + no new types + same fingerprints = likely noise
   - Page view drop + error spike = likely infra issue
   - Error spike + latency spike = likely downstream dependency

5. **Minimum volume gates.** No detection below threshold (see above).

6. **Adaptive baselines with outlier resistance.** Use **median** instead of mean, **MAD** instead of stddev, or use Datadog's Robust algorithm approach (STL decomposition ignores spikes when fitting).

7. **Cooldown periods.** After alerting, don't alert again for the same issue for N minutes. Sentry calls this "action interval."

### Recommended algorithm for Strada

For a first implementation, a **tiered approach** based on traffic volume:

```
if baseline_hourly_count >= 50:
    use rolling Z-score (window=60min, threshold=3.0)
    require 3 consecutive anomalous minutes
    compare same-hour-of-day for baseline
elif baseline_hourly_count >= 10:
    use Poisson-based detection
    wider window (15min buckets)
    threshold: P(X >= observed | λ) < 0.001
else:
    use categorical rules only
    "any new error type" / "any fatal" / "first error after silence"
```

### Concrete ClickHouse SQL for the recommended approach

**Step 1: Compute hourly baseline per project per service**

```sql
-- Hourly error counts for baseline computation
-- Uses same hour + same day-of-week for the last 4 weeks
SELECT
    ServiceName,
    avg(hourly_count) AS baseline_mean,
    stddevPop(hourly_count) AS baseline_std,
    median(hourly_count) AS baseline_median,
    count() AS baseline_points
FROM (
    SELECT
        ServiceName,
        toStartOfHour(Timestamp) AS hour,
        count() AS hourly_count
    FROM otel_errors
    WHERE Timestamp >= now() - INTERVAL 28 DAY
      AND toDayOfWeek(Timestamp) = toDayOfWeek(now())
      AND toHour(Timestamp) = toHour(now())
    GROUP BY ServiceName, hour
)
GROUP BY ServiceName
```

**Step 2: Compare current hour against baseline**

```sql
SELECT
    ServiceName,
    current_count,
    baseline_mean,
    baseline_std,
    baseline_points,
    CASE
        WHEN baseline_points < 3 THEN 'insufficient_data'
        WHEN baseline_std = 0 AND current_count > baseline_mean THEN 'anomaly'
        WHEN baseline_mean < 10 AND current_count > baseline_mean + 3 * sqrt(baseline_mean) THEN 'anomaly_poisson'
        WHEN (current_count - baseline_mean) / nullIf(baseline_std, 0) > 3.0 THEN 'anomaly_zscore'
        ELSE 'normal'
    END AS status,
    CASE
        WHEN baseline_std > 0
        THEN (current_count - baseline_mean) / baseline_std
        ELSE 0
    END AS z_score
FROM (
    SELECT ServiceName, count() AS current_count
    FROM otel_errors
    WHERE Timestamp >= now() - INTERVAL 1 HOUR
    GROUP BY ServiceName
) AS current
JOIN (
    -- baseline query from step 1
    ...
) AS baseline USING ServiceName
```

## 8. Key references

| Resource | URL | What it covers |
|----------|-----|---------------|
| Sentry escalating issues | https://docs.sentry.io/product/issues/escalating-issues/ | Spike/bursty limit formulas |
| Sentry anomaly alerts blog | https://blog.sentry.io/2025/03/25/anomaly-alerts-now-in-open-beta | Matrix Profile + Prophet hybrid |
| Sentry spike protection | https://docs.sentry.io/product/data-management-and-privacy/spike-protection/ | Dynamic rate limiting |
| Datadog anomaly detection | https://docs.datadoghq.com/monitors/monitor_types/anomaly/ | Agile/Robust/Basic algorithms |
| Tencent/Metis | https://github.com/Tencent/Metis | EWMA + other time-series anomaly detection |
| ClickHouse window functions | https://clickhouse.com/docs/en/sql-reference/window-functions | SQL building blocks |
| Sentry open source | https://github.com/getsentry/sentry | Escalating issues implementation |
