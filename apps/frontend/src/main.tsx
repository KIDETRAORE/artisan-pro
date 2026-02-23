import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { UserProvider } from './context/user.context'; 
// On ne garde que l'import du store si nécessaire, mais on retire AuthProvider
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      {/* Si tu utilises Zustand pour l'auth, tu n'as pas besoin de Wrapper ici. 
          Le UserProvider suffit si tes données artisan y sont stockées.
      */}
      <UserProvider>
        <App />
      </UserProvider>
    </BrowserRouter>
  </React.StrictMode>
);