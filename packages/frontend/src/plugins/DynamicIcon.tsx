import {
  Film, Settings, Users, Shield, Server, Bell, RefreshCw, ScrollText, Plug,
  ExternalLink, MessageSquare, Puzzle, BarChart3, Zap, Code, Palette, Bot,
  Download, Package, Star, Loader2, BookOpen, Terminal, ChevronDown, ChevronUp,
  Copy, Check, Power, Search, Trash2, Eye, EyeOff, Play, Tv, type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  Film, Settings, Users, Shield, Server, Bell, RefreshCw, ScrollText, Plug,
  ExternalLink, MessageSquare, Puzzle, BarChart3, Zap, Code, Palette, Bot,
  Download, Package, Star, Loader2, BookOpen, Terminal, ChevronDown, ChevronUp,
  Copy, Check, Power, Search, Trash2, Eye, EyeOff, Play, Tv,
};

interface DynamicIconProps {
  name: string;
  className?: string;
}

export function DynamicIcon({ name, className }: DynamicIconProps) {
  const Icon = ICON_MAP[name];
  if (!Icon) {
    return <Puzzle className={className} />;
  }
  return <Icon className={className} />;
}
