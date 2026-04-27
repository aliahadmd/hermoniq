function stripMarkdown(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function shouldAutoGenerateTitle(currentTitle: string): boolean {
  return currentTitle.trim().toLowerCase() === "new chat";
}

export function generateChatTitleFromTopic(topic: string): string {
  const stripped = stripMarkdown(topic);
  if (!stripped) return "New chat";

  const words = stripped.split(/\s+/).slice(0, 8);
  let title = words.join(" ").trim();

  if (title.length > 56) {
    title = `${title.slice(0, 55).trimEnd()}…`;
  }

  return title || "New chat";
}
