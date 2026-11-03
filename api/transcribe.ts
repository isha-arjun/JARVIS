const transcriptionBuckets = new Map<string, { count: number; resetAt: number }>();

function send(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed." });
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return send(res, 503, { error: "Deepgram is not configured. Add DEEPGRAM_API_KEY to the Vercel Preview environment and redeploy." });

  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  const bucket = transcriptionBuckets.get(ip);
  if (bucket && bucket.resetAt > now && bucket.count >= 8) {
    res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
    return send(res, 429, { error: "Too many voice transcriptions. Please wait a minute and try again." });
  }
  transcriptionBuckets.set(ip, !bucket || bucket.resetAt <= now ? { count: 1, resetAt: now + 60_000 } : { ...bucket, count: bucket.count + 1 });
  if (transcriptionBuckets.size > 2000) {
    for (const [k, v] of transcriptionBuckets) if (v.resetAt <= now) transcriptionBuckets.delete(k);
  }

  const body = typeof req.body === "string" ? (() => { try { return JSON.parse(req.body); } catch { return null; } })() : req.body;
  const encoded = typeof body?.audioBase64 === "string" ? body.audioBase64 : "";
  if (!encoded || encoded.length > 4_000_000) return send(res, 413, { error: "Audio is empty or too large. Try a shorter recording." });
  const mime = typeof body?.mimeType === "string" ? body.mimeType.split(";")[0].toLowerCase() : "audio/webm";
  const allowed = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg", "audio/x-m4a"]);
  if (!allowed.has(mime)) return send(res, 415, { error: "This audio format is not supported by the transcription service." });

  try {
    const bytes = Buffer.from(encoded, "base64");
    if (!bytes.length || bytes.length > 3_000_000) return send(res, 413, { error: "Audio is too large. Please record a shorter command." });
    const params = new URLSearchParams({
      model: "nova-3",
      language: "en",
      smart_format: "true",
      punctuate: "true"
    });
    for (const term of ["JARVIS", "Neon Aether", "ClearBoard", "Godot", "Ollama", "Vercel", "Groq", "Deepgram", "Monte Carlo", "Supabase", "Google Ads", "TypeScript", "Electron"]) {
      params.append("keyterm", term);
    }
    const upstream = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": mime
      },
      body: bytes,
      signal: AbortSignal.timeout(60_000)
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail = typeof data?.err_msg === "string" ? data.err_msg : typeof data?.message === "string" ? data.message : "Deepgram transcription failed.";
      return send(res, upstream.status === 429 ? 429 : 502, { error: detail });
    }
    const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    if (typeof transcript !== "string" || !transcript.trim()) {
      return send(res, 422, { error: "I couldn't detect clear speech. Try speaking a little closer to the microphone." });
    }
    return send(res, 200, { text: transcript.trim(), provider: "Deepgram Nova-3" });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError" ? "Transcription took too long. Please try again." : "Could not reach Deepgram. Check the deployment and try again.";
    return send(res, 502, { error: message });
  }
}
