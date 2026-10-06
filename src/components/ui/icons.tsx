import * as React from 'react';

import { cn } from '@/lib/utils';

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, className, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', className)}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9.5l6 6 6-6" />
  </Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p} className={cn('flip-rtl', p.className)}>
    <path d="M9.5 6l6 6-6 6" />
  </Svg>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p} className={cn('flip-rtl', p.className)}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </Svg>
);

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 10.5L12 3.5l8.5 7" />
    <path d="M5.5 9.5V20h13V9.5" />
    <path d="M9.75 20v-5.5h4.5V20" />
  </Svg>
);

export const GridIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5.5h6.5V12H4zM13.5 5.5H20V12h-6.5zM4 14.5h6.5V21H4zM13.5 14.5H20V21h-6.5z" />
  </Svg>
);

export const LayersIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8 12 3.5z" />
    <path d="M4 12.5l8 4.25 8-4.25M4 16.5l8 4.25 8-4.25" />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </Svg>
);

export const BellIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 10a5.5 5.5 0 1111 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10z" />
    <path d="M10.2 18.5a2 2 0 003.6 0" />
  </Svg>
);

export const UserIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8.5" r="3.75" />
    <path d="M4.75 20c1.2-3.6 4-5.25 7.25-5.25S18 16.4 19.25 20" />
  </Svg>
);

export const BookIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5.5A1.5 1.5 0 015.5 4H11v16H5.5A1.5 1.5 0 014 18.5v-13z" />
    <path d="M20 5.5A1.5 1.5 0 0018.5 4H13v16h5.5a1.5 1.5 0 001.5-1.5v-13z" />
  </Svg>
);

export const WalletIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7.5A2.5 2.5 0 016.5 5H18a1.5 1.5 0 011.5 1.5v1" />
    <path d="M4 7.5v10A2.5 2.5 0 006.5 20H19a1 1 0 001-1v-2.5" />
    <path d="M4 7.5A2.5 2.5 0 006.5 5" />
    <path d="M20 10.5h-3.5a1.75 1.75 0 000 3.5H20z" />
  </Svg>
);

export const LifeBuoyIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3.5" />
    <path d="M6 6l3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5" />
  </Svg>
);

export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="2.75" />
    <path d="M12 3.5l1.2 2.1 2.4-.5.6 2.4 2.2 1.1-1 2.2 1 2.2-2.2 1.1-.6 2.4-2.4-.5L12 20.5l-1.2-2.1-2.4.5-.6-2.4-2.2-1.1 1-2.2-1-2.2L7.8 5.5l.6-2.4 2.4.5z" />
  </Svg>
);

export const LogOutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 5.5H6.5A1.5 1.5 0 005 7v10a1.5 1.5 0 001.5 1.5H14" />
    <path d="M16.5 8.5l3.5 3.5-3.5 3.5M20 12h-9" />
  </Svg>
);

export const SunIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
  </Svg>
);

export const MoonIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 13.5A8 8 0 1110.5 4a6.5 6.5 0 009.5 9.5z" />
  </Svg>
);

export const MonitorIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="11" rx="1.5" />
    <path d="M9 20h6M12 16v4" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

export const CheckCircleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12.2l2.4 2.4 4.6-4.8" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.5l8.5 15h-17l8.5-15z" />
    <path d="M12 10v4M12 17h.01" />
  </Svg>
);

export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const PlayIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5.5l10 6.5-10 6.5z" />
  </Svg>
);

export const FileIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.5 3.5H7A1.5 1.5 0 005.5 5v14A1.5 1.5 0 007 20.5h10a1.5 1.5 0 001.5-1.5V8.5z" />
    <path d="M13.5 3.5V8.5h5" />
  </Svg>
);

export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v10M8 10.5l4 4 4-4" />
    <path d="M5 18.5h14" />
  </Svg>
);

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5l7 2.5v6c0 4-3 7.5-7 8.5-4-1-7-4.5-7-8.5V6z" />
    <path d="M9 12l2.2 2.2L15.5 10" />
  </Svg>
);

export const DeviceIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6.5" y="3" width="11" height="18" rx="2" />
    <path d="M10.5 18h3" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 6.5h15M9 6.5V4.5h6v2M6.5 6.5L7.5 20h9l1-13.5" />
  </Svg>
);

export const PencilIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 19.5l4-1 10-10a2 2 0 000-3l0 0a2 2 0 00-3 0l-10 10z" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const FilterIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </Svg>
);

export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5.5" width="16" height="15" rx="1.5" />
    <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
  </Svg>
);

export const AwardIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="9" r="5" />
    <path d="M8.5 13.5L7 21l5-2.5L17 21l-1.5-7.5" />
  </Svg>
);

export const TicketIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8.5A1.5 1.5 0 005.5 7h13A1.5 1.5 0 0120 8.5v1.8a2 2 0 000 3.4v1.8a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 15.5v-1.8a2 2 0 000-3.4V8.5z" />
    <path d="M13 7v10" strokeDasharray="2 2" />
  </Svg>
);

export const EyeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="1.5" />
    <path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" />
  </Svg>
);

export const GlobeIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.2 2.4 3.3 5.4 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.4-3.3-8.5S9.8 5.9 12 3.5z" />
  </Svg>
);

export const PaletteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5a8.5 8.5 0 000 17c1.2 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.8-1.7H16a4.5 4.5 0 004.5-4.5c0-3.6-3.8-6.7-8.5-6.7z" />
    <circle cx="8" cy="10" r="1" />
    <circle cx="11" cy="7.5" r="1" />
    <circle cx="15" cy="8.5" r="1" />
  </Svg>
);

export const MessageIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12.5c0 3.6-3.6 6.5-8 6.5-1 0-2-.15-2.9-.45L4.5 20l1.2-3.4A6.4 6.4 0 014 12.5C4 8.9 7.6 6 12 6s8 2.9 8 6.5z" />
  </Svg>
);

export const SendIcon = (p: IconProps) => (
  <Svg {...p} className={cn('flip-rtl', p.className)}>
    <path d="M4 12l16-8-6 16-2.5-6z" />
  </Svg>
);

export const TrendingUpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 16.5l5.5-5.5 3.5 3.5L20 7.5" />
    <path d="M15 7.5h5v5" />
  </Svg>
);

export const TrendDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7.5l5.5 5.5 3.5-3.5L20 16.5" />
    <path d="M15 16.5h5v-5" />
  </Svg>
);

export const CreditCardIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
    <path d="M3.5 10h17" />
  </Svg>
);

export const HistoryIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 108-8 7.9 7.9 0 00-6 2.6L4 8.5" />
    <path d="M4 4.5v4h4" />
    <path d="M12 8v4.5l3 1.75" />
  </Svg>
);

export const InboxIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 13.5L6 5.5h12l2 8" />
    <path d="M4 13.5h4l1 2.5h6l1-2.5h4v4A1.5 1.5 0 0118.5 19h-13A1.5 1.5 0 014 17.5z" />
  </Svg>
);

export const KeyIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="12" r="4" />
    <path d="M12 12h9M17.5 12v3M20 12v2.5" />
  </Svg>
);

export const PhoneIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 006 6l1.5-2 4 1.5v3a1.5 1.5 0 01-1.7 1.5C11 18.5 5.5 13 4.6 5.2A1.5 1.5 0 016.5 3.5z" />
  </Svg>
);