/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // La página de tiendas online se dio de baja: quien llegue desde Google va a páginas web
  // Panel: no se puede mostrar dentro de otros sitios (evita que engañen con clics encima) ni filtra la dirección al salir.
  async headers() {
    const panel = [
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ]
    return [
      { source: '/administracion/:path*', headers: panel },
      { source: '/api/administracion/:path*', headers: [...panel, { key: 'Cache-Control', value: 'no-store' }] },
    ]
  },
  async redirects() {
    return [{ source: "/tiendas-online", destination: "/paginas-web-cordoba", permanent: true }]
  },
  devIndicators: false,
  images: {
    unoptimized: true,
  },
}

export default nextConfig
