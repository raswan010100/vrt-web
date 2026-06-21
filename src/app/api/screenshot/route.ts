import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let body: { url: string; width: number; height: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body tidak valid.' }, { status: 400 });
  }

  const { url, width, height } = body;

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
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);

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
