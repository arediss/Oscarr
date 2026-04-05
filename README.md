<p align="center">
  <img src="packages/frontend/public/favicon.svg" width="80" alt="Oscarr" />
</p>

<h1 align="center">Oscarr</h1>

<p align="center">
  A modern, self-hosted media request & management platform.
  <br />
  Radarr & Sonarr are the source of truth. Oscarr is the interface.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.3.0-6366f1?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs Welcome" />
  <a href="https://discord.gg/BKMaWhVCRr"><img src="https://img.shields.io/badge/Discord-join-5865F2?style=flat-square&logo=discord&logoColor=white" alt="Discord" /></a>
  <br />
  <a href="https://sonarcloud.io/summary/overall?id=arediss_Oscarr"><img src="https://sonarcloud.io/api/project_badges/measure?project=arediss_Oscarr&metric=alert_status" alt="Quality Gate" /></a>
  <a href="https://sonarcloud.io/summary/overall?id=arediss_Oscarr"><img src="https://sonarcloud.io/api/project_badges/measure?project=arediss_Oscarr&metric=security_rating" alt="Security Rating" /></a>
  <a href="https://sonarcloud.io/summary/overall?id=arediss_Oscarr"><img src="https://sonarcloud.io/api/project_badges/measure?project=arediss_Oscarr&metric=reliability_rating" alt="Reliability Rating" /></a>
  <a href="https://sonarcloud.io/summary/overall?id=arediss_Oscarr"><img src="https://sonarcloud.io/api/project_badges/measure?project=arediss_Oscarr&metric=sqale_rating" alt="Maintainability Rating" /></a>
</p>

<p align="center">
  <img src="docs/preview.jpg" alt="Oscarr Preview" width="900" />
</p>

<p align="center">
  <a href="#why-oscarr">Why Oscarr?</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#tech-stack">Tech Stack</a> &middot;
  <a href="#quick-start-with-docker">Docker</a> &middot;
  <a href="#manual-setup">Manual Setup</a> &middot;
  <a href="#plugins">Plugins</a> &middot;
  <a href="#contributing">Contributing</a>
</p>

---

## Why Oscarr?

There are great tools out there for managing media requests. Oscarr doesn't aim to replace them — it offers a **different vision** of what this kind of tool can be.

The core idea: **Radarr and Sonarr are your source of truth**, not your media server. Oscarr syncs directly with your *arr instances, tracks what's available, what's downloading, and what's been requested — all from there. Plex is used for authentication and access control, but the library state comes from where it actually lives.

Here's what makes Oscarr different:

- **Multi-service native** — Connect as many Radarr and Sonarr instances as you need. Define folder rules with priority-based routing, and let Oscarr figure out where each request should go based on genre, language, or country. A 4K library, an anime Sonarr, a regional Radarr — it all coexists naturally.

- **Quality selection for users** — Let your users choose between SD, HD, 4K, or 4K HDR when requesting. Each quality maps to specific profiles per service, so the right content ends up in the right place.

- **Plugin system** — Oscarr is extensible at its core. Plugins can register backend routes, frontend pages, scheduled jobs, notification channels, and UI contributions — all from a simple manifest file. Build what you need without forking the whole project.

- **Feature toggles** — Don't need the calendar? Turn it off. Support tickets? Toggle it. Every section is optional, controlled from the admin panel in real time.

- **Modern stack, fast UI** — React 19, Vite, Tailwind, Fastify. The interface is dark-themed, responsive, and snappy.

---

## Features

**For users**
- Browse trending, popular, and upcoming media from TMDB
- Search movies and TV shows instantly
- Request media with quality and season selection
- Track request status in real time
- **Upcoming releases calendar** — See what's coming out and when, right from the app
- **Audio & subtitle language badges** — See available audio tracks and subtitles at a glance on any media
- **Complete the collection** — Own 3 out of 5 movies in a saga? One click to request the missing ones
- Support ticket system to contact admins
- Multi-language support (English & French)

**For admins**
- Multi-instance Radarr & Sonarr management
- Intelligent folder routing with condition-based rules (genre, language, country, user, role, keyword tag)
- Quality profile mappings per service
- User management with Plex server access verification
- Notification matrix (Discord, Telegram, Email) per event type
- Scheduled sync jobs with CRON configuration
- Feature toggles and incident banners
- Comprehensive application logs with label filtering
- Customizable site name and branding

**Architecture**
- Plugin system for extensibility
- SQLite database (zero config, easy backups)
- JWT authentication with Plex OAuth
- Role-based access control
- Auto-approve mode for trusted communities

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Tailwind CSS, React Router |
| Backend | Fastify, Prisma ORM, SQLite |
| Auth | Plex OAuth, JWT |
| Integrations | Radarr, Sonarr, TMDB, Plex |
| Notifications | Discord, Telegram, Resend (email) |
| Scheduling | node-cron |

---

## Quick Start with Docker

### Docker Run

```bash
docker run -d \
  --name oscarr \
  --network host \
  -e JWT_SECRET=your_random_secret_key \
  -v oscarr-data:/data \
  ghcr.io/arediss/oscarr:latest
```

### Docker Compose

Create a `docker-compose.yml`:

```yaml
services:
  oscarr:
    image: ghcr.io/arediss/oscarr:latest
    container_name: oscarr
    restart: unless-stopped
    network_mode: host
    volumes:
      - oscarr-data:/data
    environment:
      - JWT_SECRET=your_random_secret_key
      # - TMDB_API_TOKEN=your_own_key  # Optional: override the built-in TMDB key

volumes:
  oscarr-data:
```

```bash
docker compose up -d
```

Open `http://localhost:3456` and follow the setup wizard.

> **Notes:**
> - `network_mode: host` is recommended so Oscarr can reach your Radarr/Sonarr/Plex instances on the local network.
> - Data (SQLite database, install config) is persisted in the `oscarr-data` volume.
> - A built-in TMDB read access token is included — no signup needed. You can override it with `TMDB_API_TOKEN` if you prefer your own.
> - To use plugins, mount a plugins directory: `-v ./plugins:/app/packages/plugins`

---

## Manual Setup

### Prerequisites

- Node.js 20+
- npm 9+
- A Plex server
- A TMDB API key (optional — a built-in key is provided, [get your own here](https://www.themoviedb.org/settings/api))

### Installation

```bash
git clone https://github.com/arediss/Oscarr.git
cd Oscarr
npm install
```

### Configuration

Create a `.env` file at the root:

```env
JWT_SECRET=your_random_secret_key
DATABASE_URL=file:./dev.db
# TMDB_API_TOKEN=your_own_key  # Optional: a built-in read access token is provided by default
PORT=3456
FRONTEND_URL=http://localhost:5173
```

### Database setup

```bash
npm run db:generate
npm run db:push
```

### Development

```bash
npm run dev
```

This starts both the frontend (`:5173`) and backend (`:3456`) concurrently.

### Production

```bash
npm run build
NODE_ENV=production node packages/backend/dist/index.js
```

### First launch

Open the app and follow the setup wizard — connect your Plex server, authenticate with your admin account, and you're ready to go.

---

## Project Structure

```
oscarr/
├── packages/
│   ├── backend/          # Fastify API server
│   │   ├── src/
│   │   │   ├── routes/       # API route modules
│   │   │   ├── services/     # Business logic (sync, notifications, Plex...)
│   │   │   ├── plugins/      # Plugin engine
│   │   │   └── middleware/   # Auth middleware
│   │   └── prisma/           # Database schema & migrations
│   ├── frontend/         # React SPA
│   │   └── src/
│   │       ├── pages/        # Page components
│   │       ├── components/   # Shared UI components
│   │       ├── context/      # React contexts (auth, features)
│   │       ├── plugins/      # Frontend plugin system
│   │       └── i18n/         # Translations (EN, FR)
│   └── plugins/          # Drop-in plugin directory
└── package.json          # Workspace root
```

---

## Plugins

Oscarr supports a plugin system that lets you extend both the backend and frontend without modifying core code.

A plugin is a folder in `packages/plugins/` with a `manifest.json`:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "apiVersion": "v1",
  "entry": "index.js"
}
```

Plugins can:
- Register API routes
- Add scheduled jobs
- Contribute UI pages and admin tabs
- Expose feature flags
- Access the database, settings, and notification system

---

## Vision

> *One app to rule them all.*

Oscarr's ambition goes beyond media requests. The core is designed to be a **unified dashboard for your entire homelab media stack** — and plugins are how it gets there.

The core handles what every setup needs: authentication, user management, notifications, routing rules, and a beautiful interface. Everything else — Radarr, Sonarr, Plex, download clients, media servers — connects through **providers and plugins**. Today, Radarr and Sonarr are built-in. Tomorrow, the community can build plugins for anything: Lidarr for music, Readarr for books, Bazarr for subtitles, monitoring dashboards, storage analytics, or entirely custom workflows.

This is the guiding philosophy:

- **The core stays lean** — Authentication, UI shell, plugin engine, notification system. No hardcoded integrations that don't belong in every setup.
- **Plugins do the heavy lifting** — Each service integration is a self-contained plugin that registers its own routes, pages, jobs, and settings. Want to add Jellyfin support? Build a plugin, not a fork.
- **Modular by default** — Every feature is toggleable. Every integration is optional. You compose the app that fits your stack.
- **User-friendly always** — A fast, polished interface that non-technical users actually enjoy using. No config files, no terminal commands.
- **Community-driven** — Open source, actively maintained, and designed for contributions. Build a plugin, share it, help shape the ecosystem.

---

## Contributing

Contributions are welcome! Whether it's a bug fix, a new feature, or a plugin — feel free to open an issue or submit a PR.

> **Development workflow** — This project uses [Claude Code](https://claude.com/claude-code) as a development assistant for code reviews, security audits, brainstorming, documentation, and issue/PR management. All architecture decisions and implementation are made by the maintainers — Claude serves as a quality and productivity tool, much like a linter or a CI pipeline.

---

## License

MIT
