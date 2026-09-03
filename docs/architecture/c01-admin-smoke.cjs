// 仅验证开发态登录页加载，不登录或发送真实用户数据。
const fs = require('node:fs');
(async () => {
  const { chromium } = require(process.env.C01_PLAYWRIGHT_PATH);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    const response = await page.goto('http://127.0.0.1:33317/', {
      waitUntil: 'networkidle',
      timeout: 20000,
    });
    const result = {
      at: new Date().toISOString(),
      status: response.status(),
      url: page.url(),
      title: await page.title(),
      text: await page.locator('body').innerText(),
      errors,
    };
    fs.writeFileSync('docs/audit-logs/44-admin-browser.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
