# avinash.ai — Personal AI Assistant

A small full-stack web app where every user signs up with a personal
profile (name, age, goals, health notes, activity level, diet
preferences, free-text "anything else"), and then chats with an AI that
**already knows all of that** — like a doctor or trainer who's read your
chart before you walked in.

- **Backend:** Node.js + Express
- **Database:** SQLite (via `better-sqlite3`)
- **Auth:** `express-session` + `bcrypt` password hashing
- **LLM:** Cohere (`command-r-08-2024` by default) via the official SDK
- **Frontend:** Plain HTML, CSS, and JavaScript — no framework, modern dark UI

---

## Quick start (local dev)

You need **Node.js 18 or newer** installed (`node -v` to check).

```bash
# 1. From the project folder, copy the env template and edit it
cp .env.example .env
# Now open .env in your editor and paste your real GEMINI_API_KEY.

# 2. Install dependencies
npm install

# 3. Run the server
npm start
```

Then open **http://localhost:3000** in your browser. You'll be sent to
the login page; click "Sign up" to create an account.

That's it. The SQLite database (`data.db`) is created automatically on
first run.

### Getting a Gemini API key (free)

1. Go to **https://aistudio.google.com/app/apikey**
2. Sign in with your Google account
3. Click **"Create API key"**
4. Copy the key (it looks like `AIza...`) into your `.env` file as
   `GEMINI_API_KEY=...`

The free tier gives you plenty of requests for personal use.

---

## How it's wired together

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

### What happens on every chat message

1. `requireAuth` middleware checks the session cookie.
2. The user's profile is loaded from the `profiles` table.
3. The last 10 messages are loaded from the `messages` table.
4. A **system prompt** is built that injects the profile as known
   context — Gemini is told *"You already know the following about
   the user, do not ask them to repeat any of it"*, plus a safety
   instruction to advise real medical care for anything serious.
5. Everything is sent to the Google Gemini API.
6. Both the user's message and the assistant's reply are saved to the
   `messages` table.

---

## Project layout

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
│   ├── chat.html          ← chat UI with iMessage-style bubbles
│   ├── profile.html       ← view/edit profile
│   └── styles.css         ← all styles
├── .env.example           ← template for your .env
├── .gitignore
├── package.json
└── README.md
```

---

## Switching models

In `routes/chat.js`, change the `MODEL` constant near the top:

```js
const MODEL = 'gemini-1.5-flash';   // ← change this
```

Available options (free tier):
- `gemini-1.5-flash` — fast, very capable, recommended
- `gemini-1.5-pro` — more capable, slightly slower
- `gemini-2.0-flash` — newer, fast

---

## Troubleshooting

- **`Error: GEMINI_API_KEY is missing`** — you didn't put a key in
  `.env`. Copy `.env.example` to `.env` and fill it in.

- **`better-sqlite3` install fails** — it needs to compile a native
  module. On Linux install `build-essential` and `python3`; on macOS
  install Xcode Command Line Tools (`xcode-select --install`); on
  Windows install the Visual Studio Build Tools. Then re-run
  `npm install`.

- **Sessions keep logging me out** — that's normal in development; the
  default session store is in-memory and resets whenever you restart
  the server. For production you'd want a persistent session store.

- **The AI keeps asking me things I already told it** — make sure
  you've filled out your profile at `/profile.html`. The system prompt
  only includes what you've saved.

- **Health questions get blocked by safety filters** — the
  `safetySettings` in `routes/chat.js` are loosened already
  (`BLOCK_ONLY_HIGH`). If something still gets blocked, you can
  change them to `BLOCK_NONE`, but that disables safety filtering
  entirely.

---

## Notes for the C++ developer 👋

A few mental models that helped me write this assuming a C++
background:

| Web concept        | C++ analogy                                |
|--------------------|--------------------------------------------|
| Express middleware | A chain of function decorators             |
| `req` / `res`      | Function args (input) + out-parameters     |
| `async` / `await`  | `std::future` but cleaner syntax           |
| `JSON.parse/stringify` | `nlohmann::json` parse / dump         |
| `better-sqlite3`   | A synchronous wrapper around SQLite C API  |
| `fetch()` in JS    | `libcurl` with a Promise-based callback    |
| `req.session`      | A `std::unordered_map` keyed by cookie id  |
| `bcrypt.hash`      | A one-way hash function (no decryption)    |
| Middleware chain   | `funcA(funcB(funcC(handler(req,res))))`    |
# Personal-Ai
