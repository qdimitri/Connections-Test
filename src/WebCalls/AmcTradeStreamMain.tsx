import { useEffect, useRef, useState, useCallback } from "react";
import TradeStreamCard from '../Components/TradeStreamCard';
import { API_ALPHA_URL, SYMBOL, MAX_MOCK_TRADES, MockAlphaSocket, parseWebSockTradeMessage, type WebSockTradeMessage, } from './AmcMockWebSock';
import { MockBravoRest, fetchTradeBatch, type RestTradeMessage, } from './AmcMockRest';

interface Trade extends WebSockTradeMessage { id: string; }

type ConnectionStatus = "connecting" | "open" | "closed" | "error";

const USE_MOCK = true;
const MAX_RECONNECT_DELAY_MS = 10_000;
const POLL_MIN_MS = 2000;
const POLL_MAX_MS = 3000;

// Merges A's live WebSocket feed and B's REST batches into one reconciled trade feed.
export default function AmcTradeStreamMain() {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [priceDirection, setPriceDirection] = useState<"up" | "down" | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [tradeLimitReached, setTradeLimitReached] = useState(false);

  const socketRef = useRef<WebSocket | MockAlphaSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const unmountedRef = useRef(false);

  const [lastPolledAt, setLastPolledAt] = useState<number | null>(null);
  const [restLimitReached, setRestLimitReached] = useState(false);

  const mockServerRef = useRef<MockBravoRest | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tradesBySeqRef = useRef<Map<number, Trade>>(new Map());

  const [lastConfirmedSeq, setLastConfirmedSeq] = useState(0);
  const [maxMirroredSeq, setMaxMirroredSeq] = useState(0);
  const isResyncing = maxMirroredSeq > lastConfirmedSeq;

  // Dedupes incoming trades by seq, merges them into state, and updates the gap-detection watermark.
  const ingestTrades = useCallback((incoming: (WebSockTradeMessage | RestTradeMessage)[]) => {
    if (incoming.length === 0) return;

    const bySeq = tradesBySeqRef.current;
    let added = false;
    for (const t of incoming) {
      if (!bySeq.has(t.seq)) {
        bySeq.set(t.seq, { ...t, type: "trade", id: String(t.seq) });
        added = true;
      }
    }
    if (!added) return;

    const merged = Array.from(bySeq.values()).sort((a, b) => b.timestamp - a.timestamp);
    setTrades(merged);

    const latest = merged[0];
    setLastPrice((prev) => {
      if (prev !== null) setPriceDirection(latest.price >= prev ? "up" : "down");
      return latest.price;
    });

    setLastConfirmedSeq((prevConfirmed) => {
      let next = prevConfirmed;
      while (next < MAX_MOCK_TRADES && bySeq.has(next + 1)) next += 1;
      return next;
    });

    setMaxMirroredSeq((prevMax) => {
      let next = prevMax;
      for (const t of incoming) {
        if (t.seq <= MAX_MOCK_TRADES && t.seq > next) next = t.seq;
      }
      return next;
    });
  }, []);

  // Mirrors state into refs so the stable pollRest callback always reads current values.
  const statusRef = useRef<ConnectionStatus>("connecting");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const lastConfirmedSeqRef = useRef(0);
  useEffect(() => {
    lastConfirmedSeqRef.current = lastConfirmedSeq;
  }, [lastConfirmedSeq]);

  const maxMirroredSeqRef = useRef(0);
  useEffect(() => {
    maxMirroredSeqRef.current = maxMirroredSeq;
  }, [maxMirroredSeq]);

  const restPollingActiveRef = useRef(false);

  // Polls the REST API on a short cadence, but only while disconnected or resyncing; idles once healthy.
  const pollRest = useCallback(async () => {
    try {
      const batch = await fetchTradeBatch(USE_MOCK ? mockServerRef.current : null);
      if (unmountedRef.current) return;

      setLastPolledAt(Date.now());

      if (batch.length > 0) {
        ingestTrades(batch);
      }

      if (USE_MOCK && MockBravoRest.hasReachedTradeLimit()) {
        setRestLimitReached(true);
        console.log(`[API Main] Trade limit of ${MAX_MOCK_TRADES} reached — no further polling.`);
        restPollingActiveRef.current = false;
        return;
      }
    } catch {
      // Poll failure — the next scheduled attempt below will retry.
    }

    if (unmountedRef.current) return;

    const stillNeedsPolling = statusRef.current !== "open" || maxMirroredSeqRef.current > lastConfirmedSeqRef.current;
    if (!stillNeedsPolling) {
      restPollingActiveRef.current = false;
      return;
    }

    const nextDelay = POLL_MIN_MS + Math.random() * (POLL_MAX_MS - POLL_MIN_MS);
    pollTimerRef.current = setTimeout(pollRest, nextDelay);
  }, []);

  // Starts the REST poll loop if it isn't already running.
  const ensureRestPolling = useCallback(() => {
    if (restPollingActiveRef.current) return;
    restPollingActiveRef.current = true;
    pollRest();
  }, [pollRest]);

  // Opens the WebSocket connection and handles incoming trades, drops, and reconnects.
  const connect = useCallback(() => {
    setStatus("connecting");

    const socket: WebSocket | MockAlphaSocket = USE_MOCK
      ? new MockAlphaSocket(API_ALPHA_URL)
      : new WebSocket(API_ALPHA_URL);

    socket.onopen = () => {
      setStatus("open");
      const attempts = reconnectAttemptRef.current;
      if (attempts > 0) {
        console.log(`[API Main] Reconnected to ${SYMBOL} stream (after ${attempts} attempt${attempts > 1 ? "s" : ""}).`);
      }
      reconnectAttemptRef.current = 0;
      setReconnectAttempt(0);
    };

    socket.onmessage = (event: { data: string }) => {
      const parsed = parseWebSockTradeMessage(event.data);
      if (!parsed) return;

      ingestTrades([parsed]);
    };

    socket.onerror = () => setStatus("error");

    socket.onclose = () => {
      setStatus("closed");
      console.log(`[API Main] Disconnected from ${SYMBOL} stream.`);
      socketRef.current = null;
      ensureRestPolling();
      if (unmountedRef.current) return;

      if (USE_MOCK && MockAlphaSocket.hasReachedTradeLimit()) {
        setTradeLimitReached(true);
        console.log(`[API Main] Trade limit of ${MAX_MOCK_TRADES} reached — no further reconnects.`);
        return;
      }

      const attempt = reconnectAttemptRef.current;
      const nextAttempt = attempt + 1;
      reconnectAttemptRef.current = nextAttempt;
      setReconnectAttempt(nextAttempt);

      const delay = Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
      reconnectTimerRef.current = setTimeout(() => {
        if (!unmountedRef.current) connect();
      }, delay);
    };

    socketRef.current = socket;
  }, []);

  // Connects the WebSocket on mount and cleans it up on unmount.
  useEffect(() => {
    unmountedRef.current = false;
    connect();
    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
    };
  }, [connect]);

  // Starts the REST poller on mount and cleans it up on unmount.
  useEffect(() => {
    unmountedRef.current = false;
    if (USE_MOCK) mockServerRef.current = new MockBravoRest();
    ensureRestPolling();
    return () => {
      unmountedRef.current = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      mockServerRef.current?.stop();
    };
  }, [ensureRestPolling]);

  return (
    <TradeStreamCard
      className="Unified"
      label="API Main · UNIFIED FEED"
      symbol={SYMBOL}
      trades={trades}
      price={lastPrice}
      priceDirection={priceDirection}
      statusKey={tradeLimitReached || restLimitReached ? status : isResyncing ? "resyncing" : status}
      statusLabel={
        tradeLimitReached || restLimitReached
          ? "limit reached"
          : isResyncing
            ? "resyncing…"
            : `${status}${status === "connecting" && reconnectAttempt > 0 ? ` (retry ${reconnectAttempt})` : ""}`
      }
      secondaryMeta={
        lastPolledAt
          ? `Last resynced ${new Date(lastPolledAt).toLocaleTimeString([], { hour12: false })}`
          : "Waiting for first resync…"
      }
      infoText="NOTE: Uses same mock WebSocket feed 'API Alpha' simulating live trades. Disconnects randomly after some trades. Reconnects automatically and resumes with next trade sequence resulting in data loss, then uses mock Rest feed 'API Bravo' to poll on disconnect to backfill any missing trades."
    />
  );
}
