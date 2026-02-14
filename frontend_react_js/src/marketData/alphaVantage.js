const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query";

/**
 * Error that explicitly indicates LIVE market data was missing/invalid.
 * This is used to satisfy BRD v1.2 "fail on missing data" rules.
 */
export class LiveDataError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = "LiveDataError";
    this.meta = meta;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isFiniteNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

function getEnv(name) {
  return process.env[name];
}

// PUBLIC_INTERFACE
export function hasAlphaVantageApiKey() {
  /**
   * Indicates whether LIVE mode can be used (i.e., the Alpha Vantage API key is configured).
   * This must be safe to call in preview environments where the env var is intentionally missing.
   */
  return Boolean(getEnv("REACT_APP_ALPHA_VANTAGE_API_KEY"));
}

function requireEnv(name) {
  const value = getEnv(name);
  if (!value) {
    throw new LiveDataError(`LIVE mode requires ${name} to be set.`, { envVar: name });
  }
  return value;
}

/**
 * Log a LIVE market-data call with required timestamp + source.
 * Source is fixed to Alpha Vantage for this module.
 */
function logLiveCall({ operation, symbol, url }) {
  // Intentionally a single structured log line so it can be grepped easily.
  // BRD requirement: log timestamp + source for each call.
  // eslint-disable-next-line no-console
  console.info(
    `[market-data] ts=${nowIso()} source=ALPHA_VANTAGE op=${operation} symbol=${symbol} url=${url}`
  );
}

function parseAlphaVantageErrorPayload(json) {
  if (!json || typeof json !== "object") return null;
  // Alpha Vantage returns throttling and invalid symbol errors via these keys.
  if (typeof json["Error Message"] === "string") return json["Error Message"];
  if (typeof json["Information"] === "string") return json["Information"];
  if (typeof json["Note"] === "string") return json["Note"];
  return null;
}

async function fetchJsonStrict(url, { operation, symbol }) {
  logLiveCall({ operation, symbol, url });

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new LiveDataError("Network error while fetching LIVE data from Alpha Vantage.", {
      operation,
      symbol,
      cause: e instanceof Error ? e.message : String(e),
    });
  }

  if (!res.ok) {
    throw new LiveDataError(`Alpha Vantage request failed (HTTP ${res.status}).`, {
      operation,
      symbol,
      httpStatus: res.status,
    });
  }

  let json;
  try {
    json = await res.json();
  } catch (e) {
    throw new LiveDataError("Alpha Vantage response was not valid JSON.", {
      operation,
      symbol,
      cause: e instanceof Error ? e.message : String(e),
    });
  }

  const maybeErr = parseAlphaVantageErrorPayload(json);
  if (maybeErr) {
    throw new LiveDataError(`Alpha Vantage returned an error: ${maybeErr}`, { operation, symbol });
  }

  return json;
}

function toMoneyNumberStrict(value, { fieldName, operation, symbol }) {
  const n = Number(value);
  if (!isFiniteNumber(n)) {
    throw new LiveDataError(`Missing/invalid numeric field "${fieldName}" from Alpha Vantage.`, {
      operation,
      symbol,
      fieldName,
      rawValue: value,
    });
  }
  return n;
}

/**
 * Extract the latest close from the Alpha Vantage "TIME_SERIES_DAILY_ADJUSTED" payload.
 * Returns: { price, asOfDate }
 */
function extractLatestDailyAdjustedCloseStrict(json, { operation, symbol }) {
  const series = json && json["Time Series (Daily)"];
  if (!series || typeof series !== "object") {
    throw new LiveDataError("Missing 'Time Series (Daily)' in Alpha Vantage response.", {
      operation,
      symbol,
    });
  }

  const dates = Object.keys(series).sort().reverse();
  if (dates.length === 0) {
    throw new LiveDataError("Alpha Vantage time series contained no data points.", {
      operation,
      symbol,
    });
  }

  const asOfDate = dates[0];
  const row = series[asOfDate];
  if (!row || typeof row !== "object") {
    throw new LiveDataError("Alpha Vantage time series latest row was missing/invalid.", {
      operation,
      symbol,
      asOfDate,
    });
  }

  // Prefer adjusted close if available; otherwise close.
  const adjustedClose = row["5. adjusted close"];
  const close = row["4. close"];

  const price = toMoneyNumberStrict(adjustedClose ?? close, {
    fieldName: "5. adjusted close (or 4. close)",
    operation,
    symbol,
  });

  return { price, asOfDate };
}

/**
 * Extract last N daily closes from "TIME_SERIES_DAILY_ADJUSTED" payload.
 * Returns array sorted ascending by date: [{ date, close }]
 */
function extractDailyHistoryStrict(json, { operation, symbol, limit }) {
  const series = json && json["Time Series (Daily)"];
  if (!series || typeof series !== "object") {
    throw new LiveDataError("Missing 'Time Series (Daily)' in Alpha Vantage response.", {
      operation,
      symbol,
    });
  }

  const datesDesc = Object.keys(series).sort().reverse();
  if (datesDesc.length === 0) {
    throw new LiveDataError("Alpha Vantage time series contained no data points.", {
      operation,
      symbol,
    });
  }

  const sliceDesc = datesDesc.slice(0, limit);
  const points = sliceDesc.map((date) => {
    const row = series[date];
    if (!row || typeof row !== "object") {
      throw new LiveDataError("Alpha Vantage time series row was missing/invalid.", {
        operation,
        symbol,
        date,
      });
    }
    const adjustedClose = row["5. adjusted close"];
    const close = row["4. close"];
    const closeNum = toMoneyNumberStrict(adjustedClose ?? close, {
      fieldName: "5. adjusted close (or 4. close)",
      operation,
      symbol,
    });
    return { date, close: closeNum };
  });

  // Ascending for return computations (oldest -> newest)
  points.sort((a, b) => a.date.localeCompare(b.date));
  return points;
}

// PUBLIC_INTERFACE
export async function fetchCurrentPriceAlphaVantage(symbol) {
  /**
   * Fetch the latest available daily close for a symbol via Alpha Vantage.
   * Strict: throws LiveDataError if the data is missing/invalid.
   */
  const apiKey = requireEnv("REACT_APP_ALPHA_VANTAGE_API_KEY");
  const url = `${ALPHA_VANTAGE_BASE_URL}?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(
    symbol
  )}&outputsize=compact&apikey=${encodeURIComponent(apiKey)}`;

  const operation = "price.latest_daily_adjusted_close";
  const json = await fetchJsonStrict(url, { operation, symbol });
  const { price, asOfDate } = extractLatestDailyAdjustedCloseStrict(json, { operation, symbol });

  return { price, asOfDate, source: "ALPHA_VANTAGE" };
}

// PUBLIC_INTERFACE
export async function fetchDailyHistoryAlphaVantage(symbol, limit = 260) {
  /**
   * Fetch daily close history for a symbol via Alpha Vantage.
   * Strict: throws LiveDataError if the data is missing/invalid.
   */
  const apiKey = requireEnv("REACT_APP_ALPHA_VANTAGE_API_KEY");
  const url = `${ALPHA_VANTAGE_BASE_URL}?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(
    symbol
  )}&outputsize=full&apikey=${encodeURIComponent(apiKey)}`;

  const operation = "history.daily_adjusted_close";
  const json = await fetchJsonStrict(url, { operation, symbol });
  const history = extractDailyHistoryStrict(json, { operation, symbol, limit });

  return { history, source: "ALPHA_VANTAGE" };
}
