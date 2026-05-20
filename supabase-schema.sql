-- Run this in your Supabase SQL editor to set up the database

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  total_points integer default 0,
  total_predictions integer default 0,
  correct_predictions integer default 0,
  created_at timestamptz default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('ipl', 'nba', 'current_events')),
  options jsonb not null,
  correct_option integer,
  deadline timestamptz not null,
  status text default 'open' check (status in ('open', 'closed', 'resolved')),
  created_at timestamptz default now()
);

create table if not exists predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  question_id uuid references questions(id) on delete cascade not null,
  chosen_option integer not null,
  points_awarded integer default 0,
  created_at timestamptz default now(),
  unique(user_id, question_id)
);

-- Row-level security
alter table users enable row level security;
alter table questions enable row level security;
alter table predictions enable row level security;

create policy "Anyone can read users" on users for select using (true);
create policy "Anyone can insert users" on users for insert with check (true);
create policy "Anyone can update users" on users for update using (true);
create policy "Anyone can read questions" on questions for select using (true);
create policy "Anyone can insert questions" on questions for insert with check (true);
create policy "Anyone can update questions" on questions for update using (true);
create policy "Anyone can read predictions" on predictions for select using (true);
create policy "Anyone can insert predictions" on predictions for insert with check (true);
create policy "Anyone can update predictions" on predictions for update using (true);

-- IPL 2026 seed questions (deadlines relative to now)
insert into questions (title, category, options, deadline, status) values
(
  'Who will win IPL 2026 Qualifier 1?',
  'ipl',
  '["Mumbai Indians", "Kolkata Knight Riders", "Royal Challengers Bengaluru", "Rajasthan Royals"]',
  now() + interval '2 days',
  'open'
),
(
  'Which player will be top run-scorer in IPL 2026 Qualifier 1?',
  'ipl',
  '["Virat Kohli", "Rohit Sharma", "Shubman Gill", "KL Rahul"]',
  now() + interval '2 days',
  'open'
),
(
  'Which team will reach the IPL 2026 Final from Qualifier 2?',
  'ipl',
  '["Delhi Capitals", "Punjab Kings", "Sunrisers Hyderabad", "Chennai Super Kings"]',
  now() + interval '4 days',
  'open'
),
(
  'Who will win the IPL 2026 Final?',
  'ipl',
  '["Mumbai Indians", "Royal Challengers Bengaluru", "Kolkata Knight Riders", "Chennai Super Kings"]',
  now() + interval '7 days',
  'open'
),
(
  'Who will win Game 5 of the NBA Western Conference Finals?',
  'nba',
  '["Oklahoma City Thunder", "Golden State Warriors"]',
  now() + interval '2 days',
  'open'
),
(
  'Which team will win the NBA Eastern Conference Finals?',
  'nba',
  '["Boston Celtics", "Cleveland Cavaliers", "New York Knicks", "Milwaukee Bucks"]',
  now() + interval '5 days',
  'open'
),
(
  'Who will score 30+ points in NBA ECF Game 4?',
  'nba',
  '["Jayson Tatum", "Donovan Mitchell", "Jalen Brunson", "Giannis Antetokounmpo"]',
  now() + interval '3 days',
  'open'
);
