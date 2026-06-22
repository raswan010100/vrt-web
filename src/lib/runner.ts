import type { Page } from 'playwright';
import { runSteps } from './steps';
import type { ActionStep, AssertionInput, AssertionResult } from './report';

export interface CheckpointInput {
  steps: ActionStep[];
  hideSelectors: string[];
  assertions: AssertionInput[];
}

/**
 * Untuk satu checkpoint pada halaman yang SUDAH dibuka:
 *  1. jalankan langkah (login/navigasi)
 *  2. tunggu font + scroll (lazy load)
 *  3. evaluasi assertion (baca textContent SEBELUM hide)
 *  4. sembunyikan elemen dinamis
 *  5. ambil screenshot full page
 *
 * Browser/page yang sama dipakai lintas checkpoint sehingga state (login dsb) terbawa.
 */
export async function captureCheckpoint(
  page: Page,
  input: CheckpointInput
): Promise<{ buffer: Buffer; assertionResults: AssertionResult[] }> {
  // 1. langkah sebelum checkpoint
  if (input.steps.length > 0) {
    await runSteps(page, input.steps);
    await page.waitForTimeout(1500);
  }

  // 2. font + scroll bertahap
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let total = 0;
      const dist = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, dist);
        total += dist;
        if (total >= document.body.scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 100);
    });
  });
  await page.waitForTimeout(500);

  // 3. assertion (baca teks sebelum elemen disembunyikan)
  const assertionResults: AssertionResult[] =
    input.assertions.length === 0
      ? []
      : await page.evaluate((items: AssertionInput[]) => {
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
        }, input.assertions);

  // 4. hide elemen dinamis (CSS atau XPath)
  if (input.hideSelectors.length > 0) {
    await page.evaluate((selectors: string[]) => {
      selectors.forEach((selector) => {
        try {
          const isXPath = selector.startsWith('/') || selector.startsWith('(');
          if (isXPath) {
            const result = document.evaluate(selector, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
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
          /* selector tidak valid — lewati */
        }
      });
    }, input.hideSelectors);
  }

  // 5. screenshot
  const buffer = await page.screenshot({ fullPage: true, animations: 'disabled' });
  return { buffer, assertionResults };
}
