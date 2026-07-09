import { controls } from '../Variables/GlobalVariables';

export const API_ALPHA_URL = "wss://api.alpha.example.com/v1/trades/stream";
export const SYMBOL = "AMC";

export interface WebSockTradeMessage {
  type: "trade";
  symbol: string;
  price: number;
  size: number;
  timestamp: number;
  side: "buy" | "sell";
  seq: number;
}

function createSeededRandom(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TRADE_SEQUENCE_SEED = 1337;
export const MAX_MOCK_TRADES = controls.maxTrades;

export class MockAlphaSocket {
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  private dropTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  private static rng = createSeededRandom(TRADE_SEQUENCE_SEED);
  private static lastPrice = 4.85;
  private static tradeCount = 0;
  private static genStarted = false;
  private static activeSockets = new Set<MockAlphaSocket>();

  static hasReachedTradeLimit(): boolean {
    return MockAlphaSocket.tradeCount >= MAX_MOCK_TRADES;
  }

  constructor(_url: string) {
    setTimeout(() => {
      if (this.closed) return;
      MockAlphaSocket.activeSockets.add(this);
      this.onopen?.();
      MockAlphaSocket.ensureGenerating();
      this.scheduleRandomDrop();
    }, 300);
  }

  private static ensureGenerating() {
    if (MockAlphaSocket.genStarted) return;
    MockAlphaSocket.genStarted = true;
    MockAlphaSocket.scheduleNextTrade();
  }

  private static scheduleNextTrade() {
    if (MockAlphaSocket.hasReachedTradeLimit()) return;

    const delay = 400 + MockAlphaSocket.rng() * 800;
    setTimeout(() => {
      MockAlphaSocket.emitTrade();
      MockAlphaSocket.scheduleNextTrade();
    }, delay);
  }

  private static emitTrade() {
    const drift = (MockAlphaSocket.rng() - 0.5) * 0.03;
    MockAlphaSocket.lastPrice = Math.max(0.5, MockAlphaSocket.lastPrice + drift);
    MockAlphaSocket.tradeCount += 1;

    const msg: WebSockTradeMessage = {
      type: "trade",
      symbol: SYMBOL,
      price: Number(MockAlphaSocket.lastPrice.toFixed(2)),
      size: Math.floor(10 + MockAlphaSocket.rng() * 990),
      timestamp: Date.now(),
      side: MockAlphaSocket.rng() > 0.5 ? "buy" : "sell",
      seq: MockAlphaSocket.tradeCount,
    };

    const payload = { data: JSON.stringify(msg) };
    for (const socket of MockAlphaSocket.activeSockets) {
      if (!socket.closed) {
        socket.onmessage?.(payload);
      }
    }
  }

  private scheduleRandomDrop() {
    const delay = 8000 + Math.random() * 12000;
    this.dropTimer = setTimeout(() => {
      if (this.closed) return;
      this.simulateDrop();
    }, delay);
  }

  private simulateDrop() {
    this.closed = true;
    MockAlphaSocket.activeSockets.delete(this);
    this.onerror?.(new Event("error"));
    this.onclose?.();
  }

  close() {
    this.closed = true;
    MockAlphaSocket.activeSockets.delete(this);
    if (this.dropTimer) clearTimeout(this.dropTimer);
    this.onclose?.();
  }
}

export function parseWebSockTradeMessage(raw: string): WebSockTradeMessage | null {
  try {
    const data = JSON.parse(raw);
    if (data.type === "trade" && data.symbol === SYMBOL) {
      return data as WebSockTradeMessage;
    }
    return null;
  } catch {
    return null;
  }
}
