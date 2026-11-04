import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const [mode, ...args] = process.argv.slice(2);
if (!['capture', 'compare'].includes(mode)) {
  console.error('usage: visual-baseline.mjs capture <dir> [baseUrl] | compare <baselineDir> <dir> [baseUrl]');
  process.exit(2);
}
const baselineDir = mode === 'compare' ? args[0] : undefined;
const outputDir = mode === 'compare' ? args[1] : args[0];
const baseUrl = (mode === 'compare' ? args[2] : args[1]) ?? 'http://localhost:5173';

const devices = {
  desktop: { viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
};

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});

async function newContext(device) {
  const context = await browser.newContext({ ...devices[device], reducedMotion: 'reduce', colorScheme: 'dark' });
  await context.addInitScript(() => {
    const frozen = 1000;
    performance.now = () => frozen;
    try {
      localStorage.setItem('shaderlab:version', '1');
      localStorage.setItem('shaderlab:tutorial-completed:v1', 'true');
      localStorage.setItem('mode-watcher-mode', 'dark');
    } catch {}
  });
  return context;
}

async function routes() {
  const context = await newContext('desktop');
  const page = await context.newPage();
  const found = ['/', '/tasks/', '/teach/', '/pipeline/'];
  for (const list of ['/tasks/', '/teach/']) {
    await page.goto(baseUrl + list, { waitUntil: 'networkidle' });
    const links = await page.$$eval('a[href]', anchors => anchors.map(anchor => new URL(anchor.href).pathname));
    for (const link of links) if (/^\/(task|teach)\/[^/]+\/$/.test(link) && !found.includes(link)) found.push(link);
  }
  await context.close();
  return found;
}

async function settle(page) {
  await page.waitForFunction(() => !document.querySelector('[aria-label^="Loading"], .loading-overlay'), null, { timeout: 60_000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
}

function fileName(route, device) {
  const name = route === '/' ? 'home' : route.replace(/^\/|\/$/g, '').replaceAll('/', '_');
  return `${name}.${device}.png`;
}

async function capture() {
  await mkdir(outputDir, { recursive: true });
  const report = {};
  const list = await routes();
  for (const device of Object.keys(devices)) {
    const context = await newContext(device);
    for (const route of list) {
      const page = await context.newPage();
      const messages = [];
      page.on('console', message => { if (['error', 'warning'].includes(message.type())) messages.push(`${message.type()}: ${message.text()}`); });
      page.on('pageerror', error => messages.push(`pageerror: ${error.message}`));
      await page.goto(baseUrl + route, { waitUntil: 'load' });
      await settle(page);
      await page.screenshot({ path: path.join(outputDir, fileName(route, device)) });
      if (device === 'mobile' && await page.$('.workspace-layout')) {
        await page.$eval('.workspace-layout', element => { element.scrollTop = element.scrollHeight; });
        await settle(page);
        await page.screenshot({ path: path.join(outputDir, fileName(route, 'mobile-end')) });
      }
      const editor = await page.$$eval('.monaco-editor .view-line', lines => lines.map(line => line.textContent.replace(/\u00a0/g, ' ')).join('\n'));
      const tabs = await page.$$eval('[data-tutorial="editor"] [role="tab"]', tabs => tabs.map(tab => tab.textContent.trim()));
      report[`${device} ${route}`] = { messages, tabs, editor };
      await page.close();
      process.stdout.write('.');
    }
    await context.close();
  }
  await writeFile(path.join(outputDir, 'console.json'), JSON.stringify(report, null, 2));
  console.log(`\ncaptured ${list.length} routes × ${Object.keys(devices).length} devices into ${outputDir}`);
  return list;
}

async function compare(list) {
  const failures = [];
  const beforeReport = JSON.parse(await readFile(path.join(baselineDir, 'console.json'), 'utf8'));
  const afterReport = JSON.parse(await readFile(path.join(outputDir, 'console.json'), 'utf8'));
  for (const [key, before] of Object.entries(beforeReport)) {
    const after = afterReport[key];
    if (!after) { failures.push(`${key}: missing`); continue; }
    if (before.editor !== after.editor) failures.push(`${key}: editor text differs`);
    if (JSON.stringify(before.tabs) !== JSON.stringify(after.tabs)) failures.push(`${key}: editor tabs ${before.tabs} → ${after.tabs}`);
    const newMessages = after.messages.filter(message => !before.messages.includes(message));
    if (newMessages.length) failures.push(`${key}: new console messages:\n    ${newMessages.join('\n    ')}`);
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  for (const device of [...Object.keys(devices), 'mobile-end']) {
    for (const route of list) {
      const name = fileName(route, device);
      if (device === 'mobile-end' && !existsSync(path.join(baselineDir, name)) && !existsSync(path.join(outputDir, name))) continue;
      const before = path.join(baselineDir, name);
      const after = path.join(outputDir, name);
      if (!existsSync(before)) { failures.push(`${name}: no baseline`); continue; }
      const [a, b] = await Promise.all([readFile(before), readFile(after)]);
      const result = await page.evaluate(async ([a, b]) => {
        const load = async base64 => createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
        const [imageA, imageB] = await Promise.all([load(a), load(b)]);
        if (imageA.width !== imageB.width || imageA.height !== imageB.height) return { sizeMismatch: `${imageA.width}x${imageA.height} vs ${imageB.width}x${imageB.height}` };
        const pixels = image => {
          const canvas = new OffscreenCanvas(image.width, image.height);
          const context = canvas.getContext('2d');
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, image.width, image.height).data;
        };
        const pa = pixels(imageA), pb = pixels(imageB);
        let different = 0;
        for (let i = 0; i < pa.length; i += 4) {
          const delta = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
          if (delta > 24) different++;
        }
        return { ratio: different / (pa.length / 4) };
      }, [a.toString('base64'), b.toString('base64')]);
      if (result.sizeMismatch) failures.push(`${name}: size ${result.sizeMismatch}`);
      else if (result.ratio > 0.002) failures.push(`${name}: ${(result.ratio * 100).toFixed(2)}% of pixels differ`);
    }
  }
  await context.close();
  return failures;
}

const list = await capture();
if (mode === 'compare') {
  const failures = await compare(list);
  console.log(failures.length ? `DIFFERENCES:\n${failures.join('\n')}` : 'all screenshots match');
  process.exitCode = failures.length ? 1 : 0;
}
await browser.close();
