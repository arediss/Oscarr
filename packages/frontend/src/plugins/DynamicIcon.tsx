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
  type LucideIcon,
} from 'lucide-react';

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
