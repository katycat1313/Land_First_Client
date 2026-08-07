# Opportunity Engine (P.A.C.)

A real-time opportunity discovery engine and AI partner designed to find genuine business problems, analyze operational bottlenecks, and connect with micro-business owners who need practical software, automation, and digital solutions.

---

## What This App Does

Instead of browsing endless job boards or sending cold spam, the Opportunity Engine monitors public discussions across Reddit, Quora, trade forums, and community channels to surface businesses experiencing actual operational pain.

- **Problem-First Discovery**: Scrapes and analyzes raw community discussions for real pain points—manual data cleanup, missed phone calls, double-entry headaches, or scheduling chaos.
- **Intent & Qualification Scoring**: Evaluates posts based on commercial urgency, author decision-making authority, and solution fit.
- **P.A.C. Co-Founder & Voice Partner**: Integrated AI co-founder (powered by Deepgram real-time voice and Gemini AI) that reviews leads with you, drafts value-first replies, and helps manage outreach.
- **1-Click Thought Leadership**: Proactively drafts helpful, practical posts for LinkedIn, Reddit, and forums that showcase real-world solutions to common business bottlenecks without spamming or pitch slaps.
- **CRM & Pipeline Tracker**: Keeps track of saved leads, outreach status, custom notes, and payment deposits in one clean view.

---

## Core Philosophy

1. **Problems First, Solutions Second**: We look for real people with actual business headaches, not technical jargon or hype.
2. **Value First, Sales Later**: We build trust by giving helpful advice, diagnostic insights, or quick templates upfront before discussing paid work or deposits.
3. **Targeting Decision Makers**: Focused on nimble micro-businesses (home services, real estate, boutique agencies, trade contractors) where the owner is the decision-maker who can act quickly.
4. **Authentic Data Only**: No fake numbers, mock threads, or simulated upvotes. Everything in the feed comes straight from live web sources.

---

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons, Motion
- **Backend**: Node.js & Express server (`server.ts`)
- **AI & Voice Engine**:
  - Google Gemini API (`@google/genai`) for intent analysis, scoring, and response generation
  - Deepgram WebSocket Voice Agent API for real-time co-founder voice interaction
- **Persistence & Config**: File-backed storage in `data/`, environment variables via `.env`

---

## Environment Variables Setup

Create a `.env` file in the root directory (based on `.env.example`):

```env
# Optional App Password Protection (leave empty for public access)
APP_PASSWORD=

# Google Gemini API Key
GEMINI_API_KEY=your_gemini_api_key_here

# Deepgram Voice Credentials (for P.A.C. voice co-founder)
DEEPGRAM_API_KEY=your_deepgram_api_key_here
DEEPGRAM_PROJECT_ID=your_deepgram_project_id_here
DEEPGRAM_AGENT_ID=your_deepgram_agent_id_here
```

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Development Server
```bash
npm run dev
```
The app will start on `http://localhost:3000`.

### 3. Build for Production
```bash
npm run build
npm start
```

---

## License

MIT License. Built for real business discovery and value-first outreach.
