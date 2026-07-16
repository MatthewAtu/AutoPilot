# AutoPilot

AutoPilot is an AI-assisted email productivity tool built on Microsoft Graph. It watches an Outlook mailbox, summarizes and categorizes incoming mail, extracts actionable tasks, triages messages with AI-drafted replies/forwards, and surfaces everything through a web dashboard.
Live demo: https://drive.google.com/file/d/164M92843XPsLdxuOYENLsTSIxG-i8ABX/view?usp=sharing

## Architecture

The project has two parts:

- **`AutoPilot/`** — ASP.NET Core (.NET 10) Web API backend. Talks to Microsoft Graph for mail/calendar, runs a background worker for categorization and health monitoring, and calls an LLM provider (Groq or a local Ollama instance) for summarization, classification, and drafting.
- **`autopilot-ui/`** — React + Vite frontend (dashboard UI: inbox/outlook panel, task list, calendar, workflow monitor, chatbot).

## Features

- **Inbox summarization** — pulls recent emails and produces a daily summary/task list.
- **Task extraction** — from emails or from meeting transcripts/audio (via Groq Whisper transcription).
- **Auto-categorization** — classifies emails from a "To Categorize" folder into workflow folders (Finance, Requests, IT Support, Approvals, General Inquiry, plus custom folders) and moves them via Graph.
- **Health monitor** — tracks emails per category, flags overdue/warning items based on extracted deadlines, and keeps a historical snapshot for trend charts.
- **Triage & auto-draft** — analyzes inbox/category emails, decides whether a reply, forward, or task is needed, and creates an editable Outlook draft for the user to approve or reject.
- **Chatbot** — ask questions about recent emails or a specific date's inbox.
- **Calendar view** — today's calendar events via Graph.

## Prerequisites

- .NET 10 SDK
- Node.js (for the UI)
- A Microsoft Graph access token with `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`, and `Calendars.Read` scopes
- An LLM provider: [Groq](https://console.groq.com/) API key, or a local [Ollama](https://ollama.com/) instance running `llama3`

## Configuration

Backend configuration lives in `AutoPilot/appsettings.json` (and `AutoPilot/appsettings.Development.json` for local overrides, which is gitignored):

```json
{
  "Graph": {
    "AccessToken": "<your Microsoft Graph access token>"
  },
  "Groq": {
    "ApiKey": "<your Groq API key>"
  },
  "AI": {
    "Provider": "groq"
  }
}
```

Set `AI:Provider` to `ollama` to use a local model instead (expects Ollama running on `http://localhost:11434`).

> **Do not commit real tokens or API keys.** Use `appsettings.Development.json` (already gitignored) or environment variables/user-secrets for local credentials, and keep `appsettings.json` limited to non-sensitive defaults.

## Running locally

**Backend:**

```bash
cd AutoPilot
dotnet run
```

**Frontend:**

```bash
cd autopilot-ui
npm install
npm run dev
```

The UI expects the API at the origin configured in `Program.cs` CORS policy (`http://localhost:5173` by default) and calls the backend's `api/*` endpoints (emails, tasks, calendar, chat, workflow, health-monitor, triage).

## Project layout

```
AutoPilot/            .NET Web API backend
  Controllers/         HTTP endpoints (TeamsController)
  Service/              SummaryService (Graph + LLM orchestration), stores for health/task/draft state
  DTOs/                  Request/response and Graph payload models
  Bot/                   Teams bot integration
  Interfaces/            Service interfaces
  Data/                  Local JSON stores (gitignored)
autopilot-ui/          React + Vite frontend
  src/components/        Dashboard panels (Outlook, Tasks, Calendar, Chatbot, Workflow Monitor)
```
