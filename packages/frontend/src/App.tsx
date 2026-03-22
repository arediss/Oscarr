import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import Layout from '@/components/Layout';
import HomePage from '@/pages/HomePage';
import LoginPage from '@/pages/LoginPage';
import SearchPage from '@/pages/SearchPage';
import MediaDetailPage from '@/pages/MediaDetailPage';
import RequestsPage from '@/pages/RequestsPage';
import MessagesPage from '@/pages/MessagesPage';
import DownloadsPage from '@/pages/DownloadsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/movie/:id" element={<MediaDetailPage type="movie" />} />
                <Route path="/tv/:id" element={<MediaDetailPage type="tv" />} />
                <Route path="/requests" element={<RequestsPage />} />
                <Route path="/messages" element={<MessagesPage />} />
                <Route path="/downloads" element={<DownloadsPage />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
