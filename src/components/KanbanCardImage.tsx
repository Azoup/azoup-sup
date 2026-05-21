import { memo, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { kanbanImageSrc } from '@/lib/kanbanImageUrl';
import { cn } from '@/lib/utils';

type KanbanCardImageProps = {
  imageUrl: string;
  className?: string;
  onClick?: () => void;
};

function KanbanCardImageInner({ imageUrl, className, onClick }: KanbanCardImageProps) {
  const [failed, setFailed] = useState(false);
  const src = kanbanImageSrc(imageUrl);

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
      onError={() => setFailed(true)}
    />
  );
}

export const KanbanCardImage = memo(KanbanCardImageInner);
