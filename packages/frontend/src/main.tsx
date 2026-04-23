import React from 'react';
import ReactDOM from 'react-dom/client';
import * as jsxRuntime from 'react/jsx-runtime';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { FeaturesProvider } from './context/FeaturesContext';
import { BackendGate } from './context/BackendGate';
import App from './App';
import LoadingScreen from './components/LoadingScreen';
import './i18n';
import './index.css';

// Expose React globally for plugin ESM modules (shim pattern)
(window as any).__OSCARR_REACT__ = React;
(window as any).__OSCARR_REACT_DOM__ = ReactDOM;
(window as any).__OSCARR_JSX_RUNTIME__ = jsxRuntime;

ReactDOM.createRoot(document.getElementById('root')!).render(
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
