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
      const resp = await fetch(url, options);
      if (!resp.ok) {
        let msg = resp.statusText;
        try {
          const errData = await resp.json();
          msg = errData?.error || errData?.message || msg;
        } catch (_) {}
        throw new Error(msg);
      }
      return resp;
    } catch (err) {
      throw new Error('Network error: ' + err.message);
    }
  }
  window.authorizedFetch = authorizedFetch;
})();
