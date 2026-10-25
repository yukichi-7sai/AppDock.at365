import { createRoot } from 'react-dom/client';
import { OverlayApp } from './OverlayApp';
import './overlay.css';
import './palette.css';

createRoot(document.getElementById('root')!).render(<OverlayApp />);
