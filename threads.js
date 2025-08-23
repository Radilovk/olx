(function() {
  function createThreadElement(thread, meta) {
    const threadElement = document.createElement('div');
    threadElement.className = 'thread-item';
    threadElement.dataset.threadId = thread.id;

    const isRead = meta.isRead ?? (thread.unread_count === 0);
    const shortValue = meta.shortName || meta.advertTitle || '';
    const orderStatus = meta.orderStatus || 'pending';
    const shipping = meta.shipping || '';
    const lastDate = formatDate(
      thread.last_message_date ||
      thread.last_message?.created_at ||
      thread.last_message?.date
    );
    if (!isRead) threadElement.classList.add('unread');

    const interlocutorName = meta.contactName || thread.interlocutor?.name || 'Неизвестен потребител';
    const advertTitle = meta.advertTitle || '';

    threadElement.innerHTML = `
        <input type="checkbox" class="thread-checkbox" data-id="${thread.id}" name="thread-checkbox-${thread.id}">
        <div class="thread-item-info">
            <p><span class="unread-badge"></span><span class="user-name">${interlocutorName}</span><input class="short-ad-name" name="short-ad-name-${thread.id}" value="${shortValue}" placeholder="${advertTitle || 'Кратко име'}"></p>
            <small class="advert-title">${advertTitle}</small>
            <small>Последно: ${lastDate}</small>
        </div>
        <div class="thread-meta">
            <button class="read-toggle" title="Маркирай прочетено">${isRead ? '📖' : '📬'}</button>
            <select class="order-status" name="order-status-${thread.id}">
                <option value="pending"${orderStatus === 'pending' ? ' selected' : ''}>Необработена</option>
                <option value="done"${orderStatus === 'done' ? ' selected' : ''}>Обработена</option>
            </select>
            <select class="shipping-method" name="shipping-method-${thread.id}">
                <option value=""${shipping === '' ? ' selected' : ''}>Доставка</option>
                <option value="speedy"${shipping === 'speedy' ? ' selected' : ''}>Спиди</option>
                <option value="econt"${shipping === 'econt' ? ' selected' : ''}>Еконт</option>
            </select>
            <button class="note-button" title="Бележка">📝</button>
            <button class="details-button" title="Обнови детайли">🔄</button>
        </div>
    `;

    const info = threadElement.querySelector('.thread-item-info');
    info.addEventListener('click', () => {
      document.querySelectorAll('.thread-item').forEach(el => el.classList.remove('active'));
      threadElement.classList.add('active');
      displayMessages(thread.id);
    });

    const shortInput = threadElement.querySelector('.short-ad-name');
    shortInput.addEventListener('change', e => {
      e.stopPropagation();
      meta.shortName = e.target.value.trim();
      saveThreadMeta(thread.id, meta);
    });

    const readBtn = threadElement.querySelector('.read-toggle');
    readBtn.addEventListener('click', e => {
      e.stopPropagation();
      meta.isRead = !meta.isRead;
      threadElement.classList.toggle('unread', !meta.isRead);
      readBtn.textContent = meta.isRead ? '📖' : '📬';
      saveThreadMeta(thread.id, meta);
    });

    const orderSelect = threadElement.querySelector('.order-status');
    orderSelect.addEventListener('change', e => {
      e.stopPropagation();
      meta.orderStatus = e.target.value;
      saveThreadMeta(thread.id, meta);
    });

    const shipSelect = threadElement.querySelector('.shipping-method');
    shipSelect.addEventListener('change', e => {
      e.stopPropagation();
      meta.shipping = e.target.value;
      saveThreadMeta(thread.id, meta);
    });

    const noteBtn = threadElement.querySelector('.note-button');
    noteBtn.addEventListener('click', e => {
      e.stopPropagation();
      const newNote = prompt('Бележка за клиента:', meta.note || '');
      if (newNote !== null) {
        meta.note = newNote;
        saveThreadMeta(thread.id, meta);
      }
    });

    const detailsBtn = threadElement.querySelector('.details-button');
    detailsBtn.addEventListener('click', e => {
      e.stopPropagation();
      refreshThreadDetails(thread.id, threadElement, meta, shortInput);
    });

    refreshThreadDetails(thread.id, threadElement, meta, shortInput);
    return threadElement;
  }

  async function refreshThreadDetails(id, threadElement, meta, shortInput) {
    const advertEl = threadElement.querySelector('.advert-title');
    const userEl = threadElement.querySelector('.user-name');
    const btn = threadElement.querySelector('.details-button');
    if (btn) btn.disabled = true;
    try {
      const response = await authorizedFetch(`${API_BASE_URL}/api/threads/${id}/details`);
      if (!response.ok) throw new Error('fetch failed');
      const data = await response.json();
      meta.advertTitle = data.advertTitle || '';
      meta.contactName = data.contactName || userEl.textContent;
      saveThreadMeta(id, meta);
      advertEl.textContent = meta.advertTitle;
      userEl.textContent = meta.contactName;
      if (!meta.shortName) {
        shortInput.placeholder = meta.advertTitle || 'Кратко име';
      }
    } catch (err) {
      advertEl.textContent = meta.advertTitle || advertEl.textContent;
      userEl.textContent = meta.contactName || userEl.textContent;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  window.createThreadElement = createThreadElement;
})();
