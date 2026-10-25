// Screenshots of both sides with the WeChat popup open, attached to the HTML report for a person
// to look over. They are not compared pixel by pixel (fonts and anti-aliasing differ between
// systems); the other specs assert the geometry.
import { test } from './fixtures.js';
import { open } from './helpers.js';

test.use({
  contextOptions: { reducedMotion: 'reduce' },
  // WebKit's screenshots inject a stylesheet, which the page's CSP correctly refuses. The
  // other specs take no screenshots, so they still catch any real CSP violation.
  allow: /Refused to apply a stylesheet because its hash|CSP violation: style-src-elem inline/,
});

for (const [locale, face] of [['zh-CN', '#front'], ['en-US', '#back']]) {
  test.describe(locale, () => {
    test.use({ locale });

    test('screenshot for review', async ({ page }, testInfo) => {
      await open(page);
      await page.locator(`${face} .wx button`).click();
      await page.mouse.move(1, 1);
      await page.locator(`${face} .pop`).waitFor({ state: 'visible' });
      await page.waitForTimeout(400); // let the popup's fade finish, for the picture only
      await testInfo.attach(`${testInfo.project.name} ${locale}`, { body: await page.screenshot(), contentType: 'image/png' });
    });
  });
}
