/**
 * OLX Command Center - API Backend v4 (Final)
 *
 * Тази версия на Worker-а е пълноценен API сървър,
 * поддържащ всички функции на Command Center интерфейса.
 *
 * API ПЪТИЩА:
 * - /callback                  (GET)  -> Обработва OAuth2 оторизацията от OLX.
 * - /api/threads               (GET)  -> Връща списък с последните разговори.
 * - /api/threads/:id/messages  (GET)  -> Връща съобщенията за конкретен разговор.
 * - /api/threads/:id/send-message(POST) -> Изпраща съобщение до OLX.
 * - /api/generate-reply        (POST) -> Извиква AI за генериране на отговор.
 * - /api/analyze-thread        (POST) -> Извиква AI за анализ на разговор.
 * - /api/broadcast             (POST) -> Изпраща групови съобщения.
 * - /api/prompt                (GET/POST) -> Чете и записва системния AI промпт.
 *
 * Използва KV Namespace "OLX_TOKENS" за съхранение на токени и системния промпт.
 */

// --- ГЛАВЕН РУТЕР И КОНФИГУРАЦИЯ ---

export default {
  async fetch(request, env, ctx) {
    // CORS pre-flight заявките са критични за комуникацията с интерфейса.
    if (request.method === 'OPTIONS') {
      return handleCors();
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // --- РУТЕР ЗА API ПЪТИЩА ---
      if (path === "/callback" && method === 'GET') return this.handleOAuthCallback(request, env);
      if (path === "/api/threads" && method === 'GET') return this.getThreads(request, env);
      
      const messageMatch = path.match(/^\/api\/threads\/(\d+)\/messages$/);
      if (messageMatch && method === 'GET') return this.getMessages(request, env, messageMatch[1]);
      
      const sendMatch = path.match(/^\/api\/threads\/(\d+)\/send-message$/);
      if (sendMatch && method === 'POST') return this.sendMessage(request, env, sendMatch[1]);

      if (path === "/api/generate-reply" && method === 'POST') return this.generateReply(request, env);
      if (path === "/api/analyze-thread" && method === 'POST') return this.analyzeThread(request, env);
      if (path === "/api/broadcast" && method === 'POST') return this.broadcastMessage(request, env);

      if (path === "/api/prompt") {
        if (method === 'GET') return this.getPrompt(request, env);
        if (method === 'POST') return this.savePrompt(request, env);
      }

      // Ако никой път не съвпадне
      return jsonResponse({ message: "OLX API Worker is running. Endpoint not found." }, 404);

    } catch (error) {
      console.error("Unhandled error:", error);
      return jsonResponse({ error: "An unexpected server error occurred." }, 500);
    }
  },

  // --- API ФУНКЦИИ ---

  async getThreads(request, env) {
    const accessToken = await getValidAccessToken(env);
    if (!accessToken) return jsonResponse({ error: "Authentication required." }, 401);

    const threadsResponse = await fetch("https://www.olx.bg/api/partner/threads?limit=50&offset=0", { headers: { "Authorization": `Bearer ${accessToken}`, "Version": "2.0" } });
    if (!threadsResponse.ok) throw new Error(`OLX API Error [getThreads]: ${threadsResponse.status}`);
    const threadsData = await threadsResponse.json();
    return jsonResponse(threadsData.data);
  },

  async getMessages(request, env, threadId) {
    const accessToken = await getValidAccessToken(env);
    if (!accessToken) return jsonResponse({ error: "Authentication required." }, 401);

    const messagesResponse = await fetch(`https://www.olx.bg/api/partner/threads/${threadId}/messages`, { headers: { "Authorization": `Bearer ${accessToken}`, "Version": "2.0" } });
    if (!messagesResponse.ok) throw new Error(`OLX API Error [getMessages]: ${messagesResponse.status}`);
    const messagesData = await messagesResponse.json();
    return jsonResponse(messagesData.data);
  },
  
  async generateReply(request, env) {
    const { threadId } = await request.json();
    if (!threadId) return jsonResponse({ error: "threadId is required" }, 400);

    const accessToken = await getValidAccessToken(env);
    if (!accessToken) return jsonResponse({ error: "Authentication required." }, 401);

    // Взимаме целия контекст (детайли за разговора, съобщения, обява, системен промпт)
    const threadDetailsResponse = await fetch(`https://www.olx.bg/api/partner/threads/${threadId}`, { headers: { "Authorization": `Bearer ${accessToken}`, "Version": "2.0" }});
    if (!threadDetailsResponse.ok) throw new Error("Could not fetch thread details.");
    const threadData = (await threadDetailsResponse.json()).data;

    const [messagesRes, advertRes, systemPrompt] = await Promise.all([
      fetch(`https://www.olx.bg/api/partner/threads/${threadId}/messages`, { headers: { "Authorization": `Bearer ${accessToken}`, "Version": "2.0" } }).then(res => res.json()),
      fetch(`https://www.olx.bg/api/partner/adverts/${threadData.advert_id}`, { headers: { "Authorization": `Bearer ${accessToken}`, "Version": "2.0" } }).then(res => res.json()),
      env.OLX_TOKENS.get("AI_PROMPT")
    ]);
    
    const messageHistory = messagesRes.data.map(m => `${m.type === 'sent' ? 'Аз' : 'Клиент'}: ${m.text}`).join('\n');
    const advert = advertRes.data;

    const fullPrompt = `СИСТЕМНИ ИНСТРУКЦИИ: ${systemPrompt || "Ти си полезен асистент по продажбите в OLX. Отговаряй кратко и учтиво на български."}\n\nКОНТЕКСТ ЗА ОБЯВАТА:\n- Заглавие: ${advert.title}\n- Цена: ${advert.price.value} ${advert.price.currency}\n\nИСТОРИЯ НА РАЗГОВОРА:\n${messageHistory}\n\nТВОЯТА ЗАДАЧА: Въз основа на всичко дотук, генерирай полезен и адекватен отговор на последния въпрос на клиента.\nОТГОВОР:`;
    
    return callGemini(env.GEMINI_API_KEY, fullPrompt).then(reply => jsonResponse({ reply }));
  },

  async analyzeThread(request, env) {
      const { threadId, question } = await request.json();
      if (!threadId || !question) return jsonResponse({ error: "threadId and question are required" }, 400);

      const accessToken = await getValidAccessToken(env);
      if (!accessToken) return jsonResponse({ error: "Authentication required." }, 401);

      const messagesRes = await fetch(`https://www.olx.bg/api/partner/threads/${threadId}/messages`, { headers: { "Authorization": `Bearer ${accessToken}`, "Version": "2.0" } }).then(res => res.json());
      const messageHistory = messagesRes.data.map(m => `${m.type === 'sent' ? 'Аз' : 'Клиент'}: ${m.text}`).join('\n');
      
      const fullPrompt = `Ти си AI анализатор. Твоята задача е да отговориш на въпроса на потребителя, като използваш САМО информация от предоставения разговор. Ако информацията не съществува в разговора, отговори с "Информацията не е налична в разговора."\n\nРАЗГОВОР:\n---\n${messageHistory}\n---\n\nВЪПРОС НА ПОТРЕБИТЕЛЯ: ${question}\n\nАНАЛИТИЧЕН ОТГОВОР:`;

      return callGemini(env.GEMINI_API_KEY, fullPrompt).then(answer => jsonResponse({ answer }));
  },

  async sendMessage(request, env, threadId) {
      const { text } = await request.json();
      if (!text || text.trim() === '') return jsonResponse({ error: "Message text cannot be empty." }, 400);

      const accessToken = await getValidAccessToken(env);
      if (!accessToken) return jsonResponse({ error: "Authentication required." }, 401);

      const response = await fetch(`https://www.olx.bg/api/partner/threads/${threadId}/messages`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json", "Version": "2.0" },
          body: JSON.stringify({ text }),
      });

      if (!response.ok) throw new Error(`OLX API Error [sendMessage]: ${response.status} - ${await response.text()}`);
      return jsonResponse({ success: true });
  },

  async broadcastMessage(request, env) {
      const { threadIds, text } = await request.json();
      if (!threadIds || !Array.isArray(threadIds) || threadIds.length === 0 || !text) {
          return jsonResponse({ error: "threadIds (array) and text are required." }, 400);
      }
      if (!threadIds.every(id => Number.isInteger(Number(id)))) {
          return jsonResponse({ error: "threadIds must contain only integers." }, 400);
      }

      const accessToken = await getValidAccessToken(env);
      if (!accessToken) return jsonResponse({ error: "Authentication required." }, 401);

      let sentCount = 0;
      for (const threadId of threadIds) {
          try {
              const response = await fetch(`https://www.olx.bg/api/partner/threads/${threadId}/messages`, {
                  method: "POST",
                  headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json", "Version": "2.0" },
                  body: JSON.stringify({ text }),
              });
              if (response.ok) sentCount++;
              await new Promise(resolve => setTimeout(resolve, 250)); // Малка пауза, за да не претоварим API-то
          } catch (e) {
              console.error(`Broadcast failed for thread ${threadId}:`, e);
          }
      }
      return jsonResponse({ success: true, sentCount });
  },

  async getPrompt(request, env) {
      const prompt = await env.OLX_TOKENS.get("AI_PROMPT");
      return jsonResponse({ prompt: prompt || "Ти си полезен асистент по продажбите. Отговаряй кратко и на български." });
  },

  async savePrompt(request, env) {
      const { prompt } = await request.json();
      if (typeof prompt !== 'string') return jsonResponse({ error: "Prompt must be a string." }, 400);
      await env.OLX_TOKENS.put("AI_PROMPT", prompt);
      return jsonResponse({ success: true });
  },

  // --- OAUTH2 ФУНКЦИИ ---

  async handleOAuthCallback(request, env) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    if (!code) return new Response("Authorization code not found.", { status: 400 });

    const redirectUri = "https://olx.radilov-k.workers.dev/callback";
    const tokenResponse = await fetch("https://www.olx.bg/api/open/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: env.OLX_CLIENT_ID,
        client_secret: env.OLX_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("Failed to fetch token:", errorText);
        return new Response(`Failed to fetch token from OLX. Status: ${tokenResponse.status}. Body: ${errorText}`, { status: 500 });
    }

    const tokenData = await tokenResponse.json();
    await env.OLX_TOKENS.put("access_token", tokenData.access_token);
    await env.OLX_TOKENS.put("refresh_token", tokenData.refresh_token);
    const expires_at = Date.now() + (tokenData.expires_in * 1000);
    await env.OLX_TOKENS.put("expires_at", expires_at.toString());

    // Препращаме потребителя обратно към главния интерфейс
    const frontendUrl = "https://radilovk.github.io/olx/";
    return Response.redirect(frontendUrl, 302);
  },
};

// --- ПОМОЩНИ ФУНКЦИИ (извън главния обект) ---

async function getValidAccessToken(env) {
  const expires_at_str = await env.OLX_TOKENS.get("expires_at");
  const expires_at = expires_at_str ? parseInt(expires_at_str) : 0;
  
  if (!expires_at || Date.now() >= expires_at - 60000) {
    console.log("Access token expired or missing. Refreshing...");
    const refreshToken = await env.OLX_TOKENS.get("refresh_token");
    if (!refreshToken) throw new Error("No refresh token found. Please re-authorize.");
    
    const response = await fetch("https://www.olx.bg/api/open/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: env.OLX_CLIENT_ID,
          client_secret: env.OLX_CLIENT_SECRET,
          refresh_token: refreshToken,
        }),
    });

    if (!response.ok) {
      console.error("Failed to refresh token. Please re-authorize.");
      await env.OLX_TOKENS.delete("access_token");
      await env.OLX_TOKENS.delete("refresh_token");
      await env.OLX_TOKENS.delete("expires_at");
      throw new Error("Failed to refresh token. Please re-authorize.");
    }

    const tokenData = await response.json();
    await env.OLX_TOKENS.put("access_token", tokenData.access_token);
    await env.OLX_TOKENS.put("refresh_token", tokenData.refresh_token);
    const new_expires_at = Date.now() + (tokenData.expires_in * 1000);
    await env.OLX_TOKENS.put("expires_at", new_expires_at.toString());
    
    console.log("Token refreshed successfully.");
    return tokenData.access_token;
  } else {
    return await env.OLX_TOKENS.get("access_token");
  }
}

async function callGemini(apiKey, prompt) {
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!geminiResponse.ok) throw new Error(`Gemini API Error: ${geminiResponse.status}`);
    const geminiData = await geminiResponse.json();
    return geminiData.candidates?.[0]?.content?.parts?.[0]?.text.trim() || "Не можах да генерирам отговор.";
}

function handleCors() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
    });
}

function jsonResponse(data, status = 200) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };
  return new Response(JSON.stringify(data, null, 2), { status, headers });
}
