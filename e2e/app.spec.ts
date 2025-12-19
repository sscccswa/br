import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import * as path from 'path'

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  // Launch Electron app
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../dist/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  })

  // Get the first window
  page = await electronApp.firstWindow()

  // Wait for the app to be ready
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  // Close the app
  await electronApp.close()
})

test.describe('Electron App', () => {
  test('should launch the application', async () => {
    // Verify the window is visible
    expect(await page.isVisible('body')).toBeTruthy()
  })

  test('should have the correct title', async () => {
    const title = await page.title()
    expect(title).toBeTruthy()
  })

  test('should display the sidebar', async () => {
    // Check if sidebar elements exist
    const sidebar = page.locator('[class*="sidebar"]').first()
    await expect(sidebar).toBeVisible({ timeout: 10000 })
  })

  test('should display the dropzone when no file is open', async () => {
    // Look for dropzone text or element
    const dropzoneText = page.getByText(/drag.*drop/i).first()
    await expect(dropzoneText).toBeVisible({ timeout: 10000 })
  })

  test('should have a functional window', async () => {
    // Verify the window has expected dimensions
    const size = await page.viewportSize()
    expect(size).toBeTruthy()
    expect(size?.width).toBeGreaterThan(0)
    expect(size?.height).toBeGreaterThan(0)
  })
})
