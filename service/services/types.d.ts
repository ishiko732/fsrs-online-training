export interface ParseData {
  review_time: string
  card_id: string
  review_rating: string
  review_duration: string
  review_state: string
}

export interface FSRSReview {
  rating: number
  deltaT: number
}

export type FSRSItem = FSRSReview[]

export interface ProgressValue {
  current: number
  total: number
  percent: number
}
