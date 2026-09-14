import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, Ban, Bell, Box,
  Boxes, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleAlert,
  CircleCheck, ClipboardList, Clock, Command, Copy, Cpu, CreditCard, Crosshair,
  Download, ExternalLink, Eye, Factory, FileBox, FileUp, Gauge, Heart, Inbox, Info,
  LayoutDashboard, Layers, Library, LoaderCircle, LogOut, MapPin, Maximize,
  Maximize2, Menu, Minus, Move3d, Package, Palette, PanelLeftClose, PanelLeftOpen,
  Pause, Play, Plus, RotateCcw, Rotate3d, Ruler, Scan, ScanLine, Search, Settings,
  Settings2, ShoppingCart, SlidersHorizontal, Sun, Thermometer, Timer, Trash2,
  TriangleAlert, Truck, Upload, User, Users, Wallet, Weight, Wrench, X,
} from "lucide-react";

/**
 * The Reality 3D glyph set.
 *
 * The design system specifies Lucide outline, loaded per-icon from a CDN and
 * painted with a CSS mask. That costs one network request per glyph and cannot
 * server-render, so this registry bundles the same glyphs instead. Icons stay
 * monochrome and inherit `currentColor`, exactly as specified.
 *
 * Registry keys mirror Lucide ids so the design system's `name` strings port
 * across unchanged.
 */
const REGISTRY = {
  "alert": TriangleAlert,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "box": Box,
  "boxes": Boxes,
  "check": Check,
  "check-circle": CircleCheck,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  "cpu": Cpu,
  "credit-card": CreditCard,
  "crosshair": Crosshair,
  "download": Download,
  "error": CircleAlert,
  "external-link": ExternalLink,
  "eye": Eye,
  "file-up": FileUp,
  "filter": SlidersHorizontal,
  "gauge": Gauge,
  "heart": Heart,
  "info": Info,
  "layers": Layers,
  "loader": LoaderCircle,
  "log-out": LogOut,
  "map-pin": MapPin,
  "maximize": Maximize,
  "expand": Maximize2,
  "menu": Menu,
  "minus": Minus,
  "move-3d": Move3d,
  "package": Package,
  "palette": Palette,
  "pause": Pause,
  "play": Play,
  "plus": Plus,
  "reset": RotateCcw,
  "rotate-3d": Rotate3d,
  "ruler": Ruler,
  "scan": Scan,
  "scan-line": ScanLine,
  "search": Search,
  "settings-2": Settings2,
  "shopping-cart": ShoppingCart,
  "sun": Sun,
  "thermometer": Thermometer,
  "timer": Timer,
  "trash": Trash2,
  "truck": Truck,
  "upload": Upload,
  "user": User,
  "weight": Weight,
  "wrench": Wrench,
  "x": X,

  /* Operations console. */
  "activity": Activity,
  "arrow-down": ArrowDown,
  "arrow-up": ArrowUp,
  "ban": Ban,
  "bell": Bell,
  "clipboard": ClipboardList,
  "clock": Clock,
  "command": Command,
  "copy": Copy,
  "dashboard": LayoutDashboard,
  "factory": Factory,
  "file-box": FileBox,
  "inbox": Inbox,
  "library": Library,
  "panel-left-close": PanelLeftClose,
  "panel-left-open": PanelLeftOpen,
  "settings": Settings,
  "sort": ArrowUpDown,
  "users": Users,
  "wallet": Wallet,
} as const;

export type IconName = keyof typeof REGISTRY;

export interface IconProps {
  name: IconName;
  /** 14 inline metadata · 16 UI default · 20 nav & large buttons · 24–32 feature */
  size?: number;
  /** Design system stroke weight is 1.5px geometric outline. */
  strokeWidth?: number;
  /** Supply only when the icon carries meaning no adjacent text already carries. */
  title?: string;
  className?: string;
}

export function Icon({
  name,
  size = 16,
  strokeWidth = 1.5,
  title,
  className,
}: IconProps) {
  const Glyph = REGISTRY[name];

  return (
    <Glyph
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      role={title ? "img" : undefined}
      focusable="false"
      style={{ flex: "0 0 auto", display: "block" }}
    />
  );
}
