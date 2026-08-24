import { Page, Locator, expect } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import fs from 'fs';
import path from 'path';

export interface VisualTestOptions {
  name: string;
  fullPage?: boolean;
  threshold?: number;
  maxDiffPixels?: number;
  mask?: Locator[];
  animations?: 'disabled' | 'allow';
}

export interface ViewportSize {
  name: string;
  width: number;
  height: number;
}

export const VIEWPORTS: ViewportSize[] = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'desktop-xl', width: 1920, height: 1080 },
];

const SNAPSHOT_DIR = path.join(process.cwd(), 'tests', 'visual', '__snapshots__');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getSnapshotPath(testName: string, viewportName: string): string {
  const sanitized = testName.replace(/[^a-zA-Z0-9]/g, '-');
  const dir = path.join(SNAPSHOT_DIR, sanitized);
  ensureDir(dir);
  return path.join(dir, `${viewportName}.png`);
}

export async function takeVisualSnapshot(
  page: Page,
  options: VisualTestOptions
): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) {
    throw new Error('Viewport size not set');
  }

  const viewportName = VIEWPORTS.find(
    (v) => v.width === viewport.width && v.height === viewport.height
  )?.name || `${viewport.width}x${viewport.height}`;

  const snapshotPath = getSnapshotPath(options.name, viewportName);

  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  if (options.animations === 'disabled') {
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `,
    });
  }

  if (options.mask && options.mask.length > 0) {
    for (const locator of options.mask) {
      await locator.evaluate((el) => {
        (el as HTMLElement).style.visibility = 'hidden';
      });
    }
  }

  const screenshot = await page.screenshot({
    fullPage: options.fullPage ?? true,
    animations: options.animations === 'disabled' ? 'disabled' : 'allow',
  });

  if (!fs.existsSync(snapshotPath)) {
    fs.writeFileSync(snapshotPath, screenshot);
    console.log(`Created baseline snapshot: ${snapshotPath}`);
    return;
  }

  const baseline = PNG.sync.read(fs.readFileSync(snapshotPath));
  const current = PNG.sync.read(screenshot);

  const { width, height } = baseline;
  const diff = new PNG({ width, height });

  const numDiffPixels = pixelmatch(
    baseline.data,
    current.data,
    diff.data,
    width,
    height,
    { threshold: options.threshold ?? 0.1 }
  );

  const maxDiff = options.maxDiffPixels ?? 100;
  const diffRatio = numDiffPixels / (width * height);

  if (numDiffPixels > maxDiff && diffRatio > (options.threshold ?? 0.1)) {
    const diffPath = snapshotPath.replace('.png', '-diff.png');
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
    fs.writeFileSync(snapshotPath.replace('.png', '-actual.png'), screenshot);

    throw new Error(
      `Visual regression detected for "${options.name}" at ${viewportName}: ` +
      `${numDiffPixels} pixels differ (${(diffRatio * 100).toFixed(2)}%). ` +
      `Baseline: ${snapshotPath}, Actual: ${snapshotPath.replace('.png', '-actual.png')}, Diff: ${diffPath}`
    );
  }

  if (numDiffPixels > 0) {
    fs.writeFileSync(snapshotPath, screenshot);
    console.log(`Updated snapshot for "${options.name}" at ${viewportName} (${numDiffPixels} pixels changed)`);
  }
}

export async function expectVisualMatch(
  page: Page,
  testName: string,
  options: Partial<VisualTestOptions> = {}
): Promise<void> {
  await takeVisualSnapshot(page, { name: testName, ...options });
}

export async function captureElementScreenshot(
  locator: Locator,
  name: string,
  viewportName: string
): Promise<void> {
  const screenshot = await locator.screenshot();
  const snapshotPath = getSnapshotPath(name, viewportName);
  
  if (!fs.existsSync(snapshotPath)) {
    fs.writeFileSync(snapshotPath, screenshot);
    return;
  }

  const baseline = PNG.sync.read(fs.readFileSync(snapshotPath));
  const current = PNG.sync.read(screenshot);
  const diff = new PNG({ width: baseline.width, height: baseline.height });

  const numDiffPixels = pixelmatch(baseline.data, current.data, diff.data, baseline.width, baseline.height, {
    threshold: 0.1,
  });

  if (numDiffPixels > 50) {
    const diffPath = snapshotPath.replace('.png', '-diff.png');
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
    fs.writeFileSync(snapshotPath.replace('.png', '-actual.png'), screenshot);
    throw new Error(`Element visual regression for "${name}" at ${viewportName}`);
  }
}