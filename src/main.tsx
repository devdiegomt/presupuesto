import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { installSyncHooks } from './db/hooks';
import './styles/tokens.css';

// Antes de montar: los hooks son los que mantienen updatedAt y los tombstones,
// y una escritura que ocurra sin ellos instalados queda invisible para el sync.
installSyncHooks();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
