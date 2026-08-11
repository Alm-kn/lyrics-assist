import { expect, test } from "@playwright/test";

test("renders the bootstrap page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Lyrics Assist" })).toBeVisible();
  await expect(page.getByText("Project bootstrap is ready.")).toBeVisible();
});
