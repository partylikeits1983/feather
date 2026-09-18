import { test, expect } from '@playwright/test';

test('scratchpad, live math, themes, views, shortcuts, and persistence', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A little room to think.' })).toBeVisible();
  await expect(page.locator('.katex')).toHaveCount(2);
  await page.screenshot({ path: 'artifacts/feather-light.png' });
  const source = page.getByRole('textbox', { name: 'Markdown source' });
  await source.fill('# A new thought\n\nInline $x^2$ and a [link](https://example.com).\n\n$$\nf(x) = x + 1\n$$');
  await expect(page.getByRole('heading', { name: 'A new thought' })).toBeVisible();
  await expect(page.locator('.katex')).toHaveCount(2);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('.popover-dismiss').click({ position: { x: 20, y: 200 } });
  await page.getByRole('button', { name: 'Preview view', exact: true }).click();
  await expect(page.locator('.source-pane')).toBeHidden();
  await page.getByRole('button', { name: 'Source view', exact: true }).click();
  await expect(page.locator('.preview-pane')).toHaveCount(0);
  await page.getByRole('button', { name: 'Split view', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A new thought' })).toBeVisible();
  await page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+s');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('feather.scratchpad'))).toContain('A new thought');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'A new thought' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(errors).toEqual([]);
});

test('dark welcome, resizing, and source jump', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' }); await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A little room to think.' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/feather-dark.png' });
  const separator = page.getByRole('separator', { name: 'Resize editor and preview' });
  await separator.focus(); await page.keyboard.press('ArrowLeft');
  await expect(separator).toHaveAttribute('aria-valuenow', '48');
  await page.getByRole('heading', { name: 'Just you and your words' }).dblclick();
  await expect(page.getByRole('textbox', { name: 'Markdown source' })).toBeFocused();
});

test('Vim toggle preserves text, Escape returns to Normal, navigation and insert work', async ({ page }) => {
  await page.goto('/');
  const source = page.getByRole('textbox', { name: 'Markdown source' });
  await source.fill('first line\nsecond line\nthird line');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('switch', { name: 'Vim mode' }).check();
  await page.locator('.popover-dismiss').click({ position: { x: 20, y: 200 } });
  await expect(page.getByText('--NORMAL--', { exact: true })).toBeVisible();
  await source.focus();
  await page.keyboard.type('ggji');
  await expect(page.getByText('--INSERT--', { exact: true })).toBeVisible();
  await page.keyboard.type('inserted ');
  await page.keyboard.press('Escape');
  await expect(page.getByText('--NORMAL--', { exact: true })).toBeVisible();
  await expect(source).toContainText('inserted second line');
  await page.keyboard.type('dd');
  await expect(source).not.toContainText('second line');
  await page.keyboard.type('u');
  await expect(source).toContainText('inserted second line');
  await page.keyboard.type(':w'); await page.keyboard.press('Enter');
  await page.reload();
  await expect(page.getByText('--NORMAL--', { exact: true })).toBeVisible();
  await expect(source).toContainText('inserted second line');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('switch', { name: 'Vim mode' }).uncheck();
  await page.locator('.popover-dismiss').click({ position: { x: 20, y: 200 } });
  await expect(page.getByText('--NORMAL--', { exact: true })).toHaveCount(0);
  await source.focus(); await page.keyboard.type('ordinary typing');
  await expect(source).toContainText('ordinary typing');
});

test('Vim owns Escape in Insert, Visual and Normal modes while Zen remains active', async ({ page }) => {
  await page.goto('/');
  const source = page.getByRole('textbox', { name: 'Markdown source' });
  await source.fill('first line\nsecond line');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('switch', { name: 'Vim mode' }).check();
  await page.locator('.popover-dismiss').click({ position: { x: 20, y: 200 } });
  await expect(page.getByText('--NORMAL--', { exact: true })).toBeVisible();
  await source.focus(); await page.keyboard.press('ControlOrMeta+j');
  const escape = () => source.evaluate(element => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true });
    element.dispatchEvent(event); return event.defaultPrevented;
  });
  await page.keyboard.type('ggiadded ');
  await expect(page.getByText('--INSERT--', { exact: true })).toBeVisible();
  expect(await escape()).toBe(true);
  await expect(page.getByText('--NORMAL--', { exact: true })).toBeVisible();
  await page.keyboard.type('v');
  await expect(page.getByText('--VISUAL--', { exact: true })).toBeVisible();
  expect(await escape()).toBe(true);
  await expect(page.getByText('--NORMAL--', { exact: true })).toBeVisible();
  // An extra Escape in Normal must not fall through to macOS fullscreen exit.
  expect(await escape()).toBe(true);
  expect(await escape()).toBe(true);
  await expect(page.locator('.app-header')).toBeHidden();
  await expect(source).toContainText('added first line');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('switch', { name: 'Vim mode' }).uncheck();
  await page.locator('.popover-dismiss').click({ position: { x: 20, y: 200 } });
  await expect(page.getByText('--NORMAL--', { exact: true })).toHaveCount(0);
  await source.focus();
  expect(await escape()).toBe(false);
});

test('GitHub is the default profile and scratchpad edits require an explicit save', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-profile', 'github');
  await page.getByRole('textbox', { name: 'Markdown source' }).fill('# Pending scratchpad');
  await page.waitForTimeout(750);
  expect(await page.evaluate(() => localStorage.getItem('feather.scratchpad'))).toBeNull();
  await expect(page.getByRole('img', { name: 'Unsaved changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Save file', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Unsaved changes' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('feather.scratchpad'))).toBe('# Pending scratchpad');
});

test('dragging Markdown text visibly selects it and mirrors the selection and caret in preview', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const source = page.getByRole('textbox', { name: 'Markdown source' });
  await source.fill('Alpha beta gamma\n\nSecond **bold** and `code` paragraph.');
  await expect(page.locator('.markdown-body p').first()).toHaveText('Alpha beta gamma');
  const bounds = await source.locator('.cm-line').first().evaluate(element => {
    const text = element.firstChild!;
    const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 10);
    const rect = range.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  await page.mouse.move(bounds.x + 1, bounds.y + bounds.height / 2); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width, bounds.y + bounds.height / 2, { steps: 12 }); await page.mouse.up();
  await expect(page.locator('.cm-selectionBackground').first()).toBeVisible();
  await expect(page.locator('.preview-selection').first()).toBeVisible();
  const activeBackground = await source.locator('.cm-activeLine').evaluate(element => getComputedStyle(element).backgroundColor);
  expect(activeBackground).toMatch(/(?:0\.4|40%)/);
  await page.screenshot({ path: 'artifacts/feather-source-selection.png' });
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.preview-caret')).toBeVisible();
  const first = await page.locator('.preview-caret').boundingBox();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await page.locator('.preview-caret').boundingBox())?.x).toBeLessThan(first!.x);
  await page.screenshot({ path: 'artifacts/feather-preview-cursor.png' });
  expect(errors).toEqual([]);
});

test('preview selection mirrors exact Markdown text across formatting and repeated paragraphs', async ({ page }) => {
  await page.goto('/');
  const source = page.getByRole('textbox', { name: 'Markdown source' });
  await source.fill('Same **bold** &amp; `code`.\n\nSame **bold** &amp; `code`.');
  await expect(page.locator('.markdown-body p')).toHaveCount(2);
  const bounds = await page.locator('.markdown-body p').nth(1).evaluate(element => {
    const range = document.createRange(); range.setStart(element.firstChild!.firstChild!, 0); range.setEnd(element.firstChild!.firstChild!, 4);
    const rect = range.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  await page.mouse.move(bounds.x + .1, bounds.y + bounds.height / 2); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - .1, bounds.y + bounds.height / 2, { steps: 10 }); await page.mouse.up();
  await expect(page.locator('.cm-preview-selection')).toHaveText('Same');
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('Same');
  await page.locator('.markdown-body p').nth(1).evaluate(element => {
    const start = element.querySelector('strong span')!.firstChild!;
    const end = element.querySelector('code')!.firstChild!;
    const selection = window.getSelection()!; selection.removeAllRanges();
    const range = document.createRange(); range.setStart(start, 1); range.setEnd(end, 3); selection.addRange(range);
  });
  await expect(page.locator('.cm-preview-selection')).toHaveText('old** &amp; `cod');
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('old & cod');
  await page.screenshot({ path: 'artifacts/feather-preview-selection.png' });
  // Keyboard selection in the source replaces the preview's mirrored decoration.
  await source.focus(); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Shift+ArrowRight');
  await expect(page.locator('.cm-preview-selection')).toHaveCount(0);
  await expect(page.locator('.preview-selection').first()).toBeVisible();
  await source.fill('Replacement');
  await expect(page.locator('.markdown-body p')).toHaveText(['Replacement']);
  await expect(page.locator('.cm-preview-selection')).toHaveCount(0);
});
