import { forwardRef, type ReactNode } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Spotifood's own icons, "Kashi" (کاشی): drawn on the geometry of Persian tilework. Straight
 * strokes with square ends and sharp joins, octagons and eight-pointed stars where other sets
 * use circles, and on some icons a small diamond in the tile colour (`--kashi-dot`, the text
 * colour by default). Each takes the same props as the library icons it replaces.
 */

/** Points of a regular octagon (flat sides up), as an SVG path. */
function oct(cx: number, cy: number, r: number) {
  const a = r * 0.4142;
  const p = [
    [cx - a, cy - r],
    [cx + a, cy - r],
    [cx + r, cy - a],
    [cx + r, cy + a],
    [cx + a, cy + r],
    [cx - a, cy + r],
    [cx - r, cy + a],
    [cx - r, cy - a],
  ];
  return `M${p.map(([x, y]) => `${x!.toFixed(2)} ${y!.toFixed(2)}`).join("L")}z`;
}

/** The eight-pointed star (khatam): two squares, one turned 45°. */
function star(cx: number, cy: number, r: number) {
  const s = r * 0.7071;
  const pts: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const ang = (Math.PI / 8) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.76;
    pts.push([cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)]);
  }
  void s;
  return `M${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L")}z`;
}

/** The small filled diamond accent. */
const dot = (cx: number, cy: number, r = 1.4) => (
  <path
    className="kashi-dot"
    d={`M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}z`}
    fill="var(--kashi-dot, currentColor)"
    stroke="none"
  />
);

function icon(name: string, body: ReactNode): LucideIcon {
  const Icon = forwardRef<SVGSVGElement, LucideProps>(function Icon(
    {
      size = 24,
      strokeWidth = 1.75,
      absoluteStrokeWidth,
      color = "currentColor",
      className,
      children,
      ...rest
    },
    ref,
  ) {
    void absoluteStrokeWidth;
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="square"
        strokeLinejoin="miter"
        strokeMiterlimit={6}
        className={cn("kashi", `kashi-${name}`, className)}
        {...rest}
      >
        {body}
        {children}
      </svg>
    );
  });
  Icon.displayName = name;
  return Icon as unknown as LucideIcon;
}

const p = (d: string) => <path d={d} />;

export const Plus = icon("plus", p("M12 5v14M5 12h14"));
export const Minus = icon("minus", p("M5 12h14"));
export const X = icon("x", p("M6.5 6.5l11 11M17.5 6.5l-11 11"));
export const Check = icon("check", p("M4.5 12.5l4.5 4.5L19.5 6.5"));
export const CheckCheck = icon("check-check", p("M2 12.5l4.5 4.5L15 8.5M10.5 15.5l1.5 1.5L22 7"));
export const CheckCircle2 = icon(
  "check-circle",
  <>
    {p(oct(12, 12, 9.5))}
    {p("M7.5 12.5l3 3 6-6.5")}
  </>,
);
export const CircleCheck = CheckCircle2;
export const ChevronDown = icon("chevron-down", p("M6 9l6 6 6-6"));
export const ChevronUp = icon("chevron-up", p("M6 15l6-6 6 6"));
export const ChevronLeft = icon("chevron-left", p("M15 6l-6 6 6 6"));
export const ChevronRight = icon("chevron-right", p("M9 6l6 6-6 6"));
export const ArrowRight = icon("arrow-right", p("M4 12h15M13 6l6 6-6 6"));
export const ArrowLeft = icon("arrow-left", p("M20 12H5M11 6l-6 6 6 6"));
export const Search = icon(
  "search",
  <>
    {p(oct(10.5, 10.5, 6.8))}
    {p("M15.5 15.5l5 5")}
    {dot(10.5, 10.5)}
  </>,
);
export const Trash2 = icon("trash", p("M4 6.5h16M9 6.5V3.5h6v3M6 6.5l1 14h10l1-14M10 10.5v6M14 10.5v6"));
export const Pencil = icon("pencil", p("M15 4l5 5L9 20H4v-5zM12.5 6.5l5 5"));
export const PenLine = icon("pen-line", p("M14 5l4 4-9 9H5v-4zM12 7l4 4M13 21h8"));
export const Copy = icon("copy", p("M9 9h11v11H9zM5.5 15H4V4h11v1.5"));
export const Clock = icon(
  "clock",
  <>
    {p(oct(12, 12, 9.2))}
    {p("M12 7v5l3.5 2.5")}
  </>,
);
export const Timer = icon(
  "timer",
  <>
    {p(oct(12, 13.5, 7.8))}
    {p("M12 9.5v4l2.5 1.5M10 2.5h4M18.5 6l1.5-1.5")}
  </>,
);
export const User = icon(
  "user",
  <>
    {p(oct(12, 8, 4))}
    {p("M4.5 21v-1.5c0-3.3 3.4-6 7.5-6s7.5 2.7 7.5 6V21")}
  </>,
);
export const UserRound = User;
export const CircleUser = icon(
  "circle-user",
  <>
    {p(oct(12, 12, 9.5))}
    {p(oct(12, 10, 3))}
    {p("M6.8 18.6c1-2.2 3-3.4 5.2-3.4s4.2 1.2 5.2 3.4")}
  </>,
);
export const Users = icon(
  "users",
  <>
    {p(oct(9, 8, 3.4))}
    {p("M2.5 20v-1c0-3 2.9-5.2 6.5-5.2s6.5 2.2 6.5 5.2v1")}
    {p("M15.5 4.9a3.3 3.3 0 0 1 0 6.2M18 13.9c2.1.6 3.5 2.4 3.5 4.6v1.5")}
  </>,
);
export const UsersRound = Users;
export const Star = icon("star", p(star(12, 12, 10)));
export const Sparkles = icon(
  "sparkles",
  <>
    {p("M10 3.5l1.9 4.6L16.5 10l-4.6 1.9L10 16.5l-1.9-4.6L3.5 10l4.6-1.9z")}
    {dot(18, 17.5, 2.6)}
  </>,
);
export const Phone = icon(
  "phone",
  p("M5 3h4l2 5-2.5 1.6a11 11 0 0 0 5.9 5.9L16 13l5 2v4c0 1.1-.9 2-2 2C10.2 21 3 13.8 3 5c0-1.1.9-2 2-2z"),
);
export const AlertTriangle = icon(
  "alert",
  <>
    {p("M12 3.5 2.5 20.5h19z")}
    {p("M12 10v4.5")}
    {dot(12, 17.2, 1.1)}
  </>,
);
export const TriangleAlert = AlertTriangle;
export const Info = icon(
  "info",
  <>
    {p(oct(12, 12, 9.5))}
    {p("M12 11v6")}
    {dot(12, 7.8, 1.1)}
  </>,
);
export const Ban = icon(
  "ban",
  <>
    {p(oct(12, 12, 9))}
    {p("M6 6l12 12")}
  </>,
);
export const Wallet = icon("wallet", p("M3.5 6.5h14v3M3.5 6.5v13h17v-10h-17M15.5 14.5h2"));
export const RotateCcw = icon("rotate-ccw", p("M3.5 4v5h5M4.6 9a8 8 0 1 1 1.4 8.5"));
export const RefreshCw = icon(
  "refresh",
  p("M20.5 4v5h-5M3.5 20v-5h5M19.5 9A8 8 0 0 0 5.2 7.5M4.5 15a8 8 0 0 0 14.3 1.5"),
);
export const Undo2 = icon("undo", p("M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"));
export const Printer = icon("printer", p("M7 8V3h10v5M4 8h16v9h-3M7 17H4V8M7 14h10v7H7z"));
export const CreditCard = icon("credit-card", p("M2.5 5h19v14h-19zM2.5 9.5h19M6 15h4.5"));
export const Bell = icon("bell", p("M6 16.5V10.5a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21.5h4"));
export const BellRing = icon(
  "bell-ring",
  p("M6 16.5V10.5a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21.5h4M2.5 7.5l2-2.5M21.5 7.5l-2-2.5"),
);
export const BellOff = icon(
  "bell-off",
  p("M6 16.5V10.5a6 6 0 0 1 9.6-4.8M18 10.5v6l1.5 2H8M10 21.5h4M3 3l18 18"),
);
export const ConciergeBell = icon(
  "concierge",
  <>
    {p("M2.5 18.5h19M4.5 18.5a7.5 7.5 0 0 1 15 0M12 11V8M10 8h4")}
    {dot(12, 14.5, 1.2)}
  </>,
);
export const Utensils = icon(
  "utensils",
  p("M7 3v8M4.5 3v5.5a2.5 2.5 0 0 0 5 0V3M7 11v10M17.5 3C15.5 3 14.5 5.5 14.5 9v4h3v8"),
);
export const Store = icon(
  "store",
  <>
    {p("M3 9 5 4h14l2 5M3 9h18M5 12v8.5h14V12M10 20.5v-5h4v5")}
    {p("M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0")}
  </>,
);
export const ShoppingBag = icon(
  "bag",
  <>
    {p("M5 8h14l-1 13H6zM9 8V6.5a3 3 0 0 1 6 0V8")}
    {dot(12, 14.5)}
  </>,
);
export const MapPin = icon(
  "map-pin",
  <>
    {p("M12 21.5s-7-6.6-7-11.5a7 7 0 0 1 14 0c0 4.9-7 11.5-7 11.5z")}
    {dot(12, 10, 2)}
  </>,
);
export const LogOut = icon("log-out", p("M10 4H4v16h6M15 8l4 4-4 4M19 12H9"));
export const LogIn = icon("log-in", p("M14 4h6v16h-6M9 8l4 4-4 4M13 12H3"));
export const LayoutGrid = icon(
  "grid",
  p("M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z"),
);
export const Flame = icon(
  "flame",
  p("M12 2.5c1 3.6 6 5.6 6 11a6 6 0 0 1-12 0c0-3 1.4-4.6 3-6 0 2 .8 3.2 2 3.2 0-3-1-5.3 1-8.2z"),
);
export const ReceiptText = icon("receipt", p("M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"));
export const QrCode = icon(
  "qr",
  <>
    {p(
      "M3.5 3.5h7v7h-7zM13.5 3.5h7v7h-7zM3.5 13.5h7v7h-7zM14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM14 19.5h1M19.5 14h1",
    )}
    {dot(7, 7, 1.2)}
    {dot(17, 7, 1.2)}
    {dot(7, 17, 1.2)}
  </>,
);
export const ChefHat = icon(
  "chef-hat",
  p("M7 20.5h10M7 20.5V14M17 20.5V14M7 14 4.5 9 9 8l3-4.5L15 8l4.5 1L17 14z"),
);
export const Headset = icon(
  "headset",
  p("M4 15v-3a8 8 0 0 1 16 0v3M4 13h3.5v6H4zM16.5 13H20v6h-3.5zM20 19c0 1.6-2.2 2.5-5 2.5h-2"),
);
export const LifeBuoy = icon(
  "life-buoy",
  <>
    {p(oct(12, 12, 9.5))}
    {p(oct(12, 12, 4))}
    {p("M5.3 5.3l3.9 3.9M18.7 5.3l-3.9 3.9M5.3 18.7l3.9-3.9M18.7 18.7l-3.9-3.9")}
  </>,
);
export const Home = icon("home", p("M3 11 12 3l9 8M5 9.3V21h14V9.3M10 21v-6h4v6"));
export const Settings = icon(
  "settings",
  <>
    {p(star(12, 12, 9.8))}
    {p(oct(12, 12, 3.2))}
  </>,
);
export const Eye = icon(
  "eye",
  <>
    {p("M2 12c3-5 6.5-7 10-7s7 2 10 7c-3 5-6.5 7-10 7S5 17 2 12z")}
    {p(oct(12, 12, 3))}
    {dot(12, 12, 1)}
  </>,
);
export const Download = icon("download", p("M12 3v12M7 10l5 5 5-5M4 20h16"));
export const Upload = icon("upload", p("M12 16V4M7 9l5-5 5 5M4 20h16"));
export const Lock = icon("lock", p("M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4"));
export const LockOpen = icon("lock-open", p("M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.7-1.5"));
export const Send = icon("send", p("M3.5 4l17.5 8-17.5 8 3-8zM6.5 12h6.5"));
export const SendHorizontal = Send;
export const CalendarDays = icon(
  "calendar",
  <>
    {p("M3.5 5h17v15.5h-17zM3.5 10h17M8 3v4M16 3v4")}
    {dot(8, 14.5, 1.1)}
    {dot(12, 14.5, 1.1)}
    {dot(16, 14.5, 1.1)}
  </>,
);
export const CalendarCheck = icon(
  "calendar-check",
  p("M3.5 5h17v15.5h-17zM3.5 10h17M8 3v4M16 3v4M8.5 15l2.5 2.5 4.5-4.5"),
);
export const CalendarPlus = icon(
  "calendar-plus",
  p("M3.5 5h17v15.5h-17zM3.5 10h17M8 3v4M16 3v4M12 12.5v6M9 15.5h6"),
);
export const ExternalLink = icon("external", p("M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"));
export const MessageSquareText = icon("message", p("M3 4h18v13H8.5L3 21zM7 9h10M7 13h6"));
export const Zap = icon("zap", p("M13.5 2 4 14h7l-1.5 8L19 10h-7z"));
export const Play = icon("play", p("M7 4l13 8-13 8z"));
export const Pause = icon("pause", p("M6.5 4H10v16H6.5zM14 4h3.5v16H14z"));
export const Sun = icon(
  "sun",
  <>
    {p(oct(12, 12, 4.2))}
    {p("M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1")}
  </>,
);
export const Moon = icon("moon", p("M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"));
export const Truck = icon(
  "truck",
  p("M2 6h12v10H2zM14 9h4l3.5 4v3H14M6.5 19.5h.01M17.5 19.5h.01M5 18h3v3H5zM16 18h3v3h-3z"),
);
export const ShieldCheck = icon(
  "shield-check",
  p("M12 2.5 4 5.5v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10v-6zM8.5 12l2.5 2.5 4.5-5"),
);
export const Inbox = icon("inbox", p("M3 13h5l1.5 3h5L16 13h5M3 13l3-8h12l3 8v7H3z"));
export const Globe = icon(
  "globe",
  <>
    {p(oct(12, 12, 9.5))}
    {p("M2.5 12h19M12 2.5c2.6 2.7 3.8 6 3.8 9.5s-1.2 6.8-3.8 9.5c-2.6-2.7-3.8-6-3.8-9.5S9.4 5.2 12 2.5z")}
  </>,
);
export const BookOpen = icon(
  "book",
  p(
    "M2.5 5h6.5a3 3 0 0 1 3 3v12.5a2.5 2.5 0 0 0-2.5-2.5H2.5zM21.5 5H15a3 3 0 0 0-3 3v12.5a2.5 2.5 0 0 1 2.5-2.5h7z",
  ),
);
export const Ticket = icon("ticket", p("M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4zM14 6v12"));
export const TrendingUp = icon("trending-up", p("M3 17l6-6 4 4 8-8M15 7h6v6"));
export const TrendingDown = icon("trending-down", p("M3 7l6 6 4-4 8 8M15 17h6v-6"));
export const Smartphone = icon("phone-device", p("M6.5 2.5h11v19h-11zM10.5 18.5h3"));
export const Mail = icon("mail", p("M3 5h18v14H3zM3 5l9 7.5L21 5"));
export const ImageIcon = icon(
  "image",
  <>
    {p("M3 4h18v16H3zM3 16l5-5 4 4 3-3 6 6")}
    {dot(15.5, 8.5, 1.6)}
  </>,
);
export const Columns3 = icon("columns", p("M3 4h18v16H3zM9 4v16M15 4v16"));
export const SlidersHorizontal = icon(
  "sliders",
  p("M3 6h10M17 6h4M3 12h4M11 12h10M3 18h12M19 18h2M13 4v4M7 10v4M15 16v4"),
);
export const Maximize2 = icon("maximize", p("M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5"));
export const Minimize2 = icon("minimize", p("M4 14h6v6M20 10h-6V4M14 10l6.5-6.5M10 14l-6.5 6.5"));
export const Rows3 = icon("rows", p("M3 4h18v16H3zM3 9.5h18M3 14.5h18"));
export const LayoutList = icon("layout-list", p("M3 4h6v6H3zM3 14h6v6H3zM13 6h8M13 9h5M13 16h8M13 19h5"));
export const ListChecks = icon("list-checks", p("M3 6.5l2 2 3.5-3.5M3 15.5l2 2 3.5-3.5M12 7h9M12 16h9"));
