import express from 'express';
import { Server as WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import axios from 'axios';
import cors from 'cors';
import { NotificationService } from './services/NotificationService';
import { json } from 'body-parser';

interface FPLClient {
  ws: WebSocket;
  teamId: string;
}

interface FPLState {
  bootstrap: any;  // Full bootstrap-static data
  fixtures: any[]; // All fixtures
  gameweek: {
    current: number;
    isCurrent: boolean;
    isFinished: boolean;
    liveData: any;   // Live gameweek data
  };
  teams: Map<string, TeamState>; // Team-specific data
}

interface TeamState {
  picks: any[];
  liveScore: number;
  events: PlayerEvent[];
  gameweek: number;
  manager: any;      // Manager info
  history: any;      // Historical data
}

interface PlayerEvent {
  type: 'goal' | 'assist' | 'bonus' | 'cleanSheet' | 'save' | 'penaltySave' | 'penaltyMiss' | 
        'ownGoal' | 'redCard' | 'yellowCard' | 'minutesPlayed' | 'goalsConceded';
  player: string;
  points: number;
  timestamp: number;
}

interface FPLPlayer {
  id: number;
  web_name: string;
  element_type: 1 | 2 | 3 | 4;  // 1: GKP, 2: DEF, 3: MID, 4: FWD
}

class FPLServer {
  private clients: Map<string, FPLClient> = new Map();
  private state: FPLState = {
    bootstrap: null,
    fixtures: [],
    gameweek: {
      current: 0,
      isCurrent: false,
      isFinished: false,
      liveData: null
    },
    teams: new Map()
  };
  private updateInterval: NodeJS.Timeout | null = null;
  private readonly LIVE_POLL_INTERVAL = 30000; // 30 seconds
  private readonly IDLE_POLL_INTERVAL = 900000; // 15 minutes
  private notificationService: NotificationService;

  constructor(private wss: WebSocketServer) {
    this.notificationService = new NotificationService();
    this.setupWebSocketServer();
    this.initializeState();
  }

  private async initializeState() {
    try {
      // Fetch bootstrap data
      const bootstrapResponse = await axios.get('https://fantasy.premierleague.com/api/bootstrap-static/');
      this.state.bootstrap = bootstrapResponse.data;

      // Set current gameweek
      const currentGw = bootstrapResponse.data.events.find((event: any) => event.is_current);
      this.state.gameweek.current = currentGw.id;
      this.state.gameweek.isCurrent = true;
      this.state.gameweek.isFinished = currentGw.finished;

      // Fetch fixtures
      const fixturesResponse = await axios.get('https://fantasy.premierleague.com/api/fixtures/');
      this.state.fixtures = fixturesResponse.data;

      // Fetch live data for current gameweek
      await this.updateLiveData();

      console.log(`Initialized FPL state for gameweek ${this.state.gameweek.current}`);
      
      // Start polling with appropriate interval
      this.startPolling();
    } catch (error) {
      console.error('Error initializing FPL state:', error);
    }
  }

  private startPolling() {
    // Clear any existing interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Determine if we're in a live gameweek
    const isLiveGameweek = this.isLiveGameweek();
    const interval = isLiveGameweek ? this.LIVE_POLL_INTERVAL : this.IDLE_POLL_INTERVAL;

    console.log(`Starting polling with ${interval}ms interval (${isLiveGameweek ? 'live' : 'idle'} mode)`);

    this.updateInterval = setInterval(async () => {
      await this.updateState();
      
      // Check if we need to change polling interval
      const newIsLiveGameweek = this.isLiveGameweek();
      if (newIsLiveGameweek !== isLiveGameweek) {
        console.log('Gameweek status changed, adjusting polling interval');
        this.startPolling();
      }
    }, interval);

    // Do an immediate update
    this.updateState();
  }

  private isLiveGameweek(): boolean {
    if (!this.state.bootstrap) return false;

    const currentGw = this.state.bootstrap.events.find((event: any) => event.is_current);
    if (!currentGw) return false;

    // Check if there are any live fixtures
    const currentFixtures = this.state.fixtures.filter(f => f.event === currentGw.id);
    const hasLiveFixtures = currentFixtures.some(f => {
      const kickoffTime = new Date(f.kickoff_time);
      const now = new Date();
      const matchEnd = new Date(kickoffTime.getTime() + (2 * 60 * 60 * 1000)); // 2 hours after kickoff
      return now >= kickoffTime && now <= matchEnd;
    });

    return hasLiveFixtures && !currentGw.finished;
  }

  private async updateState() {
    try {
      // Update bootstrap data (less frequently as it doesn't change much)
      const bootstrapResponse = await axios.get('https://fantasy.premierleague.com/api/bootstrap-static/');
      this.state.bootstrap = bootstrapResponse.data;

      // Update fixtures
      const fixturesResponse = await axios.get('https://fantasy.premierleague.com/api/fixtures/');
      this.state.fixtures = fixturesResponse.data;

      // Update live data
      await this.updateLiveData();

      // Update each team's state
      for (const [teamId] of this.clients) {
        await this.updateTeamState(teamId);
      }

      // Notify clients of any changes
      this.notifyClients();
    } catch (error) {
      console.error('Error updating FPL state:', error);
    }
  }

  private async updateLiveData() {
    try {
      const liveResponse = await axios.get(
        `https://fantasy.premierleague.com/api/event/${this.state.gameweek.current}/live/`
      );
      this.state.gameweek.liveData = liveResponse.data;
    } catch (error) {
      console.error('Error updating live data:', error);
    }
  }

  private async updateTeamState(teamId: string) {
    try {
      // Fetch team picks
      const picksResponse = await axios.get(
        `https://fantasy.premierleague.com/api/entry/${teamId}/event/${this.state.gameweek.current}/picks/`
      );

      // Fetch team info and history
      const teamResponse = await axios.get(
        `https://fantasy.premierleague.com/api/entry/${teamId}/`
      );

      const teamHistory = await axios.get(
        `https://fantasy.premierleague.com/api/entry/${teamId}/history/`
      );

      // Process team data
      const picks = picksResponse.data.picks;
      const events: PlayerEvent[] = [];
      let liveScore = 0;

      // Calculate scores and collect events
      for (const pick of picks) {
        const playerLiveData = this.state.gameweek.liveData?.elements[pick.element - 1];
        if (!playerLiveData) continue;

        const stats = playerLiveData.stats;
        liveScore += stats.total_points * pick.multiplier;

        // Process events (goals, assists, etc.)
        await this.processPlayerEvents(playerLiveData, stats, events, teamId);
      }

      // Update team state
      this.state.teams.set(teamId, {
        picks,
        liveScore,
        events,
        gameweek: this.state.gameweek.current,
        manager: teamResponse.data,
        history: teamHistory.data
      });

    } catch (error) {
      console.error(`Error updating team state for ${teamId}:`, error);
    }
  }

  private async processPlayerEvents(playerData: any, stats: any, events: PlayerEvent[], teamId: string) {
    const player = this.state.bootstrap.elements.find((e: any) => e.id === playerData.id) as FPLPlayer | undefined;
    if (!player) return;

    const processEvent = async (type: PlayerEvent['type'], points: number) => {
      events.push({
        type,
        player: player.web_name,
        points,
        timestamp: Date.now()
      });

      // Send notification for the event
      await this.notificationService.notifyFplEvent(teamId, {
        type,
        player: player.web_name,
        points
      });
    };

    // Minutes played
    if (stats.minutes > 0) {
      const points = stats.minutes > 59 ? 2 : stats.minutes > 0 ? 1 : 0;
      if (points > 0) {
        await processEvent('minutesPlayed', points);
      }
    }

    // Goals scored
    if (stats.goals_scored > 0) {
      const pointsMap: Record<number, number> = {
        1: 10,  // GKP
        2: 6,   // DEF
        3: 5,   // MID
        4: 4    // FWD
      };
      const pointsPerGoal = pointsMap[player.element_type] || 4;
      await processEvent('goal', stats.goals_scored * pointsPerGoal);
    }

    // Assists
    if (stats.assists > 0) {
      await processEvent('assist', stats.assists * 3);
    }

    // Clean sheets
    if (stats.clean_sheets > 0) {
      const pointsMap: Record<number, number> = {
        1: 4,  // GKP
        2: 4,  // DEF
        3: 1,  // MID
        4: 0   // FWD
      };
      const points = pointsMap[player.element_type] || 0;
      if (points > 0) {
        await processEvent('cleanSheet', points);
      }
    }

    // Goals conceded
    if (stats.goals_conceded >= 2 && [1, 2].includes(player.element_type)) {
      const pointsDeducted = Math.floor(stats.goals_conceded / 2) * -1;
      await processEvent('goalsConceded', pointsDeducted);
    }

    // Saves
    if (stats.saves >= 3 && player.element_type === 1) {
      await processEvent('save', Math.floor(stats.saves / 3));
    }

    // Penalties saved
    if (stats.penalties_saved > 0) {
      await processEvent('penaltySave', stats.penalties_saved * 5);
    }

    // Penalties missed
    if (stats.penalties_missed > 0) {
      await processEvent('penaltyMiss', stats.penalties_missed * -2);
    }

    // Own goals
    if (stats.own_goals > 0) {
      await processEvent('ownGoal', stats.own_goals * -2);
    }

    // Yellow cards
    if (stats.yellow_cards > 0) {
      await processEvent('yellowCard', stats.yellow_cards * -1);
    }

    // Red cards
    if (stats.red_cards > 0) {
      await processEvent('redCard', stats.red_cards * -3);
    }

    // Bonus points
    if (stats.bonus > 0) {
      await processEvent('bonus', stats.bonus);
    }
  }

  private notifyClients() {
    for (const [teamId, client] of this.clients.entries()) {
      const teamState = this.state.teams.get(teamId);
      if (!teamState) continue;

      client.ws.send(JSON.stringify({
        type: 'update',
        data: {
          ...teamState,
          gameweekStatus: {
            current: this.state.gameweek.current,
            isFinished: this.state.gameweek.isFinished
          },
          fixtures: this.state.fixtures.filter(f => f.event === this.state.gameweek.current)
        }
      }));
    }
  }

  private setupWebSocketServer() {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('Client connected');

      ws.on('message', async (message: string) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'register') {
            const teamId = data.teamId;
            this.clients.set(teamId, { ws, teamId });
            console.log(`Registered client for team ${teamId}`);
            
            // Update and send initial state
            await this.updateTeamState(teamId);
            const teamState = this.state.teams.get(teamId);
            if (teamState) {
              ws.send(JSON.stringify({
                type: 'initial',
                data: {
                  ...teamState,
                  gameweekStatus: {
                    current: this.state.gameweek.current,
                    isFinished: this.state.gameweek.isFinished
                  },
                  fixtures: this.state.fixtures.filter(f => f.event === this.state.gameweek.current)
                }
              }));
            }
          }
        } catch (error) {
          console.error('Error processing message:', error);
        }
      });

      ws.on('close', () => {
        for (const [teamId, client] of this.clients.entries()) {
          if (client.ws === ws) {
            this.clients.delete(teamId);
            console.log(`Client for team ${teamId} disconnected`);
            break;
          }
        }
      });
    });
  }

  getNotificationService(): NotificationService {
    return this.notificationService;
  }
}

// Create Express app
const app = express();

// Enable CORS and JSON body parsing
app.use(cors());
app.use(json());

// Serve static files from public directory
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Initialize FPL server
const fplServer = new FPLServer(wss);

// Push notification endpoints
app.post('/api/push/subscribe', async (req, res) => {
  try {
    const { teamId, subscription } = req.body;
    if (!teamId || !subscription) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    fplServer.getNotificationService().addSubscription(teamId, subscription);
    res.json({ success: true });
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    res.status(500).json({ error: 'Failed to subscribe to push notifications' });
  }
});

app.delete('/api/push/unsubscribe', async (req, res) => {
  try {
    const { teamId, endpoint } = req.body;
    if (!teamId || !endpoint) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    fplServer.getNotificationService().removeSubscription(teamId, endpoint);
    res.json({ success: true });
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    res.status(500).json({ error: 'Failed to unsubscribe from push notifications' });
  }
});

app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ key: fplServer.getNotificationService().getVapidPublicKey() });
});

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Add a root endpoint
app.get('/', (req, res) => {
  res.json({ message: 'FPL WebSocket server running' });
});

// Handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 