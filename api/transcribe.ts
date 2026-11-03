function send(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed." });
  const key = process.env.GROQ_API_KEY;
  if (!key) return send(res, 503, { error: "Groq transcription is not configured. Check the Vercel environment variable." });

  const body = typeof req.body === "string" ? (() => { try { return JSON.parse(req.body); } catch { return null; } })() : req.body;
  const encoded = typeof body?.audioBase64 === "string" ? body.audioBase64 : "";
  if (!encoded || encoded.length > 4_000_000) return send(res, 413, { error: "Audio is empty or too large. Try a shorter recording." });
  const mime = typeof body?.mimeType === "string" ? body.mimeType.split(";")[0] : "audio/webm";
  const allowed = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg", "audio/x-m4a"]);
  if (!allowed.has(mime)) return send(res, 415, { error: "This audio format is not supported by the transcription service." });

  try {
    const bytes = Buffer.from(encoded, "base64");
    if (!bytes.length || bytes.length > 3_000_000) return send(res, 413, { error: "Audio is too large. Try a shorter recording." });
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime }), mime === "audio/mp4" ? "speech.m4a" : mime === "audio/wav" ? "speech.wav" : mime === "audio/ogg" ? "speech.ogg" : "speech.webm");
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "en");
    form.append("temperature", "0");
    form.append("response_format", "json");
    form.append("prompt", "Transcribe clear conversational English. Preserve names and technical terms exactly when heard: JARVIS, Neon Aether, ClearBoard, Godot, Ollama, Vercel, Groq, Monte Carlo, Whisper, Supabase, Google Ads, API, TypeScript, Electron.");
    const upstream = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(60_000)
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail = typeof data?.error?.message === "string" ? data.error.message : "Groq transcription failed.";
      return send(res, upstream.status === 429 ? 429 : 502, { error: detail });
    }
    if (typeof data?.text !== "string" || !data.text.trim()) return send(res, 422, { error: "I couldn't detect clear speech. Try speaking a little closer to the microphone." });
    return send(res, 200, { text: data.text.trim() });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError" ? "Transcription took too long. Please try again." : "Could not transcribe this recording.";
    return send(res, 502, { error: message });
  }
}
