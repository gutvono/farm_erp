export interface ApiResponse<T> {
  success: boolean
  message: string
  data: T
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
}

export interface Notification {
  id: string
  type: string
  title: string
  message: string
  is_read: boolean
  reference_module: string | null
  reference_id: string | null
  created_at: string
  read_at: string | null
}

export interface User {
  id: string
  username: string
  is_active: boolean
  created_at: string
}
