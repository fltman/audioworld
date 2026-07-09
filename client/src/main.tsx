import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register the offline service worker (harmless in dev — it only ever serves the map
// tiles + audio a user explicitly downloaded, never the app shell). Secure contexts
// only, since service workers require HTTPS or localhost.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline packs just won't be available */
    });
  });
}
