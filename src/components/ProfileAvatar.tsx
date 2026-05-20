import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { normalizeProfilePhotoUrl, profilePhotoSrc, profilePhotoStoragePath } from '@/lib/profilePhotoUrl';

type ProfileAvatarProps = {
  photoUrl?: string | null;
  fallbackLabel: string;
  className?: string;
  imageClassName?: string;
  cacheBust?: string | number;
};

export function ProfileAvatar({
  photoUrl,
  fallbackLabel,
  className,
  imageClassName,
  cacheBust,
}: ProfileAvatarProps) {
  const [src, setSrc] = useState<string | undefined>(() =>
    profilePhotoSrc(photoUrl, cacheBust),
  );

  useEffect(() => {
    setSrc(profilePhotoSrc(photoUrl, cacheBust));
  }, [photoUrl, cacheBust]);

  const trySignedUrl = async () => {
    const raw = normalizeProfilePhotoUrl(photoUrl);
    if (!raw) return;
    const path = profilePhotoStoragePath(raw);
    if (!path) return;
    const { data, error } = await supabase.storage
      .from('profile-photos')
      .createSignedUrl(path, 60 * 60);
    if (!error && data?.signedUrl) {
      setSrc(data.signedUrl);
    }
  };

  return (
    <Avatar className={className}>
      <AvatarImage
        src={src}
        alt={fallbackLabel}
        className={imageClassName}
        onError={() => {
          void trySignedUrl();
        }}
      />
      <AvatarFallback>
        {(fallbackLabel || '?').charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
