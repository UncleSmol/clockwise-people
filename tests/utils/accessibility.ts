import { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { AxeResults } from 'axe-core';
import fs from 'fs';
import path from 'path';

type AxeNode = {
  target: unknown[];
  html: string;
  failureSummary: string | undefined;
};

type AxeViolation = {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | undefined;
  description: string;
  help: string;
  helpUrl: string;
  nodes: AxeNode[];
};

export interface AccessibilityTestOptions {
  excludedRules?: string[];
  includedTags?: string[];
  excludedTags?: string[];
  threshold?: 'minor' | 'moderate' | 'serious' | 'critical';
  detailedReport?: boolean;
  skipFrames?: boolean;
}

export interface AccessibilityViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical';
  description: string;
  help: string;
  helpUrl: string;
  nodes: Array<{
    target: string[];
    html: string;
    failureSummary: string;
  }>;
}

export async function checkAccessibility(
  page: Page,
  options: AccessibilityTestOptions = {}
): Promise<AxeResults> {
  const builder = new AxeBuilder({ page })
    .withTags(options.includedTags ?? ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']);

  if (options.excludedTags?.length) {
    builder.exclude(options.excludedTags);
  }

  if (options.excludedRules?.length) {
    builder.disableRules(options.excludedRules);
  }

  const results = await builder.analyze();
  return results;
}

export async function expectNoAccessibilityViolations(
  page: Page,
  options: AccessibilityTestOptions = {}
): Promise<void> {
  const results = await checkAccessibility(page, options);
  
  const violations = results.violations.filter((v) => {
    if (options.threshold) {
      const severityOrder = ['minor', 'moderate', 'serious', 'critical'] as const;
      const thresholdIndex = severityOrder.indexOf(options.threshold);
      return severityOrder.indexOf(v.impact as any) >= thresholdIndex;
    }
    return true;
  });

  if (violations.length > 0) {
    const violationDetails = violations.map((v) => 
      `${v.id} (${v.impact}): ${v.description}\n  ${v.helpUrl}\n  Affected nodes: ${v.nodes.length}`
    ).join('\n\n');
    
    throw new Error(
      `Accessibility violations found (${violations.length}):\n\n${violationDetails}`
    );
  }
}

export async function getAccessibilityViolations(
  page: Page,
  options: AccessibilityTestOptions = {}
): Promise<AccessibilityViolation[]> {
  const results = await checkAccessibility(page, options);
  return (results.violations as unknown as AxeViolation[]).map((v) => ({
    id: v.id,
    impact: v.impact ?? 'moderate',
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    nodes: v.nodes.map((n) => ({
      target: Array.isArray(n.target) ? n.target.map(String) : [String(n.target)],
      html: n.html,
      failureSummary: n.failureSummary ?? '',
    })),
  }));
}

export function generateAccessibilityReport(violations: AccessibilityViolation[]): string {
  if (violations.length === 0) {
    return '✅ No accessibility violations found';
  }

  const byImpact = violations.reduce((acc, v) => {
    acc[v.impact] = (acc[v.impact] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  let report = `# Accessibility Report\n\n`;
  report += `Total violations: ${violations.length}\n`;
  report += `By severity: ${Object.entries(byImpact).map(([k, v]) => `${k}: ${v}`).join(', ')}\n\n`;

  for (const violation of violations) {
    report += `## ${violation.id} (${violation.impact})\n`;
    report += `${violation.description}\n\n`;
    report += `${violation.help}\n`;
    report += `[Learn more](${violation.helpUrl})\n\n`;
    report += `### Affected elements (${violation.nodes.length}):\n`;
    for (const node of violation.nodes.slice(0, 5)) {
      report += `- \`${node.target.join(' > ')}\`\n`;
      report += `  ${node.failureSummary}\n`;
      report += `  \`${node.html.slice(0, 200)}\`\n\n`;
    }
    if (violation.nodes.length > 5) {
      report += `... and ${violation.nodes.length - 5} more\n\n`;
    }
  }

  return report;
}

export async function runAccessibilityAudit(
  page: Page,
  testName: string,
  options: AccessibilityTestOptions = {}
): Promise<{ passed: boolean; violations: AccessibilityViolation[]; report: string }> {
  const violations = await getAccessibilityViolations(page, options);
  const passed = violations.length === 0;
  const report = generateAccessibilityReport(violations);
  
  const reportDir = path.join(process.cwd(), 'test-results', 'accessibility');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  const reportPath = path.join(reportDir, `${testName.replace(/[^a-zA-Z0-9]/g, '-')}-a11y-report.md`);
  fs.writeFileSync(reportPath, report);
  
  return { passed, violations, report };
}