export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
};

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ModelResult =
  | { kind: "tool_calls"; calls: ToolCall[] }
  | { kind: "final"; text: string };

export interface ModelProvider {
  respond(
    messages: ChatMessage[],
    tools: ToolDefinition[],
  ): Promise<ModelResult>;
}

class StubProvider implements ModelProvider {
  async respond(
    messages: ChatMessage[],
    tools: ToolDefinition[],
  ): Promise<ModelResult> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const lastTool = [...messages].reverse().find((m) => m.role === "tool");
    const text = (lastUser?.content || "").toLowerCase();
    const has = (name: string) => tools.some((t) => t.name === name);

    if (lastTool) {
      return { kind: "final", text: summarise(lastTool.content) };
    }

    if (has("get_my_credits") && /(credit|balance)/.test(text)) {
      return {
        kind: "tool_calls",
        calls: [{ id: "1", name: "get_my_credits", arguments: {} }],
      };
    }
    if (
      has("get_my_bookings") &&
      /(my booking|my session|what have i booked)/.test(text)
    ) {
      return {
        kind: "tool_calls",
        calls: [{ id: "1", name: "get_my_bookings", arguments: {} }],
      };
    }
    if (
      has("get_my_sessions_detail") &&
      /(my session|attendee|who.?s coming)/.test(text)
    ) {
      return {
        kind: "tool_calls",
        calls: [{ id: "1", name: "get_my_sessions_detail", arguments: {} }],
      };
    }
    if (
      has("search_sessions") &&
      /(session|class|available|when|schedule|book)/.test(text)
    ) {
      return {
        kind: "tool_calls",
        calls: [{ id: "1", name: "search_sessions", arguments: {} }],
      };
    }

    return {
      kind: "final",
      text: "I can help with sessions, bookings, and your credit balance — what would you like to know?",
    };
  }
}

function summarise(toolResultJson: string): string {
  try {
    const data = JSON.parse(toolResultJson);
    if (data && data.error) return `I can't do that: ${data.error}`;
    return `Here's what I found:\n\n${JSON.stringify(data, null, 2)}`;
  } catch {
    return toolResultJson;
  }
}

class OpenAiCompatibleProvider implements ModelProvider {
  constructor(
    private baseUrl: string,
    private model: string,
    private apiKey: string,
  ) {}

  async respond(
    messages: ChatMessage[],
    tools: ToolDefinition[],
  ): Promise<ModelResult> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map((m) => {
          const base: Record<string, unknown> = {
            role: m.role,
            content: m.content,
          };
          if (m.role === "tool") {
            base.tool_call_id = m.tool_call_id;
            base.name = m.name;
          }
          if (m.role === "assistant" && m.tool_calls?.length) {
            base.tool_calls = m.tool_calls;
          }
          return base;
        }),
        tools: tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
      }),
    });

    if (!res.ok) {
      throw new Error(
        `model provider returned ${res.status}: ${await res.text()}`,
      );
    }

    const body = await res.json();
    const choice = body.choices?.[0]?.message;
    const toolCalls = choice?.tool_calls;

    if (toolCalls?.length) {
      return {
        kind: "tool_calls",
        calls: toolCalls.map((c: any) => ({
          id: c.id,
          name: c.function.name,
          arguments: JSON.parse(c.function.arguments || "{}"),
        })),
      };
    }

    return { kind: "final", text: choice?.content || "" };
  }
}

export function getModelProvider(): ModelProvider {
  const kind = process.env.MODEL_PROVIDER || "stub";
  if (kind === "stub") return new StubProvider();

  const baseUrl = process.env.MODEL_BASE_URL || "http://localhost:11434/v1";
  const model = process.env.MODEL_NAME || "llama3.2:3b";
  const apiKey = process.env.MODEL_API_KEY || "";
  return new OpenAiCompatibleProvider(baseUrl, model, apiKey);
}
