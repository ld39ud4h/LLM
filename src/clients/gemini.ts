import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
export const gemini=new GoogleGenAI({apiKey:env.GEMINI_API_KEY});
export const GEMINI_MODEL=env.GEMINI_MODEL;
