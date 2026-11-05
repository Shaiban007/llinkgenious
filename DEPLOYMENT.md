# Putting LinkGenius AI on the internet

Use this when you want to open it from any device or let your team log in. Local use (see README) is fine to start with.

Recommended: **Vercel** (hosts the app, free tier is enough to start) + **Neon** or **Supabase** (hosted PostgreSQL, free tier).

## 1. Create the database
- **Neon** (<https://neon.tech>): New project → copy the **connection string** (it starts with `postgres://` or `postgresql://`; use the *pooled* one if offered).
- or **Supabase**: Project settings → Database → Connection string (URI).

Create the tables once from your computer, with `DATABASE_URL` pointing at the hosted database in `.env.local`:
```
npm run db:migrate
```
You should see “Database is up to date.” Then switch `.env.local` back if you also work locally.

## 2. Deploy the app on Vercel
1. Push the code to GitHub (already done if you use this repo).
2. <https://vercel.com> → **Add New → Project** → import the GitHub repo. Framework: Next.js (auto-detected).
3. Add **Environment Variables** (Settings → Environment Variables):

| Name | Value |
|---|---|
| `DATABASE_URL` | the hosted connection string |
| `NEXTAUTH_URL` | your Vercel address, e.g. `https://your-app.vercel.app` (or your own domain) |
| `NEXTAUTH_SECRET` | 64 random hex characters |
| `ENCRYPTION_KEY` | a *different* 64 hex characters. **If you lose or change it, saved API keys and SMTP passwords become unreadable.** |
| `CRON_SECRET` | another random string |
| `SMTP_*` (optional) | only for system emails such as password reset |

Generate random values with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
4. Click **Deploy**. Open the address, register (first account = platform admin).

## 3. Schedule the reminder/send job
The app needs something to call it every 5–15 minutes so reminders appear and **already-approved** emails are sent within your daily limits.
- Free option: <https://cron-job.org> → new job → URL `https://your-app.vercel.app/api/cron/tick`, method **POST**, header `Authorization: Bearer YOUR_CRON_SECRET`, every 10 minutes.
- Vercel’s free plan only allows daily cron jobs, so use the external scheduler above.

## 4. Before real use — checklist
- [ ] `NEXTAUTH_URL` matches the real address exactly (https, no trailing slash).
- [ ] Secrets are only in Vercel’s settings, not in GitHub. `.env.local` is git-ignored — keep it that way.
- [ ] The database has automatic backups (Neon/Supabase offer them; check the plan).
- [ ] You tested **Integrations → Email** and sent one approved email to yourself.
- [ ] Your postal address is set in **Settings → Email**.
- [ ] Registration is open to anyone who finds the URL. If only your team should have accounts, register yourself, then ask your developer to restrict sign-up, or keep the address private.
- [ ] Set a custom domain (Vercel → Domains) and send mail from an address on a domain you own, with SPF/DKIM set up by your email provider, so emails do not land in spam.

## Updating later
Push changes to GitHub; Vercel redeploys automatically. After pulling a version that adds migrations, run `npm run db:migrate` against the hosted database.

## Other hosts
Any host that runs Node 20+ works (`npm run build`, `npm start`) with the same environment variables, e.g. Railway or Render. Use a persistent PostgreSQL, never the local `.pgdata` database, for production.
