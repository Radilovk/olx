(function(){
  const TOKEN_KEY = 'auth_token';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  async function authorizedFetch(url, options = {}) {
    const { throwOnError, ...fetchOptions } = options;
    const headers = new Headers(fetchOptions.headers || {});
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    fetchOptions.headers = headers;
    try {
      return await fetch(url, fetchOptions);
    } catch (err) {
      if (throwOnError) {
        throw new Error(`Network error: ${err.message}`);
      }
      return { ok: false, error: err.message };
    }
  }
  window.authorizedFetch = authorizedFetch;
})();
