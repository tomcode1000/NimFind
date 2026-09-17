import { nimiqIcons } from "../icons.generated";

interface IconData {
  width: number;
  height: number;
  body: string;
}

// Icons missing from the Nimiq set, drawn on the same 12 unit grid and stroke style.
const stroke = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.25"';
const customIcons = {
  laptop: { width: 12, height: 12, body: `<g ${stroke}><rect x="2" y="2.25" width="8" height="5.75" rx="1"/><path d="M.75 10h10.5"/></g>` },
  message: {
    width: 12,
    height: 12,
    body: `<path ${stroke} d="M2.5 1.75h7a1.75 1.75 0 0 1 1.75 1.75v4A1.75 1.75 0 0 1 9.5 9.25H5.5L2.75 11V9.25h-.25A1.75 1.75 0 0 1 .75 7.5v-4A1.75 1.75 0 0 1 2.5 1.75"/>`,
  },
  image: {
    width: 12,
    height: 12,
    body: `<g ${stroke}><rect x=".75" y="1.75" width="10.5" height="8.5" rx="1.5"/><path d="m.75 8.5 3-3 3.5 3.5M7 7.25l1.5-1.5 2.75 2.75"/><circle cx="8.25" cy="4.25" r=".6"/></g>`,
  },
  printer: {
    width: 12,
    height: 12,
    body: `<g ${stroke}><path d="M3 4.25V.75h6v3.5M3 8.75H1.75a1 1 0 0 1-1-1v-2.5a1 1 0 0 1 1-1h8.5a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1H9"/><path d="M3 6.75h6v4.5H3z"/></g>`,
  },
  calendar: {
    width: 12,
    height: 12,
    body: `<g ${stroke}><rect x=".75" y="1.75" width="10.5" height="9.5" rx="1.5"/><path d="M.75 4.75h10.5M3.5.75v2M8.5.75v2"/></g>`,
  },
  phone: {
    width: 12,
    height: 12,
    body: `<g ${stroke}><rect x="3" y=".75" width="6" height="10.5" rx="1.4"/><path d="M5.25 9h1.5"/></g>`,
  },
  keys: {
    width: 12,
    height: 12,
    body: `<g ${stroke}><circle cx="4" cy="8" r="2.75"/><path d="M5.95 6.05 10.75 1.25M8.4 3.6l1.5 1.5M9.8 2.2l1 1"/></g>`,
  },
  coins: {
    width: 12,
    height: 12,
    // A coin with the Nimiq hexagon inside.
    body: `<g ${stroke}><circle cx="6" cy="6" r="5.25"/><path d="M4.55 3.5h2.9L8.9 6 7.45 8.5h-2.9L3.1 6z"/></g>`,
  },
  tag: {
    width: 12,
    height: 12,
    body: `<g ${stroke}><path d="M6.4.75h4.1a.75.75 0 0 1 .75.75v4.1a.75.75 0 0 1-.22.53l-5 5a.75.75 0 0 1-1.06 0L1.47 7.63a.75.75 0 0 1 0-1.06l5-5A.75.75 0 0 1 6.4.75"/><circle cx="8.75" cy="3.25" r=".6"/></g>`,
  },
} satisfies Record<string, IconData>;

export type IconName = keyof typeof nimiqIcons | keyof typeof customIcons;

export function iconData(name: IconName): IconData {
  return (nimiqIcons as Record<string, IconData>)[name] ?? (customIcons as Record<string, IconData>)[name];
}
