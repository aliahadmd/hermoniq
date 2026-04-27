interface StoredMemoryMetadata {
  text?: string;
  userId?: string;
  chatId?: string;
  createdAt?: string;
}

interface EmbeddingResponseLike {
  data?: unknown;
}

function extractEmbedding(response: unknown): number[] | null {
  if (!response || typeof response !== "object") return null;
  const data = (response as EmbeddingResponseLike).data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0];
  if (!Array.isArray(first)) return null;
  const vector = first.filter((value): value is number => typeof value === "number");
  return vector.length > 0 ? vector : null;
}

async function embedText(env: Env, text: string): Promise<number[] | null> {
  try {
    const model = env.AI_EMBED_MODEL || "@cf/baai/bge-base-en-v1.5";
    const response = await env.AI.run(model, { text: [text] });
    return extractEmbedding(response);
  } catch {
    return null;
  }
}

export async function queryVectorMemories(
  env: Env,
  namespace: string,
  query: string,
  topK = 6,
): Promise<string[]> {
  if (!query.trim()) return [];

  const embedding = await embedText(env, query);
  if (!embedding) return [];

  try {
    const result = await env.CHAT_MEMORY_INDEX.query(embedding, {
      namespace,
      topK: Math.max(1, Math.min(topK, 20)),
      returnMetadata: "all",
    });

    return (result.matches ?? [])
      .map((match) => {
        if (!match.metadata || typeof match.metadata !== "object") return "";
        const metadata = match.metadata as StoredMemoryMetadata;
        return typeof metadata.text === "string" ? metadata.text : "";
      })
      .filter((value) => value.length > 0);
  } catch {
    return [];
  }
}

interface UpsertMemoryInput {
  namespace: string;
  id: string;
  text: string;
  userId: string;
  chatId: string;
  createdAt: string;
}

export async function upsertConversationMemory(env: Env, input: UpsertMemoryInput): Promise<boolean> {
  const embedding = await embedText(env, input.text);
  if (!embedding) return false;

  try {
    await env.CHAT_MEMORY_INDEX.upsert([
      {
        id: input.id,
        namespace: input.namespace,
        values: embedding,
        metadata: {
          text: input.text,
          userId: input.userId,
          chatId: input.chatId,
          createdAt: input.createdAt,
        },
      },
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function deleteVectorMemories(env: Env, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  for (let i = 0; i < ids.length; i += 1_000) {
    await env.CHAT_MEMORY_INDEX.deleteByIds(ids.slice(i, i + 1_000));
  }
}
