// Helpers de email HTML estilo TuPuesto (usados por request-reset y send-pin).
// Header navy #0a2540 + logo texto "TuPuesto" (la P en el accent color),
// body blanco, código/PIN en bloque grande redondeado con el accent,
// footer chico "TuPuesto — control de puestos".

// Accent color por categoría del negocio.
export const ACCENT_POR_CATEGORIA = {
  comida: '#e07a2f',
  postres: '#e04f9f',
  ropa: '#8b5cf6',
  mercaderia: '#0ea5e9',
  juguetes: '#f59e0b',
  otro: '#635bff',
  admin: '#635bff',
}

export function accentDe(categoria) {
  return ACCENT_POR_CATEGORIA[categoria] ?? ACCENT_POR_CATEGORIA.otro
}

// Escapa HTML en valores que vienen del usuario (nombre, pin, etc).
export function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]))
}

// Genera el HTML completo del email.
//   categoria: clave de ACCENT_POR_CATEGORIA (default 'otro')
//   nombre:    para el saludo "Hola <nombre>"
//   intro:     párrafo HTML de contexto (va sin escapar — lo escribe el caller)
//   codigo:    el código/PIN a mostrar en grande (se escapa)
//   codigoPie: texto chico bajo el bloque del código (HTML del caller)
//   ctaUrl/ctaTexto: botón opcional
//   nota:      disclaimer final en gris chico (HTML del caller)
export function emailHtml({
  categoria = 'otro',
  nombre,
  intro = '',
  codigo,
  codigoPie = '',
  ctaUrl,
  ctaTexto = 'Entrar a la app',
  nota = '',
} = {}) {
  const accent = accentDe(categoria)
  const saludo = nombre ? `Hola ${esc(nombre)}` : 'Hola'
  const bloqueCodigo = codigo != null && codigo !== ''
    ? `<div style="background:#f6f9fc;border-radius:14px;padding:20px 16px;text-align:center;margin:0 0 8px">
         <span style="font-size:34px;font-weight:800;letter-spacing:8px;color:${accent}">${esc(codigo)}</span>
       </div>`
    : ''
  const pie = codigoPie !== ''
    ? `<p style="margin:0 0 4px;color:#425466;font-size:14px;line-height:1.5">${codigoPie}</p>`
    : ''
  const cta = ctaUrl
    ? `<p style="text-align:center;margin:24px 0 8px">
         <a href="${esc(ctaUrl)}"
            style="background:${accent};color:#ffffff;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block">
           ${esc(ctaTexto)}
         </a>
       </p>`
    : ''
  const notaHtml = nota !== ''
    ? `<p style="margin:16px 0 0;color:#6b7c93;font-size:12px;line-height:1.5">${nota}</p>`
    : ''

  return `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f6f9fc;padding:24px 12px">
  <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden">
    <div style="background:#0a2540;padding:20px 28px">
      <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px">Tu<span style="color:${accent}">P</span>uesto</span>
    </div>
    <div style="padding:28px">
      <h2 style="margin:0 0 12px;color:#0a2540;font-size:20px">${saludo}</h2>
      <p style="margin:0 0 20px;color:#425466;font-size:14px;line-height:1.5">${intro}</p>
      ${bloqueCodigo}
      ${pie}
      ${cta}
      ${notaHtml}
    </div>
    <div style="padding:14px 28px;background:#f6f9fc;color:#8898aa;font-size:11px;text-align:center">
      TuPuesto — control de puestos
    </div>
  </div>
</div>`
}
