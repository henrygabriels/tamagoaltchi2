import React from 'react';
import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Tamagotchi from '../components/Tamagotchi';
import { FplService } from '../services/fpl';
import Image from 'next/image';
import { registerForPushNotifications, unregisterFromPushNotifications } from '../services/notifications';
import { PushNotifications } from '@capacitor/push-notifications';

interface PlayerScore {
  name: string;
  points: number;
  position: number;
  multiplier: number;
  isOnBench: boolean;
  stats?: {
    goals: number;
    assists: number;
    bonus: number;
    cleanSheet: boolean;
    saves: number;
  };
  teamAbbr: string;
}

interface PlayerDetailsProps {
  player: PlayerScore;
  onClose: () => void;
}

const PlayerDetails = ({ player, onClose }: PlayerDetailsProps) => (
  <div className="absolute inset-0 bg-black flex flex-col items-center justify-center p-4">
    <div className="text-center">
      <div className="text-lg font-bold mb-2 text-magenta-400">{player.name}</div>
      <div className="text-2xl mb-4 text-yellow-400">{player.points} pts</div>
      {player.stats && (
        <div className="text-sm space-y-1 text-cyan-400">
          {player.stats.goals > 0 && <div>Goals: {player.stats.goals}</div>}
          {player.stats.assists > 0 && <div>Assists: {player.stats.assists}</div>}
          {player.stats.bonus > 0 && <div>Bonus: {player.stats.bonus}</div>}
          {player.stats.cleanSheet && <div>Clean Sheet</div>}
          {player.stats.saves > 0 && <div>Saves: {player.stats.saves}</div>}
        </div>
      )}
    </div>
    <button 
      onClick={onClose}
      className="mt-4 px-4 py-2 bg-cyan-500 text-black rounded pixel-corners hover:bg-cyan-400 transition-colors"
    >
      Back
    </button>
  </div>
);

interface TamagotchiCustomization {
  head: 'arteta' | 'dyche' | 'ferguson';
  body: 'suit' | 'tracksuit';
}

export default function Home() {
  const [teamId, setTeamId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [customization, setCustomization] = useState<TamagotchiCustomization>({
    head: 'arteta',
    body: 'suit'
  });
  const [score, setScore] = useState(0);
  const [mood, setMood] = useState<'happy' | 'neutral' | 'excited'>('neutral');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('');
  const [gameweekInfo, setGameweekInfo] = useState<string>('');
  const [playerScores, setPlayerScores] = useState<PlayerScore[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [fplService, setFplService] = useState<FplService | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerScore | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Initialize push notifications
  useEffect(() => {
    const initPushNotifications = async () => {
      try {
        // Check if we're in a Capacitor environment
        const isCapacitor = typeof (window as any).Capacitor !== 'undefined';
        console.log('Environment check:', { isCapacitor });

        if (isCapacitor) {
          console.log('Initializing push notifications in Capacitor environment...');
          
          try {
            // First, request POST_NOTIFICATIONS permission for Android 13+
            if ((window as any).Capacitor.getPlatform() === 'android') {
              const { Permissions } = await import('@capacitor/core');
              const permissionStatus = await Permissions.query({ name: 'notifications' });
              console.log('Android notification permission status:', permissionStatus);

              if (permissionStatus.state === 'prompt') {
                const requestResult = await Permissions.request({ name: 'notifications' });
                console.log('Android notification permission request result:', requestResult);
              }
            }

            // Then proceed with push notification setup
            const permStatus = await PushNotifications.checkPermissions();
            console.log('Push notification permission status:', permStatus);

            if (permStatus.receive !== 'granted') {
              console.log('Requesting push notification permissions...');
              const result = await PushNotifications.requestPermissions();
              console.log('Push notification permission result:', result);
              
              if (result.receive === 'granted') {
                await registerNotifications();
              } else {
                console.log('Push notification permission denied by user');
              }
            } else {
              await registerNotifications();
            }
          } catch (error) {
            console.error('Error during push notification permission check/request:', error);
          }
        } else {
          console.log('Not in Capacitor environment, using web push notifications');
          if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            console.log('Web notification permission result:', permission);
          }
        }
      } catch (error) {
        console.error('Error initializing push notifications:', error);
      }
    };

    const registerNotifications = async () => {
      try {
        // Register for push notifications
        await PushNotifications.register();
        console.log('Push notifications registered successfully');

        // Remove any existing listeners
        PushNotifications.removeAllListeners();

        // Add listeners
        PushNotifications.addListener('registration', (token) => {
          console.log('Push registration success, token:', token.value);
        });

        PushNotifications.addListener('registrationError', (error: any) => {
          console.error('Push registration error:', error.error);
        });

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('Push notification received:', notification);
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
          console.log('Push notification action performed:', notification);
        });
      } catch (error) {
        console.error('Error registering push notifications:', error);
      }
    };

    // Run initialization immediately
    initPushNotifications();
  }, []);

  // Load saved data and connect on mount
  useEffect(() => {
    const savedTeamId = localStorage.getItem('teamId');
    const savedCustomization = localStorage.getItem('customization');
    
    if (savedTeamId) {
      setTeamId(savedTeamId);
      connectToFpl(savedTeamId).then(success => {
        if (success) {
          if (savedCustomization) {
            setCustomization(JSON.parse(savedCustomization));
            setIsConnected(true);
          } else {
            setIsCustomizing(true);
          }
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectToFpl = useCallback(async (id: string) => {
    setIsLoading(true);
    setError('');
    setConnectionStatus('Connecting to FPL...');
    
    try {
      const service = new FplService(id);
      setFplService(service);
      setConnectionStatus('Fetching team data...');
      
      await service.initialize();
      
      // Get team info and gameweek data
      const teamInfo = await service.getTeamInfo();
      const gameweekDetails = await service.getGameweekDetails();
      
      // Get current gameweek from the service
      const currentGameweek = service.getCurrentGameweek();
      setGameweekInfo(`Gameweek ${currentGameweek}`);
      
      // Set score and check if gameweek is finished
      setScore(teamInfo.summary_event_points || 0);
      const isFinished = service.isGameweekFinished();
      setIsLive(!isFinished);

      // Get player scores
      const players = service.getPlayerScores();
      setPlayerScores(players);
      
      // Update UI states
      setMood(players.some(p => p.points > 6) ? 'excited' : 'happy');
      
      // Set appropriate status message and start live updates if needed
      if (isFinished) {
        setConnectionStatus('Showing completed gameweek data');
      } else {
        setConnectionStatus('Live tracking enabled');
        await service.startLiveUpdates(handleScoresUpdate);
      }

      // Register for push notifications
      const notificationsEnabled = await registerForPushNotifications(id);
      if (notificationsEnabled) {
        console.log('Push notifications enabled');
      } else {
        console.log('Push notifications not available');
      }

      return true;
    } catch (error: any) {
      console.error('Connection error:', error);
      setError(error.message || 'Error connecting to FPL. Please check your team ID and try again.');
      setMood('neutral');
      setConnectionStatus('');
      setFplService(null);
      localStorage.removeItem('teamId');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleScoresUpdate = (newScores: PlayerScore[]) => {
    setPlayerScores(newScores);
    // Calculate new total score
    const newTotal = newScores.reduce((sum, player) => sum + player.points, 0);
    setScore(newTotal);
    // Set mood based on score changes
    setMood('excited');
    setTimeout(() => setMood('happy'), 3000);
  };

  const handleConnect = async () => {
    if (!teamId) {
      setError('Please enter your team ID');
      return;
    }

    const success = await connectToFpl(teamId);
    if (success) {
      localStorage.setItem('teamId', teamId);
      setIsCustomizing(true); // Show customization screen after successful connection
    }
  };

  const handleCustomizationComplete = () => {
    setIsCustomizing(false);
    setIsConnected(true);
    localStorage.setItem('customization', JSON.stringify(customization));
  };

  const handleTeamIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    setTeamId(value);
    if (error) setError('');
  };

  const renderPlayerList = () => {
    const starters = playerScores.filter(p => !p.isOnBench);
    const bench = playerScores.filter(p => p.isOnBench);

    return (
      <>
        <div className="space-y-1">
          {starters.map((player, index) => (
            <div 
              key={index}
              onClick={() => setSelectedPlayer(player)}
              className="flex justify-between items-center group cursor-pointer hover:bg-cyan-400/10 px-1"
            >
              <div className="flex items-center gap-1">
                {player.multiplier > 1 && <span className="text-yellow-400">(C)</span>}
                <span className="text-[#50ff50]">
                  {player.name} ({player.teamAbbr})
                </span>
              </div>
              <span className="text-pink-400">{player.points}</span>
            </div>
          ))}
        </div>
        
        {bench.length > 0 && (
          <>
            <div className="h-[3px] bg-yellow-400/50 my-2"></div>
            <div className="text-pink-400 mb-1">BENCH</div>
            <div className="space-y-1">
              {bench.map((player, index) => (
                <div 
                  key={index}
                  onClick={() => setSelectedPlayer(player)}
                  className="flex justify-between items-center group cursor-pointer hover:bg-cyan-400/10 px-1"
                >
                  <span className="text-[#50ff50] opacity-75">
                    {player.name} ({player.teamAbbr})
                  </span>
                  <span className="text-pink-400 opacity-75">{player.points}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </>
    );
  };

  // Reset everything and start fresh
  const handleSettingsClick = () => {
    // Clear localStorage
    localStorage.removeItem('teamId');
    localStorage.removeItem('customization');
    
    // Reset all state
    setTeamId('');
    setIsConnected(false);
    setIsCustomizing(false);
    setCustomization({ head: 'arteta', body: 'suit' });
    setScore(0);
    setMood('neutral');
    setError('');
    setConnectionStatus('');
    setGameweekInfo('');
    setPlayerScores([]);
    setIsLive(false);
    setSelectedPlayer(null);
    
    // Clean up FPL service if it exists
    if (fplService) {
      fplService.cleanup();
      setFplService(null);
    }
  };

  const renderSettingsButton = () => (
    <button
      onClick={handleSettingsClick}
      className="absolute top-4 right-4 w-8 h-8 pixel-corners bg-cyan-500 hover:bg-cyan-400 transition-colors z-50"
      aria-label="Settings"
    >
      <div className="w-4 h-4 relative mx-auto">
        <div 
          className="absolute inset-0 pointer-events-none" 
          style={{ 
            boxShadow: `
              0 0 0 2px currentColor,
              2px 2px 0 2px currentColor,
              -2px -2px 0 2px currentColor,
              2px -2px 0 2px currentColor,
              -2px 2px 0 2px currentColor,
              0 3px 0 1px currentColor,
              0 -3px 0 1px currentColor,
              3px 0 0 1px currentColor,
              -3px 0 0 1px currentColor
            `
          }}
        />
      </div>
    </button>
  );

  const renderTeamSelection = () => {
    const heads = [
      { id: 'arteta' },
      { id: 'dyche' },
      { id: 'ferguson' }
    ];

    const bodies = [
      { id: 'suit' },
      { id: 'tracksuit' }
    ];

    return (
      <div className="space-y-12">
        <div>
          <h3 className="text-cyan-400 mb-6 text-sm text-center">Select Manager</h3>
          <div className="grid grid-cols-3 gap-4 justify-center max-w-[300px] mx-auto">
            {heads.map((head) => (
              <button
                key={head.id}
                onClick={() => setCustomization(prev => ({ ...prev, head: head.id as any }))}
                className={`w-24 h-24 border-2 ${
                  customization.head === head.id 
                    ? 'border-yellow-400' 
                    : 'border-cyan-400'
                } pixel-corners p-2 relative overflow-hidden bg-[#98FB98] flex items-center justify-center`}
              >
                <div className="relative w-16 h-16">
                  <div 
                    className="absolute inset-0"
                    style={{
                      backgroundImage: `url(/Managers/Previews/Heads/${head.id}.png)`,
                      backgroundSize: '100%',
                      imageRendering: 'pixelated'
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-cyan-400 mb-6 text-sm text-center">Select Outfit</h3>
          <div className="grid grid-cols-2 gap-4 justify-center max-w-[200px] mx-auto">
            {bodies.map((body) => (
              <button
                key={body.id}
                onClick={() => setCustomization(prev => ({ ...prev, body: body.id as any }))}
                className={`w-24 h-24 border-2 ${
                  customization.body === body.id 
                    ? 'border-yellow-400' 
                    : 'border-cyan-400'
                } pixel-corners p-2 relative overflow-hidden bg-[#98FB98] flex items-center justify-center`}
              >
                <div className="relative w-16 h-16">
                  <div 
                    className="absolute inset-0"
                    style={{
                      backgroundImage: `url(/Managers/Previews/Bodies/${body.id}.png)`,
                      backgroundSize: '100%',
                      imageRendering: 'pixelated'
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleCustomizationComplete}
          className="bg-cyan-500 text-black px-6 py-2 text-sm pixel-corners transform transition-transform active:scale-95 hover:bg-cyan-400 block mx-auto"
        >
          DONE
        </button>
      </div>
    );
  };

  // Add cleanup on unmount
  useEffect(() => {
    return () => {
      if (fplService) {
        fplService.cleanup();
        // Unregister from push notifications
        const teamId = localStorage.getItem('teamId');
        if (teamId) {
          unregisterFromPushNotifications(teamId).catch(console.error);
        }
      }
    };
  }, [fplService]);

  return (
    <>
      <Head>
        <title>Tamagoaltchi - FPL Companion</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <style jsx global>{`
        .pixel-corners {
          clip-path: polygon(
            0 4px, 4px 4px, 4px 0,
            calc(100% - 4px) 0, calc(100% - 4px) 4px, 100% 4px,
            100% calc(100% - 4px), calc(100% - 4px) calc(100% - 4px), calc(100% - 4px) 100%,
            4px 100%, 4px calc(100% - 4px), 0 calc(100% - 4px)
          );
        }
        .scanlines::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: repeating-linear-gradient(
            transparent 0px,
            rgba(255, 255, 255, 0.03) 1px,
            transparent 2px
          );
          pointer-events: none;
        }
        .screen-glare::after {
          content: "";
          position: absolute;
          top: -50%;
          left: -50%;
          right: -50%;
          bottom: -50%;
          background: linear-gradient(
            45deg,
            transparent 0%,
            rgba(255, 255, 255, 0.03) 45%,
            rgba(255, 255, 255, 0.05) 50%,
            rgba(255, 255, 255, 0.03) 55%,
            transparent 100%
          );
          transform: rotate(-45deg);
          pointer-events: none;
        }
        .screen-border {
          box-shadow: 
            inset 0 0 10px rgba(0, 255, 255, 0.2),
            inset 0 0 20px rgba(0, 255, 255, 0.1),
            0 0 10px rgba(0, 255, 255, 0.1);
        }
      `}</style>

      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center font-['Press_Start_2P']">
        <main className="w-full h-full flex items-center justify-center">
          {isCustomizing ? (
            <div className="w-full h-full bg-black relative overflow-hidden">
              <div className="bg-black w-full h-full p-4 flex flex-col items-center justify-center overflow-hidden relative scanlines screen-glare">
                <div className="text-center">
                  <h1 className="text-purple-400 text-xl mb-12">tamagoaltchi</h1>
                  {renderTeamSelection()}
                </div>
              </div>
            </div>
          ) : !isConnected ? (
            <div className="w-full h-full bg-black relative overflow-hidden">
              <div className="bg-black w-full h-full p-4 flex flex-col items-center justify-center overflow-hidden relative scanlines screen-glare">
                <div className="text-center">
                  <h1 className="text-purple-400 text-xl mb-12">tamagoaltchi</h1>
                  <div className="mb-8">
                    <input
                      type="text"
                      value={teamId}
                      onChange={handleTeamIdChange}
                      placeholder="TEAM ID"
                      className="bg-black border-2 border-cyan-400 p-2 mb-4 text-center w-48 text-sm pixel-corners focus:outline-none focus:border-cyan-300 text-cyan-400 placeholder-cyan-700"
                      disabled={isLoading}
                    />
                    {error && (
                      <div className="text-red-500 mb-4 text-[10px] font-bold">
                        {error}
                      </div>
                    )}
                    {connectionStatus && (
                      <div className="text-cyan-400 mb-4 text-[10px]">
                        {connectionStatus}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <button
                      onClick={handleConnect}
                      className={`bg-cyan-500 text-black px-6 py-2 text-sm pixel-corners transform transition-transform active:scale-95 hover:bg-cyan-400 ${
                        isLoading ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      disabled={isLoading}
                    >
                      {isLoading ? '...' : 'CONNECT'}
                    </button>

                    <div>
                      <button
                        onClick={() => setShowHelp(prev => !prev)}
                        className="text-cyan-400 text-[10px] hover:text-cyan-300 transition-colors mt-8"
                      >
                        How do I get my team ID?
                      </button>
                      
                      {showHelp && (
                        <div className="mt-4 text-[10px] text-cyan-400/75 max-w-xs mx-auto">
                          Your FPL Team ID can be found in your team URL:
                          <div className="mt-2 text-yellow-400 break-all">
                            fantasy.premierleague.com/entry/<span className="text-pink-400">XXXXXX</span>/event/1
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full h-full bg-black relative overflow-hidden">
              {/* Screen */}
              <div className="bg-black w-full h-full p-4 flex flex-col items-center justify-center overflow-hidden relative scanlines screen-glare">
                {renderSettingsButton()}
                
                <div className="w-full h-full flex flex-col relative">
                  {selectedPlayer ? (
                    <PlayerDetails 
                      player={selectedPlayer} 
                      onClose={() => setSelectedPlayer(null)}
                    />
                  ) : (
                    <div className="h-full flex flex-col">
                      {/* Header - Gameweek info */}
                      <div className="text-center pb-2 mb-2">
                        <div className="text-[10px] text-purple-400">{gameweekInfo}</div>
                        <div className="text-lg font-bold text-yellow-400 mb-1">Score: {score}</div>
                        <div className="text-[10px] text-cyan-400 mb-2">
                          {isLive ? 'Live' : '✓ Done'}
                        </div>
                        <div className="h-[3px] bg-yellow-400/50"></div>
                      </div>

                      {/* Player List */}
                      <div className="flex-1 min-h-0 overflow-y-auto mb-2 text-[10px] space-y-1">
                        {renderPlayerList()}
                      </div>

                      {/* Tamagotchi */}
                      <div className="h-64">
                        <Tamagotchi 
                          mood={mood} 
                          score={score} 
                          customization={customization}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
} 