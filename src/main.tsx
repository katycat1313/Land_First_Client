import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
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

