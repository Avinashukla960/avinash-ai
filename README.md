# avinash.ai — Personal AI Assistant

A full-stack personal AI assistant where every user signs up with a personal profile (name, age, goals, health notes, activity level, diet preferences, and free-form notes), then chats with an AI that **already knows all of that** — like a doctor or trainer who's read your chart before you walked in.

**🔗 Live Demo:** [avinash-ai.onrender.com](https://avinash-ai.onrender.com)


---

## 🛠 Tech Stack

- **Backend:** Node.js + Express
- **Database:** SQLite (via `better-sqlite3`)
- **Auth:** `express-session` + `bcrypt` password hashing
- **LLM:** Cohere (`command-r-08-2024`) via official SDK
- **Frontend:** Vanilla HTML, CSS, JavaScript — no framework, modern dark UI
- **Deployment:** Render (free tier)

---

## 🎯 What This Project Taught Me

Built with AI-assisted development. I owned the architecture, debugged real production issues (auth flows, DB transactions, LLM provider switching from Gemini → OpenAI → Anthropic → Cohere), and shipped end-to-end.

**Real problems I solved:**
- Session management across requests
- SQLite transaction handling for atomic chat message saves
- LLM provider migration when APIs changed pricing/quotas
- `better-sqlite3` compilation issues on Render (fixed by pinning Node 22.x)
- Environment-based config for local dev vs. production

---

## 🚀 Quick Start (Local Development)

**Prerequisites:** Node.js 22.x or newer (`node -v` to check)

```bash
# 1. Clone the repo
git clone https://github.com/Avinashukla960/avinash-ai.git
cd avinash-ai

# 2. Install dependencies
npm install

# 3. Copy env template and add your keys
cp .env.example .env
# Open .env and paste your COHERE_API_KEY

# 4. Run the server
npm start
```

Open **http://localhost:3000** — you'll land on the login page. Click "Sign up" to create an account.

The SQLite database (`data.db`) is created automatically on first run.

---

## 🔑 Getting a Cohere API Key (Free)

1. Go to **[dashboard.cohere.com/api-keys](https://dashboard.cohere.com/api-keys)**
2. Sign up for a free account
3. Click **"Create Trial Key"** (free tier includes generous quota)
4. Copy the key into your `.env` file:

```env
COHERE_API_KEY=your-key-here
SESSION_SECRET=any-long-random-string
PORT=3000
```

---

## 🏗 How It's Wired Together

```
Browser  ──HTTP──▶  Express server (server.js)
                       │
                       ├── static files in public/   ← HTML, CSS, JS
                       │
                       ├── /api/auth/*    (routes/auth.js)
                       │     • POST /signup   create account + profile
                       │     • POST /login    verify password, start session
                       │     • POST /logout   destroy session
                       │     • GET  /me       who's logged in
                       │
                       ├── /api/profile/* (routes/profile.js)
                       │     • GET  /         read profile
                       │     • PUT  /         update profile
                       │
                       └── /api/chat/*    (routes/chat.js)
                             • POST /          send a message, get a reply
                             • GET  /history   load past messages

SQLite (data.db)
   ├── users     (id, email, password_hash, created_at)
   ├── profiles  (user_id, profile_json, updated_at)
   └── messages  (id, user_id, role, content, created_at)
```

---

## 💬 What Happens on Every Chat Message

1. `requireAuth` middleware checks the session cookie
2. User's profile is loaded from the `profiles` table
3. Last 10 messages loaded from the `messages` table
4. A **system prompt (preamble)** is built that injects the profile as known context — Cohere is told: *"You already know the following about the user, do not ask them to repeat any of it"* — plus safety instructions to recommend real medical care for anything serious
5. Message + history + preamble sent to Cohere API
6. Response streamed back
7. Both user message and AI reply saved atomically to `messages` table

---

## 📁 Project Structure

```
.
├── server.js              ← Express entry point
├── db.js                  ← SQLite setup + schema
├── middleware/auth.js     ← "is logged in?" check
├── routes/
│   ├── auth.js            ← signup / login / logout
│   ├── chat.js            ← AI chat endpoint
│   └── profile.js         ← get / update profile
├── public/
│   ├── signup.html        ← signup form (account + profile)
│   ├── login.html         ← login form
│   ├── chat.html          ← chat UI with sidebar history
│   ├── profile.html       ← view/edit profile
│   └── styles.css         ← all styles
├── .env.example           ← template for your .env
├── .gitignore
├── package.json
└── README.md
```

---

## 🔄 Switching Models

In `routes/chat.js`, change the `MODEL` constant near the top:

```js
const MODEL = 'command-r-08-2024';   // ← change this
```

**Available Cohere models:**
- `command-r-08-2024` — balanced, recommended (current default)
- `command-r-plus-08-2024` — most capable, slower
- `command-light` — fastest, lighter capability
- `command-nightly` — experimental, latest features

---

## 🐛 Troubleshooting

**`Error: COHERE_API_KEY is missing`**
→ You didn't put a key in `.env`. Copy `.env.example` to `.env` and fill it in.

**`better-sqlite3` install fails locally**
→ It needs to compile a native module. Install build tools:
- **Linux:** `sudo apt install build-essential python3`
- **macOS:** `xcode-select --install`
- **Windows:** Install Visual Studio Build Tools
- Then re-run `npm install`

**Sessions keep logging me out**
→ Normal in development. The default session store is in-memory and resets on server restart. For production, use a persistent session store (Redis, Postgres session store).

**AI keeps asking things I already told it**
→ Make sure you've filled out your profile at `/profile.html`. The system prompt only includes what you've saved.

**Deployment fails on Render with `better-sqlite3` error**
→ Pin Node version to `22.x` in `package.json`:
```json
"engines": { "node": "22.x" }
```

**Data resets on Render restart**
→ Known free-tier limitation (ephemeral filesystem). Migration to Turso (persistent cloud SQLite) coming soon.

---

## 🚀 Deployment (Render)

1. Push your code to GitHub
2. Sign up at [render.com](https://render.com)
3. Click **New +** → **Web Service**
4. Connect your GitHub repo
5. Configure:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
6. Add environment variables:
   - `COHERE_API_KEY`
   - `SESSION_SECRET`
   - `NODE_ENV=production`
7. Deploy 🎉

Your app will be live at `https://your-app-name.onrender.com`

---

## 📚 Notes for C++ Developers 👋

Mental models that helped me build this coming from a C++ background:

| Web concept            | C++ analogy                                |
|------------------------|--------------------------------------------|
| Express middleware     | A chain of function decorators             |
| `req` / `res`          | Function args (input) + out-parameters     |
| `async` / `await`      | `std::future` but cleaner syntax           |
| `JSON.parse/stringify` | `nlohmann::json` parse / dump              |
| `better-sqlite3`       | A synchronous wrapper around SQLite C API  |
| `fetch()` in JS        | `libcurl` with a Promise-based callback    |
| `req.session`          | A `std::unordered_map` keyed by cookie id  |
| `bcrypt.hash`          | A one-way hash function (no decryption)    |
| Middleware chain       | `funcA(funcB(funcC(handler(req,res))))`    |

---

## 🗺 Roadmap

- [ ] **Turso migration** — persistent cloud database (this weekend)
- [ ] Chat history export (JSON/PDF)
- [ ] Voice input support
- [ ] Multi-conversation threads
- [ ] Profile export/import
- [ ] Dark/light theme toggle
- [ ] Docker containerization

---

## 📄 License

MIT — feel free to fork, modify, and learn from this project.

---

## 👨‍💻 About the Developer

Built by **Avinash Shukla** — 2nd year CSE student at JUET, Guna.

- 🌐 Portfolio: [avinashukla960.github.io/Avinash-Shukla](https://avinashukla960.github.io/Avinash-Shukla/)
- 💼 LinkedIn: [linkedin.com/in/avinash-shukla960](https://www.linkedin.com/in/avinash-shukla960/)
- 🐙 GitHub: [@Avinashukla960](https://github.com/Avinashukla960)

**Honest disclosure:** This project was built with AI-assisted development. I owned the architecture, debugged real production issues, and shipped end-to-end. AI helped me learn faster — it didn't replace the learning.

---

*Star ⭐ this repo if you found it useful or want to see the Turso migration when it drops.*
