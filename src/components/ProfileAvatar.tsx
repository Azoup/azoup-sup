import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { resolvePhotoDisplayUrl } from '@/lib/profilePhotoUpload';
import { profilePhotoSrc } from '@/lib/profilePhotoUrl';

type ProfileAvatarProps = {
  photoUrl?: string | null;
  /** Se a foto principal falhar (ex.: perfil manual quebrado), tenta esta (cadastro). */
  alternatePhotoUrl?: string | null;
  /** URL imediata (blob ou assinada) logo após upload — evita esperar refetch */
  previewUrl?: string | null;
  fallbackLabel: string;
  className?: string;
  imageClassName?: string;
  cacheBust?: string | number;
};

async function loadDisplaySrc(
  url: string | null | undefined,
  cacheBust?: string | number,
): Promise<string | undefined> {
  if (!url?.trim()) return undefined;
  return (await resolvePhotoDisplayUrl(url, cacheBust)) ?? profilePhotoSrc(url, cacheBust);
}

export function ProfileAvatar({
  photoUrl,
  alternatePhotoUrl,
  previewUrl,
  fallbackLabel,
  className,
  imageClassName,
  cacheBust,
}: ProfileAvatarProps) {
  const [src, setSrc] = useState<string | undefined>(() =>
    previewUrl || profilePhotoSrc(photoUrl, cacheBust),
  );
  const [activeUrl, setActiveUrl] = useState<'primary' | 'alternate'>('primary');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (previewUrl) {
        if (!cancelled) setSrc(previewUrl);
        return;
      }
      const primary = photoUrl?.trim();
      const alternate = alternatePhotoUrl?.trim();
      const chosen =
        activeUrl === 'alternate' && alternate
          ? alternate
          : primary || alternate || '';
      if (!chosen) {
        if (!cancelled) setSrc(undefined);
        return;
      }
      const display = await loadDisplaySrc(chosen, cacheBust);
      if (!cancelled) setSrc(display);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [photoUrl, alternatePhotoUrl, previewUrl, cacheBust, activeUrl]);

  useEffect(() => {
    setActiveUrl('primary');
  }, [photoUrl, alternatePhotoUrl, previewUrl]);

  const handleImageError = () => {
    if (previewUrl) return;
    const alternate = alternatePhotoUrl?.trim();
    const primary = photoUrl?.trim();
    if (activeUrl === 'primary' && alternate && alternate !== primary) {
      setActiveUrl('alternate');
      return;
    }
    const publicFallback = profilePhotoSrc(
      activeUrl === 'alternate' ? alternatePhotoUrl : photoUrl,
      cacheBust,
    );
    if (publicFallback && src !== publicFallback) {
      setSrc(publicFallback);
      return;
    }
    setSrc(undefined);
  };

  const imageKey = `${activeUrl}-${photoUrl ?? ''}-${alternatePhotoUrl ?? ''}-${previewUrl ?? ''}-${cacheBust ?? ''}`;

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
        />
      ) : null}
      <AvatarFallback delayMs={src ? 600 : 0}>
        {(fallbackLabel || '?').charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
