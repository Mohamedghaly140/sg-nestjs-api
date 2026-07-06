export interface ApiSuccessResponse<T> {
  status: 'success';
  message?: string;
  data: T;
  meta?: unknown;
}

export interface ApiErrorResponse {
  status: 'error';
  message: string;
  code: string;
  errors?: unknown;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
