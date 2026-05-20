import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { resolvePhotoDisplayUrl } from '@/lib/profilePhotoUpload';
import { profilePhotoSrc } from '@/lib/profilePhotoUrl';

type ProfileAvatarProps = {
  photoUrl?: string | null;
  /** URL imediata (blob ou assinada) logo após upload — evita esperar refetch */
  previewUrl?: string | null;
  fallbackLabel: string;
  className?: string;
  imageClassName?: string;
  cacheBust?: string | number;
};

export function ProfileAvatar({
  photoUrl,
  previewUrl,
  fallbackLabel,
  className,
  imageClassName,
  cacheBust,
}: ProfileAvatarProps) {
  const [src, setSrc] = useState<string | undefined>(() =>
    previewUrl || profilePhotoSrc(photoUrl, cacheBust),
  );

  useEffect(() => {
    let cancelled = false;

    if (previewUrl) {
      setSrc(previewUrl);
      return;
    }

    const run = async () => {
      if (!photoUrl?.trim()) {
        if (!cancelled) setSrc(undefined);
        return;
      }
      const display = await resolvePhotoDisplayUrl(photoUrl, cacheBust);
      if (!cancelled) setSrc(display);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [photoUrl, previewUrl, cacheBust]);

  const imageKey = `${photoUrl ?? ''}-${previewUrl ?? ''}-${cacheBust ?? ''}`;

  return (
    <Avatar className={className}>
      {src ? (
        <AvatarImage
          key={imageKey}
          src={src}
          alt={fallbackLabel}
          className={imageClassName}
          referrerPolicy="no-referrer"
        />
      ) : null}
      <AvatarFallback delayMs={src ? 600 : 0}>
        {(fallbackLabel || '?').charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
