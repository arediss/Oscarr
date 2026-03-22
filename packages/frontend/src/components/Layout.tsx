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
  { path: '/search', label: 'Rechercher', icon: Search },
  { path: '/requests', label: 'Demandes', icon: Film },
  { path: '/downloads', label: 'Téléchargements', icon: Download },
  { path: '/messages', label: 'Messages', icon: MessageSquare },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-ndp-bg">
      {/* Top navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 bg-gradient-to-br from-ndp-accent to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-ndp-accent/20 group-hover:shadow-ndp-accent/40 transition-shadow">
                <Film className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold bg-gradient-to-r from-ndp-text to-ndp-text-muted bg-clip-text text-transparent hidden sm:block">
                Netflix du Pauvre
              </span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  className={clsx(
                    'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                    location.pathname === path
                      ? 'bg-ndp-accent/10 text-ndp-accent'
                      : 'text-ndp-text-muted hover:text-ndp-text hover:bg-white/5'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              ))}
            </div>

            {/* User */}
            <div className="flex items-center gap-3">
              {isAdmin && (
                <span className="hidden sm:flex items-center gap-1 text-xs text-ndp-accent bg-ndp-accent/10 px-2.5 py-1 rounded-full">
                  <Shield className="w-3 h-3" />
                  Admin
                </span>
              )}
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
                <span className="text-sm font-medium text-ndp-text hidden lg:block">
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
            </div>
          </div>
        )}
      </nav>

      {/* Main content */}
      <main className="pt-16 min-h-screen">
        {children}
      </main>
    </div>
  );
}
