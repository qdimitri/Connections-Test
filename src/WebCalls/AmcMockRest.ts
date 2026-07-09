import { controls } from '../Variables/GlobalVariables';

export const API_BRAVO_BASE_URL = "https://api.bravo.example.com/v1";
export const SYMBOL = "AMC";

export interface RestTradeMessage {
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

export class MockBravoRest {
  private pending: RestTradeMessage[] = [];
  private stopped = false;

  private static rng = createSeededRandom(TRADE_SEQUENCE_SEED);
  private static lastPrice = 4.85;
  private static tradeCount = 0;
  private static bonusCount = 0;
  private static genStarted = false;
  private static activeServers = new Set<MockBravoRest>();

  static hasReachedTradeLimit(): boolean {
    return MockBravoRest.tradeCount >= MAX_MOCK_TRADES;
  }

  constructor() {
    MockBravoRest.activeServers.add(this);
    MockBravoRest.ensureGenerating();
  }

  private static ensureGenerating() {
    if (MockBravoRest.genStarted) return;
    MockBravoRest.genStarted = true;
    MockBravoRest.scheduleNextTrade();
  }

  private static scheduleNextTrade() {
    if (MockBravoRest.hasReachedTradeLimit()) return;

    const delay = 400 + MockBravoRest.rng() * 800;
    setTimeout(() => {
      MockBravoRest.generateTrade();
      MockBravoRest.scheduleNextTrade();
    }, delay);
  }

  private static generateTrade() {
    const drift = (MockBravoRest.rng() - 0.5) * 0.03;
    MockBravoRest.lastPrice = Math.max(0.5, MockBravoRest.lastPrice + drift);
    MockBravoRest.tradeCount += 1;

    MockBravoRest.broadcast({
      symbol: SYMBOL,
      price: Number(MockBravoRest.lastPrice.toFixed(2)),
      size: Math.floor(10 + MockBravoRest.rng() * 990),
      timestamp: Date.now(),
      side: MockBravoRest.rng() > 0.5 ? "buy" : "sell",
      seq: MockBravoRest.tradeCount,
    });

    if (MockBravoRest.tradeCount % 9 === 0) {
      MockBravoRest.broadcast(MockBravoRest.buildBonusTrade());
    }
  }

  private static buildBonusTrade(): RestTradeMessage {
    MockBravoRest.bonusCount += 1;
    const jitter = (Math.random() - 0.5) * 0.05;
    const price = Number(Math.max(0.5, MockBravoRest.lastPrice + jitter).toFixed(2));

    return {
      symbol: SYMBOL,
      price,
      size: Math.floor(10 + Math.random() * 990),
      timestamp: Date.now(),
      side: Math.random() > 0.5 ? "buy" : "sell",
      seq: 0xc00 + MockBravoRest.bonusCount,
    };
  }

  private static broadcast(trade: RestTradeMessage) {
    for (const server of MockBravoRest.activeServers) {
      if (!server.stopped) {
        server.pending.push(trade);
      }
    }
  }

  async fetchBatch(): Promise<RestTradeMessage[]> {
    await new Promise((resolve) => setTimeout(resolve, 80 + Math.random() * 150));
    const batch = this.pending;
    this.pending = [];
    return batch;
  }

  stop() {
    this.stopped = true;
    MockBravoRest.activeServers.delete(this);
  }
}

export async function fetchTradeBatch(mockServer: MockBravoRest | null): Promise<RestTradeMessage[]> {
  if (mockServer) {
    return mockServer.fetchBatch();
  }

  const response = await fetch(`${API_BRAVO_BASE_URL}/trades/batch?symbol=${SYMBOL}`);
  if (!response.ok) {
    throw new Error(`API Bravo request failed: ${response.status}`);
  }
  const data = await response.json();
  return data.trades as RestTradeMessage[];
}
