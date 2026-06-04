import assert from "node:assert/strict";
import { buildFallbackResponse, buildPrompt } from "../server.js";
import {
  buildContextsForApi,
  getSelectedPolicyProfile,
  mapMatchToCitation,
} from "../src/lib/local-kb.js";
import { builtInPolicies } from "../src/data/knowledge.js";

const selectedPolicyProfile = getSelectedPolicyProfile("taiping-care");
const waitingPeriodSection = builtInPolicies[0].sections.find((section) => section.id === "waiting-period");

const directCitation = mapMatchToCitation(
  {
    kind: "seed",
    policy: builtInPolicies[0],
    section: waitingPeriodSection,
    score: 12.6,
  },
  0,
);

const directContext = buildContextsForApi([directCitation])[0];

assert.equal(directContext.matchRelation, "direct");
assert.match(directContext.coverageSummary, /长期护理险/);
assert.match(directContext.boundarySummary, /不能把这份长期护理险直接当成医疗险/);

const weakPayload = {
  question: "我被人故意伤害了怎么办",
  selectedPolicyId: selectedPolicyProfile.id,
  selectedPolicyProfile,
  memoryWindow: [],
  contexts: [
    {
      ...directContext,
      matchRelation: "weak",
      matchBasis: "当前只弱命中“等待期规则”相关内容，不能据此直接判断保险责任。",
    },
  ],
};

const fallback = buildFallbackResponse(
  weakPayload,
  "qwen",
  "阿里云百炼 Qwen",
  "qwen-plus",
  "test fallback",
);

assert.equal(fallback.verdict, "insufficient");
assert.equal(fallback.verdictText, "当前保单未见直接责任依据");
assert.match(fallback.answer, /按当前保单条款，暂未看到可直接支持这一情形的责任依据/);
assert.match(fallback.answer, /长期护理险/);

const prompt = buildPrompt(weakPayload);

assert.match(prompt.system, /除非用户明确是在问保障认知，否则不要主动展开医保、医疗险、重疾险、住院津贴等一般知识/);
assert.match(prompt.system, /按当前保单条款，暂未看到可直接支持这一情形的责任依据/);
assert.match(prompt.system, /如果用户明确在问怎么买、该补什么保障、买哪类保险/);
assert.match(prompt.user, /当前选中的保单：太平惠鑫保护理保险（长期护理险）/);
assert.match(prompt.user, /关联强弱：弱相关/);
assert.match(prompt.user, /如需购买引导时可参考的保障方向：意外险：可优先看是否包含意外医疗、伤残给付和住院相关责任/);

const noContextFallback = buildFallbackResponse(
  {
    ...weakPayload,
    contexts: [],
  },
  "qwen",
  "阿里云百炼 Qwen",
  "qwen-plus",
  "test no context fallback",
);

assert.equal(noContextFallback.verdict, "insufficient");
assert.match(noContextFallback.answer, /当前没有命中与该问题直接相关的条款片段/);
assert.ok(
  noContextFallback.guidance.some((item) => /意外险|意外医疗责任/u.test(item)),
  "fallback guidance should provide a neutral purchase direction for uncovered injury scenarios",
);
assert.ok(
  noContextFallback.guidance.some((item) => /住院相关责任|治疗费用场景/u.test(item)),
  "injury guidance should explain why the suggested protection type is relevant",
);

const purchaseIntentFallback = buildFallbackResponse(
  {
    ...weakPayload,
    question: "这种情况我该买什么保险",
    contexts: [],
  },
  "qwen",
  "阿里云百炼 Qwen",
  "qwen-plus",
  "test purchase guidance",
);

assert.ok(
  purchaseIntentFallback.guidance.some((item) => /这不是当前保单直接条款结论/u.test(item)),
  "purchase guidance should explicitly separate general purchase direction from current policy conclusions",
);
assert.ok(
  purchaseIntentFallback.guidance.some((item) => /可优先了解|可优先比较/u.test(item)),
  "purchase guidance should use neutral comparison wording",
);

const medicalGuidanceFallback = buildFallbackResponse(
  {
    ...weakPayload,
    question: "我生病住院了，这种情况该买什么保险",
    contexts: [],
  },
  "qwen",
  "阿里云百炼 Qwen",
  "qwen-plus",
  "test medical purchase guidance",
);

assert.ok(
  medicalGuidanceFallback.guidance.some((item) => /医疗险/u.test(item)),
  "illness hospitalization scenario should point to medical insurance guidance",
);
assert.ok(
  medicalGuidanceFallback.guidance.some((item) => /住院、手术和治疗费用/u.test(item)),
  "medical guidance should explain the hospitalization expense fit",
);

const criticalIllnessGuidanceFallback = buildFallbackResponse(
  {
    ...weakPayload,
    question: "如果担心癌症和收入损失，我该补什么保险",
    contexts: [],
  },
  "qwen",
  "阿里云百炼 Qwen",
  "qwen-plus",
  "test critical illness purchase guidance",
);

assert.ok(
  criticalIllnessGuidanceFallback.guidance.some((item) => /重疾险/u.test(item)),
  "critical illness scenario should point to critical illness coverage",
);
assert.ok(
  criticalIllnessGuidanceFallback.guidance.some((item) => /定额给付|收入损失/u.test(item)),
  "critical illness guidance should explain the income-loss fit",
);

console.log("policy answering test passed");
