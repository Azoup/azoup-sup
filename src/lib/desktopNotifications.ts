export type DesktopNotificationPermission = NotificationPermission | 'unsupported';

export function getDesktopNotificationSupport(): DesktopNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestDesktopNotificationPermission(): Promise<DesktopNotificationPermission> {
  const support = getDesktopNotificationSupport();
  if (support === 'unsupported') return 'unsupported';
  if (support === 'granted') return 'granted';
  if (support === 'denied') return 'denied';
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

export function showDesktopNotification(input: {
  title: string;
  body: string;
  tag?: string;
  onClick?: () => void;
}): Notification | null {
  const support = getDesktopNotificationSupport();
  if (support !== 'granted') return null;

  try {
    const notification = new Notification(input.title, {
      body: input.body,
      tag: input.tag,
      icon: '/favicon.ico',
      requireInteraction: true,
    });

    notification.onclick = () => {
      window.focus();
      input.onClick?.();
      notification.close();
    };

    return notification;
  } catch {
    return null;
  }
}
