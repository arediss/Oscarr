import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import Layout from '@/components/Layout';
import HomePage from '@/pages/HomePage';
import LoginPage from '@/pages/LoginPage';
import InstallPage from '@/pages/InstallPage';
import SearchPage from '@/pages/SearchPage';
import MediaDetailPage from '@/pages/MediaDetailPage';
import RequestsPage from '@/pages/RequestsPage';
import MessagesPage from '@/pages/MessagesPage';

import AdminPage from '@/pages/AdminPage';
import NoAccessPage from '@/pages/NoAccessPage';
import DiscoverGenrePage from '@/pages/DiscoverGenrePage';
import CategoryPage from '@/pages/CategoryPage';
import CalendarPage from '@/pages/CalendarPage';
import { PluginPage } from '@/plugins/PluginPage';
import api from '@/lib/api';

function InstallGuard({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'installed' | 'not-installed'>('checking');
  const location = useLocation();

  useEffect(() => {
    api.get('/support/install-status')
      .then(({ data }) => setStatus(data.installed ? 'installed' : 'not-installed'))
      .catch(() => setStatus('installed'));
  }, [location.pathname]);

  if (status === 'checking') return <LoadingScreen />;
  if (status === 'not-installed' && location.pathname !== '/install') {
    return <Navigate to="/install" replace />;
  }
  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAccess({ children }: { children: React.ReactNode }) {
  const { hasAccess, user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!hasAccess) return <NoAccessPage />;
  return <>{children}</>;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-ndp-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-ndp-accent/30 border-t-ndp-accent rounded-full animate-spin" />
        <p className="text-ndp-text-muted text-sm">Chargement...</p>
      </div>
    </div>
  );
}

function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);
  return (
    <div key={location.pathname} className="animate-fade-in">
      {children}
    </div>
  );
}

export default function App() {
  return (
    <InstallGuard>
    <Routes>
      <Route path="/install" element={<InstallPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <PageTransition>
                <Routes>
                  {/* These pages require Plex server access */}
                  <Route path="/" element={<RequireAccess><HomePage /></RequireAccess>} />
                  <Route path="/search" element={<RequireAccess><SearchPage /></RequireAccess>} />
                  <Route path="/movie/:id" element={<RequireAccess><MediaDetailPage type="movie" /></RequireAccess>} />
                  <Route path="/tv/:id" element={<RequireAccess><MediaDetailPage type="tv" /></RequireAccess>} />
                  <Route path="/requests" element={<RequireAccess><RequestsPage /></RequireAccess>} />

                  <Route path="/discover/:mediaType/genre/:genreId" element={<RequireAccess><DiscoverGenrePage /></RequireAccess>} />
                  <Route path="/category/:slug" element={<RequireAccess><CategoryPage /></RequireAccess>} />
                  <Route path="/calendar" element={<RequireAccess><CalendarPage /></RequireAccess>} />

                  {/* Support accessible even without full access */}
                  <Route path="/support" element={<MessagesPage />} />

                  {/* Plugin pages */}
                  <Route path="/p/:pluginId/*" element={<PluginPage />} />

                  {/* Admin only */}
                  <Route path="/admin" element={<AdminPage />} />
                </Routes>
              </PageTransition>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
    </InstallGuard>
  );
}
