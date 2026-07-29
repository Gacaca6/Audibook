import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import {registerServiceWorker} from './lib/swUpdate.ts';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// If the app crashes before React mounts, don't leave the splash spinning forever
window.addEventListener('error', () => {
  const splash = document.getElementById('splash');
  if (splash && document.getElementById('root')?.childElementCount === 0) {
    splash.classList.add('splash-out');
    setTimeout(() => splash.remove(), 700);
  }
});

// Ask the browser to protect our storage (books + downloaded audio) from eviction
if (navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {});
}

// PWA support (production only — SW caching breaks Vite dev HMR)
registerServiceWorker();
