import type { Page } from 'playwright';
import type { ActionStep } from './report';

/**
 * Ubah selector user menjadi format yang dimengerti Playwright.
 * XPath (diawali "/" atau "(") harus diberi prefix "xpath=".
 */
function toPlaywrightSelector(selector: string): string {
  const isXPath = selector.startsWith('/') || selector.startsWith('(');
  return isXPath ? `xpath=${selector}` : selector;
}

/**
 * Jalankan urutan langkah (login, navigasi, dll) pada halaman SEBELUM screenshot.
 * Dipakai oleh /api/screenshot dan /api/test.
 *
 * @throws Error deskriptif menyebut langkah ke berapa yang gagal.
 */
export async function runSteps(page: Page, steps: ActionStep[]): Promise<void> {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    try {
      if (step.action === 'wait') {
        await page.waitForTimeout(Number(step.value) || 1000);
        continue;
      }

      const selector = toPlaywrightSelector(step.selector);

      if (step.action === 'fill') {
        await page.fill(selector, step.value, { timeout: 15_000 });
      } else if (step.action === 'click') {
        await page.click(selector, { timeout: 15_000 });
        // Beri waktu sebentar bila klik memicu navigasi/render
        await page.waitForLoadState('domcontentloaded').catch(() => {});
      }
    } catch (err) {
      const label =
        step.action === 'wait'
          ? `tunggu ${step.value}ms`
          : `${step.action} "${step.selector}"`;
      const reason = err instanceof Error ? err.message.split('\n')[0] : String(err);
      throw new Error(`Langkah ${i + 1} (${label}) gagal: ${reason}`);
    }
  }
}
