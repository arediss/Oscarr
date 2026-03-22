import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  Home,
  Search,
  Film,
  MessageSquare,
  LogOut,
  Menu,
  X,
  Shield,
  ChevronDown,
} from 'lucide-react';
import { clsx } from 'clsx';

const NAV_ITEMS = [
  { path: '/', label: 'Accueil', icon: Home },
  { path: '/requests', label: 'Demandes', icon: Film },
  { path: '/messages', label: 'Messages', icon: MessageSquare },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const avatarMenuRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="min-h-screen bg-ndp-bg">
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6">
          <div className="relative flex items-center justify-between h-16">

            {/* Left: Logo + Nav */}
            <div className="flex items-center gap-1 relative z-10">
              <Link to="/" className="flex items-center group mr-1 sm:mr-3">
                <div className="w-9 h-9 bg-gradient-to-br from-ndp-accent to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-ndp-accent/20 group-hover:shadow-ndp-accent/40 transition-shadow">
                  <Film className="w-5 h-5 text-white" />
                </div>
              </Link>

              <div className="hidden md:flex items-center gap-0.5">
                {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
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
                    <span className="hidden lg:inline">{label}</span>
                  </Link>
                ))}
              </div>
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
                    placeholder="Rechercher un film, une série..."
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

              {/* Avatar with dropdown */}
              <div className="relative" ref={avatarMenuRef}>
                <button
                  onClick={() => setAvatarMenuOpen(!avatarMenuOpen)}
                  className="flex items-center gap-2 p-1 rounded-xl hover:bg-white/5 transition-colors"
                >
                  {user?.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.plexUsername || ''}
                      className="w-8 h-8 rounded-full ring-2 ring-white/10"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-ndp-accent/20 flex items-center justify-center text-ndp-accent text-sm font-bold">
                      {(user?.plexUsername || user?.email || '?')[0].toUpperCase()}
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
                      <p className="text-sm font-semibold text-ndp-text truncate">{user?.plexUsername || user?.email}</p>
                      <p className="text-xs text-ndp-text-dim truncate">{user?.email}</p>
                    </div>

                    {isAdmin && (
                      <Link
                        to="/admin"
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ndp-text-muted hover:text-ndp-accent hover:bg-white/5 transition-colors"
                      >
                        <Shield className="w-4 h-4" />
                        Administration
                      </Link>
                    )}

                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ndp-text-muted hover:text-ndp-danger hover:bg-white/5 transition-colors w-full text-left"
                    >
                      <LogOut className="w-4 h-4" />
                      Déconnexion
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
                    placeholder="Rechercher..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-ndp-text placeholder-ndp-text-dim focus:outline-none focus:ring-2 focus:ring-ndp-accent/40"
                  />
                </div>
              </form>
            </div>
            <div className="px-4 py-3 space-y-1">
              {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
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
                  {label}
                </Link>
              ))}
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

      <main className="pt-16 min-h-screen">
        {children}
      </main>
    </div>
  );
}
