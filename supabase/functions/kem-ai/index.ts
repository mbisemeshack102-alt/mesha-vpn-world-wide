const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return Response.json({ error: "AI service is not configured" }, { status: 503, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question || question.length > 6000) {
      return Response.json({ error: "Question must contain 1–6000 characters" }, { status: 400, headers: corsHeaders });
    }

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        instructions: "You are KEM AI, a helpful general-purpose assistant inside the KEM VPN app. Answer questions on any topic clearly and safely. Reply in the language used by the user. For KEM VPN support, never claim the VPN works without a valid reachable WireGuard server and client profile. Never claim a payment is confirmed unless the payment backend confirms it.",
        input: question,
        max_output_tokens: 900,
      }),
    });

    const result = await upstream.json();
    if (!upstream.ok) {
      return Response.json({ error: "AI provider request failed" }, { status: 502, headers: corsHeaders });
    }

    const answer = (result.output ?? [])
      .flatMap((item: any) => item.content ?? [])
      .filter((part: any) => part.type === "output_text")
      .map((part: any) => part.text)
      .join("\n")
      .trim();

    if (!answer) {
      return Response.json({ error: "No answer returned" }, { status: 502, headers: corsHeaders });
    }
    return Response.json({ answer }, { headers: corsHeaders });
  } catch (_error) {
    return Response.json({ error: "Invalid request or AI service unavailable" }, { status: 400, headers: corsHeaders });
  }
});
