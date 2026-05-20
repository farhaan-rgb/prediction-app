-- Run this if you already ran supabase-schema.sql before and need to migrate

-- 1. Add new columns to users
alter table users add column if not exists total_predictions integer default 0;
alter table users add column if not exists correct_predictions integer default 0;

-- 2. Update questions category constraint to include ipl and nba
alter table questions drop constraint if exists questions_category_check;
alter table questions add constraint questions_category_check
  check (category in ('ipl', 'nba', 'current_events', 'sports'));

-- 3. Delete old sample questions (the original 5 seed questions)
delete from questions where category = 'sports' or category = 'current_events';

-- 4. Add new IPL/NBA questions
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
