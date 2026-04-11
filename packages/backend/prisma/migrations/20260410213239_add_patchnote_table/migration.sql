-- CreateTable
CREATE TABLE "Patchnote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "version" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleFr" TEXT NOT NULL,
    "entries" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Patchnote_version_key" ON "Patchnote"("version");

-- Seed initial patchnotes
INSERT INTO "Patchnote" ("version", "type", "date", "titleEn", "titleFr", "entries") VALUES
('0.5.0', 'minor', '2026-04-11T00:00:00.000Z',
  'Jellyfin, Emby, Calendar & Discover filters',
  'Jellyfin, Emby, Calendrier et filtres de découverte',
  '[{"type":"feat","titleEn":"Jellyfin & Emby authentication","titleFr":"Authentification Jellyfin & Emby","descEn":"Sign in with your Jellyfin or Emby credentials, import users, link accounts","descFr":"Connectez-vous avec vos identifiants Jellyfin ou Emby, importez les utilisateurs, liez les comptes"},{"type":"feat","titleEn":"Calendar redesign","titleFr":"Refonte du calendrier","descEn":"Grid view with 6-day columns and compact cards, list view with poster scroll, toggle persisted","descFr":"Vue grille avec 6 colonnes et cartes compactes, vue liste avec défilement de posters, choix persisté"},{"type":"feat","titleEn":"Discover & category filters","titleFr":"Filtres de découverte et catégories","descEn":"Sort by popularity/rating/date, release year, minimum rating, hide already requested media","descFr":"Tri par popularité/note/date, année de sortie, note minimum, masquer les médias déjà demandés"},{"type":"feat","titleEn":"Cast section redesign","titleFr":"Refonte du casting","descEn":"Poster-style cards with scroll arrows, clickable links to person filmography page","descFr":"Cartes style poster avec flèches de défilement, liens cliquables vers la filmographie"},{"type":"feat","titleEn":"Person page","titleFr":"Page personne","descEn":"Biography, metadata and filmography grid with availability badges","descFr":"Biographie, métadonnées et grille de filmographie avec badges de disponibilité"},{"type":"feat","titleEn":"Changelog modal","titleFr":"Modal des nouveautés","descEn":"In-app release notes with automatic notification on update","descFr":"Notes de version intégrées avec notification automatique après mise à jour"},{"type":"fix","titleEn":"Login page redesigned","titleFr":"Page de connexion repensée","descEn":"Provider selection first, clean credential forms, brand colors","descFr":"Sélection du fournisseur d''abord, formulaires propres, couleurs de marque"},{"type":"fix","titleEn":"Keyword tag dropdown clipped","titleFr":"Menu déroulant des mots-clés coupé","descEn":"Portaled dropdown in Admin > Media > Keywords","descFr":"Menu déroulant portalé dans Admin > Médias > Mots-clés"}]'
),
('0.4.2', 'patch', '2026-04-10T00:00:00.000Z',
  'Bug fixes & performance',
  'Corrections et performances',
  '[{"type":"fix","titleEn":"Episode badge showing undefined","titleFr":"Badge épisode affichant undefined","descEn":"Fixed SundefinedEundefined on recently added cards when Sonarr stored raw episode data","descFr":"Corrigé le SundefinedEundefined sur les cartes récemment ajoutées quand Sonarr stockait les données brutes"},{"type":"perf","titleEn":"Homepage loads instantly","titleFr":"La page d''accueil charge instantanément","descEn":"Replaced 100+ TMDB API calls with a single DB query for NSFW detection","descFr":"Remplacé 100+ appels API TMDB par une seule requête DB pour la détection NSFW"},{"type":"fix","titleEn":"False unsaved changes on admin page","titleFr":"Faux indicateur de modifications non sauvegardées","descEn":"Race condition between concurrent API calls on the general settings page","descFr":"Condition de course entre les appels API concurrents sur la page paramètres"}]'
),
('0.4.0', 'minor', '2026-04-09T00:00:00.000Z',
  'Webhooks, requests redesign & community features',
  'Webhooks, refonte des demandes et fonctionnalités communautaires',
  '[{"type":"feat","titleEn":"Radarr/Sonarr webhooks","titleFr":"Webhooks Radarr/Sonarr","descEn":"Instant media availability updates without waiting for sync","descFr":"Mise à jour instantanée de la disponibilité des médias sans attendre le sync"},{"type":"feat","titleEn":"Requests page redesign","titleFr":"Refonte de la page demandes","descEn":"New card layout, filter tabs, bulk cleanup, quality selection","descFr":"Nouveau design en cartes, onglets de filtres, nettoyage en masse, sélection qualité"},{"type":"feat","titleEn":"Blacklist system","titleFr":"Système de liste noire","descEn":"Block specific media from being requested","descFr":"Bloquer des médias spécifiques pour empêcher les demandes"},{"type":"feat","titleEn":"NSFW blur with admin toggle","titleFr":"Flou NSFW avec toggle admin","descEn":"Automatic detection and blurring of mature content","descFr":"Détection et floutage automatique du contenu mature"},{"type":"fix","titleEn":"TV requests failing without tvdbId","titleFr":"Demandes TV échouant sans tvdbId","descEn":"Now resolves tvdbId from TMDB automatically","descFr":"Résolution automatique du tvdbId depuis TMDB"}]'
),
('0.3.1', 'patch', '2026-04-07T00:00:00.000Z',
  'Security & stability',
  'Sécurité et stabilité',
  '[{"type":"fix","titleEn":"Security dependencies updated","titleFr":"Dépendances de sécurité mises à jour"},{"type":"fix","titleEn":"Sync crashes on large libraries","titleFr":"Crash du sync sur les grosses bibliothèques","descEn":"Fixed SQLite parameter limit exceeded on large Radarr/Sonarr libraries","descFr":"Corrigé le dépassement de limite de paramètres SQLite sur les grosses bibliothèques"}]'
);
