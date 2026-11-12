'use strict';
/*
 * Модуль раздела «Экзамен»: переход в «Онлайн-экзамен» (EXAM SYNC, github.com/StephCurrysvg/exam-sync).
 * Подключается через штатную точку расширения registerQueueModule (см. AGENTS.md) и ничего
 * в существующих экранах не меняет: кнопка появляется в панели модулей очереди у студента и преподавателя,
 * по ней открывается экран-переход #/exam/m/online-exam (#/t/m/online-exam).
 *
 * Адрес сайта экзаменов задаётся переменной окружения EXAM_SYNC_URL на сервере портала
 * (отдаётся через GET /api/modules/online-exam/config). Если она не задана:
 *  - при локальном запуске (localhost / адрес в Wi-Fi сети) — тот же хост, порт 3001;
 *  - иначе — EXAM_SYNC_DEFAULT_URL ниже.
 */
(function () {
  const EXAM_SYNC_DEFAULT_URL = 'https://exam-sync.onrender.com';
  const EXAM_SYNC_LOCAL_PORT = 3001;

  I.monitor = '<rect x="3.5" y="4.5" width="17" height="11.5" rx="2"/><path d="M8.5 20h7M12 16v4"/><path d="m9.2 10.4 1.9 1.9 3.8-3.9"/>';
  I.external = '<path d="M13.5 4.5h6v6"/><path d="M19.5 4.5 11 13"/><path d="M17.5 13.5v4.5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 6 6.5h4.5"/>';

  const isLocalHost = (h) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]' ||
    /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);

  function fallbackUrl() {
    return isLocalHost(location.hostname)
      ? `${location.protocol}//${location.hostname}:${EXAM_SYNC_LOCAL_PORT}/`
      : EXAM_SYNC_DEFAULT_URL;
  }
  /* Только http(s): адрес приходит из настроек, но в href/location его подставлять без проверки нельзя */
  function safeUrl(raw) {
    try { const u = new URL(raw, location.href); return /^https?:$/.test(u.protocol) ? u : null; } catch { return null; }
  }
  let cfgPromise = null;
  function examUrl(api) {
    if (!cfgPromise) {
      cfgPromise = api('/modules/online-exam/config')
        .then((c) => (c && c.url) || fallbackUrl())
        .catch(() => fallbackUrl())
        .then((raw) => safeUrl(raw) || safeUrl(EXAM_SYNC_DEFAULT_URL));
    }
    return cfgPromise;
  }
  /* Адрес с параметрами возврата: exam-sync покажет кнопку «← KU Portal» */
  function launchUrl(base, role) {
    const u = new URL(base.href);
    u.searchParams.set('from', 'ku-portal');
    u.searchParams.set('back', location.origin + '/' + (role === 'teacher' ? '#/t/queue' : '#/exam'));
    return u.href;
  }

  /* Бесплатный Render засыпает: будим сервер заранее, пока человек читает экран.
     no-cors — ответ нам не нужен, важен сам запрос. */
  function warmUp(url) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = setTimeout(() => ctrl && ctrl.abort(), 70000);
    return fetch(url, { mode: 'no-cors', cache: 'no-store', signal: ctrl && ctrl.signal })
      .then(() => true, () => false)
      .finally(() => clearTimeout(t));
  }

  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Полноэкранная анимация перехода «KU Portal → Онлайн-экзамен», затем уход на сайт */
  function playTransition(href, svg) {
    const ov = document.createElement('div');
    ov.className = 'oe-ov';
    ov.setAttribute('role', 'status');
    ov.setAttribute('aria-live', 'polite');
    ov.innerHTML = `
      <div class="oe-ov-in">
        <div class="oe-bridge">
          <span class="oe-app ku">${svg('logo')}</span>
          <span class="oe-track"><i></i></span>
          <span class="oe-app ex">${svg('monitor')}</span>
        </div>
        <div class="oe-ov-t">Открываем онлайн-экзамен…</div>
        <div class="oe-ov-s">Сайт экзаменов откроется в этой вкладке</div>
      </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('on'));
    setTimeout(() => { location.href = href; }, reduced() ? 50 : 900);
    // Если пользователь вернулся кнопкой «Назад» из bfcache — убрать оверлей
    window.addEventListener('pageshow', function h(e) { if (e.persisted) { ov.remove(); window.removeEventListener('pageshow', h); } });
  }

  const FEATURES = {
    student: [
      ['clipboard', 'Тесты онлайн', 'Grammar, vocabulary и другие тесты с таймером — прогресс сохраняется, если закрыть вкладку.'],
      ['book', 'Writing', 'Письменная часть экзамена прямо в браузере, черновик не потеряется.'],
      ['mic', 'Speaking-очередь', 'Комнаты экзамена с очередью на устную часть и live-обновлениями.'],
      ['star', 'Результаты', 'Баллы по частям экзамена и разбор ответов.'],
    ],
    teacher: [
      ['plus', 'Редактор тестов', 'Создание тестов с разными типами вопросов, импорт и экспорт.'],
      ['door', 'Комнаты экзамена', 'Собираете экзамен из тестов, writing и speaking, открываете комнату группе.'],
      ['users', 'Speaking-очередь', 'Вызов студентов, таймер ответа, оценка устной части.'],
      ['chart', 'Ведомость', 'Сводные баллы студентов по всем частям экзамена.'],
    ],
  };

  registerQueueModule({
    id: 'online-exam',
    title: 'Онлайн-экзамен',
    icon: 'monitor',
    roles: ['student', 'teacher'],
    disciplines: null,
    async render(root, ctx) {
      const { role, esc, svg, toast } = ctx;
      const teacher = role === 'teacher';
      root.innerHTML = `<div class="load">Загрузка…</div>`;
      const base = await examUrl(ctx.api);
      if (!document.body.contains(root)) return; // успели уйти со страницы
      if (!base) { root.innerHTML = `<div class="card next-empty">Адрес сайта онлайн-экзамена не настроен.<br>Администратору: задайте EXAM_SYNC_URL на сервере портала.</div>`; return; }
      const href = launchUrl(base, role);

      root.innerHTML = `
        <div class="card oe-hero">
          <div class="oe-bridge sm" aria-hidden="true">
            <span class="oe-app ku">${svg('logo')}</span>
            <span class="oe-track"><i></i></span>
            <span class="oe-app ex">${svg('monitor')}</span>
          </div>
          <div class="oe-kicker">Сервис экзаменов</div>
          <div class="oe-title">Онлайн-экзамен</div>
          <div class="tx oe-lead">${teacher
            ? 'Отдельный сайт для проведения письменных экзаменов: тесты, writing, speaking и ведомость в одном месте.'
            : 'Отдельный сайт для сдачи экзамена онлайн: тесты, writing и запись на speaking в одном месте.'}</div>
          <div class="oe-status" id="oeStatus"><i></i><span>Проверяем доступность сайта…</span></div>
          <a class="btn pri oe-go" id="oeGo" href="${esc(href)}">${svg('monitor')}Перейти к онлайн-экзамену</a>
          <a class="btn ghost oe-new" href="${esc(href)}" target="_blank" rel="noopener">${svg('external')}Открыть в новой вкладке</a>
          <div class="oe-host">${esc(base.host)}</div>
        </div>

        <div class="oe-feat">
          ${FEATURES[teacher ? 'teacher' : 'student'].map(([ic, t, d]) => `
            <div class="card oe-fi"><span class="oe-fic">${svg(ic)}</span><div><b>${esc(t)}</b><div class="tx">${esc(d)}</div></div></div>`).join('')}
        </div>

        <div class="card oe-note">
          <span class="oe-fic">${svg('info')}</span>
          <div class="tx">
            <b>Вход на сайте экзаменов отдельный.</b> Используйте логин и пароль, которые выдал преподаватель.
            Вернуться в портал можно кнопкой «KU Portal» в верхней панели сайта экзаменов.
          </div>
        </div>`;

      const st = root.querySelector('#oeStatus');
      const setSt = (cls, text) => { if (!st.isConnected) return; st.className = 'oe-status ' + cls; st.querySelector('span').textContent = text; };
      const slow = setTimeout(() => setSt('wait', 'Сайт просыпается — первое открытие может занять до минуты'), 2500);
      warmUp(base.href).then((alive) => {
        clearTimeout(slow);
        setSt(alive ? 'ok' : 'bad', alive ? 'Сайт доступен' : 'Не удалось связаться с сайтом — попробуйте открыть его позже');
      });

      root.querySelector('#oeGo').addEventListener('click', (e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return; // открытие в новой вкладке — как обычно
        e.preventDefault();
        try { playTransition(href, svg); } catch (err) { toast(err.message, true); location.href = href; }
      });
    },
  });
})();
