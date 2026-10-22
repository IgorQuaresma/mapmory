import {
  ArrowCounterClockwise,
  ArrowDown as PhArrowDown,
  ArrowLeft as PhArrowLeft,
  ArrowRight as PhArrowRight,
  ArrowUp as PhArrowUp,
  ArrowUUpLeft,
  ArrowUUpRight,
  CaretDown,
  Check as PhCheck,
  CheckCircle,
  CircleNotch,
  CloudSlash,
  Compass as PhCompass,
  Copy as PhCopy,
  CornersOut,
  Crosshair as PhCrosshair,
  DownloadSimple,
  EnvelopeSimpleOpen,
  Eye as PhEye,
  EyeSlash,
  Globe as PhGlobe,
  Info as PhInfo,
  LinkBreak,
  Lock as PhLock,
  MagnifyingGlass,
  MapPin as PhMapPin,
  MapPinArea,
  MapPinPlus as PhMapPinPlus,
  Minus as PhMinus,
  Palette as PhPalette,
  PencilSimpleLine,
  Plus as PhPlus,
  Rectangle,
  Scan,
  ShareNetwork,
  ShieldCheck as PhShieldCheck,
  SignOut,
  Sparkle,
  Star as PhStar,
  TextAlignCenter,
  TextAlignLeft,
  TextAlignRight,
  Trash,
  Warning,
  X as PhX,
  XCircle,
  type Icon,
  type IconProps,
} from '@phosphor-icons/react';
import { forwardRef } from 'react';

/**
 * Interface icons: Phosphor (MIT) in duotone weight. The light layer is tinted with `--icon-duo`
 * (coral by default, see styles.css); it is decoration only, and icon-only buttons carry text labels.
 * Exported under the names the app already uses, so screens import from one place.
 */
function duotone(PhIcon: Icon, extraClass?: string) {
  const Wrapped = forwardRef<SVGSVGElement, IconProps>(function DuotoneIcon({ className, ...props }, ref) {
    return <PhIcon ref={ref} weight="duotone" className={['mm-icon', extraClass, className].filter(Boolean).join(' ')} {...props} />;
  });
  return Wrapped;
}

export const AlignCenter = duotone(TextAlignCenter);
export const AlignLeft = duotone(TextAlignLeft);
export const AlignRight = duotone(TextAlignRight);
export const ArrowDown = duotone(PhArrowDown);
export const ArrowLeft = duotone(PhArrowLeft);
export const ArrowRight = duotone(PhArrowRight);
export const ArrowUp = duotone(PhArrowUp);
export const Check = duotone(PhCheck);
export const ChevronDown = duotone(CaretDown);
export const CircleCheck = duotone(CheckCircle);
export const CircleX = duotone(XCircle);
export const CloudOff = duotone(CloudSlash);
export const Compass = duotone(PhCompass);
export const Copy = duotone(PhCopy);
export const Crosshair = duotone(PhCrosshair);
export const Download = duotone(DownloadSimple);
export const Eye = duotone(PhEye);
export const EyeOff = duotone(EyeSlash);
export const Globe = duotone(PhGlobe);
export const Info = duotone(PhInfo);
export const Link2Off = duotone(LinkBreak);
export const Loader2 = duotone(CircleNotch);
export const Lock = duotone(PhLock);
export const LogOut = duotone(SignOut);
export const MailCheck = duotone(EnvelopeSimpleOpen);
export const MapPin = duotone(PhMapPin);
export const MapPinPlus = duotone(PhMapPinPlus);
export const MapPinned = duotone(MapPinArea);
export const Maximize = duotone(CornersOut);
export const Minus = duotone(PhMinus);
export const Palette = duotone(PhPalette);
export const PenLine = duotone(PencilSimpleLine);
export const Plus = duotone(PhPlus);
export const RectangleHorizontal = duotone(Rectangle);
export const RectangleVertical = duotone(Rectangle, 'rotate-90');
export const Redo2 = duotone(ArrowUUpRight);
export const RotateCcw = duotone(ArrowCounterClockwise);
export const ScanLine = duotone(Scan);
export const Search = duotone(MagnifyingGlass);
export const Share2 = duotone(ShareNetwork);
export const ShieldCheck = duotone(PhShieldCheck);
export const Sparkles = duotone(Sparkle);
export const Star = duotone(PhStar);
export const Trash2 = duotone(Trash);
export const TriangleAlert = duotone(Warning);
export const Undo2 = duotone(ArrowUUpLeft);
export const X = duotone(PhX);
