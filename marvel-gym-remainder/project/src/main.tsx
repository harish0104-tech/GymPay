import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
// Retire workers from the previous backend-enabled version.
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) {
      if (registration.scope === new URL('/', window.location.href).href) void registration.unregister();
    }
  });
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
