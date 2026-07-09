import type { ReactNode } from "react";
import '../Styling/appTicker.less'
import { stockTxt } from '../Variables/GlobalVariables';

export interface TradeRow {
  id: string;
  timestamp: number;
  side: "buy" | "sell";
  price: number;
  size: number;
  seq: number;
}

export function formatSeq(seq: number): string {
  if (seq >= 0xc00) {
    return `0c${(seq & 0xff).toString(16).padStart(2, "0")}`;
  }
  return `0x${seq.toString().padStart(2, "0")}`;
}

interface TradeStreamCardProps {
  label: string;
  symbol: string;
  trades: TradeRow[];
  price: number | null;
  priceDirection: "up" | "down" | null;
  statusKey: string;
  statusLabel: string;
  secondaryMeta: ReactNode;
  className?: string;
  infoText?: ReactNode;
}

export default function TradeStreamCard({
  label,
  symbol,
  trades,
  price,
  priceDirection,
  statusKey,
  statusLabel,
  secondaryMeta,
  className,
  infoText,
}: TradeStreamCardProps) {
  return (
    <div className={`trade-stream-card${className ? ` ${className}` : ""}`}>
      <div className="trade-stream-header">
        <div>
          <div className="trade-stream-label">{label}</div>
          <div className="trade-stream-symbol">{symbol}</div>
          <div className="trade-stream-meta">{trades.length} trade{trades.length === 1 ? "" : "s"} recorded</div>
        </div>
        <div className="trade-stream-status">
          <span className={`status-dot status-${statusKey}`} />
          <span className="status-text">{statusLabel}</span>
        </div>
      </div>

      <div className={`trade-price ${priceDirection === "up" ? "price-up" : priceDirection === "down" ? "price-down" : "price-neutral"}`}>
        {price !== null ? `$${price.toFixed(2)}` : "—"}
      </div>
      <div className="trade-stream-meta" style={{ marginBottom: 16 }}>
        {secondaryMeta}
      </div>

      <div className="trade-tape">
        <div className="trade-tape-header">
          <span>{stockTxt.timeTxt}</span>
          <span>{stockTxt.sideTxt}</span>
          <span className="trade-price-cell">{stockTxt.priceTxt}</span>
          <span className="trade-price-cell">{stockTxt.sizeTxt}</span>
          <span className="trade-price-cell">{stockTxt.seqTxt}</span>
        </div>
        <div className="trade-tape-list">
          {trades.length === 0 && <div className="trade-empty">Waiting for trades…</div>}
          {trades.map((t) => (
            <div key={t.id} className="trade-row">
              <span className="trade-time">{new Date(t.timestamp).toLocaleTimeString([], { hour12: false })}</span>
              <span className={t.side === "buy" ? "trade-side-buy" : "trade-side-sell"}>{t.side.toUpperCase()}</span>
              <span className="trade-price-cell">${t.price.toFixed(2)}</span>
              <span className="trade-size">{t.size}</span>
              <span className="trade-price-cell">{formatSeq(t.seq)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="info-box">{infoText}</div>
    </div>
  );
}
