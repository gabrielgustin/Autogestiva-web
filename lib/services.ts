// Contenido de las páginas por servicio (/paginas-web-cordoba, etc.). Cada una apunta a una búsqueda concreta.
export type Service = {
  slug: string
  /** Título de la pestaña y de Google */
  metaTitle: string
  metaDescription: string
  eyebrow: string
  h1: string
  intro: string
  includes: { title: string; text: string }[]
  /** Nombres de proyectos de lib/site-data.ts */
  projectNames: string[]
  faqs: { q: string; a: string }[]
  /** Mensaje que llega por WhatsApp al tocar "Cotizar" */
  whatsapp: string
}

export const services: Service[] = [
  {
    slug: "paginas-web-cordoba",
    metaTitle: "Diseño de páginas web en Córdoba | Autogestiva",
    metaDescription:
      "Diseñamos páginas web a medida en Córdoba: institucionales, landing pages y sitios para profesionales y empresas. Rápidas, seguras y listas para aparecer en Google.",
    eyebrow: "Páginas web a medida",
    h1: "Diseño de páginas web en Córdoba",
    intro:
      "Sitios web profesionales para empresas, estudios y comercios, pensados para aparecer en Google y convertir visitas en consultas.",
    includes: [
      { title: "Diseño a medida", text: "Con tu marca y tus colores, sin plantillas." },
      { title: "Rápida y adaptada al celular", text: "Se ve y carga bien en cualquier dispositivo." },
      { title: "Preparada para Google (SEO)", text: "SEO técnico configurado desde el inicio." },
      { title: "Formulario y WhatsApp", text: "Tus clientes te escriben directo." },
      { title: "Dominio, hosting y certificado", text: "Te la dejamos publicada y funcionando." },
      { title: "Autogestionable si lo necesitás", text: "Un panel simple para editar textos y novedades." },
    ],
    projectNames: ["Wavi", "Posty", "SEA", "Rumbo", "Santa Remera", "FA Automotores", "Jarabus", "Estudio Jurídico CONVS", "Cambel Red Jurídica", "Zonabot", "La Comanda Tejeda", "Mara Saúl Estética", "Life Gym"],
    faqs: [
      { q: "¿Cuánto cuesta una página web?", a: "Depende de las secciones y funciones que necesites. Escribinos por WhatsApp y te pasamos un presupuesto claro." },
      { q: "¿En cuánto tiempo está lista?", a: "Una página institucional o una landing suele estar lista en pocas semanas. Con más funciones, lo acordamos al presupuestar." },
      { q: "¿Trabajan solo con empresas de Córdoba?", a: "No. Estamos en Córdoba y trabajamos con clientes de toda Argentina." },
      { q: "¿La página va a aparecer en Google?", a: "Sí, la entregamos con el SEO técnico resuelto. El resto depende de la competencia y del contenido, y lo trabajamos juntos." },
      { q: "¿Podré modificar el contenido yo mismo?", a: "Sí, con un panel simple para editar textos e imágenes sin tocar código." },
    ],
    whatsapp: "Hola, quiero cotizar una página web.",
  },
  {
    slug: "sistemas-de-gestion",
    metaTitle: "Sistemas de gestión (ERP) a medida | Autogestiva",
    metaDescription:
      "Desarrollamos sistemas de gestión y ERP a medida para pymes: clientes, stock, pagos, turnos, reportes y paneles de control. Reemplazá las planillas por un sistema hecho para tu negocio.",
    eyebrow: "ERP y sistemas internos",
    h1: "Sistemas de gestión a medida para tu empresa",
    intro:
      "Reemplazá planillas y papeles por un sistema hecho a tu medida, que ordena, automatiza y te muestra todo en un solo lugar.",
    includes: [
      { title: "Gestión de clientes", text: "Fichas, historial y avisos en un solo lugar." },
      { title: "Stock, pagos y turnos", text: "Inventario, cobros, horarios o reservas." },
      { title: "Paneles y reportes", text: "Tus números claros, para decidir con datos." },
      { title: "Usuarios y permisos", text: "Cada persona ve solo lo que le corresponde." },
      { title: "Acceso desde cualquier lugar", text: "En el navegador, sin instalar nada." },
      { title: "Crece con vos", text: "Empezamos por lo urgente y sumamos módulos." },
    ],
    projectNames: ["Colegio UTN", "Gestión Jurídica", "Inventarios ITS Villada", "JARA BUS Gestión"],
    faqs: [
      { q: "¿Qué es un ERP o sistema de gestión?", a: "Un programa que reúne en un solo lugar clientes, ventas, stock, pagos, turnos y reportes." },
      { q: "¿Por qué a medida y no uno ya hecho?", a: "Un sistema genérico te obliga a adaptarte. A medida, se ajusta a cómo trabajás." },
      { q: "¿Pueden pasar mis planillas de Excel al sistema?", a: "Sí, migramos tu información para que no empieces de cero." },
      { q: "¿Cuánto tarda y cuánto cuesta?", a: "Depende de los procesos que incluya. Empezamos por un módulo acotado y vamos ampliando." },
    ],
    whatsapp: "Hola, quiero cotizar un sistema de gestión a medida.",
  },
  {
    slug: "cartas-digitales",
    metaTitle: "Cartas digitales y catálogos con QR | Autogestiva",
    metaDescription:
      "Carta digital para restaurantes, bares y cafés, y catálogos online para comercios. Con código QR, fácil de actualizar por tu cuenta y con tu marca. Desde Córdoba para todo el país.",
    eyebrow: "Cartas y catálogos digitales",
    h1: "Cartas digitales y catálogos con QR para tu negocio",
    intro:
      "Tu menú o tus productos, siempre actualizados. Cambiás precios desde un panel simple, sin reimprimir nada.",
    includes: [
      { title: "Código QR para tus mesas", text: "Escanean y ven la carta al instante." },
      { title: "Actualización inmediata", text: "Cambiá precios o marcá lo agotado en segundos." },
      { title: "Diseño con tu marca", text: "Colores y estilo propios." },
      { title: "Categorías, fotos y detalles", text: "Secciones, descripciones y promociones." },
      { title: "Pedido por WhatsApp", text: "El pedido te llega directo por WhatsApp." },
      { title: "También para comercios", text: "Funciona como catálogo de productos para cualquier negocio." },
    ],
    projectNames: ["La Comanda", "Cantina Digital", "ITS Boutique"],
    faqs: [
      { q: "¿Cuánto cuesta una carta digital?", a: "Depende del tamaño y de las funciones. Escribinos y te pasamos un presupuesto." },
      { q: "¿Puedo cambiar los precios yo mismo?", a: "Sí, desde un panel simple y sin costo extra." },
      { q: "¿Los clientes tienen que descargar una app?", a: "No. Escanean el QR y se abre en el navegador." },
      { q: "¿Sirve para un negocio que no es gastronómico?", a: "Sí, funciona como catálogo para cualquier comercio." },
    ],
    whatsapp: "Hola, quiero cotizar una carta digital.",
  },
]

export const getService = (slug: string) => services.find((s) => s.slug === slug)
