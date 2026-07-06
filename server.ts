import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Lazy initializer for Google GenAI client
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required but missing. Please set it in Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// API Routes
app.post("/api/gemini/deobfuscate", async (req, res) => {
  try {
    const { code, context } = req.body;
    if (!code) {
      return res.status(400).json({ error: "Code is required" });
    }

    const ai = getAiClient();
    const prompt = `
You are an expert JavaScript deobfuscator and reverse engineer.
Your task is to analyze the following obfuscated JavaScript code, and rewrite it with:
1. Highly descriptive, clear variable and function names instead of single-character variables (e.g., replace 'e', 't', 'n', 'r', 'o', 'a' with names that describe their actual purpose/types).
2. Clean formatting (indented, readable spacing).
3. Useful, concise inline comments explaining complex parts of the logic.
4. Keep the original exports or signatures intact. Do not change the overall logic.

Here is the context about this code (if any): ${context || "None"}

Code to deobfuscate:
\`\`\`javascript
${code}
\`\`\`

Return ONLY the clean, formatted, deobfuscated JavaScript code inside a markdown code block. Do not include conversational text before or after.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    res.json({ result: response.text });
  } catch (error: any) {
    console.error("Gemini API error:", error);
    res.status(500).json({ error: error.message || "Failed to deobfuscate code" });
  }
});

app.post("/api/gemini/explain", async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: "Code is required" });
    }

    const ai = getAiClient();
    const prompt = `
You are an expert JavaScript reverse engineer.
Explain the following JavaScript code step-by-step.
List:
1. What the code is trying to achieve (its core functionality).
2. Key API endpoints or domains it interacts with.
3. Any interesting logic or patterns used.

Code:
\`\`\`javascript
${code}
\`\`\`
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    res.json({ result: response.text });
  } catch (error: any) {
    console.error("Gemini API error:", error);
    res.status(500).json({ error: error.message || "Failed to explain code" });
  }
});

// Serve Vite Frontend
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
