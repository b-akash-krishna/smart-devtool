# 🚀 Smart DevTool for API Integration

> **Claysys AI Hackathon Submission**  
> Convert any API documentation URL into a production-ready SDK in seconds.

---

## 📌 Problem Statement

Developers waste hours reading inconsistent API documentation, manually writing boilerplate wrapper code, and debugging type mismatches. Existing tools like Postman or Swagger Codegen require a pre-existing OpenAPI spec — but most real-world documentation is just raw HTML or Markdown.

**Smart DevTool solves this end-to-end:**  
Paste a docs URL → Get a working, typed SDK you can `import` immediately.

---

## ✨ Features

- 🔍 **Intelligent Scraping** — Playwright-powered headless browser handles JS-rendered docs
- 🧠 **Dual-Mode Parser** — Direct OpenAPI detection + Gemini LLM fallback for unstructured docs
- 🏗️ **SDK Generation** — Type-safe Python and TypeScript clients via Jinja2 templates
- 📦 **One-Click Download** — ZIP package with client, requirements, and README
- 🔐 **Auth Detection** — Automatically identifies Bearer, API Key, and OAuth2 schemes
- ⚡ **Real-Time UI** — Live status updates as your docs are processed

---

## 🏗️ Architecture
```
                        User (URL) → Next.js Frontend
                                    ↓
                            FastAPI Backend
                                    ↓
            ┌───────────────────────────────────────────────┐
            │                 Task Pipeline                 │
            │       Scraper (Playwright) → PostgreSQL       │
            │    Parser (OpenAPI/LLM)  → Endpoints Table    │
            │    Code Generator (Jinja2) → ZIP Download     │
            └───────────────────────────────────────────────┘
```

**Stack:**
| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | Python, FastAPI, SQLAlchemy (async) |
| Scraper | Playwright, BeautifulSoup4, Markdownify |
| AI/LLM | Google Gemini 2.0 Flash via LangChain |
| Database | PostgreSQL 15 |
| Cache/Queue | Redis 7 |
| DevOps | Docker, Docker Compose |

---

## 🚀 Quick Start (Local)

### Prerequisites
- Docker Desktop
- Node.js 18+
- Git

### 1. Clone the repository
```bash
git clone https://github.com/b-akash-krishna/smart-devtool.git
cd smart-devtool
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
```

### 3. Start the full stack
```bash
docker-compose up --build
```

### 4. Start the frontend
```bash
cd frontend
npm install
npm run dev
```

### 5. Open the app
- **UI:** http://localhost:3000
- **API Docs:** http://localhost:8000/docs

---

## 🎯 How to Use

1. Enter a project name and paste any API documentation URL
2. Click **Generate SDK**
3. Watch real-time status: Scraping → Parsing → Completed
4. Review the discovered endpoints
5. Select Python or TypeScript
6. Click **Download SDK** — get a working client immediately

### Example URLs to try
- `https://catfact.ninja/docs` — Cat Facts API (OpenAPI spec)
- `https://jsonplaceholder.typicode.com` — JSONPlaceholder REST API
- Any public API with HTML or OpenAPI documentation

---

## 📁 Project Structure
```
smart-devtool/
├── backend/                  # FastAPI Python backend
│   ├── app/
│   │   ├── api/v1/           # Route handlers
│   │   ├── core/             # Config, database
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── schemas/          # Pydantic DTOs
│   │   ├── services/         # scraper, llm_parser, codegen
│   │   └── templates/        # Jinja2 SDK templates
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                 # Next.js frontend
│   ├── app/                  # App router pages
│   ├── components/           # UI components
│   └── lib/                  # API client, types
├── docker-compose.yml
└── .env.example
```

---

## 🧠 Technical Approach

### Dual-Mode Parser
The parser uses a smart detection strategy:
1. **Fast Path** — If the scraped content contains a valid OpenAPI/Swagger JSON spec, it's parsed directly without any LLM call. This handles the majority of modern API docs instantly.
2. **LLM Fallback** — For unstructured HTML/Markdown documentation, the content is chunked and sent to Gemini 2.0 Flash with a structured extraction prompt. Results are merged and deduplicated.

### Iterative Development
This project was built following strict iterative practices:
- Feature branches for every component (`feat/scraper-service`, `feat/code-generator`, `feat/frontend`)
- Commits every 2-3 hours representing working, testable increments
- Docker health checks ensuring proper service startup ordering

---

## 🔮 Future Scope

- **IDE Extension** — Right-click any URL in VS Code → Generate Client
- **Change Detection** — Weekly cron to alert when API endpoints change
- **More Languages** — Go, Rust, Java SDK generation
- **Test Generation** — Auto-generate integration tests for each endpoint
- **OpenAPI Export** — Export discovered schema as OpenAPI 3.0 YAML

---

## 👨‍💻 Author

Built for the **Claysys AI Hackathon 2026**