import assert from "node:assert/strict";

const MEMORY_TURN_LIMIT = 4;
const MEMORY_MESSAGE_LIMIT = MEMORY_TURN_LIMIT * 2;

function getRollingMemoryWindow(messages) {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-MEMORY_MESSAGE_LIMIT);
}

const sampleConversation = [
  { role: "system", text: "ignored" },
  { role: "user", text: "Q1" },
  { role: "assistant", text: "A1" },
  { role: "user", text: "Q2" },
  { role: "assistant", text: "A2" },
  { role: "user", text: "Q3" },
  { role: "assistant", text: "A3" },
  { role: "user", text: "Q4" },
  { role: "assistant", text: "A4" },
  { role: "user", text: "Q5" },
  { role: "assistant", text: "A5" },
];

const memoryWindow = getRollingMemoryWindow(sampleConversation);

assert.equal(memoryWindow.length, 8, "rolling memory should keep only the latest 4 turns");
assert.deepEqual(
  memoryWindow.map((message) => message.text),
  ["Q2", "A2", "Q3", "A3", "Q4", "A4", "Q5", "A5"],
  "rolling memory should preserve the latest contiguous user/assistant exchanges",
);

console.log("memory window test passed");
