import type React from 'react';
export type IconName =
  | 'home'
  | 'user'
  | 'extensions'
  | 'settings'
  | 'bell'
  | 'logs'
  | 'search'
  | 'arrow'
  | 'play'
  | 'refresh'
  | 'power'
  | 'check'
  | 'folder'
  | 'chevron'
  | 'chevron-left'
  | 'close'
  | 'minus'
  | 'square'
  | 'command'
  | 'keyboard'
  | 'touchpad'
  | 'mouse'
  | 'terminal'
  | 'bolt'
  | 'lock'
  | 'globe'
  | 'mail'
  | 'clock'
  | 'image'
  | 'sun'
  | 'moon'
  | 'calendar'
  | 'star'
  | 'heart'
  | 'file'
  | 'palette'
  | 'link'
  | 'external-link'
  | 'download'
  | 'upload'
  | 'music'
  | 'volume'
  | 'video'
  | 'edit'
  | 'trash'
  | 'info'
  | 'help';
const playIcon = <path d="m7 4 13 8-13 8Z" />;
const paths: Record<IconName, React.ReactNode> = {
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.4-3.4 1.5 1.5 0 0 1 1.1-2.6H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9Z" />
      <circle cx="7.5" cy="10" r=".8" />
      <circle cx="10.5" cy="6.5" r=".8" />
      <circle cx="15" cy="7.5" r=".8" />
      <circle cx="17.5" cy="11" r=".8" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4m10-4v4M3 11h18M7 15h2m3 0h2m3 0h1M7 18h2m3 0h2" />
    </>
  ),
  star: <path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" />,
  heart: (
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
  ),
  file: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M7.5 8h9m-9 4h9m-9 4h6" />
    </>
  ),
  link: (
    <>
      <path d="m10 13 4-4m-5 7-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 0 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" />
    </>
  ),
  'external-link': <path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7" />,
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6" />,
  upload: <path d="M12 15V3m-5 5 5-5 5 5M4 15v6h16v-6" />,
  music: (
    <>
      <path d="M9 18V5l12-3v13M9 9l12-3" />
      <ellipse cx="6" cy="18" rx="3" ry="3" />
      <ellipse cx="18" cy="15" rx="3" ry="3" />
    </>
  ),
  volume: (
    <>
      <path d="m11 3-6 5H2v8h3l6 5Zm4 5a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
    </>
  ),
  video: (
    <>
      <rect x="2" y="5" width="14" height="14" rx="2" />
      <path d="m16 10 6-4v12l-6-4" />
    </>
  ),
  edit: (
    <>
      <path d="m16 3 5 5-12 12-6 1 1-6ZM13 6l5 5" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10v.1" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 8a3 3 0 0 1 6 0c0 3-3 2-3 5m0 4v.1" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 22v-3a8 8 0 0 1 16 0v3" />
    </>
  ),
  home: (
    <>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
    </>
  ),
  extensions: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <path d="m17 2 5 5-5 5-5-5Z" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="3" />
      <circle cx="16" cy="17" r="3" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
      <path d="M10 21h4" />
    </>
  ),
  logs: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="m7 9 3 3-3 3m6 0h4" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14m-5-5 5 5-5 5" />
    </>
  ),
  play: playIcon,
  refresh: (
    <>
      <path d="M20 8a8 8 0 1 0 .3 7M20 3v5h-5" />
    </>
  ),
  power: <path d="M12 2v10M6.3 5.7a9 9 0 1 0 11.4 0" />,
  check: <path d="m5 12 4 4L19 6" />,
  folder: <path d="M3 7V5a1 1 0 0 1 1-1h6l2 3h8a1 1 0 0 1 1 1v11H3Z" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  'chevron-left': <path d="m15 5-7 7 7 7" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  minus: <path d="M5 12h14" />,
  square: <rect x="6" y="6" width="12" height="12" rx="1" />,
  command: playIcon,
  touchpad: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 14h18M12 14v5" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10" />
    </>
  ),
  mouse: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="6" />
      <path d="M12 6v4" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M3 8h18m-14 4 3 2-3 2m6 0h4" />
    </>
  ),
  bolt: <path d="m14 2-10 12h7l-1 8L20 10h-7l1-8Z" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V6a4 4 0 0 1 8 0v4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6l4 2" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8" cy="8" r="1" />
      <path d="m3 17 5-5 4 4 4-6 5 7" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" />
    </>
  ),
  moon: <path d="M20 15A9 9 0 0 1 9 4 9 9 0 1 0 20 15Z" />,
};
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
