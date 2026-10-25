import { chromium } from '/home/samas1503/.nvm/versions/node/v24.21.0/lib/node_modules/playwright/index.mjs'

const APP = 'https://tupuesto.vercel.app/app'
const OUT = './shots'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()

const login = async (email, pin) => {
  await page.goto(APP, { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(pin)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForTimeout(2500)
}
const salir = async () => {
  await page.getByRole('button', { name: 'Salir' }).click().catch(() => {})
  await page.waitForTimeout(1200)
}
const shot = async n => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('✓', n) }
const tab = async label => {
  await page.getByRole('tab', { name: label }).click()
  await page.waitForTimeout(1500)
}

await page.goto(APP, { waitUntil: 'networkidle' })
await shot('00-login')
await login('duenio@demo.tupuesto', '0000')
await shot('01-hoy')
await tab('Despacho'); await shot('02-despacho')
await tab('Precios'); await shot('03-precios')
await tab('Puestos'); await shot('04-puestos')
await tab('Equipo'); await shot('05-equipo')
await tab('Stats'); await shot('06-stats')
await salir()
await login('marcos@demo.tupuesto', '1234')
await shot('07-midia')
await b.close()
console.log('LISTO')
