/* Основной режим — интерфейс и API на одном alwaysdata-хосте.
 * Адрес ниже нужен только старой копии интерфейса на GitHub Pages.
 */
(function () {
  var KU_BACKEND_URL = 'https://ku-portal.alwaysdata.net';
  var onPages = /\.github\.io$/i.test(location.hostname);
  window.KU_API_BASE = onPages ? KU_BACKEND_URL.replace(/\/+$/, '') : '';
})();
