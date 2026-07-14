export type NotificationEventKey =
  | "new_message"
  | "new_conversation"
  | "mention";

export interface NotificationSoundPreferences {
  enabled: boolean;
  file: string;
  volume: number;
}

export interface NotificationChannelPreferences {
  toast: boolean;
  browser: boolean;
  sound: NotificationSoundPreferences;
}

export interface NotificationEventPreferences {
  enabled: boolean;
  suppressWhenChatFocused: boolean;
  channels: NotificationChannelPreferences;
}

export type NotificationEventPreferencesMap = Record<
  NotificationEventKey,
  NotificationEventPreferences
>;

export interface UserNotificationPreferences {
  version: number;
  events: NotificationEventPreferencesMap;
}
