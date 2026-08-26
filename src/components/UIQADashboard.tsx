"use client";

import { useEffect, useState } from "react";

interface UIQAStatus {
  visualTests: { passed: number; failed: number; lastRun: string };
  accessibilityTests: { passed: number; failed: number; lastRun: string };
  storybookTests: { passed: number; failed: number; lastRun: string };
}

interface TestSuite {
  tests: TestCase[];
}

interface TestCase {
  title: string;
  outcome: string;
}

export function UIQADashboard() {
  const [status, setStatus] = useState<UIQAStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const resultsPath = '/test-results/results.json';
        const response = await fetch(resultsPath);
        if (response.ok) {
          const data = await response.json() as { suites: TestSuite[] };
          const tests = data.suites.flatMap((s: TestSuite) => s.tests);
          
          const visual = tests.filter((t: TestCase) => t.title.includes('visual') || t.title.includes('-mobile') || t.title.includes('-tablet') || t.title.includes('-desktop'));
          const a11y = tests.filter((t: TestCase) => t.title.includes('accessibility') || t.title.includes('a11y'));
          const storybook = tests.filter((t: TestCase) => t.title.includes('storybook'));
          
          setStatus({
            visualTests: {
              passed: visual.filter((t: TestCase) => t.outcome === 'passed').length,
              failed: visual.filter((t: TestCase) => t.outcome !== 'passed').length,
              lastRun: new Date().toLocaleString(),
            },
            accessibilityTests: {
              passed: a11y.filter((t: TestCase) => t.outcome === 'passed').length,
              failed: a11y.filter((t: TestCase) => t.outcome !== 'passed').length,
              lastRun: new Date().toLocaleString(),
            },
            storybookTests: {
              passed: storybook.filter((t: TestCase) => t.outcome === 'passed').length,
              failed: storybook.filter((t: TestCase) => t.outcome !== 'passed').length,
              lastRun: new Date().toLocaleString(),
            },
          });
        }
      } catch (error) {
        console.log('UI QA results not available');
      } finally {
        setLoading(false);
      }
    }

    if (process.env.NODE_ENV === 'development') {
      fetchStatus();
    }
  }, []);

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  if (loading) {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-surface border border-border rounded-lg p-4 shadow-lg">
        <div className="flex items-center gap-2 text-sm text-muted">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
          Loading UI QA Status...
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-surface border border-border rounded-lg p-4 shadow-lg">
        <div className="text-sm text-muted">
          UI QA: Run <code>npm run ui-qa:all</code> to generate status
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-surface border border-border rounded-lg p-4 shadow-lg min-w-[280px]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-foreground">UI QA Status</h3>
        <button
          onClick={() => window.open('/playwright-report', '_blank')}
          className="text-xs text-primary hover:underline"
        >
          View Report
        </button>
      </div>
      <div className="grid gap-2 text-sm">
        <div className="flex items-center justify-between p-2 rounded bg-background">
          <span className="text-muted">Visual Tests</span>
          <div className="flex items-center gap-2">
            <span className="text-success">{status.visualTests.passed} ✓</span>
            <span className="text-danger">{status.visualTests.failed} ✗</span>
          </div>
        </div>
        <div className="flex items-center justify-between p-2 rounded bg-background">
          <span className="text-muted">Accessibility</span>
          <div className="flex items-center gap-2">
            <span className="text-success">{status.accessibilityTests.passed} ✓</span>
            <span className="text-danger">{status.accessibilityTests.failed} ✗</span>
          </div>
        </div>
        <div className="flex items-center justify-between p-2 rounded bg-background">
          <span className="text-muted">Storybook</span>
          <div className="flex items-center gap-2">
            <span className="text-success">{status.storybookTests.passed} ✓</span>
            <span className="text-danger">{status.storybookTests.failed} ✗</span>
          </div>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-border text-xs text-muted">
        Last run: {status.visualTests.lastRun}
      </div>
    </div>
  );
}