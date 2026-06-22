import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { compareImages } from '@/lib/compare';
import type { AssertionResult } from '@/lib/report';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const start = Date.now();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Gagal membaca form data.' }, { status: 400 });
  }

  const baselineFile = formData.get('baseline') as File | null;
  const url = formData.get('url') as string | null;
  const width = Number(formData.get('width'));
  const height = Number(formData.get('height'));
  const viewportName = (formData.get('viewportName') as string) || 'custom';
  const threshold = Number(formData.get('threshold') ?? 0.1);
  const hideSelectors: string[] = JSON.parse((formData.get('hideSelectors') as string) || '[]');
  const assertions: { selector: string; expected: string }[] = JSON.parse(
    (formData.get('assertions') as string) || '[]'
  );

  if (!baselineFile || !url || !width || !height) {
    return NextResponse.json(
      { error: 'Field wajib: baseline (file), url, width, height.' },
      { status: 400 }
    );
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return NextResponse.json(
      { error: 'URL harus dimulai dengan http:// atau https://' },
      { status: 400 }
    );
  }

  // Baca baseline sebagai buffer
  const baselineBuffer = Buffer.from(await baselineFile.arrayBuffer());

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.setViewportSize({ width, height });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => document.fonts.ready);

    // Scroll bertahap agar lazy-load konten ter-trigger
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

    // Cek konten elemen (assertion): pastikan elemen mengandung teks tertentu.
    // Dijalankan sebelum hide agar membaca konten asli halaman.
    let assertionResults: AssertionResult[] = [];
    if (assertions.length > 0) {
      assertionResults = await page.evaluate((items: { selector: string; expected: string }[]) => {
        function findEl(selector: string): Element | null {
          const isXPath = selector.startsWith('/') || selector.startsWith('(');
          if (isXPath) {
            const r = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            return (r.singleNodeValue as Element) ?? null;
          }
          return document.querySelector(selector);
        }
        return items.map((item) => {
          let el: Element | null = null;
          try {
            el = findEl(item.selector);
          } catch {
            el = null;
          }
          const actual = el ? (el.textContent || '').trim() : null;
          const found = el !== null;
          const passed = found && actual !== null && actual.includes(item.expected);
          return { selector: item.selector, expected: item.expected, actual, found, passed };
        });
      }, assertions);
    }

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
            /* selector tidak valid — lewati agar tidak menggagalkan test */
          }
        });
      }, hideSelectors);
    }

    const currentBuffer = await page.screenshot({ fullPage: true, animations: 'disabled' });

    await browser.close();
    browser = undefined;

    const result = compareImages(baselineBuffer, currentBuffer, 0.1);
    const passed = result.diffPercentage <= threshold;

    return NextResponse.json({
      passed,
      diffPercentage: result.diffPercentage,
      diffPixels: result.diffPixels,
      totalPixels: result.totalPixels,
      sizeMismatch: result.sizeMismatch,
      width: result.width,
      height: result.height,
      threshold,
      viewport: { width, height, name: viewportName },
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
      images: {
        baseline: `data:image/png;base64,${baselineBuffer.toString('base64')}`,
        current: `data:image/png;base64,${currentBuffer.toString('base64')}`,
        diff: `data:image/png;base64,${result.diffImageBuffer.toString('base64')}`,
      },
      assertionResults,
    });
  } catch (err) {
    browser?.close();
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Gagal mengambil screenshot: ${message}` }, { status: 500 });
  }
}
