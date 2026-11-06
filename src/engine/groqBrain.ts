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

function encodePcmWav(audioBuffer: AudioBuffer, targetRate = 16000): Blob {
  const source = audioBuffer.getChannelData(0);
  const ratio = audioBuffer.sampleRate / targetRate;
  const length = Math.max(1, Math.floor(source.length / ratio));
  const pcm = new DataView(new ArrayBuffer(44 + length * 2));
  const writeText = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) pcm.setUint8(offset + i, value.charCodeAt(i));
  };
  writeText(0, "RIFF");
  pcm.setUint32(4, 36 + length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  pcm.setUint32(16, 16, true);
  pcm.setUint16(20, 1, true);
  pcm.setUint16(22, 1, true);
  pcm.setUint32(24, targetRate, true);
  pcm.setUint32(28, targetRate * 2, true);
  pcm.setUint16(32, 2, true);
  pcm.setUint16(34, 16, true);
  writeText(36, "data");
  pcm.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const from = Math.floor(i * ratio);
    const to = Math.min(source.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = from; j < Math.max(from + 1, to); j++) sum += source[Math.min(j, source.length - 1)];
    const sample = Math.max(-1, Math.min(1, sum / Math.max(1, to - from)));
    pcm.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([pcm], { type: "audio/wav" });
}

export async function transcribeAudio(audio: Blob): Promise<string> {
  if (!audio.size) throw new Error("The recording was empty.");
  if (audio.size > 3_000_000) throw new Error("That recording is too large. Please record a shorter command.");

  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) throw new Error("This browser cannot convert microphone audio. Try the latest Chrome or Edge.");
  const context: AudioContext = new AudioContextCtor();
  let wav: Blob;
  try {
    const decoded = await context.decodeAudioData(await audio.arrayBuffer());
    wav = encodePcmWav(decoded);
  } catch {
    throw new Error("JARVIS recorded audio, but the browser couldn't decode it. Please try again in Chrome or Edge.");
  } finally {
    await context.close().catch(() => {});
  }
  if (wav.size < 48 || wav.size > 3_000_000) {
    throw new Error("The converted recording is empty or too large. Please try a shorter command.");
  }

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the converted microphone recording."));
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      if (comma < 0) reject(new Error("Could not encode the microphone recording."));
      else resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(wav);
  });
  const response = await fetch("/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audioBase64: base64, mimeType: "audio/wav" })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "JARVIS could not transcribe the recording.");
  if (typeof data?.text !== "string" || !data.text.trim()) throw new Error("No speech was detected.");
  return data.text.trim();
}
