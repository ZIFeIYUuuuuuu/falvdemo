export const CHUNK_TARGET_LENGTH = 420;
export const CHUNK_OVERLAP = 90;

export function normalizeFileName(name) {
  return name.trim().toLowerCase();
}

export function normalizeText(text) {
  return text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ").trim();
}

export function splitIntoParagraphs(text) {
  return normalizeText(text)
    .split(/\n{2,}/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function extractKeywords(text, limit = 16) {
  const matches = text.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,}/gu) || [];
  const scores = new Map();

  for (const token of matches) {
    const normalized = token.toLowerCase();
    if (normalized.length < 2) {
      continue;
    }
    scores.set(normalized, (scores.get(normalized) || 0) + 1);
  }

  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([token]) => token);
}

export function chunkDocumentText(text, metadata = {}) {
  const paragraphs = splitIntoParagraphs(text);
  const chunks = [];

  if (!paragraphs.length) {
    return chunks;
  }

  let buffer = "";
  let startParagraph = 0;

  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;

    if (candidate.length <= CHUNK_TARGET_LENGTH || !buffer) {
      buffer = candidate;
      continue;
    }

    chunks.push(createChunk(buffer, chunks.length, startParagraph, index - 1, metadata));

    const overlapSeed = buffer.slice(-CHUNK_OVERLAP).trim();
    buffer = overlapSeed ? `${overlapSeed}\n\n${paragraph}` : paragraph;
    startParagraph = Math.max(0, index - 1);
  }

  if (buffer.trim()) {
    chunks.push(createChunk(buffer, chunks.length, startParagraph, paragraphs.length - 1, metadata));
  }

  return chunks;
}

function createChunk(text, index, startParagraph, endParagraph, metadata) {
  return {
    id: `${metadata.docId || "doc"}-chunk-${index + 1}`,
    chunkIndex: index,
    text: text.trim(),
    preview: text.trim().slice(0, 180),
    keywords: extractKeywords(text),
    startParagraph,
    endParagraph,
    page: metadata.page || null,
    sourceLabel: metadata.sourceLabel || metadata.fileName || "资料片段",
  };
}

export function scoreChunkAgainstQuery(chunk, query, memoryText = "") {
  const combinedContext = `${memoryText} ${query}`.toLowerCase();
  const queryTokens = extractKeywords(combinedContext, 24);
  const chunkText = chunk.text.toLowerCase();
  const previewText = (chunk.preview || "").toLowerCase();

  let score = 0;

  for (const token of queryTokens) {
    if (chunk.keywords.includes(token)) {
      score += 3;
    }
    if (
      chunk.keywords.some(
        (keyword) => keyword.includes(token) || token.includes(keyword),
      )
    ) {
      score += 1.8;
    }
    if (chunkText.includes(token)) {
      score += 1.2;
    }
    if (previewText.includes(token)) {
      score += 0.4;
    }
  }

  return Number(score.toFixed(2));
}

export function buildLocalRagAnswer(matches, question) {
  const primary = matches[0];
  const secondary = matches[1];

  if (!primary) {
    return `当前知识库里没有找到和“${question}”足够相关的资料片段。建议继续上传更贴近问题的产品条款、理赔说明或服务手册，再重新提问。`;
  }

  const opening = `结合已上传资料，更接近问题的依据显示：${primary.text}`;

  if (!secondary) {
    return `${opening} 这是一种基于本地知识片段的解释，具体结论仍需结合完整条款、实际材料和持证顾问意见判断。`;
  }

  return `${opening} 另外，另一段相关资料补充到：${secondary.text} 这是一种基于本地知识片段的解释，具体结论仍需结合完整条款、实际材料和持证顾问意见判断。`;
}

export function getDuplicateReason(existingDocs, fileName, contentHash) {
  const normalizedName = normalizeFileName(fileName);

  const sameHash = existingDocs.find((doc) => doc.contentHash === contentHash);
  if (sameHash) {
    return {
      type: "content",
      message: `检测到重复内容，已存在资料“${sameHash.fileName}”。`,
      duplicateOf: sameHash.id,
    };
  }

  const sameName = existingDocs.find((doc) => normalizeFileName(doc.fileName) === normalizedName);
  if (sameName) {
    return {
      type: "name",
      message: `检测到重复文件名，已存在资料“${sameName.fileName}”。`,
      duplicateOf: sameName.id,
    };
  }

  return null;
}
