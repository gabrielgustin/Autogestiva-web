import type { Metadata } from "next"

// El panel es privado: no debe aparecer en buscadores.
export const metadata: Metadata = {
  title: { default: "Administración | Autogestiva", template: "%s | Autogestiva" },
  robots: { index: false, follow: false },
  // Se puede instalar como app en el celular (avisos diarios y acceso directo a «Hoy»).
  manifest: "/administracion.webmanifest",
  appleWebApp: { capable: true, title: "Autogestiva", statusBarStyle: "default" },
}

export default function AdministracionLayout({ children }: { children: React.ReactNode }) {
  return children
}
