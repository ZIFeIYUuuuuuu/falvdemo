import {
  buildLocalRagAnswer,
  chunkDocumentText,
  getDuplicateReason,
  scoreChunkAgainstQuery,
} from "../../rag-core.js";
import { builtInPolicies, MEMORY_TURN_LIMIT } from "../data/knowledge.js";

const LIBRARY_DB_NAME = "baozhi-rag-db";
const LIBRARY_DB_VERSION = 1;

let pdfModulePromise;
let mammothModulePromise;

export function getRollingMemoryWindow(messages) {
  return messages
    .filter((message) => message.sender === "user" || message.sender === "assistant")
    .slice(-(MEMORY_TURN_LIMIT * 2))
    .map((message) => ({
      role: message.sender,
      text: message.sender === "assistant" ? message.answer || "" : message.content || "",
    }));
}

export function estimateTokenCount(messages) {
  const combinedLength = messages.reduce((total, message) => total + String(message.text || "").length, 0);
  return Math.max(0, Math.round(combinedLength / 2));
}

export function getSelectedPolicyProfile(selectedPolicyId) {
  const policy = builtInPolicies.find((item) => item.id === selectedPolicyId);

  if (!policy) {
    return null;
  }

  return {
    id: policy.id,
    title: policy.title,
    shortTitle: policy.shortTitle,
    type: policy.type,
    sourceType: policy.sourceType,
    summary: policy.summary,
    waitingPeriod: policy.waitingPeriod,
    gracePeriod: policy.gracePeriod,
    freeLookPeriod: policy.freeLookPeriod,
    tags: policy.tags.slice(0, 5),
  };
}

export function retrieveKnowledgeMatches({
  question,
  memoryWindow,
  selectedPolicyId,
  libraryDocs,
  libraryChunks,
}) {
  const memoryText = shouldUseMemoryForRetrieval(question)
    ? memoryWindow.map((message) => message.text).join(" ")
    : "";

  const seedMatches = builtInPolicies
    .filter((policy) => !selectedPolicyId || policy.id === selectedPolicyId)
    .flatMap((policy) =>
      policy.sections.map((section) => ({
        kind: "seed",
        policy,
        section,
        score: scoreChunkAgainstQuery(
          {
            text: `${section.excerpt} ${section.response}`,
            preview: section.excerpt,
            keywords: section.keywords,
          },
          question,
          memoryText,
        ),
      })),
    );

  const uploadedMatches = libraryChunks.map((chunk) => ({
    kind: "uploaded",
    chunk,
    document: libraryDocs.find((doc) => doc.id === chunk.docId),
    score: scoreChunkAgainstQuery(chunk, question, memoryText),
  }));

  return [...seedMatches, ...uploadedMatches]
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);
}

function shouldUseMemoryForRetrieval(question) {
  const normalized = String(question || "").trim();
  return /^(那|这个|这种|它|刚才|上面|继续)|(\bthis\b|\bit\b|\bthat\b)/iu.test(normalized);
}

function extractPageNumber(pageLabel) {
  const matched = String(pageLabel || "").match(/(\d+)/u);
  return matched ? Number(matched[1]) : null;
}

function resolveRenderPageNumber(policy, sectionPageLabel) {
  const sectionPageNumber = extractPageNumber(sectionPageLabel);

  if (!sectionPageNumber) {
    return null;
  }

  return sectionPageNumber + Number(policy?.documentPdfPageOffset || 0);
}

export function mapMatchToCitation(match, index = 0) {
  const matchRelation = classifyMatchRelation(match.score);

  if (match.kind === "seed") {
    return {
      citationId: `${match.policy.id}-${match.section.id}-${index + 1}`,
      kind: "seed",
      documentId: match.policy.id,
      documentTitle: match.policy.title,
      sectionTitle: match.section.title,
      sectionLabel: match.section.sectionLabel,
      page: match.section.page,
      excerpt: match.section.excerpt,
      keywords: match.section.keywords,
      pageNumber: resolveRenderPageNumber(match.policy, match.section.page),
      documentPdfPath: match.policy.documentPdfPath || "",
      documentPdfBlob: null,
      previewImagePath: match.section.previewImagePath,
      previewImageAlt: match.section.previewImageAlt,
      answerHint: match.section.response,
      guidanceHints: match.section.guidance,
      matchScore: match.score,
      matchRelation,
      policyType: match.policy.type,
      policyShortTitle: match.policy.shortTitle,
      coverageSummary: buildPolicyCoverageSummary(match.policy),
      boundarySummary: buildPolicyBoundarySummary(match.policy, match.section),
      matchBasis: buildMatchBasis(match.section.title, matchRelation),
      sourceType: match.policy.sourceType,
    };
  }

  return {
    citationId: `${match.document?.id || "upload"}-${match.chunk.id}-${index + 1}`,
    kind: "uploaded",
    documentId: match.document?.id || "upload",
    documentTitle: match.document?.fileName || "上传资料",
    sectionTitle: `资料片段 ${match.chunk.chunkIndex + 1}`,
    sectionLabel: match.document?.type || "上传资料",
    page: match.chunk.page || "未标页",
    excerpt: match.chunk.preview || match.chunk.text,
    keywords: match.chunk.keywords,
    pageNumber: extractPageNumber(match.chunk.page),
    documentPdfPath: "",
    documentPdfBlob:
      match.document?.mimeType === "application/pdf" ? match.document?.fileBlob || null : null,
    previewImagePath: "",
    previewImageAlt: "",
    answerHint: buildLocalRagAnswer([{ text: match.chunk.text }], "当前问题"),
    guidanceHints: [
      "可以继续上传同一产品的正式条款、理赔说明或常见问答，提升检索覆盖度。",
      "如果多个资料内容不一致，建议优先以正式保单或官方条款原文为准。",
      "这不是其他产品的直接条款结论；如果你正准备补充保障，也可以再比较同类产品的等待期、免责和给付条件。",
    ],
    matchScore: match.score,
    matchRelation,
    policyType: match.document?.type || "上传资料",
    policyShortTitle: match.document?.fileName || "上传资料",
    coverageSummary: buildUploadedCoverageSummary(match.document),
    boundarySummary:
      "当前命中的是上传资料片段，可能只代表保单中的局部描述；如未见直接责任表述，不能据此扩展成其他险种的一般结论。",
    matchBasis: buildMatchBasis(`资料片段 ${match.chunk.chunkIndex + 1}`, matchRelation),
    sourceType: match.document?.type || "上传资料",
  };
}

export function buildKnowledgeSummary(libraryDocs, libraryChunks) {
  const totalDocs = builtInPolicies.length + libraryDocs.length;
  const totalChunks =
    builtInPolicies.reduce((total, policy) => total + policy.sections.length, 0) +
    libraryChunks.length;

  const recentUploads = libraryDocs
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 2);

  return {
    totalDocs,
    totalChunks,
    entries: [
      ...builtInPolicies.map((policy) => ({
        id: policy.id,
        title: policy.title,
        badge: policy.sourceType,
        meta: `${policy.type} · ${policy.sections.length} 个条款片段`,
        summary: policy.sourceNote,
      })),
      ...recentUploads.map((doc) => ({
        id: doc.id,
        title: doc.fileName,
        badge: "最近上传",
        meta: `${doc.type} · ${doc.chunkCount} 个资料片段`,
        summary: normalizeExtractedText(doc.summary),
      })),
    ],
  };
}

export function buildContextsForApi(citations) {
  return citations.slice(0, 4).map((citation) => ({
    citationId: citation.citationId,
    documentTitle: citation.documentTitle,
    sectionTitle: citation.sectionTitle,
    page: citation.page,
    excerpt: citation.excerpt,
    answerHint: citation.answerHint,
    guidanceHints: citation.guidanceHints || [],
    matchRelation: citation.matchRelation || "weak",
    policyType: citation.policyType || "",
    policyShortTitle: citation.policyShortTitle || citation.documentTitle,
    coverageSummary: citation.coverageSummary || "",
    boundarySummary: citation.boundarySummary || "",
    matchBasis: citation.matchBasis || "",
    sourceType: citation.sourceType || "",
  }));
}

export async function loadLibraryFromDb() {
  const db = await openLibraryDb();
  const [docs, chunks] = await Promise.all([
    readAllFromStore(db, "docs"),
    readAllFromStore(db, "chunks"),
  ]);

  return {
    docs: docs.map((doc) => ({
      ...doc,
      summary: normalizeExtractedText(doc.summary),
    })),
    chunks: chunks.map((chunk) => ({
      ...chunk,
      text: normalizeExtractedText(chunk.text),
      preview: normalizeExtractedText(chunk.preview),
    })),
  };
}

export async function persistDocument(docRecord, chunks) {
  const db = await openLibraryDb();
  await withTransaction(db, ["docs", "chunks"], "readwrite", (stores) => {
    stores.docs.put(docRecord);
    chunks.forEach((chunk) => stores.chunks.put(chunk));
  });
}

export async function ingestFile(file, existingDocs) {
  const buffer = await file.arrayBuffer();
  const contentHash = await sha256Hex(buffer);
  const duplicate = getDuplicateReason(existingDocs, file.name, contentHash);

  if (duplicate) {
    return {
      duplicate,
      docRecord: null,
      chunks: [],
    };
  }

  const extracted = await extractDocument(file, buffer);

  if (!extracted.fullText.trim()) {
    return {
      duplicate: {
        type: "empty",
        message: `${file.name} 未提取到可用文本，已跳过。`,
      },
      docRecord: null,
      chunks: [],
    };
  }

  const docId = crypto.randomUUID();
  const docRecord = {
    id: docId,
    fileName: file.name,
    type: extracted.typeLabel,
    mimeType: file.type || extracted.mimeType,
    fileBlob: new Blob([buffer], { type: file.type || extracted.mimeType }),
    size: file.size,
    contentHash,
    chunkCount: extracted.chunks.length,
    summary: extracted.chunks[0]?.preview || extracted.fullText.slice(0, 120),
    createdAt: new Date().toISOString(),
  };

  const chunks = extracted.chunks.map((chunk) => ({
    ...chunk,
    id: `${docId}-${chunk.chunkIndex + 1}`,
    docId,
    fileName: file.name,
    type: extracted.typeLabel,
  }));

  await persistDocument(docRecord, chunks);
  return { duplicate: null, docRecord, chunks };
}

async function extractDocument(file, buffer) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".pdf")) {
    const pages = await extractPdfPages(buffer);
    const chunks = pages.flatMap((page) =>
      chunkDocumentText(page.text, {
        docId: file.name,
        fileName: file.name,
        page: page.pageLabel,
        sourceLabel: file.name,
      }),
    );

    return {
      typeLabel: "PDF",
      mimeType: "application/pdf",
      fullText: pages.map((page) => page.text).join("\n\n"),
      chunks,
    };
  }

  if (lowerName.endsWith(".docx")) {
    const mammoth = await loadMammothModule();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    const text = result.value || "";
    return {
      typeLabel: "Word",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fullText: text,
      chunks: chunkDocumentText(text, {
        docId: file.name,
        fileName: file.name,
        sourceLabel: file.name,
      }),
    };
  }

  if (
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".markdown")
  ) {
    const text = new TextDecoder("utf-8").decode(buffer);
    return {
      typeLabel: lowerName.endsWith(".txt") ? "TXT" : "Markdown",
      mimeType: file.type || "text/plain",
      fullText: text,
      chunks: chunkDocumentText(text, {
        docId: file.name,
        fileName: file.name,
        sourceLabel: file.name,
      }),
    };
  }

  throw new Error("当前仅支持 PDF、Word、TXT、Markdown 文件。");
}

async function extractPdfPages(buffer) {
  const pdfjs = await loadPdfModule();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const pages = [];

  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    const text = normalizeExtractedText(
      content.items.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim(),
    );

    if (text) {
      pages.push({
        pageNumber: index,
        pageLabel: `第 ${index} 页`,
        text,
      });
    }
  }

  return pages;
}

async function loadPdfModule() {
  if (!pdfModulePromise) {
    pdfModulePromise = import(
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.min.mjs"
    ).then((module) => {
      module.GlobalWorkerOptions.workerSrc =
        "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.worker.min.mjs";
      return module;
    });
  }

  return pdfModulePromise;
}

async function loadMammothModule() {
  if (!mammothModulePromise) {
    mammothModulePromise = import("https://esm.sh/mammoth@1.8.0");
  }

  return mammothModulePromise;
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function openLibraryDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LIBRARY_DB_NAME, LIBRARY_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("docs")) {
        const docsStore = db.createObjectStore("docs", { keyPath: "id" });
        docsStore.createIndex("byHash", "contentHash", { unique: true });
        docsStore.createIndex("byName", "fileName", { unique: false });
      }

      if (!db.objectStoreNames.contains("chunks")) {
        const chunksStore = db.createObjectStore("chunks", { keyPath: "id" });
        chunksStore.createIndex("byDocId", "docId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function withTransaction(db, storeNames, mode, callback) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, mode);
    const stores = Object.fromEntries(
      storeNames.map((storeName) => [storeName, transaction.objectStore(storeName)]),
    );

    callback(stores);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export function normalizeExtractedText(text) {
  return String(text || "")
    .replace(/([\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/gu, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function classifyMatchRelation(score) {
  if (score >= 10) {
    return "direct";
  }

  if (score >= 4.5) {
    return "related";
  }

  return "weak";
}

function buildPolicyCoverageSummary(policy) {
  const coverageTopics = [...new Set(policy.sections.map((section) => section.sectionLabel).filter(Boolean))]
    .slice(0, 3)
    .join("、");

  return `${policy.shortTitle || policy.title}属于${policy.type}，当前已接入资料主要围绕${coverageTopics || "保单责任"}展开。`;
}

function buildPolicyBoundarySummary(policy, section) {
  return `当前命中的重点是“${section.title}”这一条款，不能把这份${policy.type}直接当成医疗险、医保或其他险种的通用结论。`;
}

function buildUploadedCoverageSummary(document) {
  if (!document) {
    return "当前命中的是上传资料片段，但暂时无法确认它对应哪一类完整保单责任。";
  }

  return `${document.fileName}属于${document.type || "上传资料"}，当前只命中其中的局部片段，未必能代表完整责任范围。`;
}

function buildMatchBasis(targetLabel, relation) {
  if (relation === "direct") {
    return `当前问题与“${targetLabel}”条款的文字关联较强，可优先按该条款核对。`;
  }

  if (relation === "related") {
    return `当前问题与“${targetLabel}”存在一定关联，但更适合作为边界参考，不能直接推出责任结论。`;
  }

  return `当前只弱命中“${targetLabel}”相关内容，不能据此直接判断保险责任。`;
}
