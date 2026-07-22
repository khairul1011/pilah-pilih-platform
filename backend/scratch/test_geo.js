const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    permissions: ['geolocation']
  });
  const page = await context.newPage();
  await page.setContent(`
    <script>
      navigator.geolocation.getCurrentPosition(
        (pos) => console.log("SUCCESS:", pos),
        (err) => console.log("ERROR_CODE:", err.code, "MSG:", err.message),
        { timeout: 10000, enableHighAccuracy: true }
      );
    </script>
  `);
  page.on('console', msg => console.log(msg.text()));
  await page.waitForTimeout(2000);
  await browser.close();
})();
