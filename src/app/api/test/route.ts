import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { compareImages } from '@/lib/compare';

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
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);

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
    });
  } catch (err) {
    browser?.close();
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Gagal mengambil screenshot: ${message}` }, { status: 500 });
  }
}
