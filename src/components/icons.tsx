import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    "aria-hidden": true as const,
    ...props,
  };
}

export function BuildingIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 20.25h16M6 20.25V5.75A1.25 1.25 0 0 1 7.25 4.5h6.5A1.25 1.25 0 0 1 15 5.75v14.5M15 20.25v-8.5A1.25 1.25 0 0 1 16.25 10.5H18.5A1.25 1.25 0 0 1 19.75 11.75v8.5M8.25 8.25h.01M8.25 11.25h.01M8.25 14.25h.01M11.25 8.25h.01M11.25 11.25h.01M11.25 14.25h.01"
      />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path strokeLinecap="round" d="M12 5.5v13M5.5 12h13" />
    </svg>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 7.75A1.75 1.75 0 0 1 5.5 6h3.9c.4 0 .79.16 1.07.45l1.16 1.2c.28.29.67.45 1.07.45h5.8A1.75 1.75 0 0 1 20.25 9.85v7.4a1.75 1.75 0 0 1-1.75 1.75h-13A1.75 1.75 0 0 1 3.75 17.25v-9.5Z"
      />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="6.25" />
      <path strokeLinecap="round" d="M16 16.5 20 20.5" />
    </svg>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="8.25" cy="15" r="3.25" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11 13.25 19.25 5M16.25 8l2.25 2.25M14 10.25l2.25 2.25"
      />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 20.25v-1.5A2.75 2.75 0 0 0 13.25 16h-6.5A2.75 2.75 0 0 0 4 18.75v1.5M10 12.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5ZM20 20.25v-1.5A2.75 2.75 0 0 0 17.25 16M16.5 5.9a3.25 3.25 0 0 1 0 6.2"
      />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.25" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.75V12l2.75 2" />
    </svg>
  );
}

export function DocumentIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 3.75h6.2L18.25 8.3V20.25H7.5A1.75 1.75 0 0 1 5.75 18.5V5.5A1.75 1.75 0 0 1 7.5 3.75Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 3.9V8.4h4.5M8.75 12.25h6.5M8.75 15.75h6.5" />
    </svg>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.75 19.25h14.5M7 16.5v-4.25M12 16.5V7.75M17 16.5v-7.5" />
    </svg>
  );
}

export function HistoryIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.75 12a7.25 7.25 0 1 0 2.12-5.13M4.75 4.75v4.5h4.5"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25V12l2.25 1.5" />
    </svg>
  );
}
