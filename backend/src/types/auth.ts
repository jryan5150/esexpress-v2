export interface JwtPayload {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'dispatcher' | 'viewer';
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    email: string;
    name: string;
    role: string;
  };
}

export interface GoogleCallbackQuery {
  code: string;
  state?: string;
}
