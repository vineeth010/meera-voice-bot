import fs from "fs";
import path from "path";

let cached: string | null = null;

// Reads voice-instructions.md from the project root so it can be edited without touching code.
export function getVoiceInstructions(): string {
  if (cached !== null) return cached;

  const filePath = path.join(process.cwd(), "voice-instructions.md");
  try {
    cached = fs.readFileSync(filePath, "utf-8");
  } catch {
    cached = "";
  }
  return cached;
}
