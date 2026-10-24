/** Ilustrações dos pratos (as mesmas da landing da MESVIO). */
export function Burger({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size}>
      <path d="M9 22c0-7 6.7-12 15-12s15 5 15 12Z" fill="#e0a45a" stroke="#9a5b22" strokeWidth="1.4" strokeLinejoin="round" />
      <ellipse cx="18" cy="15.5" rx="1" ry=".6" fill="#fff4dc" />
      <ellipse cx="24" cy="13.5" rx="1" ry=".6" fill="#fff4dc" />
      <ellipse cx="29.5" cy="16" rx="1" ry=".6" fill="#fff4dc" />
      <path d="M8 23.5c2.5 2 4.5-1.2 7 .6s4.5-1.6 7 .4 4.5-1.4 7 .4 4.5-1.2 7 .4 3.6-.8 4-1.8" fill="none" stroke="#3fa34d" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 26.5h28l-3 3.5-3-2.5-3 2.5-3-2.5-3 2.5-3-2.5-3 2.5Z" fill="#f4c542" />
      <rect x="9" y="28.5" width="30" height="5.5" rx="2.75" fill="#6b3a22" />
      <path d="M10 35.5h28c0 2.5-2 4.5-4.5 4.5h-19c-2.5 0-4.5-2-4.5-4.5Z" fill="#e0a45a" stroke="#9a5b22" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function Mojito({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size}>
      <path d="M27 6 23.5 30" stroke="#062d25" strokeWidth="2" strokeLinecap="round" />
      <circle cx="33" cy="15" r="5" fill="#b9e36b" stroke="#86b52c" strokeWidth="1.2" />
      <path d="M33 10.8v8.4M28.8 15h8.4" stroke="#86b52c" strokeWidth=".7" />
      <path d="M13 14h22l-2.6 25a3 3 0 0 1-3 2.7H18.6a3 3 0 0 1-3-2.7Z" fill="#ffffff" stroke="#062d25" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14.3 21h19.4l-2 18.2a2 2 0 0 1-2 1.8H18.3a2 2 0 0 1-2-1.8Z" fill="#e6f7d9" />
      <rect x="17.5" y="23" width="5" height="5" rx="1.2" fill="#ffffff" transform="rotate(-10 20 25.5)" />
      <rect x="24.5" y="27" width="5" height="5" rx="1.2" fill="#ffffff" transform="rotate(12 27 29.5)" />
      <path d="M19 33.5c1.8-2.6 4.6-2.8 6.2-1.4-1.6 2.6-4.4 2.9-6.2 1.4Z" fill="#3fa34d" />
      <path d="M24.5 36c1.4-2 3.6-2.2 4.8-1-1.2 2-3.4 2.2-4.8 1Z" fill="#5cbf68" />
    </svg>
  );
}

export function Acai({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size}>
      <path d="M8 24c1-6.5 7.8-10 16-10s15 3.5 16 10Z" fill="#4a1f5c" />
      <circle cx="13.5" cy="21.5" r="1.7" fill="#c98f4a" />
      <circle cx="17" cy="19" r="1.5" fill="#d9a35e" />
      <circle cx="23" cy="17.5" r="3.2" fill="#f6e3a1" stroke="#e4c56b" strokeWidth=".8" />
      <circle cx="28.5" cy="20.5" r="2.8" fill="#f6e3a1" stroke="#e4c56b" strokeWidth=".8" />
      <circle cx="33.5" cy="17.5" r="2.2" fill="#d6304f" />
      <circle cx="19.5" cy="21.5" r="1.8" fill="#3a5bc7" />
      <path d="M7 24c0 9.5 7.6 16 17 16s17-6.5 17-16Z" fill="#ffffff" stroke="#062d25" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
