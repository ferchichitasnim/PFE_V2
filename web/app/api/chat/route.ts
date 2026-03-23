import { createOpenAI } from "@ai-sdk/openai";
import type { CoreMessage } from "ai";
import { streamText } from "ai";

const STORY_RULES = `You are a senior Power BI analytics storyteller.
Create a concise narrative for a business stakeholder using ONLY the provided context.
Output format rules:
1) Use exactly these markdown headings:
## Overview
## Key Insights
## Risks or Data Quality Concerns
## Recommended Actions
2) Under each heading use 3-6 bullet points.
3) Be concrete with table/column names from the context.
4) Do not invent metrics or percentages not implied by the context.`;

export async function POST(req: Request) {
  let body: {
    messages?: { role: string; content: string }[];
    /** useCompletion / useChat sends this instead of messages */
    prompt?: string;
    pbixPath?: string;
    context?: Record<string, unknown>;
    model?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const pbixPath = (body.pbixPath || "").trim();
  const model = (body.model || process.env.OLLAMA_MODEL || "llama3.2:3b").trim();
  let messages = (body.messages || []) as CoreMessage[];
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (messages.length === 0 && prompt) {
    messages = [{ role: "user", content: prompt }];
  }
  let context = body.context;

  if (!context) {
    if (!pbixPath) {
      return new Response(JSON.stringify({ error: "pbixPath is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const flaskUrl = (process.env.FLASK_URL || "http://127.0.0.1:5052").replace(/\/$/, "");
    const ctxRes = await fetch(`${flaskUrl}/api/pbix/context?pbix_path=${encodeURIComponent(pbixPath)}`);
    const data = (await ctxRes.json()) as {
      ok?: boolean;
      error?: string;
      context?: Record<string, unknown>;
    };
    if (!data.ok || !data.context) {
      return new Response(JSON.stringify({ error: data.error || "Failed to load PBIX context" }), {
        status: ctxRes.ok ? 400 : ctxRes.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    context = data.context;
  }

  const ollamaBase = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const ollama = createOpenAI({
    baseURL: `${ollamaBase}/v1`,
    apiKey: "ollama",
  });

  if (messages.length === 0) {
    return new Response(
      JSON.stringify({
        error: "Missing prompt or messages. useCompletion sends `prompt`; useChat sends `messages`.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const system = `${STORY_RULES}\n\nContext JSON:\n${JSON.stringify(context)}`;

  const result = await streamText({
    model: ollama(model),
    system,
    messages,
    temperature: 0.2,
  });

  return result.toDataStreamResponse();
}
