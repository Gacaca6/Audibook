import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
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

// Ask the browser to protect our storage (books + generated audio) from eviction
if (navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {});
}

// Register Service Worker for PWA support (production only — caching breaks Vite dev HMR)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', window.location.href).pathname)
      .then((registration) => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch((err) => {
        console.log('ServiceWorker registration failed: ', err);
      });
  });
}

