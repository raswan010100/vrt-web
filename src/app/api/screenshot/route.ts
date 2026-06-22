import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let body: { url: string; width: number; height: number; hideSelectors?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body tidak valid.' }, { status: 400 });
  }

  const { url, width, height, hideSelectors = [] } = body;

  if (!url || !url.startsWith('http')) {
    return NextResponse.json(
      { error: 'URL harus dimulai dengan http:// atau https://' },
      { status: 400 }
    );
  }

  if (!width || !height) {
    return NextResponse.json({ error: 'Width dan height wajib diisi.' }, { status: 400 });
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.setViewportSize({ width, height });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => document.fonts.ready);

    // Scroll ke bawah secara bertahap agar lazy-load konten ter-trigger
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 400;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= document.body.scrollHeight) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }
        }, 100);
      });
    });
    await page.waitForTimeout(500);

    // Sembunyikan elemen dinamis (CSS selector ATAU XPath) sebelum screenshot
    if (hideSelectors.length > 0) {
      await page.evaluate((selectors: string[]) => {
        selectors.forEach((selector) => {
          try {
            // XPath jika diawali "/" atau "(", selain itu diperlakukan sebagai CSS
            const isXPath = selector.startsWith('/') || selector.startsWith('(');
            if (isXPath) {
              const result = document.evaluate(
                selector,
                document,
                null,
                XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                null
              );
              for (let i = 0; i < result.snapshotLength; i++) {
                const node = result.snapshotItem(i);
                if (node instanceof HTMLElement) node.style.visibility = 'hidden';
              }
            } else {
              document.querySelectorAll(selector).forEach((el) => {
                (el as HTMLElement).style.visibility = 'hidden';
              });
            }
          } catch {
            /* selector tidak valid — lewati agar tidak menggagalkan screenshot */
          }
        });
      }, hideSelectors);
    }

    const screenshotBuffer = await page.screenshot({
      fullPage: true,
      animations: 'disabled',
    });

    await browser.close();
    browser = undefined;

    return NextResponse.json({
      screenshot: `data:image/png;base64,${screenshotBuffer.toString('base64')}`,
      width,
      height,
    });
  } catch (err) {
    browser?.close();
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Gagal mengambil screenshot: ${message}` },
      { status: 500 }
    );
  }
}
