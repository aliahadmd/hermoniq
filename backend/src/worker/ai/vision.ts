interface VisionAttachmentInput {
  id: string;
  objectKey: string;
  mimeType: string;
  fileName: string;
}

interface VisionModelResponseLike {
  description?: unknown;
  response?: unknown;
  result?: {
    description?: unknown;
    response?: unknown;
  };
}

function normalizeVisionText(value: string): string {
  const withoutFence = value
    .replace(/^```(?:text)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return withoutFence
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^"(.*)"$/, "$1").trim())
    .join("\n")
    .trim();
}

function parseVisionText(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim().length > 0) {
    const normalized = normalizeVisionText(raw);
    return normalized.length > 0 ? normalized : null;
  }
  if (!raw || typeof raw !== "object") return null;
  const typed = raw as VisionModelResponseLike;
  if (typeof typed.description === "string" && typed.description.trim().length > 0) {
    const normalized = normalizeVisionText(typed.description);
    return normalized.length > 0 ? normalized : null;
  }
  if (typeof typed.response === "string" && typed.response.trim().length > 0) {
    const normalized = normalizeVisionText(typed.response);
    return normalized.length > 0 ? normalized : null;
  }
  if (typeof typed.result?.description === "string" && typed.result.description.trim().length > 0) {
    const normalized = normalizeVisionText(typed.result.description);
    return normalized.length > 0 ? normalized : null;
  }
  if (typeof typed.result?.response === "string" && typed.result.response.trim().length > 0) {
    const normalized = normalizeVisionText(typed.result.response);
    return normalized.length > 0 ? normalized : null;
  }
  return null;
}

async function extractSingleAttachment(
  env: Env,
  attachment: VisionAttachmentInput,
): Promise<string | null> {
  try {
    const object = await env.AI_CHAT_MEDIA_BUCKET.get(attachment.objectKey);
    if (!object) return null;

    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.length === 0) return null;

    const model = env.AI_VISION_MODEL || "@cf/llava-hf/llava-1.5-7b-hf";
    const response = await env.AI.run(model, {
      image: Array.from(bytes),
      prompt:
        "Extract only the visible text from this image. Return plain text with line breaks and no explanation, labels, or quotes. If no readable text exists, return exactly: NO_TEXT_FOUND.",
      max_tokens: 512,
    });

    return parseVisionText(response);
  } catch {
    return null;
  }
}

export async function extractVisionContextForAttachments(
  env: Env,
  attachments: VisionAttachmentInput[],
): Promise<{ chunks: string[]; combinedText: string }> {
  const chunks: string[] = [];

  for (const attachment of attachments) {
    const text = await extractSingleAttachment(env, attachment);
    if (!text) continue;
    const label = attachment.fileName.trim() || attachment.id;
    chunks.push(`[${label}] ${text}`);
  }

  return {
    chunks,
    combinedText: chunks.join("\n"),
  };
}
