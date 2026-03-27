# Plan: In-app user notification system (Issue #8)

## Context
Les utilisateurs n'ont aucun moyen de voir les updates de leurs demandes dans l'app. Les notifications vont uniquement vers Discord/Telegram/Email et sont admin-oriented. Cette feature ajoute une cloche avec dropdown dans le header pour les notifications utilisateur (request approved, media available, etc.) + hooks plugins.

## 1. Database — Prisma schema

Ajouter le modèle `UserNotification` dans `schema.prisma` + relation sur User :

```prisma
model UserNotification {
  id        Int      @id @default(autoincrement())
  userId    Int
  type      String   // "request_approved", "request_declined", "media_available", "plugin:xxx"
  title     String
  message   String
  read      Boolean  @default(false)
  metadata  String?  // JSON optionnel (mediaId, requestId, tmdbId, etc.)
  createdAt DateTime @default(now())

  user      User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, read])
  @@index([createdAt])
}
```

Ajouter `notifications UserNotification[]` sur le modèle User.

Migration : `npm run db:migrate:dev -- --name add_user_notifications`

## 2. Backend — Service de notification utilisateur

**Nouveau fichier** : `packages/backend/src/services/userNotifications.ts`

```typescript
async function send(userId: number, payload: { type: string; title: string; message: string; metadata?: Record<string, unknown> }): Promise<void>
async function sendToRequestOwner(requestId: number, payload: ...): Promise<void>  // helper
```

Réutilise `prisma` depuis `utils/prisma.ts`.

## 3. Backend — Routes notifications

**Nouveau fichier** : `packages/backend/src/routes/notifications.ts`

Prefix : `/api/notifications` — toutes les routes avec `preHandler: [app.authenticate]`

| Méthode | Route | Description | Schema |
|---------|-------|-------------|--------|
| GET | `/` | Liste paginée (newest first) | query: { page?, unreadOnly? } |
| GET | `/unread-count` | Compteur pour le badge | — |
| PUT | `/:id/read` | Marquer comme lu | params: { id } |
| PUT | `/read-all` | Tout marquer comme lu | — |
| DELETE | `/:id` | Supprimer une notification | params: { id } |

Chaque route filtre par `userId` du JWT — un user ne voit que ses propres notifications.

## 4. Backend — Intégration dans les flux existants

**`routes/requests.ts`** — Ajouter après les `sendNotification()` existants :
- `POST /:id/approve` → `userNotifications.send(request.userId, { type: 'request_approved', ... })`
- `POST /:id/decline` → `userNotifications.send(request.userId, { type: 'request_declined', ... })`

**`services/sync.ts`** — Quand un média passe à "available" :
- Récupérer les requests liées → `userNotifications.send()` pour chaque requester

## 5. Backend — Plugin integration

**`plugins/engine.ts`** — Étendre `createContext()` :
```typescript
sendUserNotification: (userId: number, payload) => userNotifications.send(userId, payload)
```

## 6. Backend — Register dans index.ts

```typescript
import { notificationRoutes } from './routes/notifications.js';
await app.register(notificationRoutes, { prefix: '/api/notifications' });
```

## 7. Frontend — Hook polling (`useNotifications.ts`)

Suivre le pattern de `useDownloads.ts` :
- Polling partagé toutes les 30s
- Cache global `cachedNotifications` + `cachedUnreadCount`
- Subscribe/unsubscribe automatique
- Expose : `notifications`, `unreadCount`, `markAsRead(id)`, `markAllRead()`, `dismiss(id)`

## 8. Frontend — Composant `NotificationBell.tsx`

- Icône `Bell` de lucide-react
- Badge rouge avec `unreadCount` (caché si 0)
- Click → dropdown avec liste des notifications
- Pattern identique au avatar dropdown de Layout.tsx (ref + outside click)
- "Mark all as read" en haut du dropdown
- Chaque item : titre, message, timestamp, indicateur lu/non-lu
- Click sur un item → marque comme lu

## 9. Frontend — Intégration Layout.tsx

Placer `<NotificationBell />` juste **avant** le div avatar dans le header (côté desktop et mobile).

## 10. Frontend — i18n

Ajouter dans `en/translation.json` et `fr/translation.json` :
```json
"notifications": {
  "title": "Notifications",
  "mark_all_read": "Mark all as read",
  "no_notifications": "No notifications",
  "request_approved": "Request approved",
  "request_declined": "Request declined",
  "media_available": "Media available"
}
```

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `prisma/schema.prisma` | Ajouter UserNotification + relation User |
| `prisma/migrations/YYYYMMDD_add_user_notifications/` | Migration auto-générée |
| `src/services/userNotifications.ts` | **Nouveau** — service d'envoi |
| `src/routes/notifications.ts` | **Nouveau** — 5 routes API |
| `src/routes/requests.ts` | Ajouter appels userNotifications |
| `src/services/sync.ts` | Ajouter notification "media_available" |
| `src/plugins/engine.ts` | Étendre PluginContext |
| `src/index.ts` | Register notification routes |
| `frontend/src/hooks/useNotifications.ts` | **Nouveau** — hook polling |
| `frontend/src/components/NotificationBell.tsx` | **Nouveau** — bell + dropdown |
| `frontend/src/components/Layout.tsx` | Intégrer NotificationBell |
| `frontend/src/i18n/locales/en/translation.json` | Clés i18n |
| `frontend/src/i18n/locales/fr/translation.json` | Clés i18n |

## Vérification
1. TypeScript compile sans erreur (backend + frontend)
2. Migration appliquée
3. Approuver une request → notification apparaît dans la cloche du requester
4. Décliner une request → idem
5. Média available (via sync) → notification au requester
6. Badge rouge affiche le bon compteur
7. "Mark all as read" fonctionne
8. Supprimer une notification fonctionne
9. Swagger affiche les routes sous le tag "Notifications"
