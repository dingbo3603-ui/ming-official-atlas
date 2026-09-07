import { useEffect, useSyncExternalStore } from 'react';

export const PHONE_LAYOUT_QUERY = '(max-width: 767px), (max-width: 1023px) and (pointer: coarse)';
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(PHONE_LAYOUT_QUERY);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
export function usePhoneLayout() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_LAYOUT_QUERY).matches, () => false);
}

/** Keep full-screen sheets inside the visible area when a software keyboard opens. */
export function usePhoneViewport(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      // Leave pinch zoom under browser control.
      if (viewport.scale !== 1) return;
      root.style.setProperty('--phone-visible-height', `${viewport.height}px`);
      root.style.setProperty('--phone-visible-top', `${viewport.offsetTop}px`);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      root.style.removeProperty('--phone-visible-height');
      root.style.removeProperty('--phone-visible-top');
    };
  }, [enabled]);
}
