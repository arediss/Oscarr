import { useAuth } from '@/context/AuthContext';
import { Link } from 'react-router-dom';
import { ShieldX, MessageSquare, CreditCard, Server } from 'lucide-react';

export default function NoAccessPage() {
  const { user, hasPlexServerAccess, isSubscriptionActive } = useAuth();

  return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center">
      <div className="card p-8">
        <ShieldX className="w-16 h-16 text-ndp-warning mx-auto mb-6" />
        <h1 className="text-2xl font-bold text-ndp-text mb-2">Accès restreint</h1>
        <p className="text-ndp-text-muted mb-6">
          Bonjour {user?.plexUsername || user?.email}, votre accès est actuellement limité.
        </p>

        <div className="space-y-4 text-left mb-8">
          {!hasPlexServerAccess && (
            <div className="flex items-start gap-3 p-4 bg-ndp-danger/5 border border-ndp-danger/20 rounded-xl">
              <Server className="w-5 h-5 text-ndp-danger flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-ndp-danger">Pas d'accès au serveur Plex</p>
                <p className="text-xs text-ndp-text-muted mt-1">
                  Votre compte Plex n'a pas accès au serveur. Contactez l'administrateur pour être ajouté.
                </p>
              </div>
            </div>
          )}

          {!isSubscriptionActive && (
            <div className="flex items-start gap-3 p-4 bg-ndp-warning/5 border border-ndp-warning/20 rounded-xl">
              <CreditCard className="w-5 h-5 text-ndp-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-ndp-warning">Abonnement inactif</p>
                <p className="text-xs text-ndp-text-muted mt-1">
                  Votre abonnement n'est pas actif ou a expiré. Effectuez votre paiement et contactez l'administrateur.
                </p>
                {user?.subscriptionEndDate && (
                  <p className="text-xs text-ndp-text-dim mt-1">
                    Expiré le {new Date(user.subscriptionEndDate).toLocaleDateString('fr-FR')}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <p className="text-ndp-text-muted text-sm mb-6">
          Vous pouvez contacter le support pour obtenir de l'aide.
        </p>

        <Link to="/support" className="btn-primary inline-flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Contacter le support
        </Link>
      </div>
    </div>
  );
}
