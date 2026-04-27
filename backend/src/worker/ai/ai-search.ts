interface AiSearchContentChunk {
  text?: string;
}

interface AiSearchResult {
  content?: AiSearchContentChunk[];
  text?: string;
}

interface AiSearchResponse {
  data?: AiSearchResult[];
}

interface AutoRagInstance {
  search: (input: unknown) => Promise<AiSearchResponse>;
}

interface AiWithAutoRag {
  autorag?: (instance: string) => AutoRagInstance;
}

export async function queryAiSearchContext(
  env: Env,
  userId: string,
  query: string,
): Promise<string[]> {
  if (!query.trim()) return [];
  if (String(env.AI_SEARCH_ENABLED).toLowerCase() !== "true") return [];
  if (!env.AI_SEARCH_INSTANCE) return [];

  const ai = env.AI as unknown as AiWithAutoRag;
  if (!ai.autorag) return [];

  try {
    const response = await ai.autorag(env.AI_SEARCH_INSTANCE).search({
      query,
      max_num_results: 4,
      ranking_options: {
        score_threshold: 0.2,
      },
      filters: {
        type: "eq",
        key: "folder",
        value: `users/${userId}/`,
      },
    });

    const chunks: string[] = [];
    for (const row of response.data ?? []) {
      if (typeof row.text === "string" && row.text.length > 0) {
        chunks.push(row.text);
      }
      for (const content of row.content ?? []) {
        if (typeof content.text === "string" && content.text.length > 0) {
          chunks.push(content.text);
        }
      }
    }
    return chunks.slice(0, 8);
  } catch {
    return [];
  }
}
