# PredictIt — Free Prediction Game

A free-to-play prediction app for sports and current events, with a live leaderboard. Built with Next.js + Supabase.

## Features

- Pick a username and start playing immediately (no email required)
- Predict outcomes on sports and current events questions
- Earn 10 points for every correct prediction
- Live leaderboard showing top players
- Admin panel to add questions and resolve them

---

## Setup

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. Go to **Settings → API** and copy:
   - `Project URL`
   - `anon public` key

### 2. Configure environment variables

Edit `.env.local` in this folder:

```
NEXT_PUBLIC_SUPABASE_URL=your_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
NEXT_PUBLIC_ADMIN_PASSWORD=your_chosen_admin_password
```

### 3. Set up the database

1. In your Supabase dashboard, go to **SQL Editor**
2. Copy and paste the contents of `supabase-schema.sql`
3. Click **Run** — this creates all tables, sets up RLS policies, and seeds 5 sample questions

### 4. Run the app

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home — browse and predict on open questions |
| `/leaderboard` | Top 50 players ranked by points |
| `/admin` | Password-protected panel to add questions and mark correct answers |

## How scoring works

- Each correct prediction earns **10 points**
- Points are awarded when an admin resolves a question in the admin panel
- The leaderboard updates immediately after resolution

## Deploying to Vercel

1. Push this folder to a GitHub repo
2. Import it on [vercel.com](https://vercel.com)
3. Add your environment variables in the Vercel project settings
4. Deploy!
