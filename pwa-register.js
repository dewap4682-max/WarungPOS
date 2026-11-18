if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(err => console.warn('Service worker tidak aktif', err)));
}
