import { useEffect, useRef, useState, useCallback } from "react";
import {
  API_ALPHA_URL,
  SYMBOL,
  MAX_MOCK_TRADES,
  MockAlphaSocket,
  parseWebSockTradeMessage,
  type WebSockTradeMessage,
} from './AmcMockWebSock';
import TradeStreamCard from '../Components/TradeStreamCard';

interface Trade extends WebSockTradeMessage {
  id: string;
}

type ConnectionStatus = "connecting" | "open" | "closed" | "error";

const USE_MOCK = true;
const MAX_RECONNECT_DELAY_MS = 10_000;

export default function AmcTradeStreamA() {
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

  const connect = useCallback(() => {
    setStatus("connecting");

    const socket: WebSocket | MockAlphaSocket = USE_MOCK
      ? new MockAlphaSocket(API_ALPHA_URL)
      : new WebSocket(API_ALPHA_URL);

    socket.onopen = () => {
      setStatus("open");
      const attempts = reconnectAttemptRef.current;
      if (attempts > 0) {
        console.log(`[API Alpha] Reconnected to ${SYMBOL} stream (after ${attempts} attempt${attempts > 1 ? "s" : ""}).`);
      }
      reconnectAttemptRef.current = 0;
      setReconnectAttempt(0);
    };

    socket.onmessage = (event: { data: string }) => {
      const parsed = parseWebSockTradeMessage(event.data);
      if (!parsed) return;

      setLastPrice((prev) => {
        if (prev !== null) {
          setPriceDirection(parsed.price >= prev ? "up" : "down");
        }
        return parsed.price;
      });

      const trade: Trade = { ...parsed, id: `${parsed.timestamp}-${Math.random()}` };
      setTrades((prev) => [trade, ...prev]);
    };

    socket.onerror = () => setStatus("error");

    socket.onclose = () => {
      setStatus("closed");
      console.log(`[API Alpha] Disconnected from ${SYMBOL} stream.`);
      socketRef.current = null;
      if (unmountedRef.current) return;

      if (USE_MOCK && MockAlphaSocket.hasReachedTradeLimit()) {
        setTradeLimitReached(true);
        console.log(`[API Alpha] Trade limit of ${MAX_MOCK_TRADES} reached — no further reconnects.`);
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

  useEffect(() => {
    unmountedRef.current = false;
    connect();
    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
    };
  }, [connect]);

  return (
    <TradeStreamCard
      className="Alpha"
      label="API ALPHA · LIVE TRADES"
      symbol={SYMBOL}
      trades={trades}
      price={lastPrice}
      priceDirection={priceDirection}
      statusKey={status}
      statusLabel={
        tradeLimitReached
          ? "limit reached"
          : `${status}${status === "connecting" && reconnectAttempt > 0 ? ` (retry ${reconnectAttempt})` : ""}`
      }
      secondaryMeta={" "}
      infoText="NOTE: Mock WebSocket feed 'API Alpha' simulating live trades. Disconnects randomly after some trades. Reconnects automatically and resumes with next trade sequence resulting in data loss. example SEQ#: 0x01, 0x02, 0x03, 0x05, etc."
    />
  );
}
