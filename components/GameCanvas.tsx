import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameState, Player, Obstacle, ObstacleType, GameStats, LeaderboardEntry } from '../types';
import { GAME_CONFIG, COLORS } from '../constants';
import { getSkiCoachCommentary } from '../services/geminiService';
import { Play, RotateCcw, Trophy, ChevronLeft, ChevronRight, Flame } from 'lucide-react';

// --- Game Logic Helpers ---

// The "Nile Mile" Switchback curve function
// z is distance in meters (pixels in game coordinates)
const getTrackOffset = (z: number): number => {
  // Broad, sweeping turns for the "Nile Mile"
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
  
  // Leaderboard State
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Mutable Game State (Refs for performance to avoid React re-renders during loop)
  const stateRef = useRef({
    player: { x: 0, y: 0, speed: 0, direction: 0, state: 'skiing' } as Player,
    obstacles: [] as Obstacle[],
    lastObstacleY: 0,
    keys: { left: false, right: false, down: false },
    startTime: 0,
    yeti: { active: false, x: 0, y: -1000, speed: 0 }
  });

  // Load Leaderboard on mount
  useEffect(() => {
    const saved = localStorage.getItem('nileMileLeaderboard');
    if (saved) {
      try {
        setLeaderboard(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load leaderboard");
      }
    }
  }, []);

  const saveToLeaderboard = () => {
    if (!playerName.trim() || hasSubmitted) return;
    
    const newEntry: LeaderboardEntry = {
      name: playerName.trim().substring(0, 10),
      time: stats.time || 0,
      date: new Date().toLocaleDateString()
    };
    
    const newBoard = [...leaderboard, newEntry]
      .sort((a, b) => a.time - b.time)
      .slice(0, 5); // Keep top 5
      
    setLeaderboard(newBoard);
    localStorage.setItem('nileMileLeaderboard', JSON.stringify(newBoard));
    setHasSubmitted(true);
  };

  const generateObstacles = useCallback((startY: number, endY: number) => {
    const { obstacles, lastObstacleY } = stateRef.current;
    
    // Stop generating obstacles near the finish line (Lodge area)
    const MAX_GEN_Y = GAME_CONFIG.TRACK_LENGTH - 300;
    
    let currentY = Math.max(startY, lastObstacleY + 40);

    while (currentY < endY) {
      if (currentY > MAX_GEN_Y) break;

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
    setHasSubmitted(false);
    setPlayerName("");
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
        if (gameState === GameState.MENU || gameState === GameState.GAME_OVER || gameState === GameState.VICTORY) {
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
      causeOfDeath: cause,
      time: Date.now() - stateRef.current.startTime
    };
    setStats(finalStats);
    
    setIsLoadingCoach(true);
    const comment = await getSkiCoachCommentary(finalStats);
    setCoachComment(comment);
    setIsLoadingCoach(false);
  };

  const finishGame = () => {
    setGameState(GameState.VICTORY);
    const finalTime = Date.now() - stateRef.current.startTime;
    const finalStats = {
      score: Math.floor(stateRef.current.player.y),
      distance: stateRef.current.player.y,
      topSpeed: stats.topSpeed,
      causeOfDeath: null,
      time: finalTime
    };
    setStats(finalStats);
  };

  const update = () => {
    if (gameState !== GameState.PLAYING) return;
    
    const state = stateRef.current;
    const { player, keys } = state;

    // --- Win Condition ---
    if (player.y >= GAME_CONFIG.TRACK_LENGTH) {
      finishGame();
      return;
    }

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
    // Yeti only appears before the end
    if (player.y > 3000 && player.y < GAME_CONFIG.TRACK_LENGTH - 200 && !state.yeti.active) {
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
      // Culling
      if (pos.y < -300 || pos.y > height + 100) return;

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

    // --- Draw "Trail's End" Pub ---
    const pubPos = toScreen(getTrackOffset(GAME_CONFIG.PUB_Y), GAME_CONFIG.PUB_Y);
    if (pubPos.y > -200 && pubPos.y < height + 200) {
       drawPub(ctx, pubPos.x, pubPos.y);
    }

    // Score Overlay
    if (gameState === GameState.PLAYING) {
      ctx.fillStyle = '#1e293b';
      ctx.font = '16px "Press Start 2P"';
      ctx.fillText(`${Math.floor(player.y)}m / ${GAME_CONFIG.TRACK_LENGTH}m`, 20, 40);
      
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

  const drawPub = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    // Lodge Body
    ctx.fillStyle = COLORS.LODGE_WOOD;
    ctx.fillRect(x - 100, y - 60, 200, 60);
    
    // Roof
    ctx.fillStyle = COLORS.LODGE_ROOF;
    ctx.beginPath();
    ctx.moveTo(x - 110, y - 60);
    ctx.lineTo(x, y - 110);
    ctx.lineTo(x + 110, y - 60);
    ctx.fill();

    // Door
    ctx.fillStyle = '#222';
    ctx.fillRect(x - 20, y - 40, 40, 40);
    
    // Sign
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(x - 60, y - 90, 120, 20);
    ctx.fillStyle = '#451a03';
    ctx.font = '10px "Press Start 2P"';
    ctx.fillText("TRAIL'S END", x - 55, y - 76);

    // Fire Pits
    const drawFire = (fx: number, fy: number) => {
      ctx.fillStyle = '#444';
      ctx.beginPath();
      ctx.ellipse(fx, fy, 20, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      
      const flicker = Math.sin(Date.now() / 100) * 5;
      ctx.fillStyle = COLORS.FIRE_ORANGE;
      ctx.beginPath();
      ctx.moveTo(fx - 10, fy);
      ctx.lineTo(fx, fy - 30 + flicker);
      ctx.lineTo(fx + 10, fy);
      ctx.fill();
      
      ctx.fillStyle = COLORS.FIRE_YELLOW;
      ctx.beginPath();
      ctx.moveTo(fx - 5, fy);
      ctx.lineTo(fx, fy - 20 - flicker);
      ctx.lineTo(fx + 5, fy);
      ctx.fill();
    };

    drawFire(x - 150, y);
    drawFire(x + 150, y);
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

  // --- Mobile Controls ---
  const handleTouchStart = (dir: 'left' | 'right') => {
    if (dir === 'left') stateRef.current.keys.left = true;
    else stateRef.current.keys.right = true;
  };
  const handleTouchEnd = (dir: 'left' | 'right') => {
    if (dir === 'left') stateRef.current.keys.left = false;
    else stateRef.current.keys.right = false;
  };

  return (
    <div className="relative w-full h-screen bg-slate-900 overflow-hidden">
      <canvas ref={canvasRef} className="block w-full h-full" />
      
      {/* Scanline Effect */}
      <div className="scanlines pointer-events-none"></div>

      {/* Mobile Controls */}
      <div className="absolute bottom-4 left-0 w-full flex justify-between px-4 pb-4 md:hidden pointer-events-auto z-20">
         <button 
           className="w-24 h-24 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center active:bg-white/40 transition-colors touch-none"
           onPointerDown={() => handleTouchStart('left')}
           onPointerUp={() => handleTouchEnd('left')}
           onPointerLeave={() => handleTouchEnd('left')}
         >
            <ChevronLeft size={48} className="text-white" />
         </button>
         <button 
           className="w-24 h-24 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center active:bg-white/40 transition-colors touch-none"
           onPointerDown={() => handleTouchStart('right')}
           onPointerUp={() => handleTouchEnd('right')}
           onPointerLeave={() => handleTouchEnd('right')}
         >
            <ChevronRight size={48} className="text-white" />
         </button>
      </div>

      {/* Main Menu */}
      {gameState === GameState.MENU && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white z-30">
          <h1 className="text-4xl md:text-6xl text-yellow-400 font-retro mb-4 text-center px-4 leading-tight">
             Camelback Resort presents:<br/><span className="text-white">NILE MILE</span>
          </h1>
          <p className="text-lg mb-8 text-slate-300">Dodge trees, survive the Yeti, reach Trail's End!</p>
          <button 
            onClick={startGame}
            className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 px-8 rounded-none border-4 border-yellow-600 font-retro text-xl transition-transform hover:scale-105"
          >
            <Play size={24} /> START RUN
          </button>
          <p className="mt-4 text-sm text-slate-400 animate-pulse">Press ENTER to Start</p>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState === GameState.GAME_OVER && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/80 backdrop-blur-sm text-white z-30 p-4">
          <h2 className="text-4xl font-retro text-red-400 mb-6">WIPEOUT!</h2>
          
          <div className="bg-slate-800 p-6 rounded-lg border-2 border-slate-600 max-w-md w-full shadow-2xl">
             <div className="mb-4 space-y-2 font-mono text-sm text-slate-300">
               <p className="flex justify-between"><span>DISTANCE:</span> <span className="text-white">{Math.floor(stats.distance)}m</span></p>
               <p className="flex justify-between"><span>SCORE:</span> <span className="text-white">{stats.score}</span></p>
               <p className="flex justify-between"><span>TOP SPEED:</span> <span className="text-white">{Math.floor(stats.topSpeed)} km/h</span></p>
               <p className="flex justify-between text-red-300"><span>CAUSE:</span> <span>{stats.causeOfDeath}</span></p>
             </div>

             <div className="border-t border-slate-600 pt-4 mt-4">
                <h3 className="text-yellow-400 font-retro text-sm mb-2">CHUCK'S TIPS:</h3>
                <p className="italic text-lg leading-relaxed text-slate-200">
                  {isLoadingCoach ? "Chuck is radioing in..." : `"${coachComment}"`}
                </p>
             </div>
          </div>

          <button 
            onClick={startGame}
            className="mt-8 flex items-center gap-2 bg-white hover:bg-slate-200 text-red-900 font-bold py-3 px-8 border-4 border-slate-300 font-retro transition-transform hover:scale-105"
          >
            <RotateCcw size={24} /> TRY AGAIN
          </button>
        </div>
      )}

      {/* Victory Screen */}
      {gameState === GameState.VICTORY && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-900/90 backdrop-blur-md text-white z-30 p-4 overflow-y-auto">
          <div className="text-center mb-6">
             <Flame className="w-12 h-12 text-orange-500 mx-auto mb-2 animate-bounce" />
             <h2 className="text-3xl md:text-5xl font-retro text-yellow-400">TRAIL'S END</h2>
             <p className="text-green-200 mt-2">You survived Nile Mile!</p>
          </div>
          
          <div className="bg-slate-800 p-6 rounded-lg border-2 border-yellow-600 max-w-md w-full shadow-2xl">
             <div className="text-center mb-6">
                <p className="text-slate-400 text-sm">FINAL TIME</p>
                <p className="text-4xl font-mono text-white">{(stats.time! / 1000).toFixed(2)}s</p>
             </div>

             {!hasSubmitted ? (
               <div className="mb-6">
                  <label className="block text-xs font-retro text-slate-400 mb-2">ENTER NAME FOR LEADERBOARD</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      maxLength={10}
                      className="bg-slate-900 border border-slate-600 text-white px-4 py-2 flex-1 font-mono uppercase focus:border-yellow-400 outline-none"
                      placeholder="AAA"
                    />
                    <button 
                       onClick={saveToLeaderboard}
                       disabled={!playerName}
                       className="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white px-4 py-2 font-bold font-retro text-xs"
                    >
                      SUBMIT
                    </button>
                  </div>
               </div>
             ) : (
                <div className="mb-6 text-center text-green-400 font-retro text-sm">
                   SCORE SUBMITTED!
                </div>
             )}

             <div className="border-t border-slate-600 pt-4">
                <h3 className="flex items-center gap-2 text-yellow-400 font-retro text-xs mb-3">
                   <Trophy size={14} /> LEADERBOARD
                </h3>
                <div className="space-y-2">
                   {leaderboard.length === 0 ? (
                      <p className="text-slate-500 text-xs italic">No records yet. Be the first!</p>
                   ) : (
                      leaderboard.map((entry, idx) => (
                        <div key={idx} className={`flex justify-between text-sm font-mono ${entry.name === playerName && hasSubmitted ? 'text-yellow-300' : 'text-slate-300'}`}>
                           <span>{idx + 1}. {entry.name}</span>
                           <span>{(entry.time / 1000).toFixed(2)}s</span>
                        </div>
                      ))
                   )}
                </div>
             </div>
          </div>

          <button 
            onClick={startGame}
            className="mt-8 flex items-center gap-2 bg-white hover:bg-slate-200 text-green-900 font-bold py-3 px-8 border-4 border-slate-300 font-retro transition-transform hover:scale-105"
          >
            <RotateCcw size={24} /> SKI AGAIN
          </button>
        </div>
      )}
    </div>
  );
};