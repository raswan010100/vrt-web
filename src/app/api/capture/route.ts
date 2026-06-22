import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { captureCheckpoint } from '@/lib/runner';
import type { ActionStep } from '@/lib/report';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface CheckpointBody {
  name: string;
  steps: ActionStep[];
  hideSelectors: string[];
}

/**
 * Jalankan seluruh journey SEKALI dalam satu sesi browser, lalu kembalikan
 * screenshot tiap checkpoint untuk dijadikan baseline.
 */
export async function POST(request: NextRequest) {
  let body: { url: string; width: number; height: number; checkpoints: CheckpointBody[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body tidak valid.' }, { status: 400 });
  }

  const { url, width, height, checkpoints } = body;

  if (!url || !url.startsWith('http')) {
    return NextResponse.json({ error: 'URL harus dimulai dengan http:// atau https://' }, { status: 400 });
  }
  if (!width || !height) {
    return NextResponse.json({ error: 'Width dan height wajib diisi.' }, { status: 400 });
  }
  if (!checkpoints || checkpoints.length === 0) {
    return NextResponse.json({ error: 'Minimal harus ada 1 checkpoint.' }, { status: 400 });
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width, height });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1000);

    const shots: string[] = [];
    for (const cp of checkpoints) {
      const { buffer } = await captureCheckpoint(page, {
        steps: cp.steps ?? [],
        hideSelectors: cp.hideSelectors ?? [],
        assertions: [],
      });
      shots.push(`data:image/png;base64,${buffer.toString('base64')}`);
    }

    await browser.close();
    browser = undefined;

    return NextResponse.json({ shots });
  } catch (err) {
    browser?.close();
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Gagal capture journey: ${message}` }, { status: 500 });
  }
}
