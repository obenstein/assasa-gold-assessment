"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { WalletState, Quote, Trade } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PriceData {
  snapshot: {
    source: string;
    pricePerGramPKR: number;
    fetchedAt: string;
    trusted: boolean;
    reason?: string;
  };
  buyPricePerGramPKR: number;
  sellPricePerGramPKR: number;
}

type Screen = "home" | "trade" | "review" | "receipt";
type Side = "BUY" | "SELL";
type InputUnit = "PKR" | "GOLD";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 0) {
  return new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

function fmtAge(iso: string, now: number): string {
  const secs = Math.floor((now - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
      style={{ animationDuration: "0.75s" }}
    >
      <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconArrowLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function IconRefresh({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={spinning ? "animate-spin" : ""}
      style={spinning ? { animationDuration: "0.9s" } : {}}
    >
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function BalanceCard({
  label,
  value,
  sub,
  loading,
  delay = 0,
}: {
  label: string;
  value: string;
  sub?: string;
  loading: boolean;
  delay?: number;
}) {
  return (
    <div
      className="glass-card p-5 animate-fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p style={{ color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
        {label}
      </p>
      {loading ? (
        <div className="skeleton" style={{ height: 28, width: "70%", marginBottom: 6 }} />
      ) : (
        <p style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{value}</p>
      )}
      {sub && !loading && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{sub}</p>
      )}
    </div>
  );
}

// Countdown ring component
function CountdownRing({
  totalSeconds,
  remainingSeconds,
}: {
  totalSeconds: number;
  remainingSeconds: number;
}) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.max(0, remainingSeconds / totalSeconds);
  const offset = circumference * (1 - fraction);

  const color =
    remainingSeconds > 30
      ? "var(--lime-accent)"
      : remainingSeconds > 15
      ? "#F59E0B"
      : "#EF4444";

  return (
    <div style={{ position: "relative", width: 96, height: 96 }}>
      <svg width="96" height="96" viewBox="0 0 96 96" className="countdown-ring-svg">
        <circle className="countdown-ring-track" cx="48" cy="48" r={radius} />
        <circle
          className="countdown-ring-fill"
          cx="48"
          cy="48"
          r={radius}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
            stroke: color,
          }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>
          {remainingSeconds}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>sec</span>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  // Global state
  const [screen, setScreen] = useState<Screen>("home");
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [balances, setBalances] = useState<WalletState | null>(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [priceRefreshing, setPriceRefreshing] = useState(false);

  // Ticker: forces re-render every second so fmtAge stays live
  // Ticker: forces re-render every second so fmtAge stays live
const [now, setNow] = useState(() => Date.now());

useEffect(() => {
  const id = setInterval(() => {
    setNow(Date.now());
  }, 1000);

  return () => clearInterval(id);
}, []);


  // Trade form state
  const [side, setSide] = useState<Side>("BUY");
  const [unit, setUnit] = useState<InputUnit>("PKR");
  const [inputRaw, setInputRaw] = useState("");

  // Quote state
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Trade/confirm state
  const [confirming, setConfirming] = useState(false);
  const [trade, setTrade] = useState<Trade | null>(null);
  const [confirmError, setConfirmError] = useState("");

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  const fetchPrice = useCallback(async (isRefresh = false) => {
  if (isRefresh) setPriceRefreshing(true);
  else setPriceLoading(true);

  try {
    const res = await fetch("/api/price");

    if (res.ok) {
      const data = await res.json();
      setPriceData(data);
      setNow(Date.now()); // force immediate freshness update
    }
  } catch {
    // Ignore network errors
  }

  setPriceLoading(false);
  setPriceRefreshing(false);
}, []);

  const fetchBalances = useCallback(async () => {
    setBalancesLoading(true);
    try {
      const res = await fetch("/api/balances");
      if (res.ok) {
        const data = await res.json();
        setBalances(data);
      }
    } catch {}
    setBalancesLoading(false);
  }, []);

  useEffect(() => {
    fetchPrice();
    fetchBalances();
  }, [fetchPrice, fetchBalances]);

  // Auto-refresh price every 5 minutes
  useEffect(() => {
    const id = setInterval(() => fetchPrice(true), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchPrice]);

  // ── Derived counter-value ──────────────────────────────────────────────────

  const inputNum = parseFloat(inputRaw.replace(/,/g, "")) || 0;
  const activePrice =
    side === "BUY"
      ? priceData?.buyPricePerGramPKR ?? 0
      : priceData?.sellPricePerGramPKR ?? 0;

  let counterLabel = "";
  let counterValue = "";
  if (inputNum > 0 && activePrice > 0) {
    if (unit === "PKR") {
      const grams = inputNum / activePrice;
      counterValue = `≈ ${grams.toFixed(4)} g`;
      counterLabel = "You receive (approx.)";
    } else {
      const pkr = inputNum * activePrice;
      counterValue = `≈ PKR ${fmt(pkr)}`;
      counterLabel = side === "BUY" ? "You pay (approx.)" : "You receive (approx.)";
    }
  }

  // ── Countdown logic ────────────────────────────────────────────────────────

  const startCountdown = useCallback((expiresAt: string) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    const tick = () => {
      const secs = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setRemainingSeconds(secs);
      if (secs === 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
      }
    };
    tick();
    countdownRef.current = setInterval(tick, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleGetQuote = async () => {
    if (!inputNum || inputNum <= 0) return;
    setQuoteLoading(true);
    setQuoteError("");
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side, inputType: unit, inputAmount: inputNum }),
      });
      const data = await res.json();
      if (!res.ok) {
        setQuoteError(data.error || "Failed to get quote");
        setQuoteLoading(false);
        return;
      }
      setQuote(data);
      startCountdown(data.expiresAt);
      setScreen("review");
    } catch {
      setQuoteError("Network error. Please try again.");
    }
    setQuoteLoading(false);
  };

  const handleConfirm = async () => {
    if (!quote || confirming) return;
    setConfirming(true);
    setConfirmError("");
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quote.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConfirmError(data.error || "Trade failed. Please try again.");
        setConfirming(false);
        return;
      }
      setTrade(data);
      setBalances(data.balancesAfter);
      if (countdownRef.current) clearInterval(countdownRef.current);
      setScreen("receipt");
    } catch {
      setConfirmError("Network error. Please try again.");
    }
    setConfirming(false);
  };

  const handleTradeAgain = () => {
    setScreen("home");
    setQuote(null);
    setTrade(null);
    setInputRaw("");
    setQuoteError("");
    setConfirmError("");
    setSide("BUY");
    setUnit("PKR");
    fetchBalances();
    fetchPrice(true);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface-0)" }}>
      {/* Background gradient blobs */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          overflow: "hidden",
          zIndex: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-20%",
            left: "-10%",
            width: "60%",
            height: "60%",
            borderRadius: "50%",
            background: "radial-gradient(ellipse, rgba(13,74,70,0.18) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-10%",
            right: "-15%",
            width: "50%",
            height: "50%",
            borderRadius: "50%",
            background: "radial-gradient(ellipse, rgba(13,74,70,0.12) 0%, transparent 70%)",
          }}
        />
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 440,
          margin: "0 auto",
          padding: "0 16px 40px",
          minHeight: "100vh",
        }}
      >
        {/* ── Screen: HOME ──────────────────────────────────────────────── */}
        {screen === "home" && (
          <div className="animate-fade-in-up">
            {/* Header */}
            <div style={{ paddingTop: 56, paddingBottom: 32, textAlign: "center" }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 99,
                  background: "rgba(13,74,70,0.25)",
                  border: "1px solid rgba(13,74,70,0.45)",
                  marginBottom: 20,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: priceData?.snapshot.trusted
                      ? "var(--lime-accent)"
                      : "#F59E0B",
                    display: "inline-block",
                  }}
                  className={priceData?.snapshot.trusted ? "animate-pulse-ring" : ""}
                />
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Live Market
                </span>
              </div>
              <h1
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  margin: "0 0 8px",
                  color: "var(--text-primary)",
                }}
              >
                Assasa Gold
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>
                Buy &amp; sell 24K gold · PKR · Transparent pricing
              </p>
            </div>

            {/* Price card */}
            <div
              className="glass-card-elevated animate-fade-in-up"
              style={{ padding: "24px", marginBottom: 24, animationDelay: "60ms" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                    Gold Price · 24K/gram
                  </p>
                  {priceLoading ? (
                    <div className="skeleton" style={{ height: 40, width: 160 }} />
                  ) : (
                    <p style={{ fontSize: 38, fontWeight: 800, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.02em" }}>
                      PKR {fmt(priceData?.snapshot.pricePerGramPKR ?? 0)}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => fetchPrice(true)}
                  disabled={priceRefreshing}
                  style={{
                    background: "rgba(13,74,70,0.2)",
                    border: "1px solid rgba(13,74,70,0.35)",
                    borderRadius: 10,
                    padding: "8px 10px",
                    cursor: "pointer",
                    color: "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 500,
                    transition: "all 0.2s",
                  }}
                >
                  <IconRefresh spinning={priceRefreshing} />
                </button>
              </div>

              {/* Buy / Sell prices */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {(["BUY", "SELL"] as Side[]).map((s) => {
                  const p =
                    s === "BUY"
                      ? priceData?.buyPricePerGramPKR
                      : priceData?.sellPricePerGramPKR;
                  return (
                    <div
                      key={s}
                      style={{
                        background: s === "BUY" ? "rgba(13,74,70,0.15)" : "rgba(123,63,0,0.12)",
                        border: `1px solid ${s === "BUY" ? "rgba(13,74,70,0.3)" : "rgba(123,63,0,0.25)"}`,
                        borderRadius: 12,
                        padding: "12px 14px",
                      }}
                    >
                      <p style={{ fontSize: 10, fontWeight: 600, color: s === "BUY" ? "var(--teal-light)" : "#F59E0B", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
                        {s === "BUY" ? "Buy from us" : "Sell to us"}
                      </p>
                      {priceLoading ? (
                        <div className="skeleton" style={{ height: 20, width: "80%" }} />
                      ) : (
                        <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                          {fmt(p ?? 0)} PKR
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Source + freshness */}
              {!priceLoading && priceData && (
                <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {priceData.snapshot.source}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Updated {fmtAge(priceData.snapshot.fetchedAt, now)}
                  </span>
                  {!priceData.snapshot.trusted && (
                    <span style={{ fontSize: 11, color: "#F59E0B", marginLeft: "auto" }}>
                      ⚠ Unverified
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Balance cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <BalanceCard
                label="PKR Wallet"
                value={`₨ ${fmt(balances?.pkrBalance ?? 0)}`}
                loading={balancesLoading}
                delay={80}
              />
              <BalanceCard
                label="Your Gold"
                value={`${(balances?.customerGoldGrams ?? 0).toFixed(4)} g`}
                sub="24K"
                loading={balancesLoading}
                delay={130}
              />
            </div>
            <BalanceCard
              label="Platform Inventory"
              value={`${fmt(balances?.platformInventoryGrams ?? 0, 4)} g`}
              sub="Available to buy"
              loading={balancesLoading}
              delay={180}
            />

            {/* CTA */}
            <div style={{ marginTop: 32 }}>
              <button
                className="btn-primary"
                onClick={() => setScreen("trade")}
                id="start-trade-btn"
              >
                Start a Trade
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ── Screen: TRADE ─────────────────────────────────────────────── */}
        {screen === "trade" && (
          <div className="animate-fade-in-up">
            {/* Nav */}
            <div style={{ paddingTop: 40, display: "flex", alignItems: "center", marginBottom: 32 }}>
              <button
                onClick={() => setScreen("home")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, padding: 0 }}
                id="back-to-home-btn"
              >
                <IconArrowLeft />
                <span style={{ fontSize: 14, fontWeight: 500 }}>Back</span>
              </button>
              <h2 style={{ margin: "0 0 0 auto", fontSize: 18, fontWeight: 700 }}>New Trade</h2>
            </div>

            {/* Buy / Sell toggle */}
            <div style={{ background: "var(--surface-1)", borderRadius: 14, padding: 4, display: "flex", gap: 4, marginBottom: 28 }}>
              {(["BUY", "SELL"] as Side[]).map((s) => (
                <button
                  key={s}
                  id={`side-${s.toLowerCase()}-btn`}
                  className={`toggle-pill ${side === s ? (s === "BUY" ? "active-buy" : "active-sell") : ""}`}
                  onClick={() => { setSide(s); setInputRaw(""); }}
                >
                  {s === "BUY" ? "Buy Gold" : "Sell Gold"}
                </button>
              ))}
            </div>

            {/* Price reference */}
            <div
              className="glass-card"
              style={{ padding: "14px 18px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between" }}
            >
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {side === "BUY" ? "Buy price" : "Sell price"} per gram
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, color: side === "BUY" ? "var(--teal-light)" : "#F59E0B" }}>
                {priceData ? `PKR ${fmt(activePrice)}` : "—"}
              </span>
            </div>

            {/* Input area */}
            <div style={{ marginBottom: 8 }}>
              {/* Unit toggle */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                {(["PKR", "GOLD"] as InputUnit[]).map((u) => (
                  <button
                    key={u}
                    id={`unit-${u.toLowerCase()}-btn`}
                    onClick={() => { setUnit(u); setInputRaw(""); }}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 8,
                      border: "1px solid",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.15s",
                      borderColor: unit === u ? "var(--teal-mid)" : "var(--border-subtle)",
                      background: unit === u ? "rgba(13,74,70,0.25)" : "transparent",
                      color: unit === u ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                  >
                    {u === "PKR" ? "₨ PKR" : "⬡ Grams"}
                  </button>
                ))}
              </div>

              <div style={{ position: "relative" }}>
                <input
                  id="amount-input"
                  className="trade-input"
                  type="number"
                  inputMode="decimal"
                  placeholder={unit === "PKR" ? "0" : "0.0000"}
                  value={inputRaw}
                  onChange={(e) => setInputRaw(e.target.value)}
                  min="0"
                  step={unit === "PKR" ? "1000" : "0.1"}
                />
                <span
                  style={{
                    position: "absolute",
                    right: 20,
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                  }}
                >
                  {unit === "PKR" ? "PKR" : "g"}
                </span>
              </div>
            </div>

            {/* Counter-value */}
            <div style={{ minHeight: 44, marginBottom: 24 }}>
              {counterValue && (
                <div
                  className="animate-fade-in"
                  style={{
                    padding: "12px 18px",
                    borderRadius: 12,
                    background: "rgba(13,74,70,0.12)",
                    border: "1px solid rgba(13,74,70,0.25)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{counterLabel}</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "var(--lime-accent)" }}>{counterValue}</span>
                </div>
              )}
            </div>

            {/* Error */}
            {quoteError && (
              <div
                className="animate-fade-in"
                style={{
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  marginBottom: 20,
                  fontSize: 13,
                  color: "#FCA5A5",
                }}
              >
                {quoteError}
              </div>
            )}

            {/* Quote CTA */}
            <button
              id="get-quote-btn"
              className="btn-primary"
              onClick={handleGetQuote}
              disabled={!inputNum || inputNum <= 0 || quoteLoading || !priceData?.snapshot.trusted}
            >
              {quoteLoading ? <Spinner /> : null}
              {quoteLoading ? "Getting Quote…" : "Lock Quote →"}
            </button>

            {!priceData?.snapshot.trusted && (
              <p style={{ textAlign: "center", fontSize: 12, color: "#F59E0B", marginTop: 12 }}>
                Trading paused — price feed unverified
              </p>
            )}
          </div>
        )}

        {/* ── Screen: REVIEW ────────────────────────────────────────────── */}
        {screen === "review" && quote && (
          <div className="animate-fade-in-up">
            {/* Nav */}
            <div style={{ paddingTop: 40, display: "flex", alignItems: "center", marginBottom: 32 }}>
              <button
                onClick={() => { setScreen("trade"); setQuote(null); if (countdownRef.current) clearInterval(countdownRef.current); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6, padding: 0 }}
                id="back-to-trade-btn"
              >
                <IconArrowLeft />
                <span style={{ fontSize: 14, fontWeight: 500 }}>Edit</span>
              </button>
              <h2 style={{ margin: "0 0 0 auto", fontSize: 18, fontWeight: 700 }}>Review &amp; Confirm</h2>
            </div>

            {/* Countdown ring + label */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32 }}>
              <CountdownRing totalSeconds={75} remainingSeconds={remainingSeconds} />
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 10 }}>
                {remainingSeconds > 0 ? "Price locked · Expires in" : "Quote expired"}
              </p>
            </div>

            {/* Quote details card */}
            <div className="glass-card-elevated" style={{ padding: "24px", marginBottom: 24 }}>
              {/* Side badge */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    padding: "5px 12px",
                    borderRadius: 8,
                    background: quote.side === "BUY" ? "rgba(13,74,70,0.3)" : "rgba(123,63,0,0.25)",
                    color: quote.side === "BUY" ? "var(--teal-light)" : "#F59E0B",
                  }}
                >
                  {quote.side === "BUY" ? "Buying Gold" : "Selling Gold"}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  ID: {quote.id.slice(-8)}
                </span>
              </div>

              <div className="stat-row">
                <span style={{ fontSize: 14, color: "var(--text-muted)" }}>Locked price</span>
                <span style={{ fontSize: 16, fontWeight: 700 }}>PKR {fmt(quote.lockedPricePerGramPKR)} / g</span>
              </div>
              <div className="stat-row">
                <span style={{ fontSize: 14, color: "var(--text-muted)" }}>Gold amount</span>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{quote.goldGrams.toFixed(4)} g</span>
              </div>
              <div className="stat-row">
                <span style={{ fontSize: 14, color: "var(--text-muted)" }}>
                  {quote.side === "BUY" ? "You pay" : "You receive"}
                </span>
                <span style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>
                  PKR {fmt(quote.pkrAmount)}
                </span>
              </div>
            </div>

            {/* Error */}
            {confirmError && (
              <div
                className="animate-fade-in"
                style={{
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  marginBottom: 20,
                  fontSize: 13,
                  color: "#FCA5A5",
                }}
              >
                {confirmError}
              </div>
            )}

            {/* Expired notice */}
            {remainingSeconds === 0 && (
              <div
                className="animate-fade-in"
                style={{
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.2)",
                  marginBottom: 20,
                  fontSize: 13,
                  color: "#FDE68A",
                  textAlign: "center",
                }}
              >
                Quote expired. Please go back and get a new quote.
              </div>
            )}

            <button
              id="confirm-trade-btn"
              className="btn-primary btn-success"
              onClick={handleConfirm}
              disabled={confirming || remainingSeconds === 0}
            >
              {confirming ? <Spinner /> : null}
              {confirming
                ? "Confirming…"
                : quote.side === "BUY"
                ? `Confirm — Pay PKR ${fmt(quote.pkrAmount)}`
                : `Confirm — Sell ${quote.goldGrams.toFixed(4)} g`}
            </button>

            <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)", marginTop: 14 }}>
              Tap once. Settlement is server-side.
            </p>
          </div>
        )}

        {/* ── Screen: RECEIPT ───────────────────────────────────────────── */}
        {screen === "receipt" && trade && (
          <div className="animate-fade-in-up">
            <div style={{ paddingTop: 64, paddingBottom: 32, textAlign: "center" }}>
              {/* Success icon */}
              <div
                className="animate-pulse-ring"
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: "rgba(140,203,80,0.12)",
                  border: "2px solid rgba(140,203,80,0.35)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 20px",
                }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--lime-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              <h2 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 8px", color: "var(--text-primary)" }}>
                Trade Complete
              </h2>
              <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "0 0 4px" }}>
                {trade.side === "BUY" ? "Gold added to your account" : "PKR credited to your wallet"}
              </p>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Receipt #{trade.receiptNumber}
              </p>
            </div>

            {/* Trade summary */}
            <div className="glass-card-elevated" style={{ padding: "24px", marginBottom: 24 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
                Trade Summary
              </p>
              <div className="stat-row">
                <span style={{ fontSize: 14, color: "var(--text-muted)" }}>Type</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: trade.side === "BUY" ? "var(--teal-light)" : "#F59E0B" }}>
                  {trade.side === "BUY" ? "Gold Purchase" : "Gold Sale"}
                </span>
              </div>
              <div className="stat-row">
                <span style={{ fontSize: 14, color: "var(--text-muted)" }}>Gold</span>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{trade.goldGrams.toFixed(4)} g 24K</span>
              </div>
              <div className="stat-row">
                <span style={{ fontSize: 14, color: "var(--text-muted)" }}>Price</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>PKR {fmt(trade.pricePerGramPKR)} / g</span>
              </div>
              <div className="stat-row">
                <span style={{ fontSize: 14, color: "var(--text-muted)" }}>
                  {trade.side === "BUY" ? "Paid" : "Received"}
                </span>
                <span style={{ fontSize: 20, fontWeight: 800 }}>PKR {fmt(trade.pkrAmount)}</span>
              </div>
              <div className="stat-row">
                <span style={{ fontSize: 14, color: "var(--text-muted)" }}>Executed</span>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {new Date(trade.executedAt).toLocaleString("en-PK", { hour12: true })}
                </span>
              </div>
            </div>

            {/* Updated balances */}
            <div style={{ marginBottom: 32 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                Updated Balances
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <BalanceCard
                  label="PKR Wallet"
                  value={`₨ ${fmt(trade.balancesAfter.pkrBalance)}`}
                  loading={false}
                />
                <BalanceCard
                  label="Your Gold"
                  value={`${trade.balancesAfter.customerGoldGrams.toFixed(4)} g`}
                  sub="24K"
                  loading={false}
                />
              </div>
            </div>

            <button
              id="trade-again-btn"
              className="btn-primary"
              onClick={handleTradeAgain}
            >
              Trade Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
