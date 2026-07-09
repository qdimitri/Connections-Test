# Connections Test — Mock Trading Feed Reconciliation

Mock trading data feed demo. Using a WebSocket stream with a polled REST feed to backfull data loss on bad connections.

## Running the project

```
npm install
npm run dev
```

Open local URL Vite prints in the terminal (e.g. `http://localhost:5173`).

maxTrades set to 50 in (`GlobalVariables.ts`) and can be adjusted to view more simulated trades with drops.

## What is `AmcMockWebSock` doing?

Simulates a live WebSocket trade feed (`MockAlphaSocket`). It pushes trades out in real time as they happen, but randomly disconnects every so often and has to reconnect — just like a real WebSocket would. Because of this, it can miss trades while it's disconnected.

## What is `AmcMockRest` doing?

Simulates a REST API you poll every couple of seconds (`MockBravoRest`). It never drops a trade whenever it is polled, it hands back everything that's happened since your last poll and also randomly adds trades that are not present in 'AmcMockWebSock'.

## AmcTradeStreamMain functions

`AmcTradeStreamMain` combines both: it uses the live socket for real-time updates and the REST poll to catch up on anything the socket missed while disconnected, matching trades between the two sources by their sequence number and adding by time stamp.


## Redundancies

AmcTradeStreamA and AmcTradeStreamB only exist as a visual indicator of what is happening with the mock data from each respective feed -- and to compare with the unified `AmcTradeStreamMain` feed. 