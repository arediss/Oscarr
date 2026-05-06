import {
  Film, Settings, Users, Shield, Server, Bell, RefreshCw, ScrollText, Plug,
  ExternalLink, MessageSquare, Puzzle, BarChart3, Zap, Code, Palette, Bot,
  Download, Package, Star, Loader2, BookOpen, Terminal, ChevronDown, ChevronUp,
  Copy, Check, Power, Search, Trash2, Eye, EyeOff, Play, Tv,
  Home, LayoutDashboard, PieChart, Activity, TrendingUp, Cpu, HardDrive, Database,
  Cloud, Globe, Mail, Send, User, UserCheck, Lock, Key, Calendar, Clock, Timer,
  CheckCircle, AlertCircle, AlertTriangle, Info, Heart, Bookmark, Tag, Flag,
  Folder, File, FileText, Image, Music, Video, Wrench, Sparkles,
  Layers, Grid3x3, List, Filter, Upload,
  Coins, CreditCard, Gift, Crown, Award, Trophy, Gauge, Rocket,
  type LucideIcon,
} from 'lucide-react';

// Curated allowlist — only listed icons end up in the bundle (tree-shaking). Plugins reference
// icons by name via this map; unknown names fall back to Puzzle. To add a new icon, import it
// above, add it here, and document it in `docs/plugins.md` (Available icons section).
const ICON_MAP: Record<string, LucideIcon> = {
  Film, Settings, Users, Shield, Server, Bell, RefreshCw, ScrollText, Plug,
  ExternalLink, MessageSquare, Puzzle, BarChart3, Zap, Code, Palette, Bot,
  Download, Package, Star, Loader2, BookOpen, Terminal, ChevronDown, ChevronUp,
  Copy, Check, Power, Search, Trash2, Eye, EyeOff, Play, Tv,
  Home, LayoutDashboard, PieChart, Activity, TrendingUp, Cpu, HardDrive, Database,
  Cloud, Globe, Mail, Send, User, UserCheck, Lock, Key, Calendar, Clock, Timer,
  CheckCircle, AlertCircle, AlertTriangle, Info, Heart, Bookmark, Tag, Flag,
  Folder, File, FileText, Image, Music, Video, Wrench, Sparkles,
  Layers, Grid3x3, List, Filter, Upload,
  Coins, CreditCard, Gift, Crown, Award, Trophy, Gauge, Rocket,
};

interface DynamicIconProps {
  name: string;
  className?: string;
}

const warned = new Set<string>();

export function DynamicIcon({ name, className }: Readonly<DynamicIconProps>) {
  const Icon = ICON_MAP[name];
  if (!Icon) {
    if (import.meta.env.DEV && !warned.has(name)) {
      warned.add(name);
      console.warn(
        `[DynamicIcon] Unknown icon "${name}" — falling back to Puzzle. Add it to packages/frontend/src/plugins/DynamicIcon.tsx and document it in docs/plugins.md.`,
      );
    }
    return <Puzzle className={className} />;
  }
  return <Icon className={className} />;
}
