export type Category = 'ipl' | 'nba' | 'current_events' | 'stocks' | 'crypto' | 'movies'
export type QuestionStatus = 'open' | 'closed' | 'resolved'

export interface User {
  id: string
  username: string
  total_points: number
  total_predictions: number
  correct_predictions: number
  streak_freezes: number
  chips: number
  created_at: string
}

export type QuestionType = 'match_winner' | 'top_scorer' | 'top_bowler' | 'team_total' | 'player_milestone' | 'toss' | 'outcome' | 'policy' | 'market' | 'market_direction' | 'price_level' | 'sector_call' | 'price_direction' | 'regulation' | 'box_office' | 'hit_or_flop'

export interface Question {
  id: string
  title: string
  category: Category
  question_type: QuestionType | null
  options: string[]
  correct_option: number | null
  deadline: string
  resolve_after: string | null
  status: QuestionStatus
  context: string | null
  created_at: string
}

export interface Prediction {
  id: string
  user_id: string
  question_id: string
  chosen_option: number
  points_awarded: number
  created_at: string
}

export interface PredictionWithQuestion extends Prediction {
  questions: Question
}
