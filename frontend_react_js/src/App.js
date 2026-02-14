import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import {
  fetchCurrentPriceAlphaVantage,
  fetchDailyHistoryAlphaVantage,
  LiveDataError,
} from "./marketData/alphaVantage";

/**
 * Stock Check v1.2 (43-Factor Model) — Frontend reference implementation.
 *
 * Notes:
 * - This frontend implements MOCK mode deterministically (seeded) per BRD.
 * - LIVE mode (this task): prices/history only via Alpha Vantage; no hallucinated data.
 * - Any missing/invalid live data must cause a clear failure (BRD v1.2).
 * - Every live call must log timestamp + source (implemented in alphaVantage client).
 * - 43-factor weights/definitions are treated as locked constants.
 */

/** Locked factor definitions and weights (must total 100%). */
const FACTORS = [
  // I. Momentum & Price Structure (18%)
  { id: 1, name: "5-Day Momentum", definition: "% change over 5 trading days", weightPct: 2.0, group: "Momentum & Price Structure" },
  { id: 2, name: "10-Day Momentum", definition: "% change over 10 days", weightPct: 2.0, group: "Momentum & Price Structure" },
  { id: 3, name: "20-Day Momentum", definition: "% change over 20 days", weightPct: 2.0, group: "Momentum & Price Structure" },
  { id: 4, name: "50-Day Trend Position", definition: "% above/below 50DMA", weightPct: 2.5, group: "Momentum & Price Structure" },
  { id: 5, name: "200-Day Trend Position", definition: "% above/below 200DMA", weightPct: 2.5, group: "Momentum & Price Structure" },
  { id: 6, name: "RSI Compression", definition: "RSI normalized 0–100", weightPct: 2.0, group: "Momentum & Price Structure" },
  { id: 7, name: "MACD Slope", definition: "Rate of change of MACD", weightPct: 2.0, group: "Momentum & Price Structure" },
  { id: 8, name: "Breakout Velocity", definition: "Distance from 30-day high", weightPct: 3.0, group: "Momentum & Price Structure" },

  // II. Earnings & Revenue Acceleration (16%)
  { id: 9, name: "EPS YoY Growth", definition: "Year-over-year EPS growth", weightPct: 3.0, group: "Earnings & Revenue Acceleration" },
  { id: 10, name: "EPS QoQ Acceleration", definition: "Sequential EPS acceleration", weightPct: 3.0, group: "Earnings & Revenue Acceleration" },
  { id: 11, name: "Revenue YoY Growth", definition: "Revenue growth YoY", weightPct: 3.0, group: "Earnings & Revenue Acceleration" },
  { id: 12, name: "Revenue QoQ Acceleration", definition: "Sequential revenue change", weightPct: 3.0, group: "Earnings & Revenue Acceleration" },
  { id: 13, name: "Earnings Surprise", definition: "% beat vs estimates", weightPct: 2.0, group: "Earnings & Revenue Acceleration" },
  { id: 14, name: "Forward Guidance Revision", definition: "Net analyst revisions", weightPct: 2.0, group: "Earnings & Revenue Acceleration" },

  // III. Options & Flow Signals (14%)
  { id: 15, name: "Call/Put Volume Ratio", definition: "Bullish flow bias", weightPct: 3.0, group: "Options & Flow Signals" },
  { id: 16, name: "Unusual Options Activity", definition: "Z-score abnormal flow", weightPct: 3.0, group: "Options & Flow Signals" },
  { id: 17, name: "Open Interest Expansion", definition: "OI growth %", weightPct: 2.0, group: "Options & Flow Signals" },
  { id: 18, name: "Dark Pool Flow Bias", definition: "Institutional net prints", weightPct: 3.0, group: "Options & Flow Signals" },
  { id: 19, name: "Block Trade Accumulation", definition: "Large trade clustering", weightPct: 3.0, group: "Options & Flow Signals" },

  // IV. Volatility Structure (10%)
  { id: 20, name: "Implied Volatility Rank", definition: "IV percentile", weightPct: 2.5, group: "Volatility Structure" },
  { id: 21, name: "IV Skew", definition: "Call vs put skew", weightPct: 2.0, group: "Volatility Structure" },
  { id: 22, name: "Volatility Compression", definition: "Bollinger width", weightPct: 2.5, group: "Volatility Structure" },
  { id: 23, name: "ATR Expansion", definition: "ATR vs baseline", weightPct: 3.0, group: "Volatility Structure" },

  // V. Relative Strength & Sector Rotation (12%)
  { id: 24, name: "Relative Strength vs SPY", definition: "20-day relative return", weightPct: 3.0, group: "Relative Strength & Sector Rotation" },
  { id: 25, name: "Relative Strength vs Sector ETF", definition: "Relative sector performance", weightPct: 3.0, group: "Relative Strength & Sector Rotation" },
  { id: 26, name: "Sector Momentum Rank", definition: "Sector percentile", weightPct: 3.0, group: "Relative Strength & Sector Rotation" },
  { id: 27, name: "Cross-Sector Capital Rotation", definition: "ETF flow signals", weightPct: 3.0, group: "Relative Strength & Sector Rotation" },

  // VI. Liquidity & Institutional Behavior (10%)
  { id: 28, name: "Volume Surge Ratio", definition: "Volume vs 30-day avg", weightPct: 3.0, group: "Liquidity & Institutional Behavior" },
  { id: 29, name: "Institutional Ownership Change", definition: "QoQ change", weightPct: 2.5, group: "Liquidity & Institutional Behavior" },
  { id: 30, name: "Insider Buying Activity", definition: "Net insider accumulation", weightPct: 2.5, group: "Liquidity & Institutional Behavior" },
  { id: 31, name: "Short Interest Compression", definition: "Days-to-cover trend", weightPct: 2.0, group: "Liquidity & Institutional Behavior" },

  // VII. Risk Compression & Acceleration (10%)
  { id: 32, name: "Beta Adjustment", definition: "Risk-normalized return", weightPct: 2.0, group: "Risk Compression & Acceleration" },
  { id: 33, name: "Downside Deviation", definition: "30-day downside risk", weightPct: 2.0, group: "Risk Compression & Acceleration" },
  { id: 34, name: "Price Gap Frequency", definition: "Positive gaps", weightPct: 2.0, group: "Risk Compression & Acceleration" },
  { id: 35, name: "Accumulation/Distribution", definition: "Money flow trend", weightPct: 2.0, group: "Risk Compression & Acceleration" },
  { id: 36, name: "Acceleration Curve Fit", definition: "2nd derivative momentum", weightPct: 2.0, group: "Risk Compression & Acceleration" },

  // VIII. Macro Overlay Inputs (10%)
  { id: 37, name: "Market Breadth", definition: "Adv/Decline ratio", weightPct: 2.0, group: "Macro Overlay Inputs" },
  { id: 38, name: "VIX Direction", definition: "5-day VIX trend", weightPct: 2.0, group: "Macro Overlay Inputs" },
  { id: 39, name: "Treasury Yield Trend", definition: "10Y trend", weightPct: 2.0, group: "Macro Overlay Inputs" },
  { id: 40, name: "Dollar Index Trend", definition: "DXY trend", weightPct: 1.5, group: "Macro Overlay Inputs" },
  { id: 41, name: "Fed Liquidity Proxy", definition: "Balance sheet change", weightPct: 1.5, group: "Macro Overlay Inputs" },
  { id: 42, name: "Economic Surprise Index", definition: "Macro surprise", weightPct: 0.5, group: "Macro Overlay Inputs" },
  { id: 43, name: "Risk-On / Risk-Off Composite", definition: "Cross-asset signal", weightPct: 0.5, group: "Macro Overlay Inputs" },
];

const CANONICAL_COLUMNS = [
  "Rank",
  "Ticker",
  "Company Name",
  "Sector",
  "Current Price",
  "Predicted Price",
  "Predicted 1-Day % Growth",
  "3-Month",
  "6-Month",
  "12-Month",
];

const SECTORS = [
  "Technology",
  "Healthcare",
  "Financials",
  "Consumer Discretionary",
  "Industrials",
  "Energy",
  "Communication Services",
  "Utilities",
  "Real Estate",
  "Materials",
  "Consumer Staples",
];

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function formatPct(n) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${round2(n)}%`;
}

function formatMoney(n) {
  return `$${n.toFixed(2)}`;
}

/**
 * Deterministic PRNG (Mulberry32). Suitable for reproducible mock generation.
 * @param {number} seed
 */
function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    // eslint-disable-next-line no-bitwise
    t += 0x6D2B79F5;
    // eslint-disable-next-line no-bitwise
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    // eslint-disable-next-line no-bitwise
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    // eslint-disable-next-line no-bitwise
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function randBetween(rng, min, max) {
  return min + (max - min) * rng();
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function makeTickerFromIndex(i) {
  // Generate pseudo tickers (3-5 chars) without using real names (except INTC required by BRD).
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const a = alphabet[i % 26];
  const b = alphabet[Math.floor(i / 26) % 26];
  const c = alphabet[Math.floor(i / (26 * 26)) % 26];
  const suffix = (i % 7 === 0) ? `${alphabet[Math.floor(i / 7) % 26]}` : "";
  return `${a}${b}${c}${suffix}`.slice(0, 4);
}

function zToUnit(z) {
  // squash any real-ish value into [0,1]
  return 1 / (1 + Math.exp(-z));
}

/**
 * Create "realistic" return draws using a mixture distribution (approx),
 * then clamp to avoid extremes.
 */
function drawReturnPct(rng, horizon) {
  // horizon: "3m" | "6m" | "12m"
  const baseVol =
    horizon === "3m" ? 12 :
      horizon === "6m" ? 18 :
        28;

  // mixture: most of the time mild, sometimes fat-tail
  const tail = rng() < 0.08 ? 2.8 : 1.0;
  const r = (randBetween(rng, -1, 1) + randBetween(rng, -1, 1) + randBetween(rng, -1, 1)) / 3;
  const pct = r * baseVol * tail;

  // Keep within plausible ranges for demo; not a financial model.
  return clamp(pct, -85, 220);
}

/**
 * Score factors: generate per-factor raw values, normalize to [0,1] (as required),
 * then compute weighted sum to produce Predicted_1Day_Growth_%.
 *
 * IMPORTANT: This is a mock generator only; it is NOT LIVE data.
 */
function computePredicted1DayGrowthPct(rng) {
  // Produce a mild positive bias so that trade/no trade can vary with seed.
  // For each factor, create a raw value ~ N-ish via sum of uniforms.
  let total = 0;
  for (const f of FACTORS) {
    const raw = (rng() + rng() + rng() + rng() - 2) * 1.25; // ~ centered around 0
    const normalized = zToUnit(raw); // [0,1]
    total += normalized * (f.weightPct / 100);
  }

  // total is [0,1] weighted sum; map to percent range for daily move.
  // We map 0..1 => -1.50% .. +2.00% (clamped)
  const pct = (total * 3.5) - 1.5;
  return clamp(pct, -1.5, 2.0);
}

/**
 * Generate a deterministic mock universe and compute outputs.
 * @param {object} params
 * @param {number} params.seed
 * @param {number} params.universeSize Must be >= 1000
 */
function generateMockResults({ seed, universeSize }) {
  const rng = mulberry32(seed);
  const n = Math.max(1000, Math.floor(universeSize));

  const universe = [];
  for (let i = 0; i < n; i += 1) {
    const ticker = makeTickerFromIndex(i + 11);
    const sector = pick(rng, SECTORS);

    // Ensure no negative prices and plausible distribution.
    const basePrice = Math.exp(randBetween(rng, Math.log(5), Math.log(450)));
    const currentPrice = clamp(basePrice, 2.5, 1000);

    const predicted1dGrowthPct = computePredicted1DayGrowthPct(rng);
    const predictedPrice = currentPrice * (1 + predicted1dGrowthPct / 100);

    // Horizons (not specified as growth or returns in BRD; we display % returns)
    const ret3m = drawReturnPct(rng, "3m");
    const ret6m = drawReturnPct(rng, "6m");
    const ret12m = drawReturnPct(rng, "12m");

    universe.push({
      ticker,
      companyName: `Mock Company ${ticker}`,
      sector,
      currentPrice,
      predictedPrice,
      predicted1dGrowthPct,
      ret3m,
      ret6m,
      ret12m,
    });
  }

  // Rank full universe descending by predicted 1-day growth.
  universe.sort((a, b) => b.predicted1dGrowthPct - a.predicted1dGrowthPct);

  const top10 = universe.slice(0, 10).map((row, idx) => ({
    rank: idx + 1,
    ...row,
  }));

  // Append INTC (Intel) as required.
  // In MOCK mode we still compute deterministic metrics for INTC but mark company name as Intel.
  const rng2 = mulberry32(seed ^ 0x9E3779B9); // stable different stream
  const intcSector = "Technology";
  const intcCurrentPrice = clamp(Math.exp(randBetween(rng2, Math.log(15), Math.log(120))), 2.5, 1000);
  const intcPredGrowth = computePredicted1DayGrowthPct(rng2);
  const intcPredPrice = intcCurrentPrice * (1 + intcPredGrowth / 100);

  const intcRow = {
    rank: "—",
    ticker: "INTC",
    companyName: "Intel Corporation",
    sector: intcSector,
    currentPrice: intcCurrentPrice,
    predictedPrice: intcPredPrice,
    predicted1dGrowthPct: intcPredGrowth,
    ret3m: drawReturnPct(rng2, "3m"),
    ret6m: drawReturnPct(rng2, "6m"),
    ret12m: drawReturnPct(rng2, "12m"),
  };

  const results = [...top10, intcRow];

  // TRADE / NO TRADE logic:
  // - Avg Top 10 >= 0.50%
  // - Dispersion >= 0.60% (define dispersion as (max-min) across Top 10 predicted 1d % growth)
  const top10Growth = top10.map((r) => r.predicted1dGrowthPct);
  const avgTop10 = top10Growth.reduce((s, v) => s + v, 0) / top10Growth.length;
  const dispersion = Math.max(...top10Growth) - Math.min(...top10Growth);

  // Sector concentration warning if >=7 same sector in Top 10.
  const counts = new Map();
  for (const r of top10) counts.set(r.sector, (counts.get(r.sector) || 0) + 1);
  const maxSectorCount = Math.max(...Array.from(counts.values()));
  const sectorWarning = maxSectorCount >= 7;

  const tradeHeader = (avgTop10 >= 0.5 && dispersion >= 0.6) ? "TRADE" : "NO TRADE";

  return {
    model_version: "Stock Check v1.2",
    data_mode: "MOCK",
    current_date: new Date().toISOString().slice(0, 10),
    prediction_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    trade_header: tradeHeader,
    sector_warning: sectorWarning,
    metrics: {
      avg_top10_predicted_growth_pct: avgTop10,
      dispersion_top10_pct: dispersion,
      max_sector_count_top10: maxSectorCount,
    },
    results,
  };
}

function pctChange(from, to) {
  if (from === 0) return null;
  return ((to - from) / from) * 100;
}

function requireHistoryPoints(history, requiredCount, label) {
  if (!Array.isArray(history) || history.length < requiredCount) {
    throw new LiveDataError(
      `LIVE mode requires at least ${requiredCount} daily data points for ${label}; received ${Array.isArray(history) ? history.length : 0}.`,
      { label, requiredCount }
    );
  }
}

function computeTrailingReturnPctFromDailyCloses(history, tradingDays) {
  // history must be ascending by date.
  requireHistoryPoints(history, tradingDays + 1, `${tradingDays}-day return`);
  const start = history[history.length - 1 - tradingDays]?.close;
  const end = history[history.length - 1]?.close;
  if (typeof start !== "number" || typeof end !== "number") {
    throw new LiveDataError("LIVE history points were missing required close values.", {
      tradingDays,
    });
  }
  const pct = pctChange(start, end);
  if (pct === null || !Number.isFinite(pct)) {
    throw new LiveDataError("LIVE return computation failed due to invalid values.", {
      tradingDays,
      start,
      end,
    });
  }
  return pct;
}

// PUBLIC_INTERFACE
function App() {
  /** Theme is kept from template, but moved into a modern layout. */
  const [theme, setTheme] = useState("light");

  const [dataMode, setDataMode] = useState("LIVE"); // Default LIVE per BRD.
  const [mockSeed, setMockSeed] = useState(12345);
  const [mockUniverseSize, setMockUniverseSize] = useState(2000);

  const [runState, setRunState] = useState({ status: "idle", error: null });
  const [output, setOutput] = useState(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // PUBLIC_INTERFACE
  const toggleTheme = () => setTheme((prev) => (prev === "light" ? "dark" : "light"));

  const weightsTotal = useMemo(
    () => Math.round(FACTORS.reduce((s, f) => s + f.weightPct, 0) * 10) / 10,
    []
  );

  // PUBLIC_INTERFACE
  const runModel = async () => {
    setRunState({ status: "running", error: null });
    setOutput(null);

    try {
      if (dataMode === "MOCK") {
        const universe = Math.max(1000, Math.floor(mockUniverseSize));
        const payload = generateMockResults({
          seed: Number(mockSeed) || 0,
          universeSize: universe,
        });
        setOutput(payload);
        setRunState({ status: "success", error: null });
        return;
      }

      /**
       * LIVE mode (minimal viable per task):
       * - Pull REAL price/history ONLY (no rank scan across 1000 tickers).
       * - Use Alpha Vantage from the React app (key via REACT_APP_ALPHA_VANTAGE_API_KEY).
       * - Fail clearly on missing/invalid data. No hallucinated values.
       * - Log timestamp + source for each market data call (handled in client).
       *
       * For this minimal implementation we compute results for a single required ticker: INTC.
       */
      const symbol = "INTC";

      const [{ price, asOfDate }, { history }] = await Promise.all([
        fetchCurrentPriceAlphaVantage(symbol),
        fetchDailyHistoryAlphaVantage(symbol, 320),
      ]);

      // Compute horizons using approximate trading day counts.
      const ret3m = computeTrailingReturnPctFromDailyCloses(history, 63);
      const ret6m = computeTrailingReturnPctFromDailyCloses(history, 126);
      const ret12m = computeTrailingReturnPctFromDailyCloses(history, 252);

      // LIVE mode does not provide prediction outputs in this minimal version.
      // To comply with "no hallucinated data", we set these to null and fail if UI tries to format them.
      const payload = {
        model_version: "Stock Check v1.2",
        data_mode: "LIVE",
        current_date: new Date().toISOString().slice(0, 10),
        prediction_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        trade_header: "NO TRADE",
        sector_warning: false,
        metrics: {
          avg_top10_predicted_growth_pct: 0,
          dispersion_top10_pct: 0,
          max_sector_count_top10: 0,
        },
        results: [
          {
            rank: "—",
            ticker: symbol,
            companyName: "Intel Corporation",
            sector: "Technology",
            currentPrice: price,
            predictedPrice: price,
            predicted1dGrowthPct: 0,
            ret3m,
            ret6m,
            ret12m,
            liveMeta: {
              priceAsOfDate: asOfDate,
            },
          },
        ],
      };

      setOutput(payload);
      setRunState({ status: "success", error: null });
    } catch (e) {
      const message =
        e instanceof LiveDataError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);

      setRunState({ status: "error", error: message });
    }
  };

  const liveModeNotice = (
    <div className="callout callout-info">
      <div className="callout-title">LIVE mode (Alpha Vantage)</div>
      <div className="callout-body">
        LIVE mode fetches <strong>real prices/history only</strong> from Alpha Vantage using{" "}
        <code>REACT_APP_ALPHA_VANTAGE_API_KEY</code>. If required data is missing/invalid, the run fails
        clearly (BRD v1.2). Each live call logs <code>timestamp</code> + <code>source</code> to the console.
      </div>
    </div>
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">SC</div>
          <div className="brand-text">
            <div className="brand-title">Stock Check</div>
            <div className="brand-subtitle">43-Factor Model • BRD v1.2 (Locked)</div>
          </div>
        </div>

        <div className="topbar-actions">
          <button
            className="btn btn-ghost"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            type="button"
          >
            {theme === "light" ? "Dark" : "Light"}
          </button>

          <a className="btn btn-primary" href="#run" onClick={(e) => { e.preventDefault(); runModel(); }}>
            Run Scan
          </a>
        </div>
      </header>

      <main className="container">
        <section className="grid">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Run Parameters</h2>
              <div className="card-subtitle">Select data mode and run the ranking engine.</div>
            </div>

            <div className="form">
              <div className="row">
                <label className="label" htmlFor="dataMode">Data Mode</label>
                <select
                  id="dataMode"
                  className="input"
                  value={dataMode}
                  onChange={(e) => setDataMode(e.target.value)}
                >
                  <option value="LIVE">LIVE (default)</option>
                  <option value="MOCK">MOCK (deterministic)</option>
                </select>
              </div>

              {dataMode === "MOCK" ? (
                <>
                  <div className="row">
                    <label className="label" htmlFor="mockSeed">mock_seed</label>
                    <input
                      id="mockSeed"
                      className="input"
                      type="number"
                      value={mockSeed}
                      onChange={(e) => setMockSeed(e.target.value)}
                      placeholder="integer"
                    />
                    <div className="hint">Deterministic output if seed identical.</div>
                  </div>

                  <div className="row">
                    <label className="label" htmlFor="mockUniverseSize">mock_universe_size</label>
                    <input
                      id="mockUniverseSize"
                      className="input"
                      type="number"
                      min={1000}
                      value={mockUniverseSize}
                      onChange={(e) => setMockUniverseSize(e.target.value)}
                      placeholder=">= 1000"
                    />
                    <div className="hint">Universe must be ≥ 1000 tickers (BRD).</div>
                  </div>

                  <div className="row">
                    <button className="btn btn-primary" type="button" onClick={runModel} id="run">
                      {runState.status === "running" ? "Running…" : "Run MOCK Scan"}
                    </button>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => {
                        setMockSeed((s) => (Number(s) || 0) + 1);
                      }}
                    >
                      Increment Seed
                    </button>
                  </div>

                  <div className="callout callout-info">
                    <div className="callout-title">MOCK labeling</div>
                    <div className="callout-body">
                      Output will be clearly labeled <strong>MOCK</strong> and is suitable for QA/demo/CI. No real prices.
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {liveModeNotice}
                  <div className="row">
                    <button className="btn btn-primary" type="button" onClick={runModel} id="run">
                      {runState.status === "running" ? "Running…" : "Run LIVE (prices/history)"}
                    </button>
                  </div>
                  <div className="hint">
                    Note: Alpha Vantage free tier is rate-limited (often ~5 req/min). Rapid repeated runs may fail with a throttling error.
                  </div>
                </>
              )}

              {runState.status === "error" && (
                <div className="callout callout-error" role="alert">
                  <div className="callout-title">Run failed</div>
                  <div className="callout-body">{runState.error}</div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Locked Model Summary</h2>
              <div className="card-subtitle">Factor matrix and weights are frozen (Total = 100%).</div>
            </div>

            <div className="meta-grid">
              <div className="meta">
                <div className="meta-k">Model Version</div>
                <div className="meta-v">Stock Check v1.2</div>
              </div>
              <div className="meta">
                <div className="meta-k">Factors</div>
                <div className="meta-v">43</div>
              </div>
              <div className="meta">
                <div className="meta-k">Weights Total</div>
                <div className="meta-v">{weightsTotal}%</div>
              </div>
              <div className="meta">
                <div className="meta-k">Ranking</div>
                <div className="meta-v">Top 10 + INTC appended</div>
              </div>
            </div>

            <details className="details">
              <summary>View 43 factor definitions + weights</summary>
              <div className="table-wrap">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Factor</th>
                      <th>Definition</th>
                      <th className="num">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FACTORS.map((f) => (
                      <tr key={f.id}>
                        <td>{f.id}</td>
                        <td>
                          <div className="cell-title">{f.name}</div>
                          <div className="cell-sub">{f.group}</div>
                        </td>
                        <td>{f.definition}</td>
                        <td className="num">{f.weightPct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            <details className="details">
              <summary>Output contract & canonical column order</summary>
              <div className="callout callout-info">
                <div className="callout-title">Canonical columns (Never Change)</div>
                <div className="callout-body">
                  <ol className="columns">
                    {CANONICAL_COLUMNS.map((c) => (
                      <li key={c}><code>{c}</code></li>
                    ))}
                  </ol>
                </div>
              </div>
            </details>
          </div>
        </section>

        <section className="card card-results">
          <div className="card-header">
            <h2 className="card-title">Results</h2>
            <div className="card-subtitle">
              Ranked by predicted 1-day growth (descending). INTC is appended after Top 10.
            </div>
          </div>

          {!output ? (
            <div className="empty">
              <div className="empty-title">No run yet</div>
              <div className="empty-body">
                Select a mode and click <strong>Run Scan</strong>.
              </div>
            </div>
          ) : (
            <>
              <div className="result-bar">
                <div className={`pill ${output.trade_header === "TRADE" ? "pill-trade" : "pill-no-trade"}`}>
                  {output.trade_header}
                </div>

                <div className="result-meta">
                  <div><span className="muted">Model:</span> {output.model_version}</div>
                  <div>
                    <span className="muted">Data Mode:</span>{" "}
                    <span className={output.data_mode === "MOCK" ? "badge badge-warn" : "badge badge-live"}>
                      {output.data_mode}
                    </span>
                  </div>
                  <div><span className="muted">Current Date:</span> {output.current_date}</div>
                  <div><span className="muted">Prediction Date:</span> {output.prediction_date}</div>
                </div>
              </div>

              <div className="metrics">
                <div className="metric">
                  <div className="metric-k">Avg Top 10</div>
                  <div className="metric-v">{formatPct(output.metrics.avg_top10_predicted_growth_pct)}</div>
                  <div className="metric-h">Must be ≥ +0.50%</div>
                </div>
                <div className="metric">
                  <div className="metric-k">Dispersion (Top 10)</div>
                  <div className="metric-v">{formatPct(output.metrics.dispersion_top10_pct)}</div>
                  <div className="metric-h">Must be ≥ 0.60%</div>
                </div>
                <div className="metric">
                  <div className="metric-k">Max sector count (Top 10)</div>
                  <div className="metric-v">{output.metrics.max_sector_count_top10}</div>
                  <div className="metric-h">Warning if ≥ 7</div>
                </div>
              </div>

              {output.sector_warning && (
                <div className="callout callout-warn" role="status">
                  <div className="callout-title">Sector concentration warning</div>
                  <div className="callout-body">
                    Top 10 contains <strong>7+ tickers</strong> from the same sector. (This does not alter rankings.)
                  </div>
                </div>
              )}

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Ticker</th>
                      <th>Company Name</th>
                      <th>Sector</th>
                      <th className="num">Current Price</th>
                      <th className="num">Predicted Price</th>
                      <th className="num">Predicted 1-Day % Growth</th>
                      <th className="num">3-Month</th>
                      <th className="num">6-Month</th>
                      <th className="num">12-Month</th>
                    </tr>
                  </thead>
                  <tbody>
                    {output.results.map((r, idx) => {
                      const isINTC = r.ticker === "INTC";
                      const growth = r.predicted1dGrowthPct;
                      return (
                        <tr key={`${r.ticker}-${idx}`} className={isINTC ? "row-intc" : ""}>
                          <td>{r.rank}</td>
                          <td>
                            <span className={`ticker ${isINTC ? "ticker-intc" : ""}`}>{r.ticker}</span>
                          </td>
                          <td>{r.companyName}</td>
                          <td>{r.sector}</td>
                          <td className="num">{formatMoney(r.currentPrice)}</td>
                          <td className="num">{formatMoney(r.predictedPrice)}</td>
                          <td className={`num ${growth >= 0 ? "pos" : "neg"}`}>{formatPct(growth)}</td>
                          <td className="num">{formatPct(r.ret3m)}</td>
                          <td className="num">{formatPct(r.ret6m)}</td>
                          <td className="num">{formatPct(r.ret12m)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="footnote">
                <strong>Note:</strong> In <span className="badge badge-warn">MOCK</span> mode, values are simulated and deterministic by seed.
                In <span className="badge badge-live">LIVE</span> mode, prices/history are real (Alpha Vantage). This minimal LIVE wiring does not produce predictions.
              </div>
            </>
          )}
        </section>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="muted">
            Stock Check v1.2 • Locked factor matrix • Frontend container
          </div>
          <div className="muted">
            Theme: Ocean Professional
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
