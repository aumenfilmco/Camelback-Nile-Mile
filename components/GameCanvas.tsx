import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameState, Player, Obstacle, ObstacleType, GameStats } from '../types';
import { GAME_CONFIG, COLORS } from '../constants';
import { getSkiCoachCommentary } from '../services/geminiService';
import { Play, RotateCcw, Award } from 'lucide-react';

// --- Game Logic Helpers ---

// The "Nile Mile" Switchback curve function
// z is distance in meters (pixels in game coordinates)
const getTrackOffset = (z: number): number => {
  // Broad, sweeping turns for the "Nile Mile"
  // Frequency reduced for wider, longer turns
  return Math.sin(z * 0.0015) * 600;
};

export const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  
  // React State for UI Overlay
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [stats, setStats] = useState<GameStats>({ score: 0, distance: 0, topSpeed: 0, causeOfDeath: null });
  const [coachComment, setCoachComment] = useState<string>("");
  const [isLoadingCoach, setIsLoadingCoach] = useState(false);

  // Mutable Game State (Refs for performance to avoid React re-renders during loop)
  const stateRef = useRef({
    player: { x: 0, y: 0, speed: 0, direction: 0, state: 'skiing' } as Player,
    obstacles: [] as Obstacle[],
    lastObstacleY: 0,
    keys: { left: false, right: false, down: false },
    startTime: 0,
    yeti: { active: false, x: 0, y: -1000, speed: 0 }
  });

  const generateObstacles = useCallback((startY: number, endY: number) => {
    const { obstacles, lastObstacleY } = stateRef.current;
    
    // Ensure we don't generate too densely
    let currentY = Math.max(startY, lastObstacleY + 40);

    while (currentY < endY) {
      // Determine track bounds at this Y
      const trackCenter = getTrackOffset(currentY);
      const halfWidth = GAME_CONFIG.TRACK_WIDTH / 2;
      const leftBoundary = trackCenter - halfWidth;
      const rightBoundary = trackCenter + halfWidth;
      
      // --- Left Tree Line (The Forest) ---
      // Dense wall layer 1
      stateRef.current.obstacles.push({
        id: Math.random(),
        x: leftBoundary - 20 - Math.random() * 60,
        y: currentY,
        type: ObstacleType.TREE,
        width: 60 + Math.random() * 30,
        height: 90 + Math.random() * 50,
      });
       // Dense wall layer 2 (deeper)
      stateRef.current.obstacles.push({
        id: Math.random(),
        x: leftBoundary - 100 - Math.random() * 200,
        y: currentY + Math.random() * 20,
        type: ObstacleType.TREE,
        width: 50,
        height: 80,
      });

      // --- Right Tree Line (The Forest) ---
      // Dense wall layer 1
      stateRef.current.obstacles.push({
        id: Math.random(),
        x: rightBoundary + 20 + Math.random() * 60,
        y: currentY,
        type: ObstacleType.TREE,
        width: 60 + Math.random() * 30,
        height: 90 + Math.random() * 50,
      });
      // Dense wall layer 2
      stateRef.current.obstacles.push({
        id: Math.random(),
        x: rightBoundary + 100 + Math.random() * 200,
        y: currentY + Math.random() * 20,
        type: ObstacleType.TREE,
        width: 50,
        height: 80,
      });

      // --- On-Track Obstacles (Nile Mile Hazards) ---
      // Rocks and stumps in the middle of the trail, but sparse enough to ski
      if (Math.random() < 0.15) {
         // Place randomly within the track width
         const lane = (Math.random() - 0.5) * 0.9; // 90% of width
         stateRef.current.obstacles.push({
            id: Math.random(),
            x: trackCenter + lane * GAME_CONFIG.TRACK_WIDTH,
            y: currentY,
            type: Math.random() > 0.6 ? ObstacleType.ROCK : ObstacleType.STUMP,
            width: 30,
            height: 30,
         });
      }

      currentY += 35; // Tighter spacing for tree walls
    }
    stateRef.current.lastObstacleY = currentY;
  }, []);

  const startGame = useCallback(() => {
    stateRef.current = {
      player: { x: 0, y: 0, speed: 0, direction: 0, state: 'skiing' },
      obstacles: [],
      lastObstacleY: 0,
      keys: { left: false, right: false, down: false },
      startTime: Date.now(),
      yeti: { active: false, x: 0, y: -1000, speed: 0 }
    };
    
    // Seed initial obstacles
    generateObstacles(0, GAME_CONFIG.VIEW_DISTANCE);
    
    setStats({ score: 0, distance: 0, topSpeed: 0, causeOfDeath: null });
    setCoachComment("");
    setGameState(GameState.PLAYING);
  }, [generateObstacles]);

  // --- Input Handling ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') stateRef.current.keys.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd') stateRef.current.keys.right = true;
      if (e.key === 'ArrowDown' || e.key === 's') stateRef.current.keys.down = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') stateRef.current.keys.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd') stateRef.current.keys.right = false;
      if (e.key === 'ArrowDown' || e.key === 's') stateRef.current.keys.down = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Handle Enter key for Start/Restart
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (gameState === GameState.MENU || gameState === GameState.GAME_OVER) {
          startGame();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [gameState, startGame]);

  const gameOver = async (cause: string) => {
    setGameState(GameState.GAME_OVER);
    const finalStats = {
      score: Math.floor(stateRef.current.player.y),
      distance: stateRef.current.player.y,
      topSpeed: stats.topSpeed,
      causeOfDeath: cause
    };
    setStats(finalStats);
    
    setIsLoadingCoach(true);
    const comment = await getSkiCoachCommentary(finalStats);
    setCoachComment(comment);
    setIsLoadingCoach(false);
  };

  const update = () => {
    if (gameState !== GameState.PLAYING) return;
    
    const state = stateRef.current;
    const { player, keys } = state;

    // --- Movement Physics ---
    // Acceleration
    if (player.speed < GAME_CONFIG.MAX_SPEED) {
      player.speed += GAME_CONFIG.ACCELERATION;
    }
    
    // Turning
    let turn = 0;
    if (keys.left) turn -= 1;
    if (keys.right) turn += 1;
    
    // Physics
    if (turn !== 0) {
      player.direction += turn * 0.1;
      player.speed -= 0.05;
    } else {
      player.direction *= 0.92; // Slight damping
    }
    // Clamp direction
    player.direction = Math.max(-1.8, Math.min(1.8, player.direction));

    // Update Position
    player.x += player.direction * GAME_CONFIG.BASE_SPEED;
    player.y += player.speed;

    // Track top speed
    if (player.speed * 5 > stats.topSpeed) {
      setStats(prev => ({ ...prev, topSpeed: player.speed * 5 }));
    }

    // --- Track Management ---
    if (state.lastObstacleY < player.y + GAME_CONFIG.VIEW_DISTANCE) {
      generateObstacles(state.lastObstacleY, player.y + GAME_CONFIG.VIEW_DISTANCE + 500);
    }
    
    // Cleanup
    state.obstacles = state.obstacles.filter(o => o.y > player.y - 200);

    // --- Collision Detection ---
    for (const obs of state.obstacles) {
      const dy = obs.y - player.y;
      const dx = obs.x - player.x;
      
      // Simple Hitbox
      if (dy > -10 && dy < 30) {
        // Tighter hitbox for gameplay feel
        if (Math.abs(dx) < (obs.width / 2)) {
           state.player.state = 'crashed';
           gameOver(`Hit a ${obs.type.toLowerCase()}`);
           return;
        }
      }
    }

    // --- Yeti Logic ---
    if (player.y > 3000 && !state.yeti.active) {
       state.yeti.active = true;
       state.yeti.y = player.y - 800;
       state.yeti.x = player.x;
    }

    if (state.yeti.active) {
      state.yeti.speed = player.speed + 0.6; // Relentless
      state.yeti.y += state.yeti.speed;
      
      const dx = player.x - state.yeti.x;
      state.yeti.x += dx * 0.04;

      if (state.yeti.y > player.y - 20) {
        state.player.state = 'crashed';
        gameOver("Caught by the Yeti");
        return;
      }
    }
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Setup Canvas
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const { player, obstacles, yeti } = stateRef.current;

    // --- Camera ---
    const cameraY = player.y - 150;
    const cameraX = player.x - width / 2;

    const toScreen = (wx: number, wy: number) => ({
      x: wx - cameraX,
      y: wy - cameraY
    });

    // --- Draw Snow ---
    ctx.fillStyle = COLORS.SNOW;
    ctx.fillRect(0, 0, width, height);
    
    // --- Grid Lines ---
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const gridStart = Math.floor(cameraY / 100) * 100;
    for (let gy = gridStart; gy < cameraY + height; gy += 100) {
       const screenY = gy - cameraY;
       ctx.moveTo(0, screenY);
       ctx.lineTo(width, screenY);
    }
    ctx.stroke();

    // --- Draw Entities ---
    const renderList = [
      ...obstacles,
      { ...player, type: 'PLAYER', width: 20, height: 30 },
      ...(yeti.active ? [{ ...yeti, type: 'YETI', width: 40, height: 50 }] : [])
    ];

    renderList.sort((a, b) => a.y - b.y);

    renderList.forEach(entity => {
      const pos = toScreen(entity.x, entity.y);
      if (pos.y < -100 || pos.y > height + 100) return;

      if (entity.type === 'PLAYER') {
         drawPlayer(ctx, pos.x, pos.y, player.direction, player.state === 'crashed');
      } else if (entity.type === 'YETI') {
         drawYeti(ctx, pos.x, pos.y);
      } else if (entity.type === ObstacleType.TREE) {
         drawTree(ctx, pos.x, pos.y, (entity as Obstacle).width);
      } else if (entity.type === ObstacleType.ROCK) {
         drawRock(ctx, pos.x, pos.y);
      } else if (entity.type === ObstacleType.STUMP) {
         drawStump(ctx, pos.x, pos.y);
      }
    });

    // Score Overlay
    if (gameState === GameState.PLAYING) {
      ctx.fillStyle = '#1e293b';
      ctx.font = '16px "Press Start 2P"';
      ctx.fillText(`${Math.floor(player.y)}m`, 20, 40);
      
      // Speedometer
      ctx.fillStyle = player.speed > 10 ? '#ef4444' : '#10b981';
      ctx.fillRect(20, 50, player.speed * 10, 10);
    }
  };

  // --- Drawing Helpers ---

  const drawPlayer = (ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, crashed: boolean) => {
    if (crashed) {
      ctx.fillStyle = COLORS.PLAYER_SUIT;
      ctx.fillRect(x - 10, y - 5, 20, 10); 
      ctx.fillStyle = COLORS.PLAYER_SKIS;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-15, -2, 30, 4);
      ctx.restore();
      return;
    }

    // Skis
    ctx.fillStyle = COLORS.PLAYER_SKIS;
    // INVERTED ROTATION: -dir makes skis point left when turning left (CCW)
    const skiAngle = -dir * 0.5; 
    ctx.save();
    ctx.translate(x, y + 10);
    ctx.rotate(skiAngle);
    ctx.fillRect(-8, -2, 6, 20); // Left Ski
    ctx.fillRect(2, -2, 6, 20); // Right Ski
    ctx.restore();

    // Body
    ctx.fillStyle = COLORS.PLAYER_SUIT;
    ctx.fillRect(x - 6, y - 10, 12, 16);
    
    // Head
    ctx.fillStyle = '#fce7f3';
    ctx.fillRect(x - 4, y - 18, 8, 8);
    // Goggles
    ctx.fillStyle = '#111';
    ctx.fillRect(x - 4, y - 16, 8, 4);
  };

  const drawTree = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number = 40) => {
    const scale = width / 40;
    
    ctx.fillStyle = COLORS.TREE_DARK;
    ctx.beginPath();
    ctx.moveTo(x, y - 40 * scale);
    ctx.lineTo(x + 15 * scale, y);
    ctx.lineTo(x - 15 * scale, y);
    ctx.fill();
    
    ctx.fillStyle = COLORS.TREE_LIGHT;
    ctx.beginPath();
    ctx.moveTo(x, y - 30 * scale);
    ctx.lineTo(x + 12 * scale, y - 5 * scale);
    ctx.lineTo(x - 12 * scale, y - 5 * scale);
    ctx.fill();
    
    ctx.fillStyle = '#451a03';
    ctx.fillRect(x - 3 * scale, y, 6 * scale, 8 * scale);
  };

  const drawRock = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.fillStyle = COLORS.ROCK;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(x - 3, y - 3, 4, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawStump = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.fillStyle = '#451a03';
    ctx.fillRect(x - 5, y - 5, 10, 10);
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.arc(x, y - 5, 5, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawYeti = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.fillStyle = COLORS.YETI_FUR;
    ctx.beginPath();
    ctx.arc(x, y - 20, 15, 0, Math.PI * 2);
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.fill();
    
    // Arms
    const time = Date.now() / 100;
    const armY = Math.sin(time) * 10;
    
    ctx.lineWidth = 8;
    ctx.strokeStyle = COLORS.YETI_FUR;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 15, y - 10);
    ctx.lineTo(x - 30, y - 10 + armY);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(x + 15, y - 10);
    ctx.lineTo(x + 30, y - 10 - armY);
    ctx.stroke();

    // Face
    ctx.fillStyle = COLORS.YETI_SKIN;
    ctx.fillRect(x - 8, y - 25, 16, 10);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(x - 5, y - 23, 4, 4);
    ctx.fillRect(x + 1, y - 23, 4, 4);
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 6, y - 18, 12, 2);
  };

  const loop = (time: number) => {
    update();
    draw();
    requestRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [gameState]);

  useEffect(() => {
    const handleResize = () => {
       if (canvasRef.current) {
         canvasRef.current.width = window.innerWidth;
         canvasRef.current.height = window.innerHeight;
       }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="relative w-full h-screen bg-slate-900 overflow-hidden">
      <canvas ref={canvasRef} className="block w-full h-full" />
      <div className="scanlines"></div>

      {/* Start Screen */}
      {gameState === GameState.MENU && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50">
          <div className="text-center animate-bounce-slow">
            <h1 className="text-4xl font-retro text-transparent bg-clip-text bg-gradient-to-b from-blue-400 to-white mb-8 drop-shadow-[4px_4px_0_rgba(0,0,0,1)]">
              Camelback Resort presents:<br/>
              <span className="text-6xl text-white block mt-4 text-shadow-lg">NILE MILE</span>
            </h1>
            <p className="text-blue-200 mb-8 font-retro text-xs uppercase tracking-widest">
              Can you survive the switchbacks?
            </p>
            
            <button 
              onClick={startGame}
              className="group relative px-8 py-4 bg-red-500 hover:bg-red-600 transition-all active:translate-y-1 shadow-[4px_4px_0_rgba(0,0,0,1)] border-2 border-black"
            >
              <div className="flex items-center gap-4">
                <Play className="w-6 h-6 text-white" />
                <span className="font-retro text-white">DROP IN (ENTER)</span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState === GameState.GAME_OVER && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-50 p-4">
          <div className="max-w-md w-full bg-slate-800 border-4 border-slate-600 p-6 shadow-2xl rounded-lg">
            <h2 className="text-4xl font-retro text-red-500 text-center mb-6 drop-shadow-md">
              WIPEOUT!
            </h2>
            
            <div className="grid grid-cols-2 gap-4 mb-6 font-mono text-sm">
              <div className="bg-slate-900 p-3 rounded border border-slate-700">
                <div className="text-slate-400 text-xs">DISTANCE</div>
                <div className="text-yellow-400 text-xl">{Math.floor(stats.distance)}m</div>
              </div>
              <div className="bg-slate-900 p-3 rounded border border-slate-700">
                <div className="text-slate-400 text-xs">TOP SPEED</div>
                <div className="text-green-400 text-xl">{Math.floor(stats.topSpeed)} km/h</div>
              </div>
            </div>
            
            {/* Chuck's Tips Section */}
            <div className="bg-blue-900/30 border border-blue-500/50 p-4 rounded mb-6 relative">
              <div className="absolute -top-3 -left-3 bg-blue-600 text-white text-xs px-2 py-1 font-bold rounded shadow border border-black transform -rotate-3">
                CHUCK'S TIPS
              </div>
              {isLoadingCoach ? (
                <div className="flex items-center gap-2 text-blue-300 text-sm animate-pulse">
                  <div className="w-2 h-2 bg-blue-300 rounded-full"></div>
                  Calling Chuck...
                </div>
              ) : (
                <p className="text-blue-100 italic text-sm leading-relaxed">
                  "{coachComment}"
                </p>
              )}
            </div>

            <button 
              onClick={startGame}
              className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-retro text-sm transition-colors shadow-[4px_4px_0_rgba(0,0,0,1)] border-2 border-black flex justify-center items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              AGAIN (ENTER)
            </button>
          </div>
        </div>
      )}
      
      {/* Mobile Controls */}
      {gameState === GameState.PLAYING && (
        <div className="absolute bottom-10 left-0 right-0 text-center pointer-events-none md:hidden opacity-50">
          <div className="flex justify-between px-10">
             <div className="w-16 h-16 rounded-full border-2 border-white/30 bg-white/10 flex items-center justify-center text-white">L</div>
             <div className="w-16 h-16 rounded-full border-2 border-white/30 bg-white/10 flex items-center justify-center text-white">R</div>
          </div>
        </div>
      )}
    </div>
  );
};