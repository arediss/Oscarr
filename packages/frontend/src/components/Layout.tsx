import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  Home,
  Search,
  Film,
  MessageSquare,
  Download,
  LogOut,
  Menu,
  X,
  Shield,
} from 'lucide-react';
import { clsx } from 'clsx';

const NAV_ITEMS = [
  { path: '/', label: 'Accueil', icon: Home },
  { path: '/requests', label: 'Demandes', icon: Film },
  { path: '/downloads', label: 'Downloads', icon: Download },
  { path: '/messages', label: 'Messages', icon: MessageSquare },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  return (
    <div className="min-h-screen bg-ndp-bg">
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6">
          <div className="flex items-center h-16 gap-4">

            {/* Left: Logo + Nav */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Logo icon only */}
              <Link to="/" className="flex items-center group mr-2">
                <div className="w-9 h-9 bg-gradient-to-br from-ndp-accent to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-ndp-accent/20 group-hover:shadow-ndp-accent/40 transition-shadow">
                  <Film className="w-5 h-5 text-white" />
                </div>
              </Link>

              {/* Desktop nav links */}
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
                {isAdmin && (
                  <Link
                    to="/admin"
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
                      location.pathname === '/admin'
                        ? 'bg-ndp-accent/10 text-ndp-accent'
                        : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5'
                    )}
                  >
                    <Shield className="w-4 h-4" />
                    <span className="hidden lg:inline">Admin</span>
                  </Link>
                )}
              </div>
            </div>

            {/* Center: Search bar */}
            <form onSubmit={handleSearch} className="flex-1 max-w-xl mx-auto hidden sm:block">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ndp-text-dim" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher un film, une série..."
                  className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-ndp-text placeholder-ndp-text-dim focus:outline-none focus:ring-2 focus:ring-ndp-accent/40 focus:border-ndp-accent/40 focus:bg-white/10 transition-all"
                />
              </div>
            </form>

            {/* Right: Avatar + Logout */}
            <div className="flex items-center gap-2.5 flex-shrink-0">
              {/* Mobile search button */}
              <button
                onClick={() => navigate('/search')}
                className="sm:hidden p-2 text-ndp-text-muted hover:text-ndp-text rounded-lg hover:bg-white/5 transition-colors"
              >
                <Search className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2">
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
                <span className="text-sm font-medium text-ndp-text hidden xl:block">
                  {user?.plexUsername || user?.email}
                </span>
              </div>
              <button onClick={handleLogout} className="p-2 text-ndp-text-dim hover:text-ndp-danger rounded-lg hover:bg-white/5 transition-colors" title="Déconnexion">
                <LogOut className="w-4 h-4" />
              </button>

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
            {/* Mobile search */}
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
