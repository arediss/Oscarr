import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { AlertTriangle, X as XIcon, Eye, EyeOff } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import {
  Home,
  Search,
  Film,
  MessageSquare,
  Calendar,
  LogOut,
  Menu,
  X,
  Shield,
  ChevronDown,
  Globe,
} from 'lucide-react';
import { clsx } from 'clsx';
import NotificationBell from '@/components/NotificationBell';
import { PluginSlot } from '@/plugins/PluginSlot';
import { DynamicIcon } from '@/plugins/DynamicIcon';
import { useFeatures } from '@/context/FeaturesContext';

const ALL_NAV = [
  { path: '/', labelKey: 'nav.home', icon: Home, feature: null },
  { path: '/requests', labelKey: 'nav.requests', icon: Film, feature: 'requestsEnabled' as const },
  { path: '/calendar', labelKey: 'nav.calendar', icon: Calendar, feature: 'calendarEnabled' as const },
  { path: '/support', labelKey: 'nav.support', icon: MessageSquare, feature: 'supportEnabled' as const },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [viewAsRole, setViewAsRole] = useState<string | null>(sessionStorage.getItem('view-as-role'));
  const [availableRoles, setAvailableRoles] = useState<{ name: string }[]>([]);
  const { features } = useFeatures();
  const avatarMenuRef = useRef<HTMLDivElement>(null);

  // Fetch incident banner
  useEffect(() => {
    api.get('/app/banner').then(({ data }) => setBanner(data.banner)).catch(() => {});
  }, []);

  // Fetch roles for the "view as" selector (admin only)
  useEffect(() => {
    if (isAdmin) {
      api.get('/admin/roles').then(({ data }) => setAvailableRoles(data)).catch(() => {});
    }
  }, [isAdmin]);

  const startViewAs = (roleName: string) => {
    sessionStorage.setItem('view-as-role', roleName);
    setViewAsRole(roleName);
    setAvatarMenuOpen(false);
  };

  const stopViewAs = () => {
    sessionStorage.removeItem('view-as-role');
    setViewAsRole(null);
  };

  // Filter nav items based on feature flags (admins see everything)
  const navItems = ALL_NAV.filter(({ feature }) => !feature || features[feature]);

  // Sync search input with URL query param when on /search
  useEffect(() => {
    if (location.pathname === '/search') {
      const q = searchParams.get('q') || '';
      setSearchQuery(q);
    } else {
      setSearchQuery('');
    }
  }, [location.pathname, searchParams]);

  const handleLogout = async () => {
    setAvatarMenuOpen(false);
    await logout();
    navigate('/login');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  // Close avatar menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close avatar menu on route change
  useEffect(() => {
    setAvatarMenuOpen(false);
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const hasBanner = banner && !bannerDismissed;
  const hasViewAsBanner = !!viewAsRole;
  const topOffset = (hasBanner ? 10 : 0) + (hasViewAsBanner ? 10 : 0);

  return (
    <div className="min-h-screen bg-ndp-bg">
      {/* Incident banner */}
      {hasBanner && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-ndp-warning/90 backdrop-blur-sm text-black px-4 py-2 flex items-center justify-center gap-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <p className="text-sm font-medium text-center">{banner}</p>
          <button onClick={() => setBannerDismissed(true)} className="p-0.5 hover:bg-black/10 rounded flex-shrink-0">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* View as role banner */}
      {viewAsRole && (
        <div className={clsx(
          'fixed left-0 right-0 z-[59] bg-purple-600/90 backdrop-blur-sm text-white px-4 py-2 flex items-center justify-center gap-3',
          hasBanner ? 'top-10' : 'top-0'
        )}>
          <Eye className="w-4 h-4 flex-shrink-0" />
          <p className="text-sm font-medium">
            {t('admin.view_as.active', 'Viewing as "{{role}}"', { role: viewAsRole })}
          </p>
          <button
            onClick={stopViewAs}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors"
          >
            <EyeOff className="w-3 h-3" />
            {t('admin.view_as.stop', 'Stop')}
          </button>
        </div>
      )}

      <nav
        className={clsx(
          'fixed left-0 right-0 z-50 transition-[background-color,backdrop-filter] duration-300',
          scrolled ? 'bg-ndp-surface/80 backdrop-blur-xl' : 'bg-transparent',
        )}
        style={{ top: `${topOffset * 4}px` }}
      >
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6">
          <div className="relative flex items-center justify-between h-16">

            {/* Left: Nav */}
            <div className="hidden md:flex items-center gap-0.5 relative z-10">
              {navItems.map(({ path, labelKey, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
                    location.pathname === path
                      ? 'bg-ndp-accent/10 text-ndp-accent'
                      : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden lg:inline">{t(labelKey)}</span>
                </Link>
              ))}
              <PluginSlot
                hookPoint="nav"
                renderItem={(c) => (
                  <Link
                    key={c.pluginId}
                    to={c.props.path as string}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
                      location.pathname.startsWith(c.props.path as string)
                        ? 'bg-ndp-accent/10 text-ndp-accent'
                        : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5'
                    )}
                  >
                    <DynamicIcon name={c.props.icon as string} className="w-4 h-4" />
                    <span className="hidden lg:inline">{c.props.label as string}</span>
                  </Link>
                )}
              />
            </div>

            {/* Center: Search bar - absolutely centered on the page */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none hidden sm:flex">
              <form onSubmit={handleSearch} className="w-full max-w-lg px-4 pointer-events-auto">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ndp-text-dim" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('search.placeholder')}
                    className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-ndp-text placeholder-ndp-text-dim focus:outline-none focus:ring-2 focus:ring-ndp-accent/40 focus:border-ndp-accent/40 focus:bg-white/10 transition-all"
                  />
                </div>
              </form>
            </div>

            {/* Right: Avatar dropdown */}
            <div className="flex items-center gap-2 flex-shrink-0 relative z-10">
              {/* Mobile search */}
              <button
                onClick={() => navigate('/search')}
                className="sm:hidden p-2 text-ndp-text-muted hover:text-ndp-text rounded-lg hover:bg-white/5 transition-colors"
              >
                <Search className="w-5 h-5" />
              </button>

              {/* Plugin hook: header actions */}
              <PluginSlot hookPoint="header.actions" context={{ user }} />

              {/* Notification bell */}
              <NotificationBell />

              {/* Avatar with dropdown */}
              <div className="relative" ref={avatarMenuRef}>
                <button
                  onClick={() => setAvatarMenuOpen(!avatarMenuOpen)}
                  className="flex items-center gap-2 p-1 rounded-xl hover:bg-white/5 transition-colors"
                >
                  {user?.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.displayName || ''}
                      className="w-8 h-8 rounded-full ring-2 ring-white/10"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-ndp-accent/20 flex items-center justify-center text-ndp-accent text-sm font-bold">
                      {(user?.displayName || user?.email || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <ChevronDown className={clsx(
                    'w-3.5 h-3.5 text-ndp-text-dim transition-transform hidden sm:block',
                    avatarMenuOpen && 'rotate-180'
                  )} />
                </button>

                {/* Dropdown menu */}
                {avatarMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 card shadow-2xl shadow-black/50 border border-white/10 animate-fade-in py-1">
                    {/* User info */}
                    <div className="px-4 py-3 border-b border-white/5">
                      <p className="text-sm font-semibold text-ndp-text truncate">{user?.displayName || user?.email}</p>
                      <p className="text-xs text-ndp-text-dim truncate">{user?.email}</p>
                    </div>

                    {isAdmin && (
                      <>
                        <Link
                          to="/admin"
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ndp-text-muted hover:text-ndp-accent hover:bg-white/5 transition-colors"
                        >
                          <Shield className="w-4 h-4" />
                          {t('nav.admin')}
                        </Link>

                        {/* View as role selector */}
                        <div className="px-4 py-2 border-t border-white/5">
                          <div className="flex items-center gap-2.5">
                            <Eye className="w-4 h-4 text-ndp-text-dim flex-shrink-0" />
                            <select
                              value={viewAsRole || ''}
                              onChange={(e) => e.target.value ? startViewAs(e.target.value) : stopViewAs()}
                              className="flex-1 bg-white/5 border border-white/10 rounded-lg text-sm text-ndp-text px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500/40 cursor-pointer appearance-none"
                            >
                              <option value="">{t('admin.view_as.off', 'View as role...')}</option>
                              {availableRoles.filter(r => r.name !== 'admin').map(r => (
                                <option key={r.name} value={r.name}>{r.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </>
                    )}

                    <div className="px-4 py-2.5 border-t border-white/5">
                      <div className="flex items-center gap-2.5">
                        <Globe className="w-4 h-4 text-ndp-text-dim flex-shrink-0" />
                        <select
                          value={i18n.language.split('-')[0]}
                          onChange={(e) => i18n.changeLanguage(e.target.value)}
                          className="flex-1 bg-white/5 border border-white/10 rounded-lg text-sm text-ndp-text px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ndp-accent/40 cursor-pointer appearance-none"
                        >
                          {Object.keys(i18n.options.resources || {}).map((code) => (
                            <option key={code} value={code}>
                              {new Intl.DisplayNames([code], { type: 'language' }).of(code)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Plugin hook: avatar menu */}
                    <PluginSlot hookPoint="avatar.menu" context={{ user, isAdmin }} />

                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ndp-text-muted hover:text-ndp-danger hover:bg-white/5 transition-colors w-full text-left"
                    >
                      <LogOut className="w-4 h-4" />
                      {t('nav.logout')}
                    </button>
                  </div>
                )}
              </div>

              {/* Mobile hamburger */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 text-ndp-text-muted hover:text-ndp-text rounded-lg"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/5 bg-ndp-surface/95 backdrop-blur-xl animate-slide-up">
            <div className="px-4 pt-3">
              <form onSubmit={(e) => { handleSearch(e); setMobileMenuOpen(false); }}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ndp-text-dim" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('search.placeholder_short')}
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-ndp-text placeholder-ndp-text-dim focus:outline-none focus:ring-2 focus:ring-ndp-accent/40"
                  />
                </div>
              </form>
            </div>
            <div className="px-4 py-3 space-y-1">
              {navItems.map(({ path, labelKey, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={clsx(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors',
                    location.pathname === path
                      ? 'bg-ndp-accent/10 text-ndp-accent'
                      : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {t(labelKey)}
                </Link>
              ))}
              <PluginSlot
                hookPoint="nav"
                renderItem={(c) => (
                  <Link
                    key={c.pluginId}
                    to={c.props.path as string}
                    onClick={() => setMobileMenuOpen(false)}
                    className={clsx(
                      'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors',
                      location.pathname.startsWith(c.props.path as string)
                        ? 'bg-ndp-accent/10 text-ndp-accent'
                        : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5'
                    )}
                  >
                    <DynamicIcon name={c.props.icon as string} className="w-5 h-5" />
                    {c.props.label as string}
                  </Link>
                )}
              />
              {isAdmin && (
                <Link
                  to="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className={clsx(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors',
                    location.pathname === '/admin'
                      ? 'bg-ndp-accent/10 text-ndp-accent'
                      : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5'
                  )}
                >
                  <Shield className="w-5 h-5" />
                  Admin
                </Link>
              )}
            </div>
          </div>
        )}
      </nav>

      <main
        className="min-h-screen"
        style={location.pathname === '/' ? undefined : { paddingTop: `${64 + topOffset * 4}px` }}
      >
        {children}
      </main>
    </div>
  );
}
