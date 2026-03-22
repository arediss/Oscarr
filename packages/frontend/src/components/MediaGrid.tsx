import MediaCard, { MediaCardSkeleton } from './MediaCard';
import { useMediaStatus, getStatusForMedia } from '@/hooks/useMediaStatus';
import type { TmdbMedia } from '@/types';

interface MediaGridProps {
  media: TmdbMedia[];
  loading?: boolean;
  skeletonCount?: number;
}

export default function MediaGrid({ media, loading, skeletonCount = 14 }: MediaGridProps) {
  const statuses = useMediaStatus(media);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
      {loading
        ? Array.from({ length: skeletonCount }).map((_, i) => <MediaCardSkeleton key={i} />)
        : media.map((item, i) => {
            const type = item.media_type || (item.title ? 'movie' : 'tv');
            return (
              <MediaCard
                key={`${type}-${item.id}`}
                media={item}
                availability={getStatusForMedia(statuses, item.id, type)}
                index={i}
              />
            );
          })}
    </div>
  );
}
