import React from 'react';
import ReactDOM from 'react-dom/client';
import * as jsxRuntime from 'react/jsx-runtime';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { FeaturesProvider } from './context/FeaturesContext';
import App from './App';
import './i18n';
import './index.css';

// Expose React globally for plugin ESM modules (shim pattern)
(window as any).React = React;
(window as any).ReactDOM = ReactDOM;
(window as any)._jsx_runtime = jsxRuntime;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <FeaturesProvider>
          <App />
        </FeaturesProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
