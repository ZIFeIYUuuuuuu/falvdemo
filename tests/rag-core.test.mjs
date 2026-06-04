import assert from "node:assert/strict";
import {
  buildLocalRagAnswer,
  chunkDocumentText,
  getDuplicateReason,
  scoreChunkAgainstQuery,
} from "../rag-core.js";

const sampleText = `
等待期

自本合同生效日零时起 90 日为等待期。如果本合同恢复效力，则自恢复效力之日零时起重新计算等待期。

责任免除

酒后驾驶、故意犯罪、战争等情形，不承担给付责任。
`;

const chunks = chunkDocumentText(sampleText, {
  docId: "sample",
  fileName: "sample.md",
  sourceLabel: "示例资料",
});

assert.ok(chunks.length >= 1, "chunking should produce at least one chunk");
assert.ok(chunks[0].keywords.length > 0, "chunk should contain derived keywords");

const waitingScore = scoreChunkAgainstQuery(chunks[0], "等待期多久", "");
const unrelatedScore = scoreChunkAgainstQuery(chunks[0], "寿险受益人怎么填", "");
assert.ok(waitingScore > unrelatedScore, "relevant query should score higher than unrelated query");

const duplicateByName = getDuplicateReason(
  [{ id: "1", fileName: "policy.pdf", contentHash: "abc" }],
  "policy.pdf",
  "def",
);
assert.equal(duplicateByName?.type, "name");

const duplicateByContent = getDuplicateReason(
  [{ id: "1", fileName: "policy.pdf", contentHash: "abc" }],
  "other.pdf",
  "abc",
);
assert.equal(duplicateByContent?.type, "content");

const answer = buildLocalRagAnswer(
  [
    { text: "等待期是 90 日。" },
    { text: "恢复效力后等待期重新计算。" },
  ],
  "等待期多久",
);
assert.match(answer, /等待期是 90 日/);

console.log("rag core test passed");
