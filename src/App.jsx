import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Database,
  FolderOpen,
  Send,
  ShieldCheck,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  builtInPolicies,
  MEMORY_TURN_LIMIT,
  MOBILE_BREAKPOINT_QUERY,
  providerOptions,
  starterPrompts,
} from "./data/knowledge.js";
import {
  buildContextsForApi,
  buildKnowledgeSummary,
  estimateTokenCount,
  getSelectedPolicyProfile,
  getRollingMemoryWindow,
  ingestFile,
  loadLibraryFromDb,
  mapMatchToCitation,
  retrieveKnowledgeMatches,
} from "./lib/local-kb.js";

const PROVIDER_STORAGE_KEY = "baozhi-provider";
const PDF_PAGE_PREVIEW_SCALE = 1.8;
const PDF_PAGE_LIGHTBOX_SCALE = 2.4;

let clientPdfModulePromise;

const PDF_PRIVACY_MASKS = {
  "taiping-care": {
    allPages: [
      { x: 0.30, y: 0.935, width: 0.40, height: 0.04 },
    ],
    pages: {
      2: [
        { x: 0.30, y: 0.17, width: 0.12, height: 0.035 },
        { x: 0.35, y: 0.46, width: 0.38, height: 0.05 },
        { x: 0.14, y: 0.82, width: 0.63, height: 0.11 },
      ],
      3: [
        { x: 0.24, y: 0.71, width: 0.22, height: 0.17 },
        { x: 0.54, y: 0.71, width: 0.24, height: 0.17 },
      ],
      4: [
        { x: 0.60, y: 0.03, width: 0.35, height: 0.07 },
        { x: 0.08, y: 0.17, width: 0.84, height: 0.14 },
      ],
      5: [
        { x: 0.08, y: 0.10, width: 0.84, height: 0.16 },
      ],
      6: [
        { x: 0.08, y: 0.09, width: 0.84, height: 0.05 },
      ],
    },
  },
};

export default function App() {
  const [selectedPolicyId, setSelectedPolicyId] = useState(null);
  const [provider, setProvider] = useState(() => {
    if (typeof window === "undefined") {
      return "qwen";
    }
    return window.localStorage.getItem(PROVIDER_STORAGE_KEY) || "qwen";
  });
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [askProgress, setAskProgress] = useState(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [inspectingCitation, setInspectingCitation] = useState(null);
  const [libraryDocs, setLibraryDocs] = useState([]);
  const [libraryChunks, setLibraryChunks] = useState([]);
  const [ingestionStatus, setIngestionStatus] = useState("已载入");
  const [activePromptId, setActivePromptId] = useState(null);
  const [desktopDraft, setDesktopDraft] = useState("");
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
  });

  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadLibraryFromDb().then(({ docs, chunks }) => {
      setLibraryDocs(docs);
      setLibraryChunks(chunks);
    });
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
  }, [provider]);

  useEffect(() => {
    autoResizeTextarea(textareaRef.current);
  }, [inputValue]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (inspectingCitation) {
      setRightSidebarCollapsed(false);
    }
  }, [inspectingCitation]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const syncViewport = (event) => setIsMobileViewport(event.matches);

    setIsMobileViewport(mediaQuery.matches);
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  const knowledgeSummary = useMemo(
    () => buildKnowledgeSummary(libraryDocs, libraryChunks),
    [libraryDocs, libraryChunks],
  );
  const selectedPolicyProfile = useMemo(
    () => getSelectedPolicyProfile(selectedPolicyId),
    [selectedPolicyId],
  );

  const memoryWindow = useMemo(() => getRollingMemoryWindow(messages), [messages]);
  const memoryTokens = useMemo(() => estimateTokenCount(memoryWindow), [memoryWindow]);
  const providerLabel = providerOptions.find((item) => item.value === provider)?.label || "阿里云 Qwen";

  function handleInspectCitation(citation) {
    setInspectingCitation(citation);
    setRightSidebarCollapsed(false);
  }

  async function handleAsk(questionText) {
    const question = questionText.trim();

    if (!question || isLoading) {
      return;
    }

    setIsLoading(true);
    setInspectingCitation(null);
    clearPromptLink();
    setInputValue("");

    const userMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      content: question,
      timestamp: formatTime(new Date()),
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);

    const totalKnowledgeDocs = builtInPolicies.length + libraryDocs.length;
    await showAskProgress(
      setAskProgress,
      buildAskProgress("memory", {
        detail: `正在核对问题和最近 ${MEMORY_TURN_LIMIT} 轮对话，只保留必要上下文。`,
        scope: `短记忆窗口 · 最近 ${MEMORY_TURN_LIMIT} 轮`,
      }),
    );

    const nextMemoryWindow = getRollingMemoryWindow(nextMessages);
    await showAskProgress(
      setAskProgress,
      buildAskProgress("retrieve", {
        detail: `正在从 ${totalKnowledgeDocs} 份资料里检索相关条款和问答片段。`,
        scope: `资料范围 · 内置 ${builtInPolicies.length} 份 / 上传 ${libraryDocs.length} 份`,
      }),
    );

    const matches = retrieveKnowledgeMatches({
      question,
      memoryWindow: nextMemoryWindow,
      selectedPolicyId,
      libraryDocs,
      libraryChunks,
    });
    const citations = matches.slice(0, 3).map((match, index) => mapMatchToCitation(match, index, question));

    await showAskProgress(
      setAskProgress,
      buildAskProgress("citations", {
        detail: citations.length
          ? `已命中 ${citations.length} 条高相关依据，正在整理引用上下文。`
          : "暂未命中直接条款，正在基于已接入资料谨慎组织回答。",
        scope: citations.length
          ? citations.map((citation) => citation.documentTitle).slice(0, 2).join(" / ")
          : "当前问题暂无直接命中条款",
      }),
    );

    try {
      setAskProgress(
        buildAskProgress("model", {
          detail: `正在调用 ${providerLabel} 生成回答，并准备可核对的原文依据。`,
          scope: citations.length ? `引用依据 · ${citations.length} 条` : "引用依据 · 暂无直接命中",
        }),
      );

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          provider,
          selectedPolicyId,
          selectedPolicyProfile,
          memoryWindow: nextMemoryWindow,
          contexts: buildContextsForApi(citations),
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || "问答服务暂时不可用。");
      }

      const assistantMessage = {
        id: body.id || `assistant-${Date.now()}`,
        sender: "assistant",
        answer: body.answer,
        verdict: body.verdict,
        verdictText: body.verdictText,
        guidance: body.guidance || [],
        citations,
        providerLabel: body.providerLabel || providerLabel,
        providerModel: body.model || "",
        degraded: Boolean(body.degraded),
        diagnostic: body.diagnostic || "",
        memorySnapshot: {
          retainedTurns: MEMORY_TURN_LIMIT,
          retainedMessages: nextMemoryWindow.length,
          estimatedTokens: estimateTokenCount(nextMemoryWindow),
        },
        timestamp: body.timestamp || formatTime(new Date()),
      };

      setMessages((current) => [...current, assistantMessage]);
      if (citations.length && !window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches) {
        handleInspectCitation(citations[0]);
      }
    } catch (error) {
      const fallbackMessage = {
        id: `assistant-${Date.now()}`,
        sender: "assistant",
        answer: "当前资料不足以支持确定结论。",
        verdict: "insufficient",
        verdictText: error.message || "问答服务暂时不可用。",
        guidance: [
          "可补充相关条款材料后再继续提问。",
          "如需准确判断，建议咨询持证顾问，并以正式条款和实际材料为准。",
        ],
        citations,
        providerLabel,
        providerModel: "",
        degraded: true,
        diagnostic: error.message || "",
        memorySnapshot: {
          retainedTurns: MEMORY_TURN_LIMIT,
          retainedMessages: nextMemoryWindow.length,
          estimatedTokens: estimateTokenCount(nextMemoryWindow),
        },
        timestamp: formatTime(new Date()),
      };
      setMessages((current) => [...current, fallbackMessage]);
    } finally {
      setIsLoading(false);
      setAskProgress(null);
    }
  }

  async function handleFileSelection(event) {
    const files = [...(event.target.files || [])];

    if (!files.length) {
      return;
    }

    for (const file of files) {
      try {
        setIngestionStatus(`解析中 · ${file.name}`);
        const result = await ingestFile(file, libraryDocs);

        if (result.duplicate) {
          setIngestionStatus(`${file.name} · 已存在`);
          continue;
        }

        setLibraryDocs((current) => [result.docRecord, ...current]);
        setLibraryChunks((current) => [...result.chunks, ...current]);
        setIngestionStatus(`${file.name} · 已入库`);
      } catch (error) {
        setIngestionStatus(`${file.name} · 失败`);
      }
    }

    event.target.value = "";
  }

  function handlePromptSelect(prompt) {
    if (window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches) {
      handleAsk(prompt.query);
      return;
    }

    setActivePromptId(prompt.id);
    setDesktopDraft(prompt.query);
    setInputValue(prompt.query);
    requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
      textareaRef.current?.setSelectionRange(prompt.query.length, prompt.query.length);
      textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function clearPromptLink() {
    setActivePromptId(null);
    setDesktopDraft("");
  }

  function handleInputChange(value) {
    setInputValue(value);
    if (desktopDraft && value.trim() !== desktopDraft) {
      clearPromptLink();
    }
  }

  const splitMode = Boolean(inspectingCitation) && !rightSidebarCollapsed;
  const hasMessages = messages.length > 0;
  const promptLinked = Boolean(activePromptId);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(199,236,225,0.45),_transparent_32%),linear-gradient(180deg,_#f5faf7_0%,_#f8fafc_100%)] text-slate-800">
      <Header
        provider={provider}
        knowledgeSummary={knowledgeSummary}
        memoryTokens={memoryTokens}
        onProviderChange={setProvider}
        onOpenLibrary={() => setLibraryOpen(true)}
      />

      <main
        className={`mx-auto grid min-h-[calc(100vh-72px)] w-full max-w-[1760px] grid-cols-1 gap-5 px-3 py-4 md:px-6 md:py-6 xl:items-start ${
          leftSidebarCollapsed
            ? "xl:grid-cols-[minmax(0,1fr)]"
            : "xl:grid-cols-[minmax(260px,312px)_minmax(0,1fr)]"
        }`}
      >
        {!leftSidebarCollapsed ? (
        <section className="order-2 flex flex-col gap-4 xl:sticky xl:top-[96px] xl:order-1 xl:self-start">
          <article className="overflow-hidden rounded-[28px] border border-slate-200/85 bg-white/92 shadow-[0_20px_44px_rgba(15,23,42,0.05)] backdrop-blur">
            <div className="px-5 pb-5 pt-5">
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setLeftSidebarCollapsed(true)}
                  className="hidden xl:inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
                  aria-label="收起左侧栏"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700/75">Insurance Knowledge Desk</p>
                  <h1 className="mt-1 text-[22px] font-bold tracking-tight text-slate-950 md:text-[26px]">保知</h1>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    像保险条款服务入口一样回答问题，先解释，再展示原文依据。
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                <TrustPoint
                  title="可问问题"
                  body="等待期、宽限期、犹豫期、给付方式和常见责任限制，都可以直接提问。"
                />
                <TrustPoint
                  title="资料依据"
                  body="回答只围绕已接入的保单与条款片段展开，并保留原文预览入口。"
                />
                <TrustPoint
                  title="不会乱判断"
                  body="资料不够时会明确提示需要补充条件，不替你直接下武断结论。"
                />
              </div>
            </div>
          </article>

          <PolicyVault
            selectedPolicyId={selectedPolicyId}
            libraryDocs={libraryDocs}
            onSelectPolicy={setSelectedPolicyId}
            onOpenLibrary={() => setLibraryOpen(true)}
          />
        </section>
        ) : null}

        <section className="order-1 min-w-0 xl:order-2">
          <div className={`grid gap-5 ${splitMode ? "xl:grid-cols-[minmax(0,1fr)_420px]" : "xl:grid-cols-1"}`}>
            <div className="flex min-h-[620px] flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)]">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">保险知识库智能体</p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-950">保障问题问答</h2>
                  <p className="mt-1 text-sm text-slate-500">先回答你的问题，再提供可以核对的原文依据。</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <MetaPill icon={<Database className="h-3.5 w-3.5" />}>
                    {knowledgeSummary.totalDocs} 份资料
                  </MetaPill>
                  <MetaPill icon={<BookOpen className="h-3.5 w-3.5" />}>
                    最近 {MEMORY_TURN_LIMIT} 轮
                  </MetaPill>
                  {inspectingCitation ? (
                    <button
                      type="button"
                      onClick={() => setRightSidebarCollapsed((current) => !current)}
                      className="hidden xl:inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
                      aria-label={splitMode ? "收起引用侧栏" : "展开引用侧栏"}
                    >
                      {splitMode ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 md:px-5">
                {!hasMessages ? (
                  <EmptyState
                    knowledgeSummary={knowledgeSummary}
                    onOpenLibrary={() => setLibraryOpen(true)}
                    onSelectPrompt={handlePromptSelect}
                    activePromptId={activePromptId}
                    inputValue={inputValue}
                    isLoading={isLoading}
                    askProgress={askProgress}
                    onInputChange={handleInputChange}
                    onAsk={handleAsk}
                    textareaRef={textareaRef}
                  />
                ) : (
                  <div className="flex flex-col gap-4">
                    {messages.map((message) =>
                      message.sender === "user" ? (
                        <UserBubble key={message.id} message={message} />
                      ) : (
                        <AssistantBubble
                          key={message.id}
                          message={message}
                          onInspectCitation={setInspectingCitation}
                          mobile={isMobileViewport}
                        />
                      ),
                    )}
                    {isLoading ? <LoadingBubble progress={askProgress} /> : null}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {hasMessages ? (
                <div className={`border-t border-slate-100 bg-slate-50/75 px-4 py-4 transition-all md:px-5 ${promptLinked ? "shadow-[inset_0_1px_0_rgba(5,150,105,0.10)]" : ""}`}>
                  <QuestionComposer
                    value={inputValue}
                    isLoading={isLoading}
                    askProgress={askProgress}
                    textareaRef={textareaRef}
                    promptLinked={promptLinked}
                    onChange={handleInputChange}
                    onSubmit={handleAsk}
                  />
                </div>
              ) : null}
            </div>

            {splitMode ? (
              <div className="hidden xl:block">
                <CitationInspector
                  citation={inspectingCitation}
                  onClose={() => setInspectingCitation(null)}
                  onCollapse={() => setRightSidebarCollapsed(true)}
                />
              </div>
            ) : null}
          </div>
        </section>
      </main>

      {leftSidebarCollapsed ? (
        <button
          type="button"
          onClick={() => setLeftSidebarCollapsed(false)}
          className="fixed left-5 top-[112px] z-30 hidden xl:inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/92 px-3 py-2 text-sm font-medium text-slate-700 shadow-[0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur transition hover:border-emerald-200 hover:text-emerald-700"
        >
          <ChevronsRight className="h-4 w-4" />
          展开左栏
        </button>
      ) : null}

      {inspectingCitation && rightSidebarCollapsed ? (
        <button
          type="button"
          onClick={() => setRightSidebarCollapsed(false)}
          className="fixed right-5 top-[112px] z-30 hidden xl:inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/92 px-3 py-2 text-sm font-medium text-slate-700 shadow-[0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur transition hover:border-emerald-200 hover:text-emerald-700"
        >
          展开引用
          <ChevronsLeft className="h-4 w-4" />
        </button>
      ) : null}

      {inspectingCitation ? (
        <div className="fixed inset-0 z-50 bg-slate-950/35 xl:hidden" onClick={() => setInspectingCitation(null)}>
          <div className="absolute inset-x-0 bottom-0 top-[12%] rounded-t-[28px] bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <CitationInspector citation={inspectingCitation} onClose={() => setInspectingCitation(null)} mobile />
          </div>
        </div>
      ) : null}

      <LibraryDrawer
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onTriggerUpload={() => fileInputRef.current?.click()}
        builtInPolicies={builtInPolicies}
        libraryDocs={libraryDocs}
        ingestionStatus={ingestionStatus}
      />

      <input
        ref={fileInputRef}
        type="file"
        hidden
        multiple
        accept=".pdf,.docx,.txt,.md,.markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleFileSelection}
      />
    </div>
  );
}

function Header({ provider, knowledgeSummary, memoryTokens, onProviderChange, onOpenLibrary }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/60 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1760px] flex-col gap-3 px-3 py-3 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-slate-950">保知</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MetaPill icon={<Database className="h-3.5 w-3.5" />}>{knowledgeSummary.totalChunks}</MetaPill>
          <MetaPill icon={<BookOpen className="h-3.5 w-3.5" />}>{memoryTokens}</MetaPill>
          <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600 shadow-sm">
            <select
              value={provider}
              onChange={(event) => onProviderChange(event.target.value)}
              className="bg-transparent font-semibold text-slate-800 outline-none"
              aria-label="选择模型提供方"
            >
              {providerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={onOpenLibrary}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            <FolderOpen className="h-4 w-4" />
            资料库
          </button>
        </div>
      </div>
    </header>
  );
}

function PolicyVault({ selectedPolicyId, libraryDocs, onSelectPolicy, onOpenLibrary }) {
  return (
    <article className="rounded-[28px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">资料范围</p>
          <h3 className="mt-1 text-base font-semibold text-slate-950">当前回答检索哪些资料</h3>
        </div>
        <button
          type="button"
          onClick={onOpenLibrary}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
        >
          资料库
        </button>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-600">
        默认会综合全部已接入资料，也可以切换到单一保单，让回答范围更聚焦。
      </p>

      <div className="mt-4 grid gap-2">
        <PolicyButton
          label="综合全部资料"
          meta={`内置 ${builtInPolicies.length} 份 · 上传 ${libraryDocs.length} 份`}
          selected={selectedPolicyId === null}
          onClick={() => onSelectPolicy(null)}
        />
        {builtInPolicies.map((policy) => (
          <PolicyButton
            key={policy.id}
            label={policy.shortTitle}
            meta={`${policy.type} · 等待期 ${policy.waitingPeriod}`}
            selected={selectedPolicyId === policy.id}
            onClick={() => onSelectPolicy(policy.id)}
          />
        ))}
      </div>
    </article>
  );
}

function TrustPoint({ title, body }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}

function QuestionComposer({
  value,
  onChange,
  onSubmit,
  isLoading,
  askProgress,
  textareaRef,
  promptLinked,
  compact = false,
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
      className="grid gap-3"
    >
      <div className={`grid gap-3 ${compact ? "sm:grid-cols-[minmax(0,1fr)_auto]" : "md:grid-cols-[minmax(0,1fr)_auto] md:items-end"}`}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit(value);
            }
          }}
          rows={1}
          maxLength={320}
          placeholder="例如：等待期内查出病，还能申请理赔吗？"
          className={`rounded-[24px] border bg-white px-4 py-4 text-sm leading-7 text-slate-800 outline-none transition ${
            compact ? "min-h-[72px]" : "min-h-[96px] md:min-h-[88px]"
          } ${
            promptLinked
              ? "border-emerald-300 shadow-[0_0_0_4px_rgba(16,185,129,0.08)]"
              : "border-slate-200 focus:border-emerald-300 focus:shadow-[0_0_0_4px_rgba(16,185,129,0.08)]"
          }`}
        />
        <button
          type="submit"
          disabled={isLoading || !value.trim()}
          className={`inline-flex items-center justify-center gap-2 rounded-[22px] px-5 text-sm font-semibold transition ${
            compact ? "min-h-[72px]" : "min-h-[56px] md:min-h-[96px] md:px-6"
          } ${
            isLoading || !value.trim()
              ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
              : "border border-emerald-700 bg-emerald-600 text-white shadow-[0_16px_36px_rgba(5,150,105,0.22)] hover:bg-emerald-700"
          }`}
        >
          <Send className="h-4 w-4" />
          提问
        </button>
      </div>
      {isLoading && askProgress ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-900">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          <span className="font-semibold">{askProgress.label}</span>
          <span className="text-emerald-800/80">{askProgress.detail}</span>
        </div>
      ) : null}
    </form>
  );
}

function PromptSuggestions({ activePromptId, onSelectPrompt }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {starterPrompts.map((prompt) => {
        const linked = activePromptId === prompt.id;

        return (
          <button
            key={prompt.id}
            type="button"
            onClick={() => onSelectPrompt(prompt)}
            className={`rounded-2xl border px-4 py-3 text-left transition ${
              linked
                ? "border-emerald-300 bg-emerald-50/70 shadow-sm"
                : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50/45"
            }`}
          >
            <p className="text-sm font-semibold leading-6 text-slate-900">{prompt.label}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{prompt.hint}</p>
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({
  knowledgeSummary,
  onOpenLibrary,
  onSelectPrompt,
  activePromptId,
  inputValue,
  isLoading,
  askProgress,
  onInputChange,
  onAsk,
  textareaRef,
}) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 rounded-[30px] border border-emerald-100/70 bg-[linear-gradient(180deg,rgba(248,251,250,0.98),rgba(241,247,244,0.98))] p-5 md:p-6">
      <div className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700/75">保知条款问答</p>
        <h3 className="mt-2 text-[26px] font-semibold tracking-tight text-slate-950 md:text-[32px]">
          你想确认哪件保障问题？
        </h3>
        <p className="mt-3 text-sm leading-7 text-slate-600 md:text-[15px]">
          直接问等待期、宽限期、退保规则或给付方式。回答会先说明结论，再给你可以核对的原文依据。
        </p>
      </div>

      <QuestionComposer
        value={inputValue}
        onChange={onInputChange}
        onSubmit={onAsk}
        isLoading={isLoading}
        askProgress={askProgress}
        textareaRef={textareaRef}
        promptLinked={Boolean(activePromptId)}
      />

      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">常见提问</p>
            <p className="mt-1 text-xs text-slate-500">点一下即可带入问题，手机端会直接发起问答。</p>
          </div>
          <button
            type="button"
            onClick={onOpenLibrary}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
          >
            查看资料范围
          </button>
        </div>

        <PromptSuggestions activePromptId={activePromptId} onSelectPrompt={onSelectPrompt} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MetaPill>{knowledgeSummary.totalDocs} 份资料</MetaPill>
        <MetaPill>{knowledgeSummary.totalChunks} 段依据</MetaPill>
        <MetaPill>仅保留最近 {MEMORY_TURN_LIMIT} 轮上下文</MetaPill>
      </div>

      <div className="hidden gap-2 md:grid">
        {knowledgeSummary.entries.map((entry) => (
          <article key={entry.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{entry.title}</p>
                <p className="mt-1 text-xs text-slate-500">{entry.meta}</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                {entry.badge}
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ message }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-[22px] rounded-br-md bg-[linear-gradient(135deg,#183b38,#26354a)] px-4 py-3 text-sm leading-7 text-white shadow-[0_16px_36px_rgba(24,59,56,0.18)]">
        <p>{message.content}</p>
        <p className="mt-1 text-right text-[11px] text-white/55">{message.timestamp}</p>
      </div>
    </div>
  );
}

function AssistantBubble({ message, onInspectCitation, mobile = false }) {
  const verdictStyle = getVerdictStyle(message.verdict);

  return (
    <article className="rounded-[26px] border border-slate-200/90 bg-white p-4 shadow-[0_14px_36px_rgba(15,23,42,0.05)] md:p-5">
      <div className={`rounded-2xl border px-4 py-3 ${verdictStyle.container}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-80">{verdictStyle.label}</p>
        <h3 className="mt-2 text-base font-semibold tracking-tight">{message.verdictText}</h3>
        <p className="mt-2 text-sm leading-6 opacity-80">{verdictStyle.explanation}</p>
      </div>

      <div className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
        {String(message.answer || "")
          .split(/\n{2,}/u)
          .filter(Boolean)
          .map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
      </div>

      {message.citations.length ? (
        <ExpandableSection
          title="判断依据"
          summary={`${message.citations.length} 条原文依据可查看`}
          mobile={mobile}
          defaultOpen={false}
          className="mt-5"
        >
          <div className="grid gap-2">
            {message.citations.map((citation) => (
              <button
                key={citation.citationId}
                type="button"
                onClick={() => onInspectCitation(citation)}
                className="group rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50/45 hover:shadow-[0_10px_26px_rgba(16,185,129,0.08)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{citation.documentTitle}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {citation.sectionTitle} · {citation.page}
                    </p>
                  </div>
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </div>
                <p
                  className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600"
                  dangerouslySetInnerHTML={{
                    __html: highlightKeywords(citation.excerpt, citation.keywords),
                  }}
                />
                <div className="mt-3 flex items-center justify-between gap-3 text-xs font-semibold text-emerald-700">
                  <span>查看原文依据</span>
                  <div className="flex items-center gap-2">
                    {citation.previewImagePath ? <span className="rounded-full bg-emerald-50 px-2 py-1">PDF 预览</span> : null}
                    <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </ExpandableSection>
      ) : null}

      {message.guidance.length ? (
        <ExpandableSection
          title="下一步建议"
          summary={`${message.guidance.length} 条温和提醒`}
          mobile={mobile}
          defaultOpen={false}
          className="mt-4"
        >
          <ul className="grid gap-2">
            {message.guidance.map((item, index) => (
              <li key={index} className="flex gap-2 text-sm leading-6 text-slate-600">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </ExpandableSection>
      ) : null}

      <div className="mt-5 flex items-center justify-end border-t border-dashed border-slate-200 pt-4 text-[11px] text-slate-500">
        <span>{message.timestamp}</span>
      </div>
    </article>
  );
}

function LoadingBubble({ progress }) {
  const steps = getAskProgressSteps();
  const activeIndex = steps.findIndex((step) => step.id === progress?.phase);

  return (
    <article className="rounded-[26px] border border-slate-200/90 bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-50">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{progress?.label || "正在生成回答"}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {progress?.detail || "正在检索资料并整理可核对的原文依据。"}
          </p>
          {progress?.scope ? (
            <p className="mt-2 text-xs text-slate-500">{progress.scope}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {steps.map((step, index) => {
          const completed = activeIndex > index;
          const active = activeIndex === index;

          return (
            <div
              key={step.id}
              className={`rounded-2xl border px-3 py-2 text-xs transition ${
                active
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : completed
                    ? "border-slate-200 bg-slate-50 text-slate-700"
                    : "border-slate-200 bg-white text-slate-400"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    active ? "bg-emerald-500" : completed ? "bg-slate-500" : "bg-slate-300"
                  }`}
                />
                <span className="font-semibold">{step.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function CitationInspector({ citation, onClose, mobile = false, onCollapse }) {
  const [zoom, setZoom] = useState(1);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const dynamicPreview = useRenderedPdfPage(citation, PDF_PAGE_PREVIEW_SCALE);
  const lightboxPreview = useRenderedPdfPage(
    lightboxOpen && citation ? citation : null,
    PDF_PAGE_LIGHTBOX_SCALE,
  );

  useEffect(() => {
    setZoom(1);
  }, [citation?.citationId]);

  useEffect(() => {
    setLightboxOpen(false);
  }, [citation?.citationId]);

  if (!citation) {
    return null;
  }

  const canZoomOut = zoom > 0.8;
  const canZoomIn = zoom < 2.4;
  const hasDynamicPdf = Boolean(
    citation.pageNumber && (citation.documentPdfPath || citation.documentPdfBlob),
  );
  const hasPrivacyMask = hasPdfPrivacyMask(citation);
  const previewSrc =
    dynamicPreview.imageUrl || citation.previewImagePath || lightboxPreview.imageUrl || "";
  const previewAlt = citation.previewImageAlt || citation.sectionTitle;
  const lightboxSrc =
    lightboxPreview.imageUrl || dynamicPreview.imageUrl || citation.previewImagePath || "";

  return (
    <aside className={`h-full overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)] ${mobile ? "rounded-[24px]" : ""}`}>
      <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Citation</p>
          <h3 className="mt-1 text-base font-semibold text-slate-900">原文依据</h3>
        </div>
        <div className="flex items-center gap-2">
          {!mobile && onCollapse ? (
            <button
              type="button"
              onClick={onCollapse}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
              aria-label="收起引用侧栏"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
            aria-label="关闭引用预览"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="h-[calc(100%-73px)] overflow-y-auto px-5 py-5">
        <div className="rounded-3xl bg-slate-50/80 p-4">
          <p className="text-sm font-semibold text-slate-900">{citation.documentTitle}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <MetaPill>{citation.sectionLabel}</MetaPill>
            <MetaPill>{citation.page}</MetaPill>
            <MetaPill>{citation.kind === "seed" ? "内置资料" : "上传资料"}</MetaPill>
          </div>
          <p className="mt-4 text-lg font-semibold tracking-tight text-slate-950">{citation.sectionTitle}</p>
          {hasDynamicPdf || citation.previewImagePath ? (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">PDF 原文页</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {hasDynamicPdf ? "按命中的页码实时渲染原文页。" : "当前使用预设原文页作为参考预览。"}
                  </p>
                  {hasPrivacyMask ? (
                    <p className="mt-1 text-xs font-medium text-emerald-700">
                      已对保单姓名、证件号、保单号与条码区域做脱敏处理。
                    </p>
                  ) : null}
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  {citation.page}
                </span>
              </div>
              {dynamicPreview.status === "loading" ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="aspect-[0.72] w-full animate-pulse bg-slate-100" />
                  <div className="border-t border-slate-100 px-4 py-3 text-sm font-medium text-slate-500">
                    正在渲染命中的 PDF 页…
                  </div>
                </div>
              ) : previewSrc ? (
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="block w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:border-emerald-200 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
                  aria-label="打开 PDF 预览"
                >
                  <img
                    src={previewSrc}
                    alt={previewAlt}
                    className="block w-full"
                  />
                  <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
                    <span>{hasDynamicPdf ? "点击放大查看整页原文" : "点击查看原文预览"}</span>
                    <ArrowUpRight className="h-4 w-4 text-emerald-700" />
                  </div>
                </button>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm leading-6 text-slate-500">
                  当前资料暂时没有可展示的 PDF 原文页。
                </div>
              )}
              {dynamicPreview.status === "error" ? (
                <p className="mt-2 text-xs text-amber-700">
                  PDF 动态渲染失败，已回退到现有预览。
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="mt-5">
            <p className="text-sm font-semibold text-slate-900">命中摘录</p>
            <div
              className="mt-2 rounded-2xl border border-emerald-100 bg-white px-4 py-4 text-sm leading-7 text-slate-700"
              dangerouslySetInnerHTML={{
                __html: highlightKeywords(citation.excerpt, citation.keywords),
              }}
            />
          </div>
        </div>
      </div>

      {lightboxOpen ? (
        <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm" onClick={() => setLightboxOpen(false)}>
          <div className="absolute inset-4 flex flex-col rounded-[28px] bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoom((current) => Math.max(0.8, Number((current - 0.2).toFixed(1))))}
                  disabled={!canZoomOut}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${
                    canZoomOut ? "border-slate-200 text-slate-600 hover:border-slate-300" : "border-slate-100 text-slate-300"
                  }`}
                  aria-label="缩小 PDF"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="min-w-[56px] text-center text-sm font-semibold text-slate-700">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((current) => Math.min(2.4, Number((current + 0.2).toFixed(1))))}
                  disabled={!canZoomIn}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${
                    canZoomIn ? "border-slate-200 text-slate-600 hover:border-slate-300" : "border-slate-100 text-slate-300"
                  }`}
                  aria-label="放大 PDF"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
                aria-label="关闭 PDF 预览"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-50 p-4">
              <div className="mx-auto w-fit">
                {lightboxPreview.status === "loading" && !lightboxSrc ? (
                  <div className="aspect-[0.72] w-[720px] max-w-full animate-pulse rounded-2xl bg-white shadow-[0_24px_60px_rgba(15,23,42,0.12)]" />
                ) : lightboxSrc ? (
                  <img
                    src={lightboxSrc}
                    alt={previewAlt}
                    className="block max-w-none rounded-2xl bg-white shadow-[0_24px_60px_rgba(15,23,42,0.12)] transition-transform"
                    style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
                  />
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-sm text-slate-500">
                    暂无可放大的 PDF 原文页。
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function LibraryDrawer({ open, onClose, onTriggerUpload, builtInPolicies, libraryDocs, ingestionStatus }) {
  return (
    <div className={`fixed inset-0 z-50 transition ${open ? "pointer-events-auto" : "pointer-events-none"}`}>
      <div
        className={`absolute inset-0 bg-slate-950/35 transition ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-[460px] flex-col gap-5 overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl transition ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">资料库</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-950">资料库</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <section className="grid gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">内置资料</p>
            <span className="text-xs text-slate-500">{builtInPolicies.length} 份</span>
          </div>
          {builtInPolicies.map((policy) => (
            <article key={policy.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{policy.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {policy.type} · {policy.sections.length} 个条款片段
                  </p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  {policy.sourceType}
                </span>
              </div>
            </article>
          ))}
        </section>

        <section className="grid gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">上传资料</p>
            <button
              type="button"
              onClick={onTriggerUpload}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              <Upload className="h-4 w-4" />
              添加资料
            </button>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm leading-6 text-slate-600">
            {ingestionStatus}
          </div>
          {libraryDocs.length ? (
            libraryDocs
              .slice()
              .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
              .map((doc) => (
                <article key={doc.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">{doc.fileName}</p>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                      {doc.type}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{doc.chunkCount} 个资料片段</p>
                </article>
              ))
          ) : (
            <article className="rounded-2xl border border-dashed border-slate-200 px-4 py-4" />
          )}
        </section>
      </aside>
    </div>
  );
}

function PolicyButton({ label, meta, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
        selected
          ? "border-emerald-300 bg-emerald-50/70 shadow-sm"
          : "border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white"
      }`}
    >
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="mt-1 text-xs text-slate-500">{meta}</p>
      </div>
      <span className={`h-2.5 w-2.5 rounded-full ${selected ? "bg-emerald-600" : "bg-slate-300"}`} />
    </button>
  );
}

function ExpandableSection({ title, summary, mobile, defaultOpen = false, className = "", children }) {
  if (mobile) {
    return (
      <details open={defaultOpen} className={`group rounded-2xl border border-slate-200 bg-slate-50/80 ${className}`}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <div>
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className="mt-1 text-xs text-slate-500">{summary}</p>
          </div>
          <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-slate-200 px-4 py-4">{children}</div>
      </details>
    );
  }

  return (
    <section className={`rounded-2xl border border-slate-200 bg-slate-50/80 p-4 ${className}`}>
      <div className="mb-3">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-xs text-slate-500">{summary}</p>
      </div>
      {children}
    </section>
  );
}

function MetaPill({ children, icon }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
      {icon}
      {children}
    </span>
  );
}

function useRenderedPdfPage(citation, renderScale) {
  const [state, setState] = useState({
    status: "idle",
    imageUrl: "",
  });

  useEffect(() => {
    let active = true;
    let objectUrl = "";

    async function renderPdfPage() {
      const pageNumber = Number(citation?.pageNumber || 0);
      const hasBlob = citation?.documentPdfBlob instanceof Blob;
      const source = hasBlob ? citation.documentPdfBlob : citation?.documentPdfPath || "";

      if (!pageNumber || !source) {
        setState({ status: "idle", imageUrl: "" });
        return;
      }

      setState({ status: "loading", imageUrl: "" });

      try {
        const pdfjs = await loadClientPdfModule();
        const pdfSource = hasBlob ? (objectUrl = URL.createObjectURL(source)) : source;
        const loadingTask = pdfjs.getDocument(pdfSource);
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: renderScale });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        await page.render({ canvasContext: context, viewport }).promise;
        applyPdfPrivacyMasks(context, canvas, citation, pageNumber);

        if (active) {
          setState({
            status: "ready",
            imageUrl: canvas.toDataURL("image/png"),
          });
        }

        await loadingTask.destroy();
      } catch (_error) {
        if (active) {
          setState({ status: "error", imageUrl: "" });
        }
      } finally {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      }
    }

    renderPdfPage();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [
    citation?.citationId,
    citation?.documentPdfBlob,
    citation?.documentPdfPath,
    citation?.pageNumber,
    renderScale,
  ]);

  return state;
}

function hasPdfPrivacyMask(citation) {
  return Boolean(citation?.documentId && PDF_PRIVACY_MASKS[citation.documentId]);
}

function applyPdfPrivacyMasks(context, canvas, citation, pageNumber) {
  if (!context || !canvas || !hasPdfPrivacyMask(citation)) {
    return;
  }

  const rules = PDF_PRIVACY_MASKS[citation.documentId];
  const masks = [...(rules.allPages || []), ...((rules.pages && rules.pages[pageNumber]) || [])];

  if (!masks.length) {
    return;
  }

  context.save();
  masks.forEach((mask) => {
    const x = Math.round(canvas.width * mask.x);
    const y = Math.round(canvas.height * mask.y);
    const width = Math.round(canvas.width * mask.width);
    const height = Math.round(canvas.height * mask.height);

    context.fillStyle = "rgba(255,255,255,0.98)";
    context.fillRect(x, y, width, height);
    context.strokeStyle = "rgba(226,232,240,0.95)";
    context.lineWidth = 1;
    context.strokeRect(x, y, width, height);
  });
  context.restore();
}

function getVerdictStyle(verdict) {
  if (verdict === "supported") {
    return {
      label: "资料支持",
      container: "border-emerald-200 bg-emerald-50/70 text-emerald-950",
      explanation: "这条回答有明确条款依据，你可以继续查看对应原文来核对细节。",
    };
  }

  if (verdict === "conditional") {
    return {
      label: "需结合条件判断",
      container: "border-amber-200 bg-amber-50/80 text-amber-950",
      explanation: "这个问题还需要结合日期、事故原因或保单状态，不能只看单一句子判断。",
    };
  }

  return {
    label: "资料不足或需补充",
    container: "border-slate-200 bg-slate-50 text-slate-900",
    explanation: "当前资料不足，不能直接下结论，建议补充条款或关键事实后再判断。",
  };
}

function getAskProgressSteps() {
  return [
    { id: "memory", label: "核对最近对话" },
    { id: "retrieve", label: "检索知识库资料" },
    { id: "citations", label: "整理命中依据" },
    { id: "model", label: "生成最终回答" },
  ];
}

function buildAskProgress(phase, { detail = "", scope = "" } = {}) {
  const matched = getAskProgressSteps().find((step) => step.id === phase);

  return {
    phase,
    label: matched?.label || "正在处理",
    detail,
    scope,
  };
}

async function showAskProgress(setAskProgress, progress, pause = 90) {
  setAskProgress(progress);
  await wait(pause);
}

function wait(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

function highlightKeywords(text, keywords = []) {
  const escaped = escapeHtml(String(text || ""));
  const usefulKeywords = [...new Set(keywords)]
    .filter((keyword) => keyword && keyword.length >= 2)
    .sort((left, right) => right.length - left.length)
    .slice(0, 8);

  if (!usefulKeywords.length) {
    return escaped;
  }

  const pattern = new RegExp(`(${usefulKeywords.map(escapeRegExp).join("|")})`, "giu");
  return escaped.replace(pattern, "<mark>$1</mark>");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function loadClientPdfModule() {
  if (!clientPdfModulePromise) {
    clientPdfModulePromise = import(
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.min.mjs"
    ).then((module) => {
      module.GlobalWorkerOptions.workerSrc =
        "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.worker.min.mjs";
      return module;
    });
  }

  return clientPdfModulePromise;
}

function autoResizeTextarea(element) {
  if (!element) {
    return;
  }
  element.style.height = "auto";
  element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
}

function formatTime(date) {
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
