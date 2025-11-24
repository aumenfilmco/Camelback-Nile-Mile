import { GoogleGenAI } from "@google/genai";
import { GameStats } from "../types";

// Helper to get the AI client
const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const getSkiCoachCommentary = async (stats: GameStats): Promise<string> => {
  const ai = getAiClient();
  if (!ai) {
    return "Insert coin (API Key) to hear from Chuck.";
  }

  try {
    const prompt = `
      The player just finished a run on "Nile Mile" at Camelback Resort.
      Stats:
      - Distance: ${Math.floor(stats.distance)}m
      - Score: ${Math.floor(stats.score)}
      - Top Speed: ${Math.floor(stats.topSpeed)} km/h
      - Cause of Crash: ${stats.causeOfDeath || "Survived"}

      You are "Chuck", a friendly but tough veteran ski instructor at Camelback Resort.
      Give a VERY short, punchy 1-sentence tip or reaction.
      If they crashed, give a safety tip or a mild roast. If they did well, welcome them to the pro team.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are Chuck. Keep it short, helpful, or funny.",
        temperature: 0.9,
      }
    });

    return response.text || "Keep your tips up!";
  } catch (error) {
    console.error("AI Error:", error);
    return "Radio static... try again later.";
  }
};