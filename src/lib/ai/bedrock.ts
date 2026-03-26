import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

let client: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (!client) {
    client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
  }
  return client;
}

export function isConfigured(): boolean {
  return !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

export async function askClaude(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 2000
): Promise<string> {
  if (!isConfigured()) {
    return "AI analysis unavailable — AWS Bedrock credentials not configured.";
  }

  const modelId = process.env.BEDROCK_MODEL_ID || "us.anthropic.claude-sonnet-4-6-20250514-v1:0";

  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  try {
    const command = new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: new TextEncoder().encode(body),
    });

    const response = await getClient().send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    return result.content?.[0]?.text || "No response from AI.";
  } catch (error) {
    console.error("[Bedrock] Claude API error:", error);
    const msg = String(error);
    if (msg.includes("AccessDeniedException")) {
      return "AI analysis unavailable — AWS Bedrock access not enabled for this model. Enable Claude in the AWS Bedrock console.";
    }
    return `AI analysis error: ${msg.substring(0, 200)}`;
  }
}
