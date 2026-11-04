export type BrainDecision =
  | { type: "simulation"; reply: string; model: { name: string; formula: string; trials: number; variables: any[] } }
  | { type: "answer"; reply: string }
  | { type: "clarify"; reply: string };

export type ChatTurn = { role: "assistant" | "user"; text: string };

export async function askGroqBrain(prompt: string, history: ChatTurn[] = [], memories: string[] = []): Promise<BrainDecision> {
  if (prompt.length > 8000) throw new Error("Please keep each request under 8,000 characters.");
  let response: Response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        history: history.slice(-8).map((m) => ({ role: m.role, content: m.text })),
        memories: memories.slice(0, 50)
      })
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("JARVIS couldn't reach its /api/chat service. Check your connection and make sure you're using the deployed JARVIS site; the chat service may be unavailable.");
    }
    throw error;
  }
  const raw = await response.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch {
    if (!response.ok) throw new Error("JARVIS chat service returned HTTP " + response.status + " with a non-JSON response.");
    throw new Error("JARVIS chat service returned an unreadable response. Check the latest deployment.");
  }
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "JARVIS could not reach its Groq brain.");
  if (!data || !["answer", "clarify", "simulation"].includes(data.type) || typeof data.reply !== "string") {
    throw new Error("JARVIS received an unsupported response.");
  }
  if (data.type === "simulation" && (!data.model || typeof data.model.formula !== "string" || !Array.isArray(data.model.variables))) {
    throw new Error("JARVIS received an invalid simulation specification.");
  }
  return data as BrainDecision;
}

export async function transcribeAudio(audio: Blob): Promise<string> {
  if (!audio.size) throw new Error("The recording was empty.");
  if (audio.size > 3_000_000) throw new Error("That recording is too large. Please record a shorter command.");
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the microphone recording."));
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      if (comma < 0) reject(new Error("Could not encode the microphone recording."));
      else resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(audio);
  });
  const response = await fetch("/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audioBase64: base64, mimeType: audio.type || "audio/webm" })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "JARVIS could not transcribe the recording.");
  if (typeof data?.text !== "string" || !data.text.trim()) throw new Error("No speech was detected.");
  return data.text.trim();
}
