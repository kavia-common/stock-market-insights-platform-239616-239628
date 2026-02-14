# Market data providers (free / freemium) — quick reference

This project’s frontend supports MOCK mode deterministically. LIVE mode should be wired via a backend proxy to avoid exposing API keys and to enforce rate limiting.

## Providers

### Alpha Vantage
- Typical free limits: ~5 requests/min, ~500/day (plan-dependent)
- Data: time series, indicators, some fundamentals
- Notes: easy to use; quotas are tight for public SPAs

### Finnhub
- Typical free limits: often ~60 req/min (plan-dependent)
- Data: quotes, candles, profile, basic financials, news
- Notes: good coverage; still not ideal to expose keys in frontend-only apps

### Twelve Data
- Typical free limits: per-day/per-minute caps (plan-dependent)
- Data: time series, indicators; websockets often paid
- Notes: good for charts; key exposure is still a concern

### Marketstack (APILayer)
- Typical free limits: low monthly quota; often EOD-only on free
- Data: EOD and reference, intraday typically paid
- Notes: fine for demos/historical, not true live

### Stooq (no-key historical)
- Typical limits: undocumented; be polite and throttle
- Data: mostly historical/EOD; CSV-style endpoints
- Notes: best fit for frontend-only if it meets requirements

### FRED (macro, not equities quotes)
- Typical limits: generous; stable API
- Data: macro series (rates, CPI, etc.)
- Notes: great for Macro Overlay factors, not stock quotes

## Frontend-only guidance
Avoid calling paid market data APIs directly from the browser in production:
- keys are exposed
- quotas are shared across all users
- abuse is easy

Recommended: use a backend/serverless proxy to store keys, normalize responses, and apply per-user throttling.
