/* Telegram Mini App integration. Works as a normal website when opened outside Telegram. */
(function () {
  if (!/Telegram/i.test(navigator.userAgent) && !(window.Telegram && window.Telegram.WebApp)) return;

  function initializeTelegramApp() {
    const webApp = window.Telegram && window.Telegram.WebApp;
    if (!webApp) return;

    try {
      webApp.ready();
      webApp.expand();
      if (typeof webApp.setHeaderColor === 'function') webApp.setHeaderColor('#F5F8FC');
      if (typeof webApp.setBackgroundColor === 'function') webApp.setBackgroundColor('#F5F8FC');
      if (typeof webApp.setBottomBarColor === 'function') webApp.setBottomBarColor('#F5F8FC');
      document.documentElement.classList.add('telegram-mini-app');
      document.documentElement.style.setProperty('--tg-viewport-height', (webApp.viewportStableHeight || webApp.viewportHeight || window.innerHeight) + 'px');
      document.documentElement.style.setProperty('--tg-safe-top', 'env(safe-area-inset-top, 0px)');
      document.documentElement.style.setProperty('--tg-safe-bottom', 'env(safe-area-inset-bottom, 0px)');
      webApp.onEvent && webApp.onEvent('viewportChanged', function () {
        document.documentElement.style.setProperty('--tg-viewport-height', (webApp.viewportStableHeight || webApp.viewportHeight || window.innerHeight) + 'px');
      });
    } catch (error) {
      console.warn('Не удалось инициализировать Telegram Mini App:', error);
    }
  }

  if (window.Telegram && window.Telegram.WebApp) {
    initializeTelegramApp();
    return;
  }

  const sdk = document.createElement('script');
  sdk.src = 'https://telegram.org/js/telegram-web-app.js';
  sdk.async = true;
  sdk.onload = initializeTelegramApp;
  document.head.appendChild(sdk);
})();