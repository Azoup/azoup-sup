import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getPhotoDisplaySrc } from '@/lib/photoDisplayCache';
import { normalizeProfilePhotoUrl } from '@/lib/profilePhotoUrl';

type ProfileAvatarProps = {
  photoUrl?: string | null;
  alternatePhotoUrl?: string | null;
  previewUrl?: string | null;
  fallbackLabel: string;
  className?: string;
  imageClassName?: string;
  onPhotoLoaded?: () => void;
};

function pickDisplayUrl(photoUrl?: string | null, alternate?: string | null): string | undefined {
  return getPhotoDisplaySrc(photoUrl) ?? getPhotoDisplaySrc(alternate);
}

export function ProfileAvatar({
  photoUrl,
  alternatePhotoUrl,
  previewUrl,
  fallbackLabel,
  className,
  imageClassName,
  onPhotoLoaded,
}: ProfileAvatarProps) {
  const stablePhoto = pickDisplayUrl(photoUrl, alternatePhotoUrl);
  const [src, setSrc] = useState<string | undefined>(previewUrl || stablePhoto);

  useEffect(() => {
    if (previewUrl) {
      setSrc(previewUrl);
      return;
    }
    setSrc(stablePhoto);
  }, [previewUrl, stablePhoto, photoUrl, alternatePhotoUrl]);

  const handleImageError = () => {
    const direct = normalizeProfilePhotoUrl(photoUrl) ?? normalizeProfilePhotoUrl(alternatePhotoUrl);
    if (direct && src !== direct) {
      setSrc(direct);
      return;
    }
    if (previewUrl) {
      setSrc(previewUrl);
      return;
    }
    setSrc(undefined);
  };

  const handleImageLoad = () => {
    if (previewUrl && src === previewUrl) return;
    onPhotoLoaded?.();
  };

  return (
    <Avatar className={className}>
      {src ? (
        <AvatarImage
          src={src}
          alt={fallbackLabel}
          className={imageClassName}
          referrerPolicy="no-referrer"
          onError={handleImageError}
          onLoad={handleImageLoad}
        />
      ) : null}
      <AvatarFallback delayMs={src ? 400 : 0}>
        {(fallbackLabel || '?').charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
