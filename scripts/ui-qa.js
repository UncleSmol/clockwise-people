#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const command = args[0] || 'help';
const isWindows = process.platform === 'win32';

function buildCommand(baseCmd, env = {}) {
  if (isWindows) {
    const envParts = Object.entries(env).map(([k, v]) => `set ${k}=${v}&&`).join(' ');
    return `${envParts} ${baseCmd}`;
  }
  const envParts = Object.entries(env).map(([k, v]) => `${k}=${v}`).join(' ');
  return `${envParts} ${baseCmd}`;
}

const usePnpm = fs.existsSync('pnpm-lock.yaml') || fs.existsSync('pnpm-workspace.yaml');
const pkgMgr = usePnpm ? 'pnpm' : 'npx';

const commands = {
  'visual': buildCommand(`${pkgMgr} playwright test --project=chromium --grep="visual"`),
  'visual:all': buildCommand(`${pkgMgr} playwright test`, { PLAYWRIGHT_VISUAL: 'true' }),
  'visual:update': buildCommand(`${pkgMgr} playwright test --update-snapshots`, { PLAYWRIGHT_VISUAL: 'true' }),
  'a11y': buildCommand(`${pkgMgr} playwright test --project=chromium --grep="accessibility"`),
  'a11y:report': buildCommand(`${pkgMgr} playwright test --project=chromium --grep="accessibility" --reporter=html`),
  'storybook': buildCommand(`${pkgMgr} playwright test --project=chromium tests/visual/storybook`),
  'all': buildCommand(`${pkgMgr} playwright test`, { PLAYWRIGHT_VISUAL: 'true' }),
  'ci': buildCommand(`${pkgMgr} playwright test --reporter=html,json`, { PLAYWRIGHT_VISUAL: 'true' }),
  'report': buildCommand(`${pkgMgr} playwright show-report`),
  'install': buildCommand(`${pkgMgr} playwright install`),
  'help': () => {
    console.log(`
UI QA Test Runner

Usage: node scripts/ui-qa.js <command>

Commands:
  visual        Run visual regression tests (chromium only)
  visual:all    Run visual tests across all browsers and viewports
  visual:update Update visual snapshots
  a11y          Run accessibility tests (chromium only)
  a11y:report   Run accessibility tests with HTML report
  storybook     Run Storybook component visual tests
  all           Run all tests (visual + a11y + storybook)
  ci            Run all tests for CI (with reports)
  report        Show Playwright HTML report
  install       Install Playwright browsers
  help          Show this help

Environment Variables:
  PLAYWRIGHT_BASE_URL     Base URL for tests (default: http://localhost:3000)
  PLAYWRIGHT_VISUAL       Enable visual regression testing (default: false)
  STORYBOOK_URL           Storybook URL (default: http://localhost:6006)
  CI                      Set to 'true' in CI environments
`);
  },
};

function run(cmd) {
  try {
    execSync(cmd, { stdio: 'inherit', shell: true });
  } catch (error) {
    process.exit(1);
  }
}

if (commands[command]) {
  const cmd = commands[command];
  if (typeof cmd === 'function') {
    cmd();
  } else {
    run(cmd);
  }
} else {
  console.error(`Unknown command: ${command}`);
  commands.help();
  process.exit(1);
}