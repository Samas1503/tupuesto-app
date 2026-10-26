// Plantilla canónica de contrato de suscripción TuPuesto — versión 'contrato-v1'.
//
// generarContrato(datos) devuelve el texto legal renderizado: DETERMINÍSTICO
// (mismo input → mismo output → mismo SHA-256). No usa Date.now, random ni
// ningún dato del entorno — la fecha llega como dato (datos.fecha).
//
// Campos requeridos (faltan → throw, nunca se emite texto con {{}} sin resolver):
//   razonSocial, cuit, email, domicilio, plan, precio, fecha
// Campos opcionales del proveedor (si no vienen en datos, usan PROVEEDOR):
//   proveedorRazonSocial, proveedorCuit, proveedorDomicilio, proveedorEmail
//
// Los valores se sanitizan: trim + colapso de espacios/saltos a uno solo, para
// que un dato con '\n' no pueda inyectar líneas falsas en el texto legal.
//
// Marco: firma electrónica SIMPLE (Ley 25.506 arts. 5º y 9º — NO firma digital
// certificada arts. 6º/7º), domicilio electrónico (art. 75 CPCCN), validación
// OTP + copia por email. Ver docs/contratos.md para el modelo probatorio.

export const PLANTILLA_VERSION = 'contrato-v1'

// Datos del titular del servicio.
// TODO legal: reemplazar por razón social / CUIT / domicilio reales cuando
// exista personería o inscripción fiscal — hasta entonces el contrato
// identifica al servicio por su nombre comercial y marca el dato como
// pendiente (es preferible un marcador honesto a un dato inventado).
// Se pueden sobreescribir por contrato pasando proveedor* en `datos`.
export const PROVEEDOR = {
  razonSocial: 'Samuel Paredes',
  cuit: '20-44706400-7',
  domicilio: 'Av. Puerto Argentino Nro. 676, Barrio Malvinas Argentinas, San Salvador de Jujuy, Jujuy, Argentina',
  email: 'soporte@samas-server.com',
}

export const CAMPOS_REQUERIDOS = [
  'razonSocial',
  'cuit',
  'email',
  'domicilio',
  'plan',
  'precio',
  'fecha',
]

// Texto canónico con variables {{}}. Texto plano, \n, sin formato rico:
// el SHA-256 del documento se computa sobre estos bytes exactos.
const TEXTO = `CONTRATO DE SUSCRIPCIÓN AL SERVICIO "TUPUESTO"
Contrato de prestación de software como servicio (SaaS) — República Argentina

Versión de plantilla: contrato-v1
Fecha del documento: {{fecha}}

PARTES

Entre {{proveedorRazonSocial}}, CUIT {{proveedorCuit}}, con domicilio legal en {{proveedorDomicilio}} y correo electrónico {{proveedorEmail}}, en adelante "EL PROVEEDOR", titular del servicio de software denominado "TuPuesto"; y por la otra parte {{razonSocial}}, CUIT/DNI {{cuit}}, con domicilio legal en {{domicilio}} y correo electrónico {{email}}, en adelante "EL SUSCRIPTOR", se celebra el presente contrato de suscripción, que se regirá por las cláusulas siguientes.

CLÁUSULA PRIMERA — OBJETO
EL PROVEEDOR otorga al SUSCRIPTOR una licencia de uso no exclusiva, intransferible y revocable del servicio "TuPuesto", plataforma de software como servicio (SaaS) para la gestión de venta ambulante (despachos de mercadería, turnos de vendedores, rendición de caja y estadísticas), accesible mediante aplicación web. El presente contrato no transfiere titularidad alguna sobre el software ni sobre la plataforma.

CLÁUSULA SEGUNDA — SERVICIO MULTI-TENANT
El servicio se presta sobre infraestructura compartida multi-tenant. Los datos de cada cuenta se encuentran lógicamente aislados de los de los demás suscriptores. EL PROVEEDOR no accede a los datos operativos del SUSCRIPTOR salvo para la prestación del servicio, para soporte requerido por aquél o por obligación legal.

CLÁUSULA TERCERA — PLAN, PRECIO Y FACTURACIÓN
Plan contratado: {{plan}}. Precio: {{precio}}, abonado por adelantado en forma mensual a través de los medios de pago habilitados por EL PROVEEDOR (Mercado Pago u otro que se indique). Toda modificación de precio será notificada al domicilio electrónico del SUSCRIPTOR con no menos de treinta (30) días de anticipación y regirá a partir del período de facturación siguiente al de la notificación.

CLÁUSULA CUARTA — DURACIÓN, PERMANENCIA Y CANCELACIÓN
El contrato rige por tiempo indeterminado desde su aceptación. No existe permanencia mínima: el SUSCRIPTOR puede cancelar la suscripción en cualquier momento desde la aplicación o mediante comunicación al domicilio electrónico de EL PROVEEDOR, con efecto al vencimiento del período ya abonado y sin penalidad alguna. Cancelada la suscripción, el SUSCRIPTOR podrá solicitar la exportación de sus datos dentro de los treinta (30) días siguientes, vencido el cual podrán ser eliminados.

CLÁUSULA QUINTA — MEDIO ELECTRÓNICO Y FIRMA ELECTRÓNICA
Las partes acuerdan celebrar el presente contrato por medios electrónicos y el SUSCRIPTOR consiente expresamente su suscripción mediante firma electrónica simple, conforme la Ley 25.506. Las partes reconocen que la firma a estampar es firma electrónica simple y no firma digital en los términos de los arts. 6º y 7º de la citada ley, y convienen atribuirle al documento así firmado el valor probatorio que corresponda conforme los arts. 5º y 9º de la Ley 25.506 y los arts. 286 a 288 del Código Civil y Comercial de la Nación. Las partes se obligan a no desconocer la firma electrónica estampada por este medio.

CLÁUSULA SEXTA — MÉTODO DE VALIDACIÓN DE LA FIRMA
La firma del SUSCRIPTOR se valida mediante: (a) acceso a un enlace único enviado al correo electrónico declarado; (b) verificación por un código de un solo uso (OTP) remitido a dicho correo; (c) estampado del trazo de firma en pantalla; y (d) aceptación expresa del texto del contrato. Completado el proceso, se genera un documento íntegro del que se calcula una huella criptográfica (SHA-256) y se envía copia completa al domicilio electrónico del SUSCRIPTOR junto con la evidencia de la operación (fecha, hora y datos técnicos del registro).

CLÁUSULA SÉPTIMA — DOMICILIO ELECTRÓNICO
Conforme el art. 75 del Código Civil y Comercial de la Nación, las partes constituyen domicilio electrónico en las casillas de correo declaradas en el apartado PARTES: el SUSCRIPTOR en {{email}} y EL PROVEEDOR en {{proveedorEmail}}. Toda notificación derivada del presente contrato dirigida a dichos domicilios se tendrá por válida y oponible. Los domicilios electrónicos solo podrán modificarse mediante comunicación fehaciente cursada al domicilio electrónico vigente.

CLÁUSULA OCTAVA — INTEGRIDAD DEL DOCUMENTO
El contenido del presente contrato queda fijado en un documento canónico cuya huella SHA-256 se registra al momento de la firma. Toda alteración del texto produce una huella distinta y, por tanto, un documento distinto. La evidencia del proceso de firma (eventos, marcas de tiempo, huellas y constancias de entrega) se conserva en un registro encadenado y anclado, exportable a pedido del SUSCRIPTOR.

CLÁUSULA NOVENA — PROTECCIÓN DE DATOS PERSONALES
Los datos personales y la información comercial del SUSCRIPTOR serán tratados conforme la Ley 25.326 de Protección de Datos Personales, exclusivamente para la prestación del servicio. El SUSCRIPTOR podrá ejercer los derechos de acceso, rectificación, actualización y supresión mediante comunicación al domicilio electrónico de EL PROVEEDOR.

CLÁUSULA DÉCIMA — LEGISLACIÓN APLICABLE Y JURISDICCIÓN
El presente contrato se rige por las leyes de la República Argentina. Las partes se someten a los tribunales ordinarios competentes conforme las reglas generales de competencia, con renuncia a todo otro fuero o jurisdicción.

ACEPTACIÓN Y FIRMA

En prueba de conformidad, el SUSCRIPTOR suscribe el presente documento mediante firma electrónica simple en la fecha indicada, previa validación por código de un solo uso enviado a {{email}}.

EL SUSCRIPTOR: {{razonSocial}} — CUIT/DNI {{cuit}} — la firma electrónica se estampa en el documento final firmado.
EL PROVEEDOR: {{proveedorRazonSocial}} — aceptado por la emisión del presente documento.
`

// Texto exacto de los disclaimers del UI — misma fuente que docs/contratos.md
// (si cambia uno, cambiar el otro). T02 los muestra en la pantalla de firma.
export const DISCLAIMER_FIRMA =
  'Esta firma tiene validez de firma electrónica simple (Ley 25.506). El contrato y su evidencia quedan registrados con timestamp anclado y se envían por email.'

export const DISCLAIMER_CANVAS =
  'Firma capturada con consentimiento — documento con validez electrónica (Ley 25.506 art. 5º). No es firma digital certificada.'

// Colapsa cualquier secuencia de espacios/saltos a un solo espacio:
// evita que un dato con '\n' inyecte líneas falsas en el texto legal
// y mantiene la forma canónica estable (determinismo del hash).
function limpiar(valor) {
  return String(valor).trim().replace(/\s+/g, ' ')
}

// Renderiza el contrato. Lanza si falta un campo requerido o si queda
// algún placeholder sin resolver — nunca devuelve texto con {{}}.
export function generarContrato(datos = {}) {
  const faltantes = CAMPOS_REQUERIDOS.filter(
    (campo) => datos[campo] == null || limpiar(datos[campo]) === '',
  )
  if (faltantes.length > 0) {
    throw new Error(`generarContrato: faltan campos requeridos: ${faltantes.join(', ')}`)
  }

  const valores = {}
  for (const campo of CAMPOS_REQUERIDOS) valores[campo] = limpiar(datos[campo])

  // Validaciones blandas (warn, no throw): el campo CUIT también admite DNI y
  // el precio puede llegar con formato — se avisa en el log pero no se bloquea
  // la emisión del contrato.
  if (!/^\d{2}-\d{7,8}-\d$/.test(valores.cuit)) {
    console.warn(`generarContrato: cuit fuera del formato XX-XXXXXXXX-X: ${valores.cuit}`)
  }
  if (!Number.isFinite(Number(valores.precio))) {
    console.warn(`generarContrato: precio no numérico: ${valores.precio}`)
  }

  // Proveedor: default del módulo, sobreescribible por contrato via datos.
  const opt = (v, def) => (v != null && limpiar(v) !== '' ? limpiar(v) : def)
  valores.proveedorRazonSocial = opt(datos.proveedorRazonSocial, PROVEEDOR.razonSocial)
  valores.proveedorCuit = opt(datos.proveedorCuit, PROVEEDOR.cuit)
  valores.proveedorDomicilio = opt(datos.proveedorDomicilio, PROVEEDOR.domicilio)
  valores.proveedorEmail = opt(datos.proveedorEmail, PROVEEDOR.email)

  const renderizado = TEXTO.replace(/\{\{(\w+)\}\}/g, (match, clave) => {
    if (Object.hasOwn(valores, clave)) return valores[clave]
    throw new Error(`generarContrato: variable de plantilla sin valor: {{${clave}}}`)
  })

  return renderizado
}
