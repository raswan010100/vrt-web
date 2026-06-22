import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { compareImages } from '@/lib/compare';
import { captureCheckpoint } from '@/lib/runner';
import type { ActionStep, AssertionInput, CheckpointResult } from '@/lib/report';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface CheckpointBody {
  name: string;
  steps: ActionStep[];
  hideSelectors: string[];
  assertions: AssertionInput[];
  /** Baseline data URL (image/png base64) */
  baseline: string;
}

/**
 * Jalankan journey dalam satu sesi browser. Untuk tiap checkpoint:
 * screenshot → bandingkan dengan baseline-nya → kumpulkan hasil + assertion.
 */
export async function POST(request: NextRequest) {
  const start = Date.now();

  let body: {
    url: string;
    width: number;
    height: number;
    threshold: number;
    viewportName: string;
    checkpoints: CheckpointBody[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body tidak valid.' }, { status: 400 });
  }

  const { url, width, height, threshold, viewportName, checkpoints } = body;

  if (!url || !url.startsWith('http')) {
    return NextResponse.json({ error: 'URL harus dimulai dengan http:// atau https://' }, { status: 400 });
  }
  if (!width || !height) {
    return NextResponse.json({ error: 'Width dan height wajib diisi.' }, { status: 400 });
  }
  if (!checkpoints || checkpoints.length === 0) {
    return NextResponse.json({ error: 'Minimal harus ada 1 checkpoint.' }, { status: 400 });
  }
  if (checkpoints.some((cp) => !cp.baseline)) {
    return NextResponse.json({ error: 'Semua checkpoint harus punya baseline. Jalankan "Capture Baseline" dulu.' }, { status: 400 });
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    // ignoreHTTPSErrors: izinkan server internal dengan sertifikat self-signed
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    await page.setViewportSize({ width, height });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1000);

    const results: CheckpointResult[] = [];

    for (const cp of checkpoints) {
      const { buffer, assertionResults } = await captureCheckpoint(page, {
        steps: cp.steps ?? [],
        hideSelectors: cp.hideSelectors ?? [],
        assertions: cp.assertions ?? [],
      });

      const baselineBuffer = Buffer.from(cp.baseline.split(',')[1], 'base64');
      const cmp = compareImages(baselineBuffer, buffer, 0.1);

      results.push({
        name: cp.name,
        diffPercentage: cmp.diffPercentage,
        diffPixels: cmp.diffPixels,
        totalPixels: cmp.totalPixels,
        sizeMismatch: cmp.sizeMismatch,
        passed: cmp.diffPercentage <= threshold,
        assertionResults,
        images: {
          baseline: cp.baseline,
          current: `data:image/png;base64,${buffer.toString('base64')}`,
          diff: `data:image/png;base64,${cmp.diffImageBuffer.toString('base64')}`,
        },
      });
    }

    await browser.close();
    browser = undefined;

    return NextResponse.json({
      url,
      viewport: { width, height, name: viewportName },
      threshold,
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
      results,
    });
  } catch (err) {
    browser?.close();
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Gagal menjalankan journey: ${message}` }, { status: 500 });
  }
}
