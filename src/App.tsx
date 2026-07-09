import './App.less'
import AmcTradeStreamA from './WebCalls/AmcTradeStreamA'
import AmcTradeStreamB from "./WebCalls/AmcTradeStreamB";
import AmcTradeStreamMain from "./WebCalls/AmcTradeStreamMain";

function App() {
  return (
    <main className="app-shell">
      <AmcTradeStreamA />
      <AmcTradeStreamMain />
      <AmcTradeStreamB />
    </main>
  )
}

export default App
