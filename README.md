# LinkGenius AI

A lead manager, lead organiser and approval-based email tool for exporters (built for Midas Trading House: rice and turmeric).

**What it does:** you bring in real buyer leads (CSV import or by hand), it scores them 0–100 against your ideal buyer, tracks them through a sales pipeline, reminds you to follow up, drafts emails that **you approve before anything is sent**, and reports on KPIs, KRAs and team performance.

**What it deliberately does not do:** it does not invent leads, scrape LinkedIn or websites in bulk, or send email without a person approving it. It is not connected to any paid lead database (Hunter, Apollo…). Find buyers from trade fairs, APEDA / Spices Board, Trade Map and similar (the in-app **Help** page lists them), then import them here.

---

## Run it on your own computer (Windows or Mac)

You need about 20 minutes and nothing else installed except Node.js.

### 1. Install Node.js (once)
Download the **LTS** version from <https://nodejs.org> and install it with the default options. Then open a terminal:
- **Windows:** press the Windows key, type `cmd`, press Enter.
- **Mac:** press Cmd+Space, type `Terminal`, press Enter.

Check it worked: `node -v` should print a number 20 or higher.

### 2. Download this project
```
git clone https://github.com/Shaiban007/llinkgenious.git
cd llinkgenious
npm install
```
(No git? On the GitHub page click **Code → Download ZIP**, unzip it, and open a terminal inside that folder.)

### 3. Create your settings file
Copy `.env.example` to a new file called `.env.local`:
- Windows: `copy .env.example .env.local`
- Mac: `cp .env.example .env.local`

Open `.env.local` in Notepad / TextEdit and replace the three placeholder secrets. Generate each one by running this command and pasting the result:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
- `NEXTAUTH_SECRET` – paste one result
- `ENCRYPTION_KEY` – paste a different result (exactly 64 characters)
- `CRON_SECRET` – paste a third result

Keep `DATABASE_URL` as it is for local use. **Never share `.env.local` or upload it anywhere.**

### 4. Start the database (terminal window 1)
```
npm run db:local
```
Wait for “Database is running”. **Leave this window open** while you use the app. (The first start downloads a small database engine and can take a minute. Your data is stored in the `.pgdata` folder and survives restarts.)

### 5. Create the tables and start the app (terminal window 2)
Open a **second** terminal in the same folder:
```
npm run db:migrate
npm run dev
```
Open <http://localhost:3000> in your browser.

### 6. First use
1. Click **Register**. The first account becomes the platform administrator.
2. Go to **Settings** → describe your ideal buyer (countries, industries, titles). Sensible defaults for rice and spice export are already filled in.
3. Go to **Lead Finder → Import** and upload your CSV. Review, tick the good ones, **Add to CRM**.
4. To explore with sample data first: `npm run db:seed:demo -- your-email@example.com`. Demo leads are labelled “Demo” and use `.invalid` emails that cannot receive mail. Remove them with `--remove` on the same command.

### Next time
Terminal 1: `npm run db:local`. Terminal 2: `npm run dev`. That is all.

---

## Turning on email sending (optional, needs a person to approve each email)

1. **Integrations → Email**: enter your SMTP server. For Gmail use `smtp.gmail.com`, port 587, your address, and an **App Password** (Google Account → Security → 2-Step Verification → App passwords). Your normal password will not work.
2. **Settings → Email**: add your business **postal address** (required in every outreach email), your name and a daily limit. Start low (10–20 a day) with a new sending address.
3. Create a campaign or a draft in the **Email Outbox**, read it, press **Approve**, then **Send**.

Every email gets a signed unsubscribe link. People who unsubscribe or are marked “do not email” are never emailed again.

## Turning on the AI assistant (optional)
Create an API key at <https://console.anthropic.com>, paste it in **Integrations → AI assistant**. Usage is billed to your Anthropic account. The assistant reads your real data and can save email *drafts*; it can never send.

---

## Commands

| Command | What it does |
|---|---|
| `npm run db:local` | Starts the local database (leave running) |
| `npm run db:migrate` | Creates/updates the database tables |
| `npm run dev` | Starts the app for everyday use at localhost:3000 |
| `npm run db:seed:demo -- EMAIL` | Adds labelled demo leads (`--remove` deletes them) |
| `npm test` | Runs the automated tests (database must be running) |
| `npm run typecheck` | Checks the code for type errors |
| `npm run build` then `npm start` | Production build |

## Troubleshooting

- **“DATABASE_URL is not set” / cannot connect** – terminal 1 (`npm run db:local`) must still be running, and `.env.local` must exist.
- **Port 3000 already in use** – close the other program, or run `npx next dev -p 3001` and open that address (update `NEXTAUTH_URL` to match).
- **Login loops back to the login page** – `NEXTAUTH_URL` in `.env.local` must exactly match the address in your browser. Restart `npm run dev` after editing the file.
- **“ENCRYPTION_KEY must be exactly 64 hex characters”** – regenerate it with the command in step 3.
- **Gmail says authentication failed** – you need an App Password, not your normal password.
- **No verification emails arrive locally** – expected. Without system SMTP they are printed in the terminal where `npm run dev` runs, and email verification is off by default.

## Security notes
Passwords are hashed (bcrypt); saved API keys and SMTP passwords are encrypted (AES-256-GCM); every database query is limited to the user's workspace; login and sensitive actions are rate-limited; CSV exports neutralise spreadsheet formulas; website enrichment blocks internal network addresses. Please read `DEPLOYMENT.md` before putting this on the internet.

## Known limits (stated honestly)
- No lead-provider integration; leads come from your own files and entries.
- LinkedIn is not supported by design. You can paste a profile link on a lead and open it yourself.
- Email open/reply tracking is not implemented; log replies manually on the lead.
- Scoring is a rule-based estimate you control, not a prediction of who will buy.
