// Logo de Autogestiva: la "A" (con el cursor naranja) es la primera letra de la palabra.
// Se dibuja en SVG; "utogestiva" usa la tipografía Space Grotesk cargada en el layout (--font-space).
const BLUE = "#0057b8"
const ORANGE = "#f97316"
const INK = "#0b1322"
const LEGS = "M0 40 L15.5 0 H24.5 L40 40 H30.5 L20 13 L9.5 40 Z"
const CURSOR = "M19 22 V37.5 l3.9-3.7 2.9 6 2.8-1.4-2.9-5.9 h5.3z"

// Medidas con la letra en 36 px: alto de mayúscula 25.2, A afinada al 90 %
const FS = 36
const S = (0.7 * FS) / 40
const AW = 40 * S * 0.9
const TEXT_X = 2 + AW - 0.045 * FS
// shortcut: ancho del texto medido a mano con Space Grotesk 700; si cambia la tipografía hay que volver a medirlo
const TEXT_W = 177

export function Logo({
  dark = false,
  tagline = false,
  bg,
  className = "",
}: {
  dark?: boolean
  /** "web y sistemas · Córdoba" debajo del nombre */
  tagline?: boolean
  /** color de fondo donde se apoya, para el borde del cursor */
  bg?: string
  className?: string
}) {
  const aColor = dark ? "#7fb4f0" : BLUE
  const ink = dark ? "#ffffff" : INK
  const outline = bg ?? (dark ? INK : "#ffffff")
  const width = TEXT_X + TEXT_W + 2
  const height = tagline ? 72 : 50
  return (
    <svg
      viewBox={`0 0 ${width.toFixed(1)} ${height}`}
      role="img"
      aria-label="Autogestiva"
      className={`w-auto ${className}`}
    >
      <g transform={`translate(2 ${(40 - 0.7 * FS).toFixed(2)})`}>
        <g transform={`scale(${(S * 0.9).toFixed(4)} ${S.toFixed(4)})`}>
          <path d={LEGS} fill={aColor} />
        </g>
        <g transform={`translate(${(AW / 2).toFixed(2)} 0) scale(${S.toFixed(4)}) translate(-20 0)`}>
          <path
            transform="translate(-4.4 -6) scale(1.2)"
            d={CURSOR}
            fill={ORANGE}
            stroke={outline}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </g>
      </g>
      <text
        x={TEXT_X.toFixed(2)}
        y="40"
        fontSize={FS}
        fontWeight="700"
        letterSpacing={(-0.03 * FS).toFixed(2)}
        fill={ink}
        style={{ fontFamily: "var(--font-space), 'Space Grotesk', system-ui, sans-serif" }}
      >
        utogestiva
      </text>
      {tagline && (
        <text
          x="4"
          y="62"
          fontSize="12.5"
          fontWeight="500"
          letterSpacing=".4"
          fill={dark ? "#9fb2cc" : "#5b6475"}
          style={{ fontFamily: "var(--font-space), 'Space Grotesk', system-ui, sans-serif" }}
        >
          web y sistemas · Córdoba
        </text>
      )}
    </svg>
  )
}
