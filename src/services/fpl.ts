import axios from 'axios';

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
  private pollingInterval: NodeJS.Timeout | null = null;
  private onScoresUpdate: ((scores: PlayerScore[]) => void) | null = null;

  constructor(teamId: string) {
    this.teamId = teamId;
  }

  private async makeRequest(endpoint: string) {
    try {
      console.log('Making request to endpoint:', endpoint);
      
      const response = await axios.get(`/api/fpl-proxy`, {
        params: { endpoint }
      });
      
      if (!response.data) {
        throw new Error('Empty response from FPL API');
      }
      
      return response.data;
    } catch (error: any) {
      console.error('API request error:', error);
      throw new Error(error.response?.data?.error || 'Failed to fetch FPL data');
    }
  }

  async initialize() {
    try {
      // Get all player data
      const bootstrapData = await this.makeRequest('/bootstrap-static/');
      
      // Store team abbreviations
      bootstrapData.teams.forEach((team: { id: number, short_name: string }) => {
        this.teamMap.set(team.id, team.short_name);
      });

      bootstrapData.elements.forEach((player: PlayerSummary) => {
        this.playerMap.set(player.id, player);
      });

      // Find current gameweek
      const { gameweek, info } = this.findRelevantGameweek(bootstrapData.events);
      this.currentGameweek = gameweek;
      this.gameweekInfo = info;

      // Get team picks
      const picks = await this.makeRequest(`/entry/${this.teamId}/event/${this.currentGameweek}/picks/`);
      this.picks = picks.picks;

      // Get gameweek data
      this.gameweekData = await this.makeRequest(`/event/${this.currentGameweek}/live/`);

      return this.currentGameweek;
    } catch (error: any) {
      console.error('Initialization error:', error);
      throw error;
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
    return await this.makeRequest(`/entry/${this.teamId}/`);
  }

  async getGameweekDetails() {
    if (!this.currentGameweek) {
      throw new Error('No gameweek selected');
    }
    return this.gameweekData;
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
    
    // Don't start polling for completed gameweeks
    if (this.isGameweekFinished()) {
      console.log('Gameweek is finished, not starting live updates');
      return;
    }

    console.log('Starting live updates...');
    
    // Clear any existing interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    // Poll every 30 seconds during live games
    this.pollingInterval = setInterval(async () => {
      try {
        const newData = await this.makeRequest(`/event/${this.currentGameweek}/live/`);
        const oldScores = this.getPlayerScores();
        
        // Update gameweek data
        this.gameweekData = newData;
        
        // Get new scores
        const newScores = this.getPlayerScores();
        
        // Check if any scores changed
        const hasChanges = newScores.some((newScore) => {
          const oldScore = oldScores.find(s => s.name === newScore.name);
          return oldScore?.points !== newScore.points;
        });

        if (hasChanges && this.onScoresUpdate) {
          console.log('Scores updated:', newScores);
          this.onScoresUpdate(newScores);
        }
      } catch (error) {
        console.error('Error polling live data:', error);
      }
    }, 30000); // 30 seconds
  }

  stopLiveUpdates() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
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