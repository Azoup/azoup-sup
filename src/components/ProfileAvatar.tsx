import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getPhotoDisplaySrc } from '@/lib/photoDisplayCache';
import { profilePhotoSrc } from '@/lib/profilePhotoUrl';

type ProfileAvatarProps = {
  photoUrl?: string | null;
  alternatePhotoUrl?: string | null;
  /** Blob local logo após upload — mantido até a URL do banco carregar */
  previewUrl?: string | null;
  fallbackLabel: string;
  className?: string;
  imageClassName?: string;
  cacheBust?: string | number;
  onPhotoLoaded?: () => void;
};

export function ProfileAvatar({
  photoUrl,
  alternatePhotoUrl,
  previewUrl,
  fallbackLabel,
  className,
  imageClassName,
  cacheBust,
  onPhotoLoaded,
}: ProfileAvatarProps) {
  const [src, setSrc] = useState<string | undefined>(() => previewUrl || profilePhotoSrc(photoUrl, cacheBust));

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const primary = photoUrl?.trim();
      const alternate = alternatePhotoUrl?.trim();

      if (previewUrl) {
        if (!cancelled) setSrc(previewUrl);
      }

      const toResolve = primary || alternate || '';
      if (!toResolve) {
        if (!previewUrl && !cancelled) setSrc(undefined);
        return;
      }

      const resolved = await getPhotoDisplaySrc(toResolve);
      if (cancelled || !resolved) return;

      setSrc((current) => {
        if (previewUrl && current === previewUrl) return resolved;
        if (!previewUrl) return resolved;
        return current;
      });
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [photoUrl, alternatePhotoUrl, previewUrl, cacheBust]);

  const handleImageError = () => {
    const publicDirect = profilePhotoSrc(photoUrl, cacheBust);
    if (publicDirect && src !== publicDirect) {
      setSrc(publicDirect);
      return;
    }
    const altDirect = profilePhotoSrc(alternatePhotoUrl, cacheBust);
    if (altDirect && src !== altDirect) {
      setSrc(altDirect);
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

  const imageKey = `${photoUrl ?? ''}-${alternatePhotoUrl ?? ''}-${previewUrl ?? ''}-${src ?? ''}`;

  return (
    <Avatar className={className}>
      {src ? (
        <AvatarImage
          key={imageKey}
          src={src}
          alt={fallbackLabel}
          className={imageClassName}
          referrerPolicy="no-referrer"
          onError={handleImageError}
          onLoad={handleImageLoad}
        />
      ) : null}
      <AvatarFallback delayMs={src ? 600 : 0}>
        {(fallbackLabel || '?').charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
