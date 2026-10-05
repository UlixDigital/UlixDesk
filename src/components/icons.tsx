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

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="6.25" />
      <path strokeLinecap="round" d="M16 16.5 20 20.5" />
    </svg>
  );
}
