import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register PWA service worker with update detection and cache clearing
registerSW({ 
  immediate: true,
  onRegistered(r) {
    r && setInterval(() => {
      r.update();
    }, 60 * 60 * 1000); // Check for updates every hour
  },
  onNeedRefresh() {
    if (confirm('Nova versão disponível! Deseja atualizar agora para garantir o funcionamento das notificações?')) {
      // Clear old caches before reloading
      if ('caches' in window) {
        caches.keys().then(names => {
          for (let name of names) caches.delete(name);
        });
      }
      window.location.reload();
    }
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Adicione este código no final do seu arquivo principal de JavaScript
// Global Safety Net for Delete Actions (Requested by user)
window.addEventListener('click', (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  
  // Verifica se o que foi clicado é a lixeira (ou está dentro dela)
  // Check for .btn-lixeira class. We avoid checking raw 'svg' tag globally to prevent false positives on other icons.
  if (target.closest('.btn-lixeira')) {
    // Note: React components with e.stopPropagation() will prevent this from firing.
    // This acts as a backup for buttons that might miss the handler.
    
    // event.preventDefault();
    // event.stopPropagation();
    
    // Only show this if the event bubbles up (meaning React didn't catch it)
    console.log("Global handler caught delete click on .btn-lixeira");
    
    // Uncomment below if you want global confirmation
    // const confirmar = window.confirm("AVISO: Deseja apagar esta informação?");
    // if (confirmar) {
    //   console.log("Comando de exclusão executado com sucesso.");
    // }
  }
});
