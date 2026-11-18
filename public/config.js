/* Адрес сервера (backend) портала.
 *
 * Когда портал открыт с самого сервера (Render, localhost, своя машина) — API на том же адресе, ничего менять не нужно.
 * Когда интерфейс открыт с GitHub Pages (*.github.io) — запросы идут на сервер ниже.
 *
 * Переезд backend на другой хостинг = поменять одну строку KU_BACKEND_URL (без «/» в конце)
 * и добавить адрес Pages в PAGES_ORIGINS на сервере (server.js), если он другой.
 */
(function () {
  var KU_BACKEND_URL = 'https://ku-portal.onrender.com';
  var onPages = /\.github\.io$/i.test(location.hostname);
  window.KU_API_BASE = onPages ? KU_BACKEND_URL.replace(/\/+$/, '') : '';
})();
