import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");

const navigationState = await importTypeScriptModule(
  path.join(projectRoot, "navigation/navigationState.ts"),
);

test("first launch opens Get Started", () => {
  assert.equal(navigationState.getInitialAppFlow(false), "onboarding");
});

test("completing Get Started opens Remote", () => {
  assert.equal(
    navigationState.getAppFlowAfterOnboardingCompleted(),
    "main",
  );
});

test("returning users open Remote directly", () => {
  assert.equal(navigationState.getInitialAppFlow(true), "main");
});

test("account routes are not active when account authentication is false", () => {
  assert.equal(navigationState.isAccountFlowActive(false), false);
});

test("account-related source files remain in the project", () => {
  [
    "components/LoginPage.tsx",
    "components/SignUpPage.tsx",
    "components/ForgotPasswordPage.tsx",
    "components/AuthVerificationStep.tsx",
    "features/auth/useAuthSession.ts",
    "features/auth/authSession.ts",
    "assets/icons/apple.svg",
  ].forEach((sourcePath) => {
    assert.doesNotThrow(() => {
      readFileSync(path.join(projectRoot, sourcePath), "utf8");
    }, `${sourcePath} should remain available`);
  });
});

test("Login is not shown while onboarding state is loading", () => {
  assert.equal(
    navigationState.shouldRenderNavigation({
      fontsReady: true,
      onboardingStateResolved: false,
    }),
    false,
  );
});

test("stored onboarding values are parsed defensively", () => {
  assert.equal(navigationState.parseStoredOnboardingCompleted("true"), true);
  assert.equal(navigationState.parseStoredOnboardingCompleted(null), false);
  assert.equal(navigationState.parseStoredOnboardingCompleted("false"), false);
  assert.equal(navigationState.parseStoredOnboardingCompleted("wat"), false);
});

async function importTypeScriptModule(sourcePath) {
  const source = readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const tempDir = mkdtempSync(path.join(tmpdir(), "mobile-navigation-test-"));
  const outputPath = path.join(tempDir, "module.mjs");

  writeFileSync(outputPath, transpiled.outputText);

  try {
    return await import(pathToFileURL(outputPath).href);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}
