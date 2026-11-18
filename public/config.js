/* Адрес сервера (backend) портала.
 *
 * Когда портал открыт с самого сервера (alwaysdata, localhost, своя машина) — API на том же адресе, ничего менять не нужно.
 * Когда интерфейс открыт с GitHub Pages (*.github.io) — запросы идут на сервер ниже.
 *
 * При публикации на Pages (.github/workflows/deploy.yml) строка KU_BACKEND_URL подставляется автоматически:
 * переменная репозитория KU_BACKEND_URL, иначе https://<ALWAYSDATA_ACCOUNT>.alwaysdata.net.
 * Значение ниже — запасное, если ни то ни другое не задано.
 */
(function () {
  var KU_BACKEND_URL = 'https://ku-portal.alwaysdata.net';
  var onPages = /\.github\.io$/i.test(location.hostname);
  window.KU_API_BASE = onPages ? KU_BACKEND_URL.replace(/\/+$/, '') : '';
})();
