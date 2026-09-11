export default async function run(page) { await page.waitForTimeout(1300); await page.screenshot({ path: 'anim-final.png', fullPage: true }); return { done: true }; }
