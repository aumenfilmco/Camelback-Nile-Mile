import { GameStats } from "../types";

const CHUCKS_TIPS = [
  "Trees are strictly stationary objects. Try avoiding them.",
  "If you French fry when you should pizza, you're gonna have a bad time.",
  "That wasn't skiing, that was falling with style.",
  "The Yeti just wants a hug. A very fast, aggressive hug.",
  "Gravity is a law, not a suggestion.",
  "Keep your tips up and your ego down.",
  "You're paying for the whole run, try to stay on your feet for it.",
  "I've seen better carving at a Thanksgiving dinner.",
  "Snow is cold. Try staying off of it.",
  "Back in '91, we didn't have helmets... we just didn't hit things."
];

export const getSkiCoachCommentary = async (stats: GameStats): Promise<string> => {
  // Simulate a brief radio delay for effect
  await new Promise(resolve => setTimeout(resolve, 600));

  // Context awareness check (optional simple logic)
  if (stats.causeOfDeath?.toLowerCase().includes('yeti')) {
    return "The Yeti just wants a hug. A very fast, aggressive hug.";
  }
  
  if (stats.causeOfDeath?.toLowerCase().includes('tree')) {
    return "Trees are strictly stationary objects. Try avoiding them.";
  }

  // Pick a random tip
  const randomIndex = Math.floor(Math.random() * CHUCKS_TIPS.length);
  return CHUCKS_TIPS[randomIndex];
};