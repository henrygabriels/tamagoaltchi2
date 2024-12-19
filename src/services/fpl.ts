import axios from 'axios';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';
const IS_CAPACITOR = typeof window !== 'undefined' && window.location.protocol === 'capacitor:';

interface PlayerSummary {
  id: number;
  web_name: string;
  team: number;
}

interface LiveElementStats {
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  saves: number;
  bonus: number;
  yellow_cards: number;
  red_cards: number;
  total_points: number;
}

interface LiveElement {
  id: number;
  stats: LiveElementStats;
}

interface Pick {
  element: number;
  position: number;
  multiplier: number;
  is_captain: boolean;
  is_vice_captain: boolean;
}

interface GameweekInfo {
  id: number;
  is_current: boolean;
  is_next: boolean;
  is_previous: boolean;
  finished: boolean;
  data_checked: boolean;
  deadline_time: string;
}

interface PlayerScore {
  name: string;
  points: number;
  position: number;
  multiplier: number;
  isOnBench: boolean;
  teamAbbr: string;
  stats: {
    goals: number;
    assists: number;
    bonus: number;
    cleanSheet: boolean;
    saves: number;
  };
}

export class FplService {
  private teamId: string;
  private playerMap: Map<number, PlayerSummary> = new Map();
  private teamMap: Map<number, string> = new Map();
  private picks: Pick[] = [];
  private gameweekInfo: GameweekInfo | null = null;
  private currentGameweek: number | null = null;
  private gameweekData: any = null;
  private ws: WebSocket | null = null;
  private onScoresUpdate: ((scores: PlayerScore[]) => void) | null = null;

  constructor(teamId: string) {
    this.teamId = teamId;
  }

  private async makeRequest(endpoint: string, isSetup: boolean = false) {
    try {
      console.log(`Making ${isSetup ? 'setup' : 'live'} request to endpoint:`, endpoint);
      
      const baseUrl = IS_CAPACITOR ? SERVER_URL : '';
      const url = `${baseUrl}/api/fpl-proxy`;
      
      const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      const response = await axios.get(url, {
        params: { 
          endpoint: normalizedEndpoint,
          mode: isSetup ? 'setup' : 'live'
        },
        timeout: 10000
      });
      
      return response.data;
    } catch (error: any) {
      console.error('API request error:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      
      if (error.code === 'ECONNABORTED') {
        throw new Error('Request timed out. Please check your internet connection.');
      }
      if (error.response?.status === 404) {
        throw new Error('Team not found. Please check your team ID.');
      }
      throw new Error(error.response?.data?.error || 'Failed to fetch FPL data');
    }
  }

  async initialize() {
    try {
      console.log('Starting FPL service initialization...');
      
      // Get team info in setup mode
      const teamInfo = await this.makeRequest(`/entry/${this.teamId}/`, true);
      console.log('Team found:', teamInfo.name);

      // Get bootstrap data in setup mode
      const bootstrapData = await this.makeRequest('/bootstrap-static/', true);
      console.log('Bootstrap data received, validating...');
      
      if (!bootstrapData) {
        throw new Error('No bootstrap data received from FPL API');
      }
      
      if (!bootstrapData.teams || !bootstrapData.elements || !bootstrapData.events) {
        throw new Error(`Invalid bootstrap data structure. Missing required fields. Available fields: ${Object.keys(bootstrapData).join(', ')}`);
      }
      
      // Store team abbreviations
      console.log('Processing team data...');
      bootstrapData.teams.forEach((team: { id: number, short_name: string }) => {
        this.teamMap.set(team.id, team.short_name);
      });
      console.log(`Processed ${this.teamMap.size} teams`);

      console.log('Processing player data...');
      bootstrapData.elements.forEach((player: PlayerSummary) => {
        this.playerMap.set(player.id, player);
      });
      console.log(`Processed ${this.playerMap.size} players`);

      // Find current gameweek
      console.log('Finding current gameweek...');
      const { gameweek, info } = this.findRelevantGameweek(bootstrapData.events);
      this.currentGameweek = gameweek;
      this.gameweekInfo = info;
      console.log(`Current gameweek: ${gameweek}`);

      // Get team picks in setup mode
      console.log('Fetching team picks...');
      const picks = await this.makeRequest(`/entry/${this.teamId}/event/${this.currentGameweek}/picks/`, true);
      if (!picks || !picks.picks) {
        throw new Error('Invalid picks data received from FPL API');
      }
      this.picks = picks.picks;
      console.log(`Processed ${this.picks.length} picks`);

      // Get initial gameweek data in live mode
      console.log('Fetching gameweek data...');
      const gameweekData = await this.makeRequest(`/event/${this.currentGameweek}/live/`, false);
      if (!gameweekData || !gameweekData.elements) {
        throw new Error('Invalid gameweek data received from FPL API');
      }
      this.gameweekData = gameweekData;

      console.log('FPL service initialized successfully');
      return this.currentGameweek;
    } catch (error: any) {
      console.error('Initialization error:', error);
      throw new Error(`Failed to initialize FPL service: ${error.message}`);
    }
  }

  private findRelevantGameweek(events: any[]): { gameweek: number, info: GameweekInfo } {
    const currentGw = events.find(event => event.is_current);
    if (currentGw) {
      return { gameweek: currentGw.id, info: currentGw };
    }

    const lastFinishedGw = [...events].reverse().find(event => event.finished);
    if (lastFinishedGw) {
      return { gameweek: lastFinishedGw.id, info: lastFinishedGw };
    }

    const nextGw = events.find(event => !event.finished);
    if (nextGw) {
      return { gameweek: nextGw.id, info: nextGw };
    }

    throw new Error('No gameweek data available');
  }

  async getTeamInfo() {
    // Get team info in setup mode
    return await this.makeRequest(`/entry/${this.teamId}/`, true);
  }

  async getGameweekDetails() {
    if (!this.currentGameweek) {
      throw new Error('No gameweek selected');
    }
    // Get gameweek data in live mode
    return this.makeRequest(`/event/${this.currentGameweek}/live/`, false);
  }

  isGameweekFinished(): boolean {
    return this.gameweekInfo?.finished || false;
  }

  getPlayerScores(): PlayerScore[] {
    if (!this.gameweekData || !this.picks) return [];

    return this.picks.map(pick => {
      const player = this.playerMap.get(pick.element);
      const stats = this.gameweekData.elements.find((e: any) => e.id === pick.element)?.stats;
      
      if (!player || !stats) return null;

      return {
        name: player.web_name,
        points: stats.total_points * pick.multiplier,
        position: pick.position,
        multiplier: pick.multiplier,
        isOnBench: pick.position > 11,
        teamAbbr: this.teamMap.get(player.team) || '',
        stats: {
          goals: stats.goals_scored || 0,
          assists: stats.assists || 0,
          bonus: stats.bonus || 0,
          cleanSheet: stats.clean_sheets > 0,
          saves: stats.saves || 0
        }
      };
    }).filter((score): score is PlayerScore => score !== null)
    .sort((a, b) => {
      // First sort by bench status
      if (a.isOnBench !== b.isOnBench) {
        return a.isOnBench ? 1 : -1;
      }
      // Then by position
      return a.position - b.position;
    });
  }

  async startLiveUpdates(callback: (scores: PlayerScore[]) => void) {
    this.onScoresUpdate = callback;
    
    if (this.isGameweekFinished()) {
      console.log('Gameweek is finished, not starting live updates');
      return;
    }

    console.log('Starting live updates via WebSocket...');
    
    if (this.ws) {
      this.ws.close();
    }

    // Create WebSocket connection
    const wsProtocol = IS_CAPACITOR || window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const serverUrl = new URL(SERVER_URL);
    const wsUrl = `${wsProtocol}//${serverUrl.host}`;
    
    console.log('Connecting to WebSocket URL:', wsUrl);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected, registering team ID:', this.teamId);
      this.ws.send(JSON.stringify({
        type: 'register',
        teamId: this.teamId
      }));
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received WebSocket message:', data);
        if (data.type === 'update' && this.onScoresUpdate) {
          this.onScoresUpdate(data.data.picks);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket connection closed:', event.code, event.reason);
      setTimeout(() => {
        console.log('Attempting to reconnect WebSocket...');
        this.startLiveUpdates(callback);
      }, 5000);
    };
  }

  stopLiveUpdates() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.onScoresUpdate = null;
  }

  // Add cleanup method
  cleanup() {
    this.stopLiveUpdates();
  }

  getCurrentGameweek(): number {
    if (!this.currentGameweek) {
      throw new Error('No gameweek selected');
    }
    return this.currentGameweek;
  }
} 