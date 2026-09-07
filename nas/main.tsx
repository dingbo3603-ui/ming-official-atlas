import React from 'react';
import { createRoot } from 'react-dom/client';
import Home from '../app/page';
import '../app/globals.css';
import '../app/atlas-v3.css';
import '../app/council-v4.css';
import '../app/hierarchy-v5.css';
import '../app/mobile-v7.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><Home /></React.StrictMode>);
