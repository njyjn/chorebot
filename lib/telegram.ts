export interface TelegramDestination {
  chatId: string;
  threadId?: number;
}

// Accepts a raw chat ID ("-1001234567890", "@channel") or a t.me link:
//   https://t.me/c/2190525348/1        private group, topic 1
//   https://t.me/c/2190525348/5/120    private group, topic 5 (message 120)
//   https://t.me/somegroup/5           public group, topic 5
// Private group links drop the "-100" prefix that the Bot API needs.
// Topic 1 is the General topic, which the Bot API addresses with no thread ID.
export function parseTelegramDestination(input: string): TelegramDestination | null {
  const value = input.trim();
  if (!value) return null;
  const link = value.match(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(.+?)\/?$/i);
  if (!link) return { chatId: value };

  const parts = link[1].split(/[?#]/)[0].split("/");
  let chatId: string;
  let rest: string[];
  if (parts[0] === "c") {
    if (!/^\d+$/.test(parts[1] || "")) return null;
    chatId = `-100${parts[1]}`;
    rest = parts.slice(2);
  } else {
    if (!/^[A-Za-z0-9_]{4,}$/.test(parts[0])) return null;
    chatId = `@${parts[0]}`;
    rest = parts.slice(1);
  }
  const thread = Number(rest[0]);
  return Number.isInteger(thread) && thread > 1 ? { chatId, threadId: thread } : { chatId };
}

async function send(botToken: string, dest: TelegramDestination, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: dest.chatId,
      ...(dest.threadId ? { message_thread_id: dest.threadId } : {}),
      text,
      disable_web_page_preview: true,
    }),
  });
  if (res.ok) return { ok: true, description: "" };
  const body = (await res.json().catch(() => ({}))) as { description?: string };
  return { ok: false, description: `${res.status} ${body.description || ""}`.trim() };
}

// Sends plain text (no parse_mode) so chore names never need escaping.
export async function notifyTelegram(botToken: string, destination: string, text: string) {
  if (!botToken || !destination) return;
  const dest = parseTelegramDestination(destination);
  if (!dest) {
    console.error(`Telegram destination not recognised: ${destination}`);
    return;
  }
  try {
    let result = await send(botToken, dest, text);
    // A t.me/c/<chat>/<n> link can point at a message rather than a topic.
    // If the group has no such topic, post to the chat itself.
    if (!result.ok && dest.threadId && /thread/i.test(result.description)) {
      result = await send(botToken, { chatId: dest.chatId }, text);
    }
    // The token is in the URL, so log only Telegram's description.
    if (!result.ok) console.error(`Error sending Telegram notification: ${result.description}`);
  } catch (error) {
    console.error("Error sending Telegram notification:", error instanceof Error ? error.message : error);
  }
}
