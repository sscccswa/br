# E2E Tests

This directory contains End-to-End tests for the Electron application using Playwright.

## Running Tests

Before running E2E tests, make sure the application is built:

```bash
npm run build
```

Then run the tests:

```bash
# Run tests in headless mode
npm run test:e2e

# Run tests with visible browser
npm run test:e2e:headed
```

## Test Structure

- `app.spec.ts` - Basic smoke tests that verify the app launches and core UI elements are visible

## Writing Tests

E2E tests use Playwright's Electron support to launch and test the actual Electron application. Tests should focus on user workflows and critical functionality.

Example test structure:
```typescript
test('should do something', async () => {
  // Interact with the page
  await page.click('button')

  // Verify expected outcome
  await expect(page.getByText('Success')).toBeVisible()
})
```

## Configuration

Test configuration is in `playwright.config.ts` at the project root.
