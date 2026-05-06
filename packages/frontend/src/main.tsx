import React from 'react';
import * as ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import * as jsxRuntime from 'react/jsx-runtime';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { FeaturesProvider } from './context/FeaturesContext';
import { BackendGate } from './context/BackendGate';
import App from './App';
import LoadingScreen from './components/LoadingScreen';
import './i18n';
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import './index.css';

// Expose React globally for plugin ESM modules (shim pattern). `react-dom/client` only carries
// createRoot/hydrateRoot — plugins that import { createPortal, flushSync } from 'react-dom'
// need the full namespace, so __OSCARR_REACT_DOM__ exposes that, not the client subpath.
(globalThis as any).__OSCARR_REACT__ = React;
(globalThis as any).__OSCARR_REACT_DOM__ = ReactDOM;
(globalThis as any).__OSCARR_JSX_RUNTIME__ = jsxRuntime;

// Auto-reload when a new service worker takes control of the page. Combined with workbox's
// skipWaiting + clientsClaim, this means a deploy reaches every open tab without a hard
// refresh. The `hadController` guard suppresses the spurious reload that would otherwise
// fire on first install (controller goes null → SW once, naturally).
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    globalThis.location.reload();
  });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <BackendGate fallback={<LoadingScreen />}>
        <AuthProvider>
          <FeaturesProvider>
            <App />
          </FeaturesProvider>
        </AuthProvider>
      </BackendGate>
    </BrowserRouter>
  </React.StrictMode>
);
