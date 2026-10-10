# Nexia Omni-Agent — Executive System Memory & Knowledge Continuity

## 1. Executive User Profile & Identity
- **User Name:** Sai Keerthan (Always addressed and displayed as **Sai Keerthan**, never raw email prefixes with numbers like `saikeerthanmedisetty686`).
- **User Email:** `saikeerthanmedisetty686@gmail.com`
- **YouTube Channel:** `@SaikeerthanMedisetty`
- **Role:** Chief Executive / Technical Lead

---

## 2. Core Architectural Principles
- **Framework:** Next.js 16.3.4 (App Router, webpack mode), React 19, Tailwind CSS v4, Framer Motion.
- **Node Environment:** Node v20.20.2.
- **AI Engine:** Google Gemini 2.5 Flash via `@google/genai` with automatic model fallback cascade.
- **Backend Integrations:**
  - **n8n Webhook Automations:** YouTube, Gmail, Google Calendar, Google Sheets, Uber.
  - **MongoDB Atlas:** Expenses ledger, calendar events, persistent agent tasks, authentication.
  - **Cloudinary:** Document and receipt OCR photo storage.

---

## 3. Persistent Decisions & Verified Capabilities
1. **Zero Synthetic Seed Data (Strict Real-Data Integrity):**
   - No mock/seed calendar events (`evt-seed-*`), no dummy pending approvals (`task-seed-*`), and no fake expenses (AWS/Swiggy/GCP/₹3,810).
   - Dashboard strictly reflects real user entries and authentic agent actions.
   - When workflows are unpublished, offline, or inactive, dashboard displays honest, calm empty states (0 meetings, 0 approvals, ₹0 spend, 0 tasks).
   - Real data populates cleanly when user logs items manually or when live agent integrations execute.
2. **Midway Stop Generation Controls:**
   - Both in-chat `TypingIndicator` and `ChatInput` render a dedicated filled Stop button (`■`).
   - Pressing <kbd>Esc</kbd> halts in-flight generation midway.
   - Wired via `AbortController` in [`page.tsx`](file:///Users/saikeerthan/.gemini/antigravity/scratch/omni-agent/src/app/chat/page.tsx) on `/api/chat` requests.
3. **Natural Language "Retry" / "Continue" Workflow Resumption:**
   - If a workflow was offline/paused, user does not need to retype their prompt.
   - Simply saying `retry`, `continue`, `try again`, `resume`, or `try now` pulls the previous substantive user request and executes it immediately.
4. **Conversational Partner Persona (ChatGPT / Gemini / Antigravity feel):**
   - Zero robotic error templates (`⚠️ Service Processing Notice`).
   - Warm, emotionally intelligent, clear, and executive-tier guidance addressing Sai Keerthan.
5. **Cross-Session Memory & Context Continuity:**
   - Handled via `crossSessionMemory` synthesizer in [`page.tsx`](file:///Users/saikeerthan/.gemini/antigravity/scratch/omni-agent/src/app/chat/page.tsx) pulling from `sessions` stored in `localStorage`.
   - Passed to `classifyIntent` and `chat` in [`gemini.ts`](file:///Users/saikeerthan/.gemini/antigravity/scratch/omni-agent/src/lib/gemini.ts) so all new chat sessions recall past tasks and decisions.
6. **YouTube Packaging Guardrails:**
   - Titles are strictly clamped under 100 characters (`clampTitle100`).
   - Autonomously generates exactly 5 high-CTR titles tailored to the video topic.
   - Generates 16:9 cinematic thumbnail visual prompt for Flux/SDXL.
