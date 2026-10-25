import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTelegramDestination } from "./telegram.ts";

test("raw chat IDs pass through", () => {
  assert.deepEqual(parseTelegramDestination("-1001234567890"), { chatId: "-1001234567890" });
  assert.deepEqual(parseTelegramDestination(" @mychannel "), { chatId: "@mychannel" });
  assert.equal(parseTelegramDestination(""), null);
});

test("private group links get the -100 prefix", () => {
  // Topic 1 is General, which takes no thread ID
  assert.deepEqual(parseTelegramDestination("https://t.me/c/2190525348/1"), { chatId: "-1002190525348" });
  assert.deepEqual(parseTelegramDestination("https://t.me/c/2190525348"), { chatId: "-1002190525348" });
  assert.deepEqual(parseTelegramDestination("t.me/c/2190525348/7"), { chatId: "-1002190525348", threadId: 7 });
  assert.deepEqual(parseTelegramDestination("https://t.me/c/2190525348/7/120"), {
    chatId: "-1002190525348",
    threadId: 7,
  });
});

test("public links use the username", () => {
  assert.deepEqual(parseTelegramDestination("https://t.me/wucasa_chores"), { chatId: "@wucasa_chores" });
  assert.deepEqual(parseTelegramDestination("https://t.me/wucasa_chores/12?single"), {
    chatId: "@wucasa_chores",
    threadId: 12,
  });
});

test("malformed links are rejected", () => {
  assert.equal(parseTelegramDestination("https://t.me/c/notanumber/1"), null);
  assert.equal(parseTelegramDestination("https://t.me/+abcInviteHash"), null);
});
