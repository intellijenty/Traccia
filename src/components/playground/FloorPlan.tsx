import React from "react";

/* ── Theme tokens ──────────────────────────────────────────────── */
const C = {
  surface: "#0C0D0F",
  room: "#0F1012",
  text: "#ECECEE",
  muted: "#7E828C",
  line: "rgba(255,255,255,0.07)",
  line2: "rgba(255,255,255,0.12)",
};

/* ── Icons (Hugeicons, 24px stroke) ────────────────────────────── */
const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const HotelIcon = (p) => (
  <svg {...svgProps} {...p}>
    <path d="M3 7V18C3 19.8856 3 20.8284 3.58579 21.4142C4.17157 22 5.11438 22 7 22H17C18.8856 22 19.8284 22 20.4142 21.4142C21 20.8284 21 19.8856 21 18V7" />
    <path d="M17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7" />
    <path d="M14 22.0001L14 18C14 16.8954 13.1046 16 12 16C10.8954 16 10 16.8954 10 18V22.0001" />
    <path d="M9 3H4.47214C4.16165 3 3.84734 3.08209 3.59811 3.32898C2.85619 4.06395 2.4281 5.28762 2 7H7M15 3H19.5279C19.8384 3 20.1527 3.08209 20.4019 3.32898C21.1438 4.06395 21.5719 5.28762 22 7H17" />
    <path d="M6 11H6.5M6 14.5H6.5" />
    <path d="M17.5 11H18M17.5 14.5H18" />
    <path d="M10.5 8V9.5M10.5 11V9.5M13.5 8V9.5M13.5 11V9.5M10.5 9.5H13.5" />
  </svg>
);

const DoorIcon = (p) => (
  <svg {...svgProps} {...p}>
    <path d="M5 22V8C5 5.17157 5 3.75736 5.87868 2.87868C6.75736 2 8.17157 2 11 2H13C15.8284 2 17.2426 2 18.1213 2.87868C19 3.75736 19 5.17157 19 8V22" />
    <path d="M3 22H21" />
    <path d="M15.125 12H15M15.25 12C15.25 12.1381 15.1381 12.25 15 12.25C14.8619 12.25 14.75 12.1381 14.75 12C14.75 11.8619 14.8619 11.75 15 11.75C15.1381 11.75 15.25 11.8619 15.25 12Z" />
  </svg>
);

const CodeIcon = (p) => (
  <svg {...svgProps} {...p}>
    <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" />
    <path d="M9.5 9.5L7.96682 10.8215C7.32228 11.377 7 11.6548 7 12C7 12.3452 7.32227 12.623 7.96682 13.1785L9.5 14.5" />
    <path d="M14.5 9.5L16.0332 10.8215C16.6777 11.377 17 11.6548 17 12C17 12.3452 16.6777 12.623 16.0332 13.1785L14.5 14.5" />
  </svg>
);

const CoffeeIcon = (p) => (
  <svg {...svgProps} {...p}>
    <path d="M18.2505 10.5H19.6403C21.4918 10.5 22.0421 10.7655 21.9975 12.0838C21.9237 14.2674 20.939 16.8047 17 17.5" />
    <path d="M5.94627 20.6145C2.57185 18.02 2.07468 14.3401 2.00143 10.5001C1.96979 8.8413 2.45126 8.5 4.65919 8.5H15.3408C17.5487 8.5 18.0302 8.8413 17.9986 10.5001C17.9253 14.3401 17.4281 18.02 14.0537 20.6145C13.0934 21.3528 12.2831 21.5 10.9194 21.5H9.08064C7.71686 21.5 6.90658 21.3528 5.94627 20.6145Z" />
    <path d="M11.3089 2.5C10.7622 2.83861 10.0012 4 10.0012 5.5M7.53971 4C7.53971 4 7 4.5 7 5.5M14.0012 4C13.7279 4.1693 13.5 5 13.5 5.5" />
  </svg>
);

/* ── Data ──────────────────────────────────────────────────────── */
const ROOMS = [
  { name: "HR Office", Icon: HotelIcon },
  { name: "Reception", Icon: DoorIcon },
  { name: "Developer Room", Icon: CodeIcon },
  { name: "Cafeteria", Icon: CoffeeIcon },
];

// One gate sits on the wall between each pair of adjacent rooms.
const GATES = [
  { label: "Gate 1", Icon: HotelIcon },
  { label: "Gate 2", Icon: CodeIcon },
  { label: "Gate 3", Icon: CoffeeIcon },
];

/* ── Component ─────────────────────────────────────────────────── */
// Size it via `className`, e.g. <FloorPlan className="w-full max-w-md" />
// compact=true: tighter spacing for narrow sidebars
export default function FloorPlan({ className = "w-full max-w-xl", compact = false }) {
  const roomPy    = compact ? "py-3.5"  : "py-10"
  const roomPl    = compact ? "pl-27"  : "pl-32"
  const roomPr    = compact ? "pr-3"   : "pr-6"
  const roomGap   = compact ? "gap-3"  : "gap-5"
  const iconSize  = compact ? 28       : 48
  const iconInner = compact ? 14       : 24
  const iconRound = compact ? "rounded-lg" : "rounded-xl"
  const nameFz    = compact ? 12       : 17
  const gateLeft  = compact ? 14       : 32
  const gateH     = compact ? 26       : 30
  const gateTop   = compact ? -11      : -15
  const gateIconW = compact ? 13       : 15
  const gateFz    = compact ? 10       : 11

  return (
    <div
      className={`flex flex-col overflow-hidden ${className}`}
      style={{
        background: C.surface,
        color: C.text,
        borderRadius: compact ? 12 : 18,
        border: `1px solid ${C.line}`,
        boxShadow: compact ? "none" : "0 25px 50px -12px rgba(0,0,0,0.6)",
      }}
    >
      {/* window header */}
      <div
        className="flex h-7 items-center justify-between px-4"
        style={{ borderBottom: `1px solid ${C.line}`, background: "rgba(255,255,255,0.012)" }}
      >
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((d) => (
            <span key={d} className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.10)" }} />
          ))}
        </div>
        <span className="font-mono tracking-wider" style={{ fontSize: 10, color: C.muted }}>
          Gate References
        </span>
        <span className="w-12" />
      </div>

      {ROOMS.map(({ name, Icon }, i) => (
        <React.Fragment key={name}>
          {/* room */}
          <div className={`flex flex-1 items-center ${roomGap} ${roomPl} ${roomPr} ${roomPy}`}>
            <div
              className={`flex shrink-0 items-center justify-center ${iconRound}`}
              style={{ width: iconSize, height: iconSize, background: C.room, border: `1px solid ${C.line2}` }}
            >
              <Icon style={{ width: iconInner, height: iconInner }} />
            </div>
            <span className="font-medium" style={{ fontSize: nameFz }}>{name}</span>
          </div>

          {/* wall + gate */}
          {i < GATES.length && (
            <div className="relative h-px shrink-0" style={{ background: C.line2 }}>
              <div
                className="absolute flex items-center gap-2 rounded-lg pl-2 pr-3"
                style={{ top: gateTop, left: gateLeft, height: gateH, background: C.room, border: `1px solid ${C.line2}` }}
              >
                {React.createElement(GATES[i].Icon, { style: { width: gateIconW, height: gateIconW } })}
                <span className="font-mono tracking-wide" style={{ fontSize: gateFz, lineHeight: 1, whiteSpace: "nowrap" }}>
                  {GATES[i].label}
                </span>
              </div>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
