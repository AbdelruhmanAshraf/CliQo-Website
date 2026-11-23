import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
import {chromium} from "playwright";

const base = process.env.CLIQO_TEST_URL ?? "http://localhost:4176";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = "output/product-order-qa";
await mkdir(output, {recursive: true});
const browser = await chromium.launch({channel: "chrome"});
const routes = {catalog: "/products", stand: "/products/stand", coaster: "/products/coaster", card: "/products/card"};
try {
  const page = await browser.newPage();
  for (const [name, route] of Object.entries(routes)) {
    const response = await page.goto(base + route, {waitUntil: "domcontentloaded", timeout: 180000});
    assert.equal(response.status(), 200);
    await page.locator("main h1").waitFor();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({width, height: 900});
      const data = await page.evaluate(() => {
        const region = document.querySelector(".shop-product-main,.shop-card-grid").getBoundingClientRect();
        const cards = [...document.querySelectorAll(".shop-card")].map(card => card.getBoundingClientRect());
        const lastRow = cards.filter(card => Math.abs(card.top - cards.at(-1).top) < 1);
        const rowCenter = lastRow.length
          ? (Math.min(...lastRow.map(card => card.left)) + Math.max(...lastRow.map(card => card.right))) / 2
          : null;
        return {overflow: document.documentElement.scrollWidth - innerWidth, center: (region.left + region.right) / 2, rowCenter};
      });
      assert.equal(data.overflow, 0, name + " overflow at " + width);
      assert.ok(Math.abs(data.center - width / 2) < 2, name + " offset at " + width + " " + JSON.stringify(data));
      if (data.rowCenter !== null) assert.ok(Math.abs(data.rowCenter - width / 2) < 2, "Last card row at " + width);
      if ([390, 1440].includes(width)) await page.screenshot({path: `${output}/${name}-${width}.png`, animations: "disabled"});
      console.log("PASS", name, width, "centered and no body overflow");
    }
  }
} finally {
  await browser.close();
}
