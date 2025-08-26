(function(){
  const TOKEN_KEY = 'auth_token';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  async function authorizedFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    options.headers = headers;
    try {
      return await fetch(url, options);
    } catch (err) {
      throw new Error('Няма връзка с API-то');
    }
  }
  window.authorizedFetch = authorizedFetch;
})();
