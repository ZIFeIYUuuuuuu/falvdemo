# AGENTS.md

## Role
You are building an interview-grade insurance knowledge-base conversation product.
The primary goal is not enterprise completeness, but a polished, credible, user-facing demo that feels professional, modern, and trustworthy.

## Product Goal
Create a consumer-friendly insurance knowledge base and Q&A system for an insurance office interview demo.

The product should:
- feel clear and premium to non-technical interviewers
- emphasize frontend quality, information hierarchy, and interaction design
- demonstrate practical AI product thinking
- show controlled multi-turn conversation behavior
- present compliant, citation-based guidance rather than aggressive sales language

## Primary Success Criteria
1. The UI looks intentionally designed, not template-like.
2. The product feels trustworthy, clear, and easy for C-end users.
3. The Q&A experience is smooth and understandable.
4. Answers show evidence/citations from insurance documents.
5. The system uses short-term memory only and controls token usage.
6. Recommendation language is compliant, gentle, and non-misleading.

## UX Direction
Design for a consumer-facing insurance assistant.

### Visual style
- Professional, warm, modern
- Creative but not playful or childish
- Avoid overly corporate dullness and avoid flashy fintech gimmicks
- Creativity should come from color palette, typography, layout rhythm, transitions, and interaction details
- The overall tone should communicate trust, calmness, and clarity

### Frontend priorities
- Frontend quality is a top priority
- The app should impress a non-technical interviewer within the first screen
- Focus on strong visual hierarchy, elegant empty states, polished chat interactions, and subtle animation
- Prioritize mobile and desktop responsiveness

### Suggested emotional tone
- reassuring
- clear
- guided
- credible
- approachable

## Core Features
Build a demo-quality product with these core features:

1. Insurance knowledge Q&A interface
- Chat-based interaction
- User asks insurance-related questions
- Assistant answers using provided insurance materials
- Each answer should support evidence display

2. Source citation display
- Show the referenced source document, section title, or paragraph excerpt
- Make citation blocks visually clear and trustworthy

3. Short-memory conversation
- Keep only the most recent 3 to 6 turns in context
- Do not send full conversation history indefinitely
- If needed, simulate or implement a simple rolling window memory strategy

4. Compliant guidance panel
- After answering, the UI may show a gentle next-step guidance area
- Use compliant language such as:
  - learn more about relevant protection
  - review whether current coverage is sufficient
  - consult a licensed advisor
- Do not use manipulative or exaggerated sales phrasing

5. Document-driven knowledge base feeling
- The product should feel grounded in actual insurance material
- If full backend RAG is too heavy for the interview version, a realistic mock or lightweight implementation is acceptable, but the UX must feel authentic

## Conversation Design Rules
When generating answers:
- answer the user question first
- then show citation/evidence
- then optionally show a compliant next-step suggestion
- never overpromise benefits
- never fabricate policy conclusions without evidence
- when uncertain, say the answer depends on policy wording and suggest checking the source or consulting a licensed advisor

## Memory Strategy
This project must use short memory.

Requirements:
- retain only the recent 3 to 6 turns
- avoid passing full history on every request
- implement a rolling context window
- design the code so memory policy is explicit and easy to explain in an interview

## Compliance Tone
Avoid:
- hard-selling language
- “must buy now”
- exaggerated gain framing
- misleading suitability claims

Prefer:
- neutral explanation
- risk reminder
- coverage gap awareness
- source-based guidance
- suggestion to consult a licensed advisor

## Technical Direction
Default to a frontend-first implementation.

Recommended approach:
- build a visually polished web app
- prioritize frontend architecture, component quality, and realistic interaction
- use mock data or lightweight backend if necessary for speed
- structure the code so it can later evolve into a true RAG system

## Interview Framing
This is an interview project, so optimize for:
- visual polish
- product thinking
- explainable technical decisions
- believable AI interaction design
- clear token/memory control strategy

## Non-Goals
- Do not over-engineer enterprise infrastructure
- Do not build a heavy admin system unless clearly necessary
- Do not let backend complexity reduce frontend quality
- Do not make the interface look like a generic chatbot clone

## Implementation Behavior
Before coding:
1. inspect the repository
2. infer the existing stack and patterns
3. preserve what already works
4. implement the smallest credible architecture that produces a polished demo

## Verification
Before finishing:
- run the project
- verify the main interface on desktop and mobile widths
- ensure the chat flow works
- ensure the short-memory behavior is reflected in code
- ensure citation blocks and guidance UI appear coherent
- ensure the design looks polished and intentional