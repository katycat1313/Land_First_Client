import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global fetch interceptor to automatically inject X-App-Password for relative API requests
const originalFetch = window.fetch;
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const urlStr = typeof input === 'string' 
    ? input 
    : (input instanceof URL ? input.href : (input as Request).url);
  
  if (urlStr.startsWith('/api/') || urlStr.includes('/api/')) {
    const pwd = localStorage.getItem('app_password') || '';
    if (pwd) {
      init = init || {};
      const headers = new Headers(init.headers || {});
      if (!headers.has('x-app-password')) {
        headers.set('x-app-password', pwd);
      }
      init.headers = headers;
    }
  }
  return originalFetch(input, init);
};

import { getOrCreateScriptPolicy, safelyExecuteScript } from './utils/trustedTypes';

// Pre-initialize our secure Trusted Types policy
getOrCreateScriptPolicy();

// Execute a clean, trusted initialization log to verify the policy is fully operational
try {
  const initScript = safelyExecuteScript("console.log('Opportunity Radar secure context verified via Trusted Types.');");
  document.head.appendChild(initScript);
} catch (err) {
  console.warn('Trusted Types initialization validation completed with warnings:', err);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

