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

async function resolveUserRole(userId: number | null): Promise<string | null> {
  if (userId === null) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role ?? null;
}

function parseKeywordIds(raw: string, tmdbId: number): number[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn(`[FolderRules] Malformed keywordIds for tmdbId=${tmdbId}: ${raw}`);
    return [];
  }
}

async function resolveKeywordTags(tmdbId: number | null): Promise<string[]> {
  if (!tmdbId) return [];

  const media = await prisma.media.findFirst({
    where: { tmdbId },
    select: { keywordIds: true },
  });
  if (!media?.keywordIds) return [];

  const ids = parseKeywordIds(media.keywordIds, tmdbId);
  if (ids.length === 0) return [];

  const keywords = await prisma.keyword.findMany({
    where: { tmdbId: { in: ids }, tag: { not: null } },
    select: { tag: true },
  });

  const tags = new Set<string>();
  for (const kw of keywords) {
    if (kw.tag) tags.add(kw.tag);
  }
  return [...tags];
}

async function buildContext(
  mediaType: 'movie' | 'tv',
  tmdbData: TmdbMovie | TmdbTv,
  userId: number | null,
): Promise<MediaContext> {
  const genres = tmdbData.genres?.map(g => g.name.toLowerCase()) ?? [];
  const originCountry = 'origin_country' in tmdbData ? (tmdbData.origin_country ?? []) : [];
  const originalLanguage = 'original_language' in tmdbData ? (tmdbData.original_language ?? '') : '';

  const tmdbId = 'id' in tmdbData ? tmdbData.id : null;
  const [userRole, keywordTags] = await Promise.all([
    resolveUserRole(userId),
    resolveKeywordTags(tmdbId),
  ]);

  return {
    mediaType, genres,
    originCountry: originCountry.map(c => c.toLowerCase()),
    originalLanguage,
    userId, userRole,
    keywordTags: keywordTags.map(t => t.toLowerCase()),
  };
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
        return values.some(v => ctx.originCountry.includes(v));
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
        return values.some(v => ctx.keywordTags.includes(v));
      }
      return false;

    default:
      return false;
  }
}

function parseRuleConditions(rule: { id: number; name: string; conditions: string }): RuleCondition[] | null {
  try {
    return JSON.parse(rule.conditions);
  } catch {
    console.warn(`[FolderRules] Malformed conditions in rule id=${rule.id} "${rule.name}", skipping`);
    return null;
  }
}

async function resolveDefaultFolder(
  mediaType: 'movie' | 'tv',
  seriesType: string | null,
): Promise<string> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (seriesType === 'anime' && settings?.defaultAnimeFolder) return settings.defaultAnimeFolder;
  if (mediaType === 'tv' && settings?.defaultTvFolder) return settings.defaultTvFolder;
  if (mediaType === 'movie' && settings?.defaultMovieFolder) return settings.defaultMovieFolder;
  return '';
}

export async function matchFolderRule(
  mediaType: 'movie' | 'tv',
  tmdbData: TmdbMovie | TmdbTv,
  userId: number | null = null,
): Promise<RuleMatch | null> {
  const rules = await prisma.folderRule.findMany({
    where: { mediaType, enabled: true },
    orderBy: { priority: 'asc' },
  });

  if (rules.length === 0) return null;

  const ctx = await buildContext(mediaType, tmdbData, userId);

  for (const rule of rules) {
    const conditions = parseRuleConditions(rule);
    if (!conditions) continue;

    const allMatch = conditions.length > 0 && conditions.every(c => evaluateCondition(c, ctx));
    if (!allMatch) continue;

    const folderPath = rule.folderPath || await resolveDefaultFolder(mediaType, rule.seriesType);
    return {
      folderPath,
      seriesType: rule.seriesType,
      serviceId: rule.serviceId,
    };
  }

  return null;
}
