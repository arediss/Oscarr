import { prisma } from '../utils/prisma.js';
import type { TmdbMovie, TmdbTv } from './tmdb.js';

export interface RuleCondition {
  field: 'genre' | 'language' | 'country' | 'user' | 'role' | 'tag';
  operator: 'contains' | 'is' | 'in';
  value: string; // Comma-separated for "in" operator
}

export interface RuleMatch {
  folderPath: string;
  seriesType?: string | null;
  serviceId?: number | null;
}

interface MediaContext {
  mediaType: 'movie' | 'tv';
  genres: string[];
  originCountry: string[];
  originalLanguage: string;
  userId: number | null;
  userRole: string | null;
  keywordTags: string[];
}

async function buildContext(
  mediaType: 'movie' | 'tv',
  tmdbData: TmdbMovie | TmdbTv,
  userId: number | null,
): Promise<MediaContext> {
  const genres = tmdbData.genres?.map(g => g.name.toLowerCase()) ?? [];
  const originCountry = 'origin_country' in tmdbData ? (tmdbData.origin_country ?? []) : [];
  const originalLanguage = 'original_language' in tmdbData ? (tmdbData.original_language ?? '') : '';

  // Resolve user role
  let userRole: string | null = null;
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    userRole = user?.role ?? null;
  }

  // Resolve keyword tags for this media
  const keywordTags: string[] = [];
  const tmdbId = 'id' in tmdbData ? tmdbData.id : null;
  if (tmdbId) {
    const media = await prisma.media.findFirst({
      where: { tmdbId },
      select: { keywordIds: true },
    });
    if (media?.keywordIds) {
      const ids: number[] = JSON.parse(media.keywordIds);
      if (ids.length > 0) {
        const keywords = await prisma.keyword.findMany({
          where: { tmdbId: { in: ids }, tag: { not: null } },
          select: { tag: true },
        });
        for (const kw of keywords) {
          if (kw.tag && !keywordTags.includes(kw.tag)) keywordTags.push(kw.tag);
        }
      }
    }
  }

  return { mediaType, genres, originCountry, originalLanguage, userId, userRole, keywordTags };
}

function evaluateCondition(condition: RuleCondition, ctx: MediaContext): boolean {
  const values = condition.value.split(',').map(v => v.trim().toLowerCase());

  switch (condition.field) {
    case 'genre':
      if (condition.operator === 'contains') {
        return values.some(v => ctx.genres.includes(v));
      }
      return false;

    case 'language':
      if (condition.operator === 'is' || condition.operator === 'in') {
        return values.includes(ctx.originalLanguage.toLowerCase());
      }
      return false;

    case 'country':
      if (condition.operator === 'contains' || condition.operator === 'in') {
        return values.some(v => ctx.originCountry.map(c => c.toLowerCase()).includes(v));
      }
      return false;

    case 'user':
      if (condition.operator === 'is' || condition.operator === 'in') {
        return ctx.userId !== null && values.includes(ctx.userId.toString());
      }
      return false;

    case 'role':
      if (condition.operator === 'is') {
        return ctx.userRole !== null && values.includes(ctx.userRole.toLowerCase());
      }
      return false;

    case 'tag':
      if (condition.operator === 'contains') {
        return values.some(v => ctx.keywordTags.map(t => t.toLowerCase()).includes(v));
      }
      return false;

    default:
      return false;
  }
}

export async function matchFolderRule(
  mediaType: 'movie' | 'tv',
  tmdbData: TmdbMovie | TmdbTv,
  userId: number | null = null,
): Promise<RuleMatch | null> {
  const rules = await prisma.folderRule.findMany({
    where: {
      mediaType: { in: [mediaType, 'all'] },
    },
    orderBy: { priority: 'asc' },
  });

  if (rules.length === 0) return null;

  const ctx = await buildContext(mediaType, tmdbData, userId);

  for (const rule of rules) {
    const conditions: RuleCondition[] = JSON.parse(rule.conditions);

    // All conditions must match (AND logic)
    const allMatch = conditions.length > 0 && conditions.every(c => evaluateCondition(c, ctx));

    if (allMatch) {
      let folderPath = rule.folderPath;
      // If folderPath is empty, resolve from default settings
      if (!folderPath) {
        const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
        if (rule.seriesType === 'anime' && settings?.defaultAnimeFolder) {
          folderPath = settings.defaultAnimeFolder;
        } else if (mediaType === 'tv' && settings?.defaultTvFolder) {
          folderPath = settings.defaultTvFolder;
        } else if (mediaType === 'movie' && settings?.defaultMovieFolder) {
          folderPath = settings.defaultMovieFolder;
        }
      }
      return {
        folderPath,
        seriesType: rule.seriesType,
        serviceId: rule.serviceId,
      };
    }
  }

  return null;
}
