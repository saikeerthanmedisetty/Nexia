# Nexia — Autonomous AI Executive Assistant

> **Field Project Submission**  
> An enterprise-grade, multi-agent orchestration ecosystem built with **Next.js 16 (React 19)**, **Google Gemini**, and **n8n event-driven workflows**, featuring strict **Human-in-the-Loop (HITL)** safeguards and zero-conflict calendar intelligence.

---

## 🌟 Executive Overview

**Nexia** is a tech-forward autonomous AI executive assistant designed to eliminate the fragility of traditional conversational chatbots. Rather than acting as a simple text generator, Nexia executes deterministic, audited, and synchronized multi-step workflows across productivity, scheduling, and mobility domains.

Built with a **Zero-Assumption Contract**, Nexia's frontend client never interacts directly with vulnerable third-party APIs. All interactions are routed through a resilient coordinator that synthesizes structured **Block-Based JSON UI schemas**, rendering interactive approval cards before executing critical mutations.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          NEXIA ARCHITECTURE                            │
└────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────┐        ┌────────────────────────────┐
    │     Next.js 16 React Client      │        │    User Preference Store   │
    │  (Framer Motion / Tailwind CSS)  │        │  (Temporal Bounds & State) │
    └─────────────────┬────────────────┘        └──────────────┬─────────────┘
                      │ HTTPS POST                             │
                      ▼                                        │ Dynamic Context
    ┌──────────────────────────────────────────────────────────┴─────────────┐
    │                 Next.js Central Orchestrator & Coordinator             │
    │  • Intent Extraction (Gemini)    • Defensive Schema Validation         │
    │  • Multi-Agent Routing           • Failover Error Interceptor          │
    └─────────────────┬──────────────────────────────────────────────────────┘
                      │
                      │ Authenticated HTTP Webhooks
                      ▼
    ┌────────────────────────────────────────────────────────────────────────┐
    │                   n8n Event-Driven Orchestration Mesh                  │
    │                                                                        │
    │  [📅 Calendar Agent]     [✉️ Gmail Agent]       [🚗 Mobility / Uber]   │
    │   • Zero-Conflict Guard   • HITL Email Drafting  • Live Deep-Linking   │
    │   • Temporal Resolution   • Smart Summarization  • Real-Time Fares     │
    │   • FreeBusy Slot Scanner                                              │
    └────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Core Capabilities & Agents

### 1. 📅 Calendar Agent & Temporal Engine
- **Live Google Calendar Sync**: Real-time bidirectional synchronization with authoritative Google Calendar endpoints (eliminates ghost/zombie events).
- **Conflict & Buffer Calculator**: Scans day events to guarantee zero double-booking; flags overlaps with HTTP 409 conflict notifications.
- **Natural Language Temporal Resolution**: Accurately resolves relative dates (*"tomorrow afternoon"*, *"next Monday at 10 AM"*) with strict timezone offset preservation (`Asia/Kolkata` / IANA).
- **Parameter Disentanglement**: Decouples meeting summaries from agendas, descriptions, attendees, and locations.
- **Freebusy Slot Scanner**: Automatically probes Google Calendar FreeBusy APIs to find the next available meeting window matching user duration.
- **Recurring EXDATE Patcher**: Gracefully removes single occurrences of recurring meeting series without altering parent recurrence rules.

### 2. ✉️ Gmail & Communications Agent
- **Human-in-the-Loop (HITL) Drafting**: Generates contextually grounded email drafts and presents interactive approval staging cards before dispatching.
- **Smart Inbox Triage**: Categorizes priority emails, action items, and follow-ups.

### 3. 🚗 Mobility & Ride Coordinator
- **Uber Deep-Link & Fare Estimator**: Formulates dynamic pickup/dropoff coordinates, provides tier-based ride options, and opens pre-filled Uber ride requests directly.

### 4. 🛡️ Human-in-the-Loop (HITL) Safety Guard
- High-stakes operations (deleting meetings, updating schedules, sending communications) generate structured **Staging Cards**.
- The user retains 100% executive control to **Confirm**, **Edit**, or **Abort** actions prior to execution.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | [Next.js 16](https://nextjs.org/) (App Router, Server Actions) |
| **UI & Styling** | React 19, [Tailwind CSS v4](https://tailwindcss.com/), [Framer Motion](https://www.framer.com/motion/) |
| **Icons & Design** | [Lucide React](https://lucide.dev/), Sonner Toast Notifications |
| **AI & NLP Intelligence** | Google Gemini (`@google/generative-ai`), OpenAI GPT-4o Router |
| **Workflow Automation** | [n8n](https://n8n.io/) Self-Hosted Event Mesh |
| **Integrations** | Google Calendar API, Google OAuth2, Gmail API |
| **Type Safety** | TypeScript 5 (Strict Mode) |

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v20.x or higher
- **npm**: v10.x or higher

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/saikeerthanmedisetty/omni-agent.git
cd omni-agent

# Install dependencies
npm install
```

### 3. Environment Variables
Create a `.env.local` file in the root directory:
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
N8N_CALENDAR_WEBHOOK_URL=https://workflow.ccbp.in/webhook/...
```

### 4. Running the Application
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to access the Nexia interface and executive dashboard.

---

## 📁 Project Structure

```
omni-agent/
├── src/
│   ├── app/
│   │   ├── api/            # Next.js API route handlers (chat, calendar, agents, auth)
│   │   ├── dashboard/      # Executive calendar, tasks, and analytics dashboard
│   │   ├── chat/           # Conversational agent interface
│   │   └── page.tsx        # Landing and portal entrypoint
│   ├── components/
│   │   ├── chat/           # HITLCard, MessageItem, ChatInterface
│   │   ├── ui/             # Radix / Tailwind modular design components
│   │   └── dashboard/      # Calendar timeline, stats, widget cards
│   ├── lib/
│   │   ├── gemini.ts       # Gemini orchestration, intent parsing & staging
│   │   ├── google/         # Google Calendar OAuth & API client
│   │   ├── calendar.ts     # Deduplication, caching, and store synchronization
│   │   └── utils.ts        # Temporal parsers, date helpers, cn utility
│   └── contexts/           # Global auth and session state providers
├── public/                 # Static assets, branding, and case study documentation
└── NEXIA_CASE_STUDY.md     # In-depth architectural whitepaper
```

---

## 👥 Authors & Team
- **Project**: Nexia Omni-Agent (Field Project)
- **Institution**: SGU
- **Lead Developer**: Sai Keerthan Medisetty (`saikeerthanmedisetty686@gmail.com`)
