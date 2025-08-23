(function(){
  const TOKEN_KEY = 'auth_token';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  async function refreshToken() {
    const response = await fetch(`${API_BASE_URL}/api/refresh-token`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`
      }
    });
    if (!response.ok) throw new Error('Refresh token failed');
    const data = await response.json();
    setToken(data.token);
    return data.token;
  }

  async function authorizedFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    options.headers = headers;
    return fetch(url, options);
  }

  window.refreshToken = refreshToken;
  window.authorizedFetch = authorizedFetch;
})();
