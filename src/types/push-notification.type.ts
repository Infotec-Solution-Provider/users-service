export interface PushSubscriptionPayload {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    auth: string;
    p256dh: string;
  };
}

export interface PushNotificationPayload {
  event: "new_message" | "new_conversation" | "mention";
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string;
}