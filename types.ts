export enum GameState {
  MENU = 'MENU',
  COUNTDOWN = 'COUNTDOWN',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY',
  PAUSED = 'PAUSED'
}

export enum Difficulty {
  EASY = 'EASY',
  HARD = 'HARD'
}

export interface Player {
  x: number; // Horizontal position
  y: number; // Vertical position (distance traveled)
  speed: number;
  direction: number; // -1 (left) to 1 (right)
  state: 'skiing' | 'crashed' | 'jumping';
}

export enum ObstacleType {
  TREE = 'TREE',
  ROCK = 'ROCK',
  STUMP = 'STUMP',
  YETI = 'YETI'
}

export interface Obstacle {
  id: number;
  x: number;
  y: number;
  type: ObstacleType;
  width: number;
  height: number;
}

export interface GameStats {
  score: number;
  distance: number;
  topSpeed: number;
  causeOfDeath: string | null;
  time?: number; // Time taken in ms
}

export interface LeaderboardEntry {
  name: string;
  time: number;
  date: string;
}