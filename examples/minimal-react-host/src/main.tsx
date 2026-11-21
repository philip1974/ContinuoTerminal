import { createRoot } from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';

import { App } from './App';

// Intentionally not wrapping in <React.StrictMode> for this minimal host:
// the mock adapter creates a session on mount, and StrictMode double-invokes
// the effect during dev. Production hosts should add a ref guard if needed.
const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('main.tsx: #root element missing in index.html');
}

createRoot(rootEl).render(<App />);
