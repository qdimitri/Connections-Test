import { useEffect, useRef, useState, useCallback } from "react";
import TradeStreamCard from '../Components/TradeStreamCard';
import {
  SYMBOL,
  MAX_MOCK_TRADES,
  MockBravoRest,
  fetchTradeBatch,
  type RestTradeMessage,
} from './AmcMockRest';

const POLL_MIN_MS = 2000;
const POLL_MAX_MS = 3000;

interface Trade extends RestTradeMessage {
  id: string;
}

type PollStatus = "idle" | "polling" | "error";

const USE_MOCK = true;

export default function AmcTradeStreamB() {
  const [status, setStatus] = useState<PollStatus>("idle");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [priceDirection, setPriceDirection] = useState<"up" | "down" | null>(null);
  const [lastPolledAt, setLastPolledAt] = useState<number | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  const mockServerRef = useRef<MockBravoRest | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const poll = useCallback(async () => {
    setStatus("polling");
    try {
      const batch = await fetchTradeBatch(USE_MOCK ? mockServerRef.current : null);
      if (unmountedRef.current) return;

      setLastPolledAt(Date.now());
      setStatus("idle");

      if (batch.length > 0) {
        setLastPrice((prev) => {
          const newest = batch[batch.length - 1].price;
          if (prev !== null) setPriceDirection(newest >= prev ? "up" : "down");
          return newest;
        });

        setTrades((prev) => [
          ...prev,
          ...batch.map((t) => ({ ...t, id: `${t.timestamp}-${Math.random()}` })),
        ]);
      }

      if (USE_MOCK && MockBravoRest.hasReachedTradeLimit()) {
        setLimitReached(true);
        console.log(`[API Bravo] Trade limit of ${MAX_MOCK_TRADES} reached — no further polling.`);
        return;
      }
    } catch {
      if (!unmountedRef.current) setStatus("error");
    }

    if (unmountedRef.current) return;
    const nextDelay = POLL_MIN_MS + Math.random() * (POLL_MAX_MS - POLL_MIN_MS);
    pollTimerRef.current = setTimeout(poll, nextDelay);
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    if (USE_MOCK) mockServerRef.current = new MockBravoRest();
    poll();
    return () => {
      unmountedRef.current = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      mockServerRef.current?.stop();
    };
  }, [poll]);

  return (
    <TradeStreamCard
      className="Bravo"
      label="API BRAVO · BATCH TRADES"
      symbol={SYMBOL}
      trades={[...trades].reverse()}
      price={lastPrice}
      priceDirection={priceDirection}
      statusKey={status}
      statusLabel={limitReached ? "limit reached" : status}
      secondaryMeta={
        lastPolledAt
          ? `Last polled ${new Date(lastPolledAt).toLocaleTimeString([], { hour12: false })}`
          : "Waiting for first poll…"
      }
      infoText="NOTE: Mock Rest feed 'API Bravo' simulating batch trades. Polls every 2-3 seconds with overlapping but not identical trade data - example SEQ#: 0x11, 0x12, 0c01, 0x13, etc."
    />
  );
}
