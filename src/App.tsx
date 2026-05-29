import { useEffect } from 'react'
import { Canvas } from './ui/Canvas'
import { useStore } from './store/useStore'
import './App.css'

function App() {
  const hydrate = useStore((s) => s.hydrate)
  const status = useStore((s) => s.status)

  // Load the persisted base on startup (seeds a root thought if empty).
  useEffect(() => {
    void hydrate()
  }, [hydrate])

  if (status === 'loading') {
    return <div className="app-loading">Loading…</div>
  }

  return <Canvas />
}

export default App
