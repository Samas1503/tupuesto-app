import { chromium } from '/home/samas1503/.nvm/versions/node/v24.21.0/lib/node_modules/playwright/index.mjs'
const b = await chromium.launch()
const page = await b.newPage()
await page.goto('file://' + process.cwd() + '/manual.html')
await page.pdf({ path: 'manual-usuario-tupuesto.pdf', format: 'A4', printBackground: true })
await b.close()
console.log('PDF OK')
