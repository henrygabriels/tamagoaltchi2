import webpush, { PushSubscription, WebPushError } from 'web-push';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  data?: any;
}

export class NotificationService {
  private subscriptions: Map<string, PushSubscription[]> = new Map();
  
  constructor() {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      throw new Error('VAPID keys must be set in environment variables');
    }

    webpush.setVapidDetails(
      `mailto:${process.env.VAPID_EMAIL}`,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  }

  getVapidPublicKey(): string {
    return process.env.VAPID_PUBLIC_KEY!;
  }

  addSubscription(teamId: string, subscription: PushSubscription) {
    const teamSubscriptions = this.subscriptions.get(teamId) || [];
    if (!teamSubscriptions.some(sub => sub.endpoint === subscription.endpoint)) {
      teamSubscriptions.push(subscription);
      this.subscriptions.set(teamId, teamSubscriptions);
      console.log(`Added push subscription for team ${teamId}`);
    }
  }

  removeSubscription(teamId: string, endpoint: string) {
    const teamSubscriptions = this.subscriptions.get(teamId);
    if (teamSubscriptions) {
      const updatedSubscriptions = teamSubscriptions.filter(
        sub => sub.endpoint !== endpoint
      );
      if (updatedSubscriptions.length > 0) {
        this.subscriptions.set(teamId, updatedSubscriptions);
      } else {
        this.subscriptions.delete(teamId);
      }
      console.log(`Removed push subscription for team ${teamId}`);
    }
  }

  async sendNotification(teamId: string, payload: NotificationPayload) {
    const teamSubscriptions = this.subscriptions.get(teamId);
    if (!teamSubscriptions) return;

    const notifications = teamSubscriptions.map(async subscription => {
      try {
        await webpush.sendNotification(
          subscription,
          JSON.stringify(payload)
        );
      } catch (error) {
        if (error instanceof WebPushError && error.statusCode === 410) {
          // Subscription has expired or is invalid
          this.removeSubscription(teamId, subscription.endpoint);
        } else {
          console.error(`Error sending notification to team ${teamId}:`, error);
        }
      }
    });

    await Promise.all(notifications);
  }

  async notifyFplEvent(teamId: string, event: {
    type: string;
    player: string;
    points: number;
  }) {
    let title = '';
    let body = '';

    switch (event.type) {
      case 'goal':
        title = '⚽ Goal!';
        body = `${event.player} scored! (${event.points} pts)`;
        break;
      case 'assist':
        title = '👟 Assist!';
        body = `${event.player} provided an assist! (${event.points} pts)`;
        break;
      case 'cleanSheet':
        title = '🧤 Clean Sheet!';
        body = `${event.player} kept a clean sheet! (${event.points} pts)`;
        break;
      case 'save':
        title = '🧤 Great Save!';
        body = `${event.player} made 3 saves! (${event.points} pts)`;
        break;
      case 'penaltySave':
        title = '🦸‍♂️ Penalty Save!';
        body = `${event.player} saved a penalty! (${event.points} pts)`;
        break;
      case 'bonus':
        title = '⭐ Bonus Points!';
        body = `${event.player} earned ${event.points} bonus points!`;
        break;
      case 'minutesPlayed':
        if (event.points > 0) {
          title = '⌚ Minutes Milestone!';
          body = `${event.player} played ${event.points === 2 ? '60+' : '30+'} minutes! (${event.points} pts)`;
        }
        break;
      case 'ownGoal':
        title = '😅 Own Goal';
        body = `${event.player} scored an own goal (${event.points} pts)`;
        break;
      case 'penaltyMiss':
        title = '😫 Penalty Miss';
        body = `${event.player} missed a penalty (${event.points} pts)`;
        break;
      case 'redCard':
        title = '🟥 Red Card';
        body = `${event.player} was sent off (${event.points} pts)`;
        break;
      case 'yellowCard':
        title = '🟨 Yellow Card';
        body = `${event.player} was booked (${event.points} pts)`;
        break;
      case 'goalsConceded':
        title = '😔 Goals Conceded';
        body = `${event.player} conceded multiple goals (${event.points} pts)`;
        break;
    }

    if (title && body) {
      await this.sendNotification(teamId, {
        title,
        body,
        icon: '/icon-192x192.png', // Make sure to create these icons
        data: {
          type: 'FPL_EVENT',
          event
        }
      });
    }
  }
} 