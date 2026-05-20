export type Category = 'ipl' | 'nba' | 'current_events'
export type QuestionStatus = 'open' | 'closed' | 'resolved'

export interface User {
  id: string
  username: string
  total_points: number
  total_predictions: number
  correct_predictions: number
  created_at: string
}

export interface Question {
  id: string
  title: string
  category: Category
  options: string[]
  correct_option: number | null
  deadline: string
  status: QuestionStatus
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
