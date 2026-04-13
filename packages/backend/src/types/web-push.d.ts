declare module 'web-push' {
  interface PushSubscription {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }

  interface SendResult {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  }

  interface RequestOptions {
    TTL?: number;
    vapidDetails?: { subject: string; publicKey: string; privateKey: string };
    headers?: Record<string, string>;
  }

  function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  function sendNotification(subscription: PushSubscription, payload?: string | Buffer | null, options?: RequestOptions): Promise<SendResult>;
  function generateVAPIDKeys(): { publicKey: string; privateKey: string };

  export { PushSubscription, SendResult, RequestOptions };
  export { setVapidDetails, sendNotification, generateVAPIDKeys };
  export default { setVapidDetails, sendNotification, generateVAPIDKeys };
}
