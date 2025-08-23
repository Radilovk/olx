export const API_BASE_URL = 'https://olx.radilov-k.workers.dev';

export async function refreshToken() {
  const response = await fetch(`${API_BASE_URL}/api/refresh-token`);
  if (!response.ok) {
    throw new Error('Грешка при опресняване на токена');
  }
  const data = await response.json();
  if (!data.token) {
    throw new Error('Липсва токен в отговора');
  }
  localStorage.setItem('auth_token', data.token);
  return data.token;
}

export async function authFetch(path, options = {}) {
  const token = localStorage.getItem('auth_token');
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
}
