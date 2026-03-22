import { prisma } from '../utils/prisma.js';
import type { TmdbMovie, TmdbTv } from './tmdb.js';

export interface RuleCondition {
  field: 'genre' | 'language' | 'country';
  operator: 'contains' | 'is' | 'in';
  value: string; // Comma-separated for "in" operator
}

export interface RuleMatch {
  folderPath: string;
  seriesType?: string | null;
}

interface MediaContext {
  mediaType: 'movie' | 'tv';
  genres: string[];
  originCountry: string[];
  originalLanguage: string;
}

function buildContext(mediaType: 'movie' | 'tv', tmdbData: TmdbMovie | TmdbTv): MediaContext {
  const genres = tmdbData.genres?.map(g => g.name.toLowerCase()) ?? [];
  const originCountry = 'origin_country' in tmdbData ? (tmdbData.origin_country ?? []) : [];
  const originalLanguage = 'original_language' in tmdbData ? (tmdbData.original_language ?? '') : '';

  return { mediaType, genres, originCountry, originalLanguage };
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

    default:
      return false;
  }
}

export async function matchFolderRule(
  mediaType: 'movie' | 'tv',
  tmdbData: TmdbMovie | TmdbTv
): Promise<RuleMatch | null> {
  const rules = await prisma.folderRule.findMany({
    where: {
      mediaType: { in: [mediaType, 'all'] },
    },
    orderBy: { priority: 'asc' },
  });

  if (rules.length === 0) return null;

  const ctx = buildContext(mediaType, tmdbData);

  for (const rule of rules) {
    const conditions: RuleCondition[] = JSON.parse(rule.conditions);

    // All conditions must match (AND logic)
    const allMatch = conditions.length > 0 && conditions.every(c => evaluateCondition(c, ctx));

    if (allMatch) {
      return {
        folderPath: rule.folderPath,
        seriesType: rule.seriesType,
      };
    }
  }

  return null;
}
