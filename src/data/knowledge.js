const taipingCarePdfUrl = new URL("../../assets/docs/电子保单.pdf", import.meta.url).href;

export const MEMORY_TURN_LIMIT = 4;
export const MOBILE_BREAKPOINT_QUERY = "(max-width: 767px)";

export const starterPrompts = [
  {
    id: "waiting-period",
    label: "等待期内查出病还能赔吗？",
    query: "等待期内查出病还能赔吗？",
    hint: "看等待期和首次确诊规则",
  },
  {
    id: "grace-period",
    label: "交费晚了两个月，保障还在吗？",
    query: "交费晚了两个月，保障还在吗？",
    hint: "看宽限期和效力中止",
  },
  {
    id: "free-look",
    label: "犹豫期退保一般怎么处理？",
    query: "犹豫期退保一般怎么处理？",
    hint: "看签收日起算时间",
  },
  {
    id: "care-benefit",
    label: "长期护理金是一次给，还是按月给？",
    query: "长期护理金是一次给，还是按月给？",
    hint: "看给付节奏和次数上限",
  },
];

// Exported preview filenames are offset from the visible PDF page numbers.
// Keep this table aligned to the actual clause content, not the PNG filename.
const seedPreviewAssets = {
  "cooling-off": {
    imagePath: "/tmp/pdfs/clauses/page_13.png",
    imageAlt: "犹豫期与合同解除原文页预览",
  },
  "waiting-period": {
    imagePath: "/tmp/pdfs/clauses/page_14.png",
    imageAlt: "等待期规则原文页预览",
  },
  "waiting-period-claim": {
    imagePath: "/tmp/pdfs/clauses/page_15.png",
    imageAlt: "等待期内首次确诊给付限制原文页预览",
  },
  "long-term-care": {
    imagePath: "/tmp/pdfs/clauses/page_15.png",
    imageAlt: "长期护理保险金给付条款原文页预览",
  },
  exclusions: {
    imagePath: "/tmp/pdfs/clauses/page_16.png",
    imageAlt: "责任免除条款原文页预览",
  },
  "grace-period": {
    imagePath: "/tmp/pdfs/clauses/page_17.png",
    imageAlt: "宽限期与未按时交费条款原文页预览",
  },
};

function withPreview(section) {
  const preview = seedPreviewAssets[section.id] || {};
  return {
    ...section,
    previewImagePath: preview.imagePath || "",
    previewImageAlt: preview.imageAlt || "",
  };
}

export const builtInPolicies = [
  {
    id: "taiping-care",
    title: "太平惠鑫保护理保险电子保单",
    shortTitle: "太平惠鑫保护理保险",
    company: "太平人寿保险有限公司",
    type: "长期护理险",
    code: "TP-HX-CARE",
    sourceType: "内置电子保单",
    documentPdfPath: taipingCarePdfUrl,
    documentPdfPageOffset: 3,
    summary: "已接入电子保单条款，回答会优先引用等待期、宽限期、给付责任和犹豫期相关内容。",
    sourceNote: "当前演示已做脱敏处理，只保留问答所需条款信息。",
    waitingPeriod: "90 日",
    gracePeriod: "60 日",
    freeLookPeriod: "15 日",
    tags: ["等待期", "宽限期", "长期护理金", "犹豫期"],
    sections: [
      withPreview({
        id: "cooling-off",
        title: "犹豫期与合同解除",
        sectionLabel: "合同解除",
        page: "第 9 页",
        excerpt: "签收本合同之日起 15 日内属于犹豫期。如在该期间申请解除合同，通常仅扣除工本费。",
        keywords: ["犹豫期", "15日", "退保", "解除合同", "工本费", "签收", "反悔"],
        response: "这份保单对犹豫期写得比较明确：自签收合同之日起 15 日内属于犹豫期。如果在这个阶段申请解除合同，通常仅扣除工本费。",
        guidance: [
          "先确认合同签收日期，再判断是否仍处于 15 日犹豫期内。",
          "如准备解除合同，建议同步核对是否已有附加服务或其他安排。",
          "如需进一步比较同类保障，也可以再看犹豫期、现金价值和免责约定，再结合个人情况咨询持证顾问。",
        ],
      }),
      withPreview({
        id: "waiting-period",
        title: "等待期规则",
        sectionLabel: "保障责任",
        page: "第 11 页",
        excerpt: "自本合同生效日零时起 90 日为等待期。如果合同恢复效力，则自每次恢复效力之日零时起 90 日重新起算。",
        keywords: ["等待期", "90日", "恢复效力", "复效", "零时", "查出病", "还能赔"],
        response: "这份保单的等待期是 90 日，并且条款特别写明，如果合同曾经恢复效力，那么每次恢复效力后的 90 日也会重新按等待期处理。",
        guidance: [
          "重点核对等待期起算点，是首次生效还是恢复效力后的重新起算。",
          "如果问题与疾病责任有关，建议把等待期和首次确诊时间一起核对。",
          "这不是当前保单以外产品的直接条款结论；如果你想补充同类保障，也可以再比较等待期、免责和给付条件。",
        ],
      }),
      withPreview({
        id: "waiting-period-claim",
        title: "等待期内首次确诊的给付限制",
        sectionLabel: "保障责任",
        page: "第 12 页",
        excerpt: "如被保险人在等待期内因非意外原因首次确诊条款约定疾病，通常按已交保险费给付一次性护理保险金，不再承担长期护理保险金责任，合同终止。",
        keywords: ["等待期内", "初次确诊", "特定疾病", "已交保险费", "合同终止", "长期护理保险金", "还能赔"],
        response: "如果被保险人在等待期内，因为非意外原因首次确诊条款定义的疾病，通常是按已交保险费给付一次性护理保险金，不再承担长期护理保险金责任，而且合同终止。",
        guidance: [
          "先确认是否属于意外伤害事故以外的原因，以及是否为首次确诊。",
          "还需要核对医院级别、专科医生初次确诊和确诊时间点是否满足条款描述。",
          "这不是其他健康险产品的直接条款结论；如果你准备补充保障，可重点比较等待期、首次确诊定义和给付方式。",
        ],
      }),
      withPreview({
        id: "long-term-care",
        title: "长期护理保险金与给付次数",
        sectionLabel: "保障责任",
        page: "第 12 页",
        excerpt: "长期护理保险金不是一次性全部给付，而是在满足责任条件后，于每月对应日按基本保险金额给付，累计给付上限为 36 次。",
        keywords: ["长期护理保险金", "每月对应日", "36次", "基本保险金额", "一次给", "按月给"],
        response: "按照这份保单，长期护理保险金不是一次性全部给付，而是在满足责任条件后，按月对应日给付，累计给付上限是 36 次。",
        guidance: [
          "进一步核对基本保险金额的约定，以及每月对应日的计算方式。",
          "如在判断给付节奏，建议把首次确诊日或伤残等级确定日作为起点来核对。",
          "如果你还想补充同类护理保障，也可以再比较给付频率、给付次数上限和责任触发条件。",
        ],
      }),
      withPreview({
        id: "grace-period",
        title: "宽限期与未按时交费",
        sectionLabel: "保费交纳",
        page: "第 14 页",
        excerpt: "分期支付保费的，自约定交费日次日零时起 60 日为宽限期。宽限期内发生保险事故，仍承担保险责任，但会扣减欠交保费。",
        keywords: ["宽限期", "60日", "未交保费", "分期支付", "扣减欠交保费", "晚了", "两个月", "保障还在"],
        response: "这份条款里的宽限期是 60 日。也就是说，在分期交费场景下，如果首期之后某期没有按时交，进入宽限期后发生保险事故，保险公司仍可能承担责任，但给付时会先扣减欠交保费。",
        guidance: [
          "先确认当前保费是否属于分期交费，以及逾期发生在第几期。",
          "如果已经进入宽限期，建议同时核对事故发生时间和欠交保费状态。",
          "如果你后续想比较其他产品，也可以再看宽限期长度、复效要求和欠费期间责任是否延续。",
        ],
      }),
    ],
  },
  {
    id: "pingan-life",
    title: "平安御享常青终身寿险条款节选",
    shortTitle: "平安御享常青终身寿险",
    company: "中国平安人寿保险股份有限公司",
    type: "终身寿险",
    code: "PA-YXCQ-LIFE",
    sourceType: "内置条款节选",
    summary: "覆盖 20 日犹豫期、身故给付比例、宽限期满合同中止与复效程序。",
    sourceNote: "适合作为终身寿险常见咨询的示例资料。",
    waitingPeriod: "无等待期",
    gracePeriod: "60 日",
    freeLookPeriod: "20 日",
    tags: ["终身寿险", "犹豫期", "复效", "身故金"],
    sections: [
      withPreview({
        id: "pa-free-look",
        title: "20 日犹豫期权益",
        sectionLabel: "投保权益",
        page: "条款节选 A",
        excerpt: "自电子签收保单次日起享有 20 天犹豫期。在犹豫期内申请撤销合同，通常在扣除少量工本费后返还首期保险费。",
        keywords: ["20天", "犹豫期", "退保", "工本费", "电子保单"],
        response: "这份寿险条款中，犹豫期相对更长，为 20 天。若在该期限内撤销合同，通常会扣除少量工本费后返还首期保险费。",
        guidance: [
          "先确认电子签收保单的具体日期，再判断是否仍在 20 天内。",
          "如果已经过了犹豫期，退保逻辑会回到现金价值而不是简单退款。",
          "如果你还想比较同类寿险产品，也可以再看犹豫期天数、现金价值和退保处理方式。",
        ],
      }),
      withPreview({
        id: "pa-reinstatement",
        title: "宽限期满合同中止与复效程序",
        sectionLabel: "续期交费",
        page: "条款节选 B",
        excerpt: "续期应缴保费次日起算 60 日为宽限期。宽限期满仍未交付，合同效力自动中止；中止期间发生事故不承担赔付责任。",
        keywords: ["宽限期", "复效", "停交保险", "合同中止", "逾期未交"],
        response: "如果宽限期届满仍未交费，这份寿险条款写得比较直接：合同会转入效力中止，中止期间发生事故通常不承担赔付责任，后续如需恢复则要走复效程序。",
        guidance: [
          "先确认逾期天数是否已经超过 60 日。",
          "如果确实进入中止阶段，还要核对复效申请、补缴保费和健康告知要求。",
          "如需后续补充同类保障，也可以比较宽限期、复效门槛和中止期间责任安排，再结合个人情况评估。",
        ],
      }),
    ],
  },
  {
    id: "taikang-ci",
    title: "泰康乐享健康重疾险特约节选",
    shortTitle: "泰康乐享健康重疾险",
    company: "泰康人寿保险有限责任公司",
    type: "重疾险",
    code: "TK-LXJK-CI",
    sourceType: "内置条款节选",
    summary: "覆盖 180 天等待期、恶性肿瘤多次给付等健康险常见问题。",
    sourceNote: "适合作为健康险等待期和多次赔付场景的示例资料。",
    waitingPeriod: "180 天",
    gracePeriod: "60 日",
    freeLookPeriod: "15 日",
    tags: ["重疾险", "180天等待期", "癌症多赔", "健康险"],
    sections: [
      withPreview({
        id: "tk-waiting-ci",
        title: "180 天重大疾病等待期限制",
        sectionLabel: "重大疾病责任",
        page: "条款节选 C",
        excerpt: "本合同生效或复效之日零时起至第 180 天为疾病等待期。在等待期内非因意外首次确诊重疾、中症、轻症，通常不承担保险给付责任，仅退还累计已缴保费。",
        keywords: ["180天", "等待期", "重疾", "首次确诊", "退还保费"],
        response: "这份重疾险把等待期拉到了 180 天。如果是在等待期内，且并非意外导致首次确诊约定疾病，通常不承担保险给付责任，而是退还累计已缴保费。",
        guidance: [
          "先确认是否属于意外导致，以及合同是否经历过复效。",
          "再核对首次确诊时间是否落在 180 天等待期内。",
          "这不是其他重疾险产品的直接条款结论；如果你想补充保障，也可以再比较等待期、病种定义和给付规则。",
        ],
      }),
      withPreview({
        id: "tk-cancer-multiple",
        title: "恶性肿瘤多次赔付特约",
        sectionLabel: "特约责任",
        page: "条款节选 D",
        excerpt: "首次重大疾病确诊为恶性肿瘤并获赔后，生存满 3 年再次发生恶性肿瘤，可再次按基本保险金额给付，次数通常有上限。",
        keywords: ["癌症", "恶性肿瘤", "多次赔付", "3年", "给付上限"],
        response: "这份特约的重点在于，并不是所有恶性肿瘤都能立即多次赔付，而是要先满足首次确诊、已经获赔，以及再次发生时与 3 年生存期相关的要求。",
        guidance: [
          "先核对首次确诊病种和首次给付是否已经发生。",
          "再判断再次发生的时间点与条款间隔要求是否满足。",
          "如果你准备比较同类重疾保障，也可以重点看多次赔付间隔、病种限制和给付次数上限。",
        ],
      }),
    ],
  },
];

export const providerOptions = [
  { value: "qwen", label: "阿里云 Qwen", note: "默认" },
  { value: "openai", label: "OpenAI", note: "Responses API" },
  { value: "deepseek", label: "DeepSeek", note: "后端代理" },
  { value: "claude", label: "Claude", note: "Messages API" },
];
