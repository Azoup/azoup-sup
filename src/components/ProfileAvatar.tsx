import { memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getPhotoDisplaySrc } from '@/lib/photoDisplayCache';

type ProfileAvatarProps = {
  photoUrl?: string | null;
  previewUrl?: string | null;
  fallbackLabel: string;
  className?: string;
  imageClassName?: string;
};

function ProfileAvatarInner({
  photoUrl,
  previewUrl,
  fallbackLabel,
  className,
  imageClassName,
}: ProfileAvatarProps) {
  const stableSrc = previewUrl || getPhotoDisplaySrc(photoUrl);

  return (
    <Avatar className={className}>
      {stableSrc ? (
        <AvatarImage
          src={stableSrc}
          alt={fallbackLabel}
          className={imageClassName}
          referrerPolicy="no-referrer"
          loading="eager"
          decoding="async"
        />
      ) : null}
      <AvatarFallback delayMs={stableSrc ? 300 : 0}>
        {(fallbackLabel || '?').charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

export const ProfileAvatar = memo(ProfileAvatarInner);
