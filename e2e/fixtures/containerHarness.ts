import { expect, type Locator, type Page } from '@playwright/test';

export async function setTicketContainerWidth(page: Page, widthPx: number): Promise<void> {
  const root = page.locator('.orders-kds-root:has(> section.order-ticket)').first();
  await root.waitFor({ state: 'visible' });
  await root.evaluate((el, width) => {
    const htmlEl = el as HTMLElement;
    htmlEl.style.width = `${width}px`;
    htmlEl.style.maxWidth = `${width}px`;
    htmlEl.style.margin = '0 auto';
  }, widthPx);
}

export async function assertNoHorizontalOverflow(locator: Locator, label: string): Promise<void> {
  const metrics = await locator.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(
    metrics.scrollWidth,
    `${label} desborda horizontalmente (scrollWidth=${metrics.scrollWidth} > clientWidth=${metrics.clientWidth})`,
  ).toBeLessThanOrEqual(metrics.clientWidth);
}

export async function assertMinTouchBox(
  locator: Locator,
  minHeightPx: number,
  minWidthPx = 44,
): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, 'Elemento visible sin boundingBox').not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(minHeightPx);
  expect(box!.width).toBeGreaterThanOrEqual(minWidthPx);
}

export async function dispatchMenuAddItem(
  page: Page,
  eventName: 'fmat:orden:add-item' | 'fmat:comanda:add-item',
  detail: {
    readonly dishId?: string;
    readonly sourceId?: string;
    readonly offerId?: string;
    readonly name: string;
    readonly quantity?: number;
    readonly unitPrice?: number;
    readonly modifiers?: string[];
    readonly notes?: string;
  },
): Promise<void> {
  await page.evaluate(
    ({ evName, payload }) => {
      window.dispatchEvent(new CustomEvent(evName, { detail: payload }));
    },
    { evName: eventName, payload: detail },
  );
}
