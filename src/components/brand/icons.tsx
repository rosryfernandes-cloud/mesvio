/** Ícones de traço (24×24, traço 1.75, pontas redondas) desenhados para a MESVIO: um só estilo em todo o lado. */
type IconProps = { className?: string };

function Icon({ className = "size-6", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconScan = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
    <path d="M9 12a3 3 0 0 1 3-3M7 12a5 5 0 0 1 5-5" />
    <circle cx="12" cy="12" r="1" />
  </Icon>
);
export const IconMenu = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6" y="3" width="12" height="18" rx="2.5" />
    <path d="M9.5 8h5M9.5 11.5h5M9.5 15h3" />
  </Icon>
);
export const IconSend = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 4 10.5 13.5M20 4l-6 16-3.5-6.5L4 10l16-6Z" />
  </Icon>
);
export const IconTray = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 16h16M5 16a7 7 0 0 1 14 0M12 9V7M10 7h4M3 19h18" />
  </Icon>
);
export const IconNoApp = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6" y="3" width="12" height="18" rx="2.5" />
    <path d="M11 18h2M9.5 10.5l1.75 1.75L14.5 9" />
  </Icon>
);
export const IconClock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);
export const IconGrid = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </Icon>
);
export const IconPlug = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 3v4M15 3v4M7 7h10v3a5 5 0 0 1-10 0V7ZM12 15v6" />
  </Icon>
);
export const IconPulse = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
  </Icon>
);
export const IconSmile = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 14a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
  </Icon>
);
export const IconArrow = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);
export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);
