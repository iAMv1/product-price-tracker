import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { beaconDeploymentUsage } from './lib/usageBeacon';
import './index.css';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('Root element #root is missing from index.html');
}

// Code provenance: a clone carries this marker in its console.
console.info('Product Price Tracker - built by iAMv1 (https://github.com/iAMv1/product-price-tracker)');

beaconDeploymentUsage();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
