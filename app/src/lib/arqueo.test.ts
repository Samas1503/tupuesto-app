import { describe, expect, it } from 'vitest'
import type { Cierre, Jornada, Producto, Venta } from '../types'
import {
  cobrado,
  cruceCierre,
  despachoValor,
  diferencia,
  esperado,
  gananciaPotencial,
  mermaUnidades,
  mermaValor,
  qrEnCero,
  qrFueraDeCuenta,
  stockActual,
  totalVentas,
  vendidos,
  vendidosRegistrados,
  ventasTotal,
} from './arqueo'

// Mocks del dominio — sin DB. La fórmula es la única fuente (R13):
// esperado = fondoCaja + Σ (despacho − remanente − merma) × precio

const productos: Producto[] = [
  { id: 1, nombre: 'Choripán', precio: 550, activo: true, orden: 1 },
  { id: 2, nombre: 'Papas', precio: 300, activo: true, orden: 2 },
]

function jornada(partial: Partial<Jornada> = {}): Jornada {
  return {
    puestoId: 1,
    vendedorId: 1,
    fecha: '2026-10-21',
    fondoCaja: 0,
    despacho: [],
    estado: 'abierta',
    createdAt: 0,
    ...partial,
  }
}

function cierre(partial: Partial<Cierre> = {}): Cierre {
  return {
    remanente: [],
    merma: [],
    efectivoContado: 0,
    qrTotal: 0,
    qrDestino: 'negocio',
    cerradaAt: 0,
    ...partial,
  }
}

function venta(partial: Partial<Venta> = {}): Venta {
  return {
    jornadaId: 1,
    items: [],
    total: 0,
    metodoPago: 'efectivo',
    createdAt: 0,
    ...partial,
  }
}

describe('vendidos', () => {
  it('es despacho − remanente − merma', () => {
    const j = jornada({
      despacho: [{ productoId: 1, cantidad: 10 }],
      cierre: cierre({
        remanente: [{ productoId: 1, cantidad: 3 }],
        merma: [{ productoId: 1, cantidad: 1 }],
      }),
    })
    expect(vendidos(j, 1)).toBe(6)
  })

  it('clampa a 0 cuando remanente + merma superan el despacho', () => {
    const j = jornada({
      despacho: [{ productoId: 1, cantidad: 5 }],
      cierre: cierre({
        remanente: [{ productoId: 1, cantidad: 4 }],
        merma: [{ productoId: 1, cantidad: 3 }],
      }),
    })
    expect(vendidos(j, 1)).toBe(0)
  })

  it('sin cierre cuenta todo el despacho como vendido', () => {
    const j = jornada({ despacho: [{ productoId: 1, cantidad: 10 }] })
    expect(vendidos(j, 1)).toBe(10)
  })

  it('producto sin línea en el despacho da 0', () => {
    const j = jornada({ despacho: [{ productoId: 1, cantidad: 10 }] })
    expect(vendidos(j, 2)).toBe(0)
  })
})

describe('totalVentas / esperado / cobrado', () => {
  const j = jornada({
    fondoCaja: 5000,
    despacho: [
      { productoId: 1, cantidad: 10 }, // 10 × 550
      { productoId: 2, cantidad: 4 }, //  4 × 300
    ],
    cierre: cierre({
      remanente: [
        { productoId: 1, cantidad: 2 }, // vendidos 8
        { productoId: 2, cantidad: 1 }, // vendidos 3
      ],
      merma: [{ productoId: 2, cantidad: 1 }], // vendidos 3 → 4−1−1 = 2
      efectivoContado: 8000,
      qrTotal: 400,
    }),
  })

  it('totalVentas suma vendidos × precio por producto', () => {
    // chori: 10−2−0 = 8 × 550 = 4400; papas: 4−1−1 = 2 × 300 = 600
    expect(totalVentas(j, productos)).toBe(5000)
  })

  it('esperado es fondo + ventas', () => {
    expect(esperado(j, productos)).toBe(10000)
  })

  it('cobrado es efectivo contado + qr declarado', () => {
    expect(cobrado(j)).toBe(8400)
  })

  it('cobrado sin cierre es 0', () => {
    expect(cobrado(jornada({ fondoCaja: 5000 }))).toBe(0)
  })
})

describe('diferencia', () => {
  const base = {
    fondoCaja: 1000,
    despacho: [{ productoId: 1, cantidad: 10 }],
    cierreBase: { remanente: [{ productoId: 1, cantidad: 2 }] },
  }
  // esperado = 1000 + 8 × 550 = 5400

  it('es 0 cuando lo contado iguala lo esperado', () => {
    const j = jornada({
      ...base,
      cierre: cierre({ ...base.cierreBase, efectivoContado: 5400 }),
    })
    expect(diferencia(j, productos)).toBe(0)
  })

  it('es negativa cuando falta plata (faltante)', () => {
    const j = jornada({
      ...base,
      cierre: cierre({ ...base.cierreBase, efectivoContado: 5200 }),
    })
    expect(diferencia(j, productos)).toBe(-200)
  })

  it('es positiva cuando sobra plata (sobrante)', () => {
    const j = jornada({
      ...base,
      cierre: cierre({ ...base.cierreBase, efectivoContado: 5500 }),
    })
    expect(diferencia(j, productos)).toBe(100)
  })

  it('cuenta el QR como cobrado aunque haya ido a cuenta del vendedor', () => {
    const j = jornada({
      ...base,
      cierre: cierre({
        ...base.cierreBase,
        efectivoContado: 4400,
        qrTotal: 1000,
        qrDestino: 'vendedor',
      }),
    })
    expect(diferencia(j, productos)).toBe(0)
    expect(qrFueraDeCuenta(j)).toBe(true)
  })
})

describe('merma y despacho valuados', () => {
  const j = jornada({
    despacho: [
      { productoId: 1, cantidad: 10 },
      { productoId: 2, cantidad: 4 },
    ],
    cierre: cierre({
      merma: [
        { productoId: 1, cantidad: 2 },
        { productoId: 2, cantidad: 3 },
      ],
    }),
  })

  it('mermaValor es la merma a precio de venta', () => {
    // 2 × 550 + 3 × 300 = 1100 + 900
    expect(mermaValor(j, productos)).toBe(2000)
  })

  it('despachoValor es la mercadería cargada a precio de venta', () => {
    // 10 × 550 + 4 × 300 = 5500 + 1200
    expect(despachoValor(j, productos)).toBe(6700)
  })

  it('mermaUnidades suma unidades entre productos', () => {
    expect(mermaUnidades(j)).toBe(5)
  })

  it('sin cierre, merma es 0 en unidades y valor', () => {
    const abierta = jornada({ despacho: [{ productoId: 1, cantidad: 10 }] })
    expect(mermaUnidades(abierta)).toBe(0)
    expect(mermaValor(abierta, productos)).toBe(0)
  })
})

describe('qrFueraDeCuenta', () => {
  it('true cuando hay QR y fue a cuenta del vendedor', () => {
    const j = jornada({
      cierre: cierre({ qrTotal: 1200, qrDestino: 'vendedor' }),
    })
    expect(qrFueraDeCuenta(j)).toBe(true)
  })

  it('false cuando el QR fue a cuenta del negocio', () => {
    const j = jornada({
      cierre: cierre({ qrTotal: 1200, qrDestino: 'negocio' }),
    })
    expect(qrFueraDeCuenta(j)).toBe(false)
  })

  it('false cuando no hubo QR aunque el destino sea vendedor', () => {
    const j = jornada({
      cierre: cierre({ qrTotal: 0, qrDestino: 'vendedor' }),
    })
    expect(qrFueraDeCuenta(j)).toBe(false)
  })

  it('false sin cierre', () => {
    expect(qrFueraDeCuenta(jornada())).toBe(false)
  })
})

describe('qrEnCero', () => {
  it('true cuando el cierre declara $0 de QR', () => {
    const j = jornada({ cierre: cierre({ qrTotal: 0 }) })
    expect(qrEnCero(j)).toBe(true)
  })

  it('false cuando hubo QR', () => {
    const j = jornada({ cierre: cierre({ qrTotal: 500 }) })
    expect(qrEnCero(j)).toBe(false)
  })

  it('false sin cierre', () => {
    expect(qrEnCero(jornada())).toBe(false)
  })
})

describe('caso realista del wedge', () => {
  it('fondo 20000 + despacho 100u a $550, vuelven 10u y faltan $5000', () => {
    const j = jornada({
      fondoCaja: 20000,
      estado: 'cerrada',
      despacho: [{ productoId: 1, cantidad: 100 }],
      cierre: cierre({
        remanente: [{ productoId: 1, cantidad: 10 }],
        efectivoContado: 64500,
        qrTotal: 0,
      }),
    })

    expect(vendidos(j, 1)).toBe(90)
    expect(totalVentas(j, productos)).toBe(49500)
    expect(esperado(j, productos)).toBe(69500)
    expect(cobrado(j)).toBe(64500)
    expect(diferencia(j, productos)).toBe(-5000)
    expect(qrEnCero(j)).toBe(true)
    expect(qrFueraDeCuenta(j)).toBe(false)
  })
})

describe('ventasTotal / vendidosRegistrados', () => {
  const ventas = [
    venta({
      items: [
        { productoId: 1, cantidad: 3 },
        { productoId: 2, cantidad: 1 },
      ],
      total: 3 * 550 + 300,
      metodoPago: 'efectivo',
    }),
    venta({
      items: [{ productoId: 1, cantidad: 2 }],
      total: 2 * 550,
      metodoPago: 'qr',
    }),
  ]

  it('ventasTotal suma los totales de cada venta', () => {
    expect(ventasTotal(ventas)).toBe(3050)
    expect(ventasTotal([])).toBe(0)
  })

  it('vendidosRegistrados suma unidades del producto entre ventas', () => {
    expect(vendidosRegistrados(ventas, 1)).toBe(5)
    expect(vendidosRegistrados(ventas, 2)).toBe(1)
  })

  it('producto sin registrar da 0', () => {
    expect(vendidosRegistrados(ventas, 99)).toBe(0)
  })
})

describe('gananciaPotencial', () => {
  const j = jornada({
    despacho: [
      { productoId: 1, cantidad: 10 },
      { productoId: 2, cantidad: 4 },
    ],
  })

  it('es Σ despacho × (precio − costo)', () => {
    const conCosto: Producto[] = [
      { id: 1, nombre: 'Choripán', precio: 550, precioCosto: 380, activo: true, orden: 1 },
      { id: 2, nombre: 'Papas', precio: 300, precioCosto: 150, activo: true, orden: 2 },
    ]
    // chori: 10 × (550−380) = 1700; papas: 4 × (300−150) = 600
    expect(gananciaPotencial(j, conCosto)).toBe(2300)
  })

  it('sin precioCosto usa 0 (toda la venta es margen)', () => {
    // chori: 10 × 550 = 5500; papas: 4 × 300 = 1200
    expect(gananciaPotencial(j, productos)).toBe(6700)
  })
})

describe('stockActual', () => {
  const j = jornada({ despacho: [{ productoId: 1, cantidad: 20 }] })

  it('es despachado − vendido registrado', () => {
    const ventas = [
      venta({ items: [{ productoId: 1, cantidad: 4 }] }),
      venta({ items: [{ productoId: 1, cantidad: 3 }] }),
    ]
    expect(stockActual(j, ventas, 1)).toBe(13)
  })

  it('clampa a 0 si el registro supera lo despachado', () => {
    const ventas = [venta({ items: [{ productoId: 1, cantidad: 25 }] })]
    expect(stockActual(j, ventas, 1)).toBe(0)
  })

  it('sin ventas registradas queda todo el despacho', () => {
    expect(stockActual(j, [], 1)).toBe(20)
  })
})

describe('cruceCierre', () => {
  // conteo físico: despacho 10, vuelven 2 → vendidos 8 × 550 = 4400
  const j = jornada({
    estado: 'cerrada',
    despacho: [{ productoId: 1, cantidad: 10 }],
    cierre: cierre({ remanente: [{ productoId: 1, cantidad: 2 }] }),
  })

  it('es 0 cuando el registro iguala el conteo físico', () => {
    const ventas = [
      venta({ items: [{ productoId: 1, cantidad: 5 }] }),
      venta({ items: [{ productoId: 1, cantidad: 3 }] }),
    ]
    expect(cruceCierre(j, ventas, productos)).toBe(0)
  })

  it('es positivo cuando faltan registrar ventas', () => {
    // registró 5, el conteo dice 8 → faltan 3 × 550
    const ventas = [venta({ items: [{ productoId: 1, cantidad: 5 }] })]
    expect(cruceCierre(j, ventas, productos)).toBe(1650)
  })

  it('sin ventas registradas es todo lo vendido según conteo', () => {
    expect(cruceCierre(j, [], productos)).toBe(4400)
  })
})
