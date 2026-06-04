import dotenv from "dotenv";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === __filename;

const PROVIDERS = {
  qwen: {
    keyEnv: "QWEN_API_KEY",
    label: "阿里云百炼 Qwen",
    model: process.env.QWEN_MODEL || "qwen-plus",
  },
  openai: {
    keyEnv: "OPENAI_API_KEY",
    label: "OpenAI",
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  },
  deepseek: {
    keyEnv: "DEEPSEEK_API_KEY",
    label: "DeepSeek",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  },
  claude: {
    keyEnv: "CLAUDE_API_KEY",
    label: "Claude",
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
  },
};

if (isMainModule) {
  startServer();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.post("/api/chat", async (req, res) => {
    try {
      const payload = validateChatPayload(req.body);
      const providerKey = resolveProvider(payload.provider);
      const response = await generateChatResponse(payload, providerKey);
      res.json(response);
    } catch (error) {
      console.error("[/api/chat]", error);
      res.status(error.statusCode || 500).json({
        error: error.message || "问答服务暂时不可用。",
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          port: Number(process.env.HMR_PORT || PORT + 1),
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = resolveProductionDistPath(__dirname);
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[BaoZhi] running at http://127.0.0.1:${PORT}`);
  });
}

export function validateChatPayload(body = {}) {
  const question = String(body.question || "").trim();

  if (!question) {
    const error = new Error("问题不能为空。");
    error.statusCode = 400;
    throw error;
  }

  const sanitizeText = (value, fallback = "") =>
    String(value || fallback)
      .replace(/\u0000/g, "")
      .trim()
      .slice(0, 4000);
  const sanitizeList = (value, limit = 5) =>
    Array.isArray(value)
      ? value.map((item) => sanitizeText(item)).filter(Boolean).slice(0, limit)
      : [];

  const memoryWindow = Array.isArray(body.memoryWindow)
    ? body.memoryWindow.slice(-8).map((item) => ({
        role: item?.role === "assistant" ? "assistant" : "user",
        text: sanitizeText(item?.text),
      }))
    : [];

  const contexts = Array.isArray(body.contexts)
    ? body.contexts.slice(0, 4).map((item, index) => ({
        citationId: sanitizeText(item?.citationId, `ref-${index + 1}`),
        documentTitle: sanitizeText(item?.documentTitle, "资料依据"),
        sectionTitle: sanitizeText(item?.sectionTitle, "相关条款"),
        page: sanitizeText(item?.page, "未标页"),
        excerpt: sanitizeText(item?.excerpt),
        answerHint: sanitizeText(item?.answerHint),
        guidanceHints: Array.isArray(item?.guidanceHints)
          ? item.guidanceHints.map((text) => sanitizeText(text)).filter(Boolean).slice(0, 3)
          : [],
        matchRelation: sanitizeMatchRelation(item?.matchRelation),
        policyType: sanitizeText(item?.policyType),
        policyShortTitle: sanitizeText(item?.policyShortTitle),
        coverageSummary: sanitizeText(item?.coverageSummary),
        boundarySummary: sanitizeText(item?.boundarySummary),
        matchBasis: sanitizeText(item?.matchBasis),
        sourceType: sanitizeText(item?.sourceType),
      }))
    : [];

  const selectedPolicyProfile = body.selectedPolicyProfile
    ? {
        id: sanitizeText(body.selectedPolicyProfile?.id),
        title: sanitizeText(body.selectedPolicyProfile?.title),
        shortTitle: sanitizeText(body.selectedPolicyProfile?.shortTitle),
        type: sanitizeText(body.selectedPolicyProfile?.type),
        sourceType: sanitizeText(body.selectedPolicyProfile?.sourceType),
        summary: sanitizeText(body.selectedPolicyProfile?.summary),
        waitingPeriod: sanitizeText(body.selectedPolicyProfile?.waitingPeriod),
        gracePeriod: sanitizeText(body.selectedPolicyProfile?.gracePeriod),
        freeLookPeriod: sanitizeText(body.selectedPolicyProfile?.freeLookPeriod),
        tags: sanitizeList(body.selectedPolicyProfile?.tags),
      }
    : null;

  return {
    question,
    provider: String(body.provider || "").trim(),
    selectedPolicyId: sanitizeText(body.selectedPolicyId),
    selectedPolicyProfile,
    memoryWindow,
    contexts,
  };
}

export function resolveProductionDistPath(baseDir) {
  const candidates = [path.join(baseDir, "dist"), baseDir];
  return candidates.find((candidate) => existsSync(path.join(candidate, "index.html"))) || candidates[0];
}

function resolveProvider(rawProvider) {
  const normalized = rawProvider && PROVIDERS[rawProvider] ? rawProvider : process.env.LLM_PROVIDER || "qwen";
  return PROVIDERS[normalized] ? normalized : "qwen";
}

async function generateChatResponse(payload, providerKey) {
  const provider = PROVIDERS[providerKey];
  const apiKey = process.env[provider.keyEnv];

  if (!apiKey) {
    return buildFallbackResponse(payload, providerKey, provider.label, provider.model, "未配置模型密钥，已使用本地保底回答。");
  }

  const prompt = buildPrompt(payload);

  try {
    let parsed;

    if (providerKey === "openai") {
      parsed = await callOpenAI(provider, apiKey, prompt);
    } else if (providerKey === "claude") {
      parsed = await callClaude(provider, apiKey, prompt);
    } else {
      parsed = await callOpenAICompatible(providerKey, provider, apiKey, prompt);
    }

    return {
      id: `asst-${Date.now()}`,
      sender: "assistant",
      verdict: normalizeVerdict(parsed.verdict),
      verdictText: parsed.verdictText,
      answer: parsed.answer,
      guidance: Array.isArray(parsed.guidance) ? parsed.guidance.slice(0, 3) : [],
      citations: payload.contexts.map((context) => ({
        citationId: context.citationId,
      })),
      provider: providerKey,
      providerLabel: provider.label,
      model: provider.model,
      degraded: false,
      timestamp: new Date().toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  } catch (error) {
    console.error(`[${providerKey}]`, error);
    return buildFallbackResponse(
      payload,
      providerKey,
      provider.label,
      provider.model,
      `模型调用失败：${error.message || "未知错误"}，已使用本地保底回答。`,
    );
  }
}

export function buildPrompt(payload) {
  const supportSignals = analyzeUserSupportSignals(payload.question, payload.memoryWindow);
  const primaryContext = payload.contexts[0] || null;
  const contextScope = describeContextScope(payload.contexts, payload.selectedPolicyProfile);
  const protectionGuidance = inferProtectionGuidance(payload.question, payload.memoryWindow);
  const memoryText = payload.memoryWindow.length
    ? payload.memoryWindow
        .map((item) => `${item.role === "assistant" ? "助手" : "用户"}：${item.text}`)
        .join("\n")
    : "当前没有需要继承的历史轮次。";
  const selectedPolicyText = describeSelectedPolicyProfile(payload.selectedPolicyProfile);

  const contextText = payload.contexts.length
    ? payload.contexts
        .map(
          (item, index) => [
            `资料 ${index + 1} / ${item.citationId}`,
            `文件：${item.documentTitle}`,
            `保单简称：${item.policyShortTitle || item.documentTitle}`,
            `资料类型：${item.policyType || item.sourceType || "未标注"}`,
            `章节：${item.sectionTitle}`,
            `位置：${item.page}`,
            `关联强弱：${describeMatchRelation(item.matchRelation)}`,
            `主要保障范围：${item.coverageSummary || "未提供"}`,
            `边界提醒：${item.boundarySummary || "未提供"}`,
            `命中说明：${item.matchBasis || "未提供"}`,
            `原文：${item.excerpt || "无可用原文"}`,
          ].join("\n"),
        )
        .join("\n\n")
    : "当前没有检索到足够相关的资料。";

  const system = [
    "你是“保知”，一个面向普通消费者的保险条款问答助手。",
    "必须只依据给定资料回答，禁止虚构条款、结论或赔付条件。",
    "你的首要任务不是泛泛介绍保险常识，而是先判断用户问题和当前命中的保单责任是否直接相关。",
    "回答必须优先对照当前命中的保单和条款，先说这份保单主要保什么，再判断这次提问是否落在它的责任范围内。",
    "如果当前资料主要体现某一特定险种或责任范围，你必须先明确说明这份保单主要保障什么，再判断这次提问是否落在它的核心责任范围内。",
    "当用户的问题与当前已接入资料不直接对应时，不要主动扩展到其他险种的通用规则，不要把其他产品当成当前保单来解释。",
    "只有在用户明确是在了解保障认知、且当前资料无法直接回答时，才可以用 1 到 2 句中性语言补充其他险种的常见作用；补充前必须先明确说明：这不是当前保单直接条款结论。",
    "对于故意伤害、被打伤、第三方伤害、住院花费、生病了怎么办这类问题，先判断当前保单是否出现了对应触发条件；若未看到对应责任，直接说明“按当前保单条款，暂未看到可直接支持这一情形的责任依据”。",
    "如果当前命中的条款只是弱相关或边界相关，也要按未直接命中处理，不能为了显得全面而展开泛化保险科普。",
    "不要把维权建议、就医建议和保险责任判断混在一起长篇展开；如需提醒报警、就医、保留票据，只做简短合规提醒。",
    "先回答问题本身，再说明依据边界，最后给 2 到 3 条合规的下一步建议。",
    "如果用户表达了生病、住院费用压力、担心负担过重、或“要是不用交钱就好了”这类情绪化愿望，先用 1 句自然的关怀式回应承接情绪，再进入解释。",
    "这种关怀式回应只能用于帮助用户理解保障认知，不能趁机销售，不能催促购买，不能制造焦虑，也不能暗示用户应该立刻投保。",
    "如果用户已经提到现有保单、产品名称、责任条款或理赔场景，优先帮助其核对现有保障是否相关，不要直接建议购买新保险。",
    "当资料不足、事实条件不全、或者无法支持确定判断时，必须明确写出这句话：当前资料不足以支持确定结论。",
    "answer 字段请按以下顺序组织成 3 到 4 段短段落：1. 当前保单/当前命中条款主要保什么；2. 这次问题是否直接落在当前责任范围；3. 依据边界或资料不足点；4. 最多 3 条简短合规引导。",
    "除非用户明确是在问保障认知，否则不要主动展开医保、医疗险、重疾险、住院津贴等一般知识。",
    "如果用户明确在问怎么买、该补什么保障、买哪类保险，或者你已经判断当前保单未直接覆盖该风险，可以在最后给出合规的购买引导。",
    "这类购买引导必须是中性、克制的选购方向，不要催促下单，不要制造焦虑，不要承诺一定赔。",
    "购买引导必须先声明“这不是当前保单直接条款结论”，再用“可优先了解”“可重点比较”“可结合预算评估”这类措辞给出方向。",
    "如果问题涉及被打伤、第三方伤害、意外住院、意外医疗费用，可优先引导了解意外险或其中的意外医疗责任；如果问题涉及一般疾病住院费用，可优先引导了解医疗险；如果问题涉及重大疾病收入损失，可补充重疾险通常解决的是确诊后的定额给付。",
    "语言要专业、可信、克制，不要营销，不要诱导购买。",
    "输出 JSON，字段必须是 verdict、verdictText、answer、guidance。",
    "verdict 仅可使用 supported、conditional、insufficient。",
    "如果当前条款未直接支持，verdict 优先使用 insufficient；如果条款方向相关但仍需补齐关键事实，使用 conditional；只有条款直接支持主要判断时才用 supported。",
    "verdictText 要像一个简短判断标题，例如“当前保单未见直接责任依据”或“当前条款支持，但仍需补充条件”。",
    "guidance 必须是字符串数组。",
  ].join("\n");

  const user = [
    `用户问题：${payload.question}`,
    "",
    `当前选中的保单：${selectedPolicyText}`,
    "",
    "最近短记忆（仅最近 4 轮，用于衔接代词和上下文）：",
    memoryText,
    "",
    "可用资料依据：",
    contextText,
    "",
    `当前首要命中资料：${describePrimaryContext(primaryContext, payload.selectedPolicyProfile)}`,
    "",
    `当前资料范围判断：${contextScope}`,
    "",
    `用户表达特征：${describeUserSupportSignals(supportSignals)}`,
    "",
    `如需购买引导时可参考的保障方向：${protectionGuidance.summary}`,
    "",
    "请生成简洁、可直接展示给用户的回答。",
  ].join("\n");

  return { system, user };
}

async function callOpenAI(provider, apiKey, prompt) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: prompt.system }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: prompt.user }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "insurance_answer",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              verdict: {
                type: "string",
                enum: ["supported", "conditional", "insufficient"],
              },
              verdictText: { type: "string" },
              answer: { type: "string" },
              guidance: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["verdict", "verdictText", "answer", "guidance"],
          },
          strict: true,
        },
      },
    }),
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.error?.message || "OpenAI 请求失败");
  }

  const rawText =
    json.output_text ||
    json.output
      ?.flatMap((item) => item.content || [])
      .map((item) => item.text || "")
      .join("\n");

  return parseModelJson(rawText);
}

async function callOpenAICompatible(providerKey, provider, apiKey, prompt) {
  const baseUrl =
    providerKey === "qwen"
      ? process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1"
      : process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    }),
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.error?.message || `${provider.label} 请求失败`);
  }

  const rawText = json.choices?.[0]?.message?.content;
  return parseModelJson(rawText);
}

async function callClaude(provider, apiKey, prompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: 1200,
      temperature: 0.2,
      system: `${prompt.system}\n请仅输出 JSON，不要输出代码块。`,
      messages: [{ role: "user", content: prompt.user }],
    }),
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.error?.message || `${provider.label} 请求失败`);
  }

  const rawText = Array.isArray(json.content)
    ? json.content.map((item) => item.text || "").join("\n")
    : "";

  return parseModelJson(rawText);
}

function parseModelJson(rawText) {
  const text = String(rawText || "").trim();

  if (!text) {
    throw new Error("模型没有返回可解析内容");
  }

  try {
    return JSON.parse(text);
  } catch {
    const matched = text.match(/\{[\s\S]*\}/);
    if (!matched) {
      throw new Error("模型返回不是合法 JSON");
    }
    return JSON.parse(matched[0]);
  }
}

export function buildFallbackResponse(payload, providerKey, providerLabel, model, diagnostic) {
  const supportSignals = analyzeUserSupportSignals(payload.question, payload.memoryWindow);
  const primary = payload.contexts[0];
  const selectedPolicy = payload.selectedPolicyProfile;
  const primaryRelation = primary?.matchRelation || "weak";
  const protectionGuidance = inferProtectionGuidance(payload.question, payload.memoryWindow);
  const empathyLead = supportSignals.needsEmpathy
    ? "生病或担心住院费用时，先想把现实负担降下来，是很常见的反应。"
    : "";
  const guidance = buildFallbackGuidance(
    primary,
    supportSignals,
    selectedPolicy,
    protectionGuidance,
    primaryRelation !== "direct",
  );

  let verdict = "insufficient";
  let verdictText = "当前资料不足以支持确定结论。";
  let answer = [
    empathyLead,
    "当前资料不足以支持确定结论。请补充更贴近问题的保单条款、理赔说明或服务材料后再提问。",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (primary) {
    const policyScope = buildPolicyScopeParagraph(primary, selectedPolicy);
    const boundaryParagraph = buildBoundaryParagraph(primary, true);

    if (primaryRelation === "direct") {
      verdict = primary.answerHint ? "conditional" : "supported";
      verdictText = primary.answerHint
        ? "当前条款支持，但仍需补充条件"
        : "当前条款与问题直接相关";
      answer = [
        empathyLead,
        policyScope,
        primary.answerHint ||
          `当前命中的资料重点来自“${primary.documentTitle}”中的“${primary.sectionTitle}”，可以先按这一条款核对责任。`,
        boundaryParagraph,
      ]
        .filter(Boolean)
        .join("\n\n");
    } else {
      verdict = "insufficient";
      verdictText = "当前保单未见直接责任依据";
      answer = [
        empathyLead,
        policyScope,
        "按当前保单条款，暂未看到可直接支持这一情形的责任依据。",
        buildBoundaryParagraph(primary),
      ]
        .filter(Boolean)
        .join("\n\n");
    }
  }

  if (!payload.contexts.length && selectedPolicy) {
    verdict = "insufficient";
    verdictText = "当前保单未见直接责任依据";
    answer = [
      empathyLead,
      describeSelectedPolicyForAnswer(selectedPolicy),
      "按当前保单条款，暂未看到可直接支持这一情形的责任依据。",
      "当前资料不足以支持确定结论。当前没有命中与该问题直接相关的条款片段，暂时只能先说明这份保单的已接入责任范围边界。",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (!payload.contexts.length && !selectedPolicy) {
    answer = [
      empathyLead,
      "当前资料不足以支持确定结论。",
      "这次没有检索到和问题足够相关的条款或资料片段。按当前已接入资料，我还看不到可以直接支持这一情形的责任依据。",
      "如果要继续判断，最好补充对应保单名称、相关条款页，或把伤情、诊断、伤残鉴定等关键事实一并对照。",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return {
    id: `asst-${Date.now()}`,
    sender: "assistant",
    verdict,
    verdictText,
    answer,
    guidance,
    citations: payload.contexts.map((context) => ({
      citationId: context.citationId,
    })),
    provider: providerKey,
    providerLabel,
    model,
    degraded: true,
    diagnostic,
    timestamp: new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function normalizeVerdict(value) {
  return ["supported", "conditional", "insufficient"].includes(value)
    ? value
    : "insufficient";
}

function analyzeUserSupportSignals(question, memoryWindow = []) {
  const combinedText = [question, ...memoryWindow.map((item) => item.text)]
    .filter(Boolean)
    .join("\n");

  return {
    needsEmpathy: /(生病|住院|医院|难受|害怕|担心|焦虑|压力|崩溃|撑不住|负担|看病贵|交不起|赔不起|如果.*就好了|要是.*就好了|免费住医院|不交钱)/u.test(
      combinedText,
    ),
    mentionsExistingPolicy: /(保单|条款|合同|产品名称|我有保险|已经买了|已投保|现有保障|我的保险|我的保单)/u.test(
      combinedText,
    ),
    asksCoverageEducation: /(什么意思|是什么|区别|科普|保障认知|一般.*保|通常.*保|都保什么|想了解|了解一下)/u.test(
      question,
    ),
    asksPurchaseGuidance: /(买什么|怎么买|买哪种|买哪类|推荐.*保险|适合.*保险|该买什么保险|补.*保险|补充保障|配置.*保险|投保|购买保险)/u.test(
      combinedText,
    ),
  };
}

function describeUserSupportSignals(signals) {
  const parts = [];

  if (signals.needsEmpathy) {
    parts.push("用户带有明显情绪或费用压力表达，需要先温和承接情绪");
  }

  if (signals.mentionsExistingPolicy) {
    parts.push("用户可能已有保单，应优先帮助核对现有保障");
  } else {
    parts.push("用户未明确提供保单，仍应先围绕当前命中资料判断");
  }

  if (signals.asksCoverageEducation) {
    parts.push("用户带有保障认知意图，若当前条款不足，可在声明边界后少量补充一般认知");
  } else {
    parts.push("用户不是在主动请求泛化科普，不应展开其他险种常识");
  }

  if (signals.asksPurchaseGuidance) {
    parts.push("用户带有明确购买或补充保障意图，可在完成当前保单判断后给出中性选购方向");
  }

  return parts.join("；");
}

function describeContextScope(contexts = [], selectedPolicyProfile = null) {
  if (!contexts.length) {
    if (selectedPolicyProfile) {
      return `当前正在对照“${selectedPolicyProfile.shortTitle || selectedPolicyProfile.title}”，但没有直接命中条款；回答应先说明这份保单的已知责任范围，再明确当前问题未见直接责任依据，不要扩展成泛保险科普。`;
    }

    return "当前没有直接命中条款，回答应先说明未命中，再提示补充对应保单或相关条款，不要扩展成泛保险科普。";
  }

  const documents = [...new Set(contexts.map((item) => item.documentTitle).filter(Boolean))];
  const sections = [...new Set(contexts.map((item) => item.sectionTitle).filter(Boolean))];
  const relations = [...new Set(contexts.map((item) => describeMatchRelation(item.matchRelation)))];

  return [
    `当前命中的资料主要来自：${documents.join(" / ") || "未标注文件"}`,
    `相关章节：${sections.slice(0, 4).join(" / ") || "未标注章节"}`,
    `关联强弱：${relations.join(" / ") || "未标注"}`,
    "请优先围绕这些资料判断问题是否直接相关，而不是扩展解释其他险种。",
  ].join("；");
}

function buildFallbackGuidance(
  primary,
  supportSignals,
  selectedPolicyProfile,
  protectionGuidance,
  hasCoverageGap = false,
) {
  const purchaseGuidance = buildPurchaseGuidance(
    supportSignals,
    protectionGuidance,
    hasCoverageGap,
  );

  if (supportSignals.needsEmpathy) {
    return [
      selectedPolicyProfile
        ? `如果你想继续核对这份${selectedPolicyProfile.shortTitle || selectedPolicyProfile.title}，可以继续补充对应条款页、事故经过或诊断结果。`
        : supportSignals.mentionsExistingPolicy
          ? "如果你已经有保单，可以继续发产品名称、责任条款或对应页码，我帮你先核对现有保障。"
          : "如果你想判断某张保单能不能用，可以继续发产品名称、责任条款或对应页码，我会先按当前保单对照。",
      primary
        ? "可以先查看这次命中的原文依据，再结合责任范围、触发条件和事实材料继续判断。"
        : "如果方便，也可以补充伤情结果、是否住院、是否做伤残鉴定，以及相关条款页，让判断更贴近实际情况。",
      purchaseGuidance || "如果你想进一步了解这类风险通常由哪些保障承担，我也可以继续按保障类型帮你梳理，但这不是当前保单的直接条款结论。",
    ];
  }

  if (primary?.guidanceHints?.length) {
    return [
      ...primary.guidanceHints.slice(0, 2),
      purchaseGuidance || "如需更完整地比较保障方向，也可以继续告诉我你的预算、已有保单和最担心的风险。",
    ].slice(0, 3);
  }

  return [
    "可以继续补充同一产品的正式条款、理赔说明或服务指引。",
    purchaseGuidance || "如果你手上还有其他保单，也可以一起对照看看是否已有相关保障。",
    "如需做更准确的保障评估或投保决策，建议结合个人情况咨询持证顾问。",
  ];
}

function inferProtectionGuidance(question, memoryWindow = []) {
  const text = [question, ...memoryWindow.map((item) => item.text)]
    .filter(Boolean)
    .join("\n");
  const entries = [];

  if (/(故意伤害|被打|第三方伤害|意外|摔伤|撞伤|骨折|伤残)/u.test(text)) {
    entries.push({
      label: "意外险",
      detail: "可优先看是否包含意外医疗、伤残给付和住院相关责任",
    });
    entries.push({
      label: "意外医疗责任",
      detail: "更贴近意外受伤后的门急诊、住院和治疗费用场景",
    });
  }

  if (/(住院|手术|医疗费|住院费|治疗费|报销|门诊|看病|生病)/u.test(text)) {
    entries.push({
      label: "医疗险",
      detail: "更适合对照住院、手术和治疗费用的报销型保障",
    });
  }

  if (/(重疾|癌症|恶性肿瘤|大病|收入损失)/u.test(text)) {
    entries.push({
      label: "重疾险",
      detail: "通常用于确诊约定重大疾病后的定额给付与收入损失缓冲",
    });
  }

  if (/(护理|失能|长期照护|康复护理)/u.test(text)) {
    entries.push({
      label: "长期护理险",
      detail: "更贴近长期失能、护理状态和持续照护责任",
    });
  }

  const uniqueEntries = [];
  const seenLabels = new Set();

  for (const entry of entries) {
    if (!seenLabels.has(entry.label)) {
      seenLabels.add(entry.label);
      uniqueEntries.push(entry);
    }
  }

  return {
    entries: uniqueEntries,
    summary: uniqueEntries.length
      ? uniqueEntries.map((entry) => `${entry.label}：${entry.detail}`).join(" / ")
      : "暂无明显保障方向",
  };
}

function buildPurchaseGuidance(supportSignals, protectionGuidance, hasCoverageGap = false) {
  if (!supportSignals.asksPurchaseGuidance && !hasCoverageGap) {
    return "";
  }

  const guidanceEntries = protectionGuidance?.entries || [];

  if (!guidanceEntries.length) {
    return "这不是当前保单直接条款结论；如果你正准备补充保障，可优先比较与你最担心风险更相关的保障类型，也可以继续告诉我预算、已有保单和想解决的问题，我再帮你细化。";
  }

  const [primaryEntry, secondaryEntry] = guidanceEntries;
  const comparisonTail = secondaryEntry
    ? `，也可以一起比较${secondaryEntry.label}`
    : "";

  return `这不是当前保单直接条款结论；如果你正准备补充保障，可优先了解${primaryEntry.label}，${primaryEntry.detail}${comparisonTail}，再结合预算、已有保障和免责条款做判断。`;
}

function sanitizeMatchRelation(value) {
  return ["direct", "related", "weak"].includes(value) ? value : "weak";
}

function describeMatchRelation(value) {
  if (value === "direct") {
    return "直接相关";
  }

  if (value === "related") {
    return "边界相关";
  }

  return "弱相关";
}

function describeSelectedPolicyProfile(profile) {
  if (!profile?.title) {
    return "当前未锁定单一保单，默认综合已接入资料。";
  }

  const terms = [
    profile.waitingPeriod ? `等待期 ${profile.waitingPeriod}` : "",
    profile.gracePeriod ? `宽限期 ${profile.gracePeriod}` : "",
    profile.freeLookPeriod ? `犹豫期 ${profile.freeLookPeriod}` : "",
  ]
    .filter(Boolean)
    .join(" / ");

  return [
    `${profile.shortTitle || profile.title}（${profile.type || "保险产品"}）`,
    profile.summary || "",
    terms,
  ]
    .filter(Boolean)
    .join("；");
}

function describePrimaryContext(primary, selectedPolicyProfile) {
  if (primary) {
    return `${primary.policyShortTitle || primary.documentTitle} / ${primary.sectionTitle} / ${describeMatchRelation(primary.matchRelation)}`;
  }

  if (selectedPolicyProfile?.title) {
    return `${selectedPolicyProfile.shortTitle || selectedPolicyProfile.title} / 暂无直接命中条款`;
  }

  return "暂无直接命中资料";
}

function describeSelectedPolicyForAnswer(profile) {
  const summary = profile.summary
    ? profile.summary.replace(/^已接入/u, "当前已接入")
    : `这份保单属于${profile.type || "保险产品"}。`;

  return `当前正在对照的是${profile.shortTitle || profile.title}（${profile.type || "保险产品"}）。${summary}`;
}

function buildPolicyScopeParagraph(primary, selectedPolicyProfile) {
  if (primary?.coverageSummary) {
    return `当前命中的保单主要保障范围是：${primary.coverageSummary}`;
  }

  if (selectedPolicyProfile?.title) {
    return describeSelectedPolicyForAnswer(selectedPolicyProfile);
  }

  return "当前还没有锁定到能直接代表责任范围的保单条款。";
}

function buildBoundaryParagraph(primary, includeConditionalTail = false) {
  const pieces = [];

  if (primary?.matchBasis) {
    pieces.push(primary.matchBasis);
  }

  if (primary?.boundarySummary) {
    pieces.push(primary.boundarySummary);
  }

  if (!pieces.length) {
    pieces.push("当前资料不足以支持确定结论。");
  }

  if (includeConditionalTail) {
    pieces.push("最终是否成立，仍需结合完整事实、触发条件和正式条款继续核对。");
  } else if (!pieces.some((item) => item.includes("当前资料不足以支持确定结论"))) {
    pieces.push("当前资料不足以支持确定结论。");
  }

  return pieces.join("");
}
