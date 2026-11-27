// Service worker del panel (/administracion): solo recibe los avisos push y abre el panel al tocarlos. No guarda nada en caché.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data && event.data.text() } }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Autogestiva', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/administracion/hoy' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/administracion/hoy', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.location.origin + '/administracion'))
      return open ? open.navigate(url).then((w) => (w || open).focus()) : self.clients.openWindow(url)
    }),
  )
})
