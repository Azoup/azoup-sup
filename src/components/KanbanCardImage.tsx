import { memo, useEffect, useMemo, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { displayKanbanImageUrl } from '@/lib/uploadKanbanImage';
import { cn } from '@/lib/utils';

type KanbanCardImageProps = {
  imageUrl: string;
  className?: string;
  onClick?: () => void;
};

function KanbanCardImageInner({ imageUrl, className, onClick }: KanbanCardImageProps) {
  const candidates = useMemo(() => {
    const normalized = displayKanbanImageUrl(imageUrl);
    const raw = imageUrl?.trim();
    const list = [normalized, raw].filter((u): u is string => !!u);
    return [...new Set(list)];
  }, [imageUrl]);

  const [candidateIndex, setCandidateIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const src = candidates[candidateIndex];

  useEffect(() => {
    setCandidateIndex(0);
    setFailed(false);
  }, [imageUrl]);

  if (!src || failed) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-muted text-muted-foreground border rounded-lg',
          className,
        )}
        role={onClick ? 'button' : undefined}
        onClick={onClick}
        onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        <ImageOff className="h-8 w-8 opacity-50" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onClick={onClick}
      onError={() => {
        if (candidateIndex < candidates.length - 1) {
          setCandidateIndex((i) => i + 1);
          return;
        }
        setFailed(true);
      }}
    />
  );
}

export const KanbanCardImage = memo(KanbanCardImageInner);
