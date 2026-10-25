import { useEffect, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { GestureIndicatorFrame } from '../../shared/gesture-indicator';
import { GestureIndicatorView } from './GestureIndicatorView';
import '../settings-ui/controls.css';
import './window.css';
function Indicator() {
  const [frame, setFrame] = useState<GestureIndicatorFrame>({ sequence: 0, model: null });
  useEffect(() => {
    const receive = (next: GestureIndicatorFrame) =>
      setFrame((current) => (next.sequence >= current.sequence ? next : current));
    const stop = window.appdockGestureIndicator.onChanged(receive);
    void window.appdockGestureIndicator
      .connect()
      .then(receive)
      .catch(() => {});
    return stop;
  }, []);
  useLayoutEffect(() => {
    const content = document.querySelector('.gesture-preview-indicator');
    if (!frame.model || !content) return;
    const bounds = content.getBoundingClientRect();
    window.appdockGestureIndicator.measured(
      frame.sequence,
      Math.ceil(bounds.width),
      Math.ceil(bounds.height),
    );
  }, [frame]);
  return frame.model ? <GestureIndicatorView model={frame.model} /> : null;
}
createRoot(document.getElementById('root')!).render(<Indicator />);
