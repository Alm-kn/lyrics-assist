import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

async function generateSession(page: Page): Promise<string> {
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "キーワード" });
  await input.fill("夜");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "光" })).toBeVisible();
  return new URL(page.url()).pathname.split("/").at(-1)!;
}

test("Homeから生成し、CandidateとSound Feedbackをreload後も復元する", async ({
  page,
}) => {
  await page.route("**/api/generations", async (route) => {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
    await route.continue();
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ことばを探す" })).toBeVisible();
  const input = page.getByRole("textbox", { name: "キーワード" });
  const submit = page.getByRole("button", { name: "探す", exact: true });
  await expect(input).toHaveAttribute("placeholder", "例：夜");
  await input.fill("夜");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "探しています…" })).toBeDisabled();
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "光" })).toBeVisible();
  await expect(submit).not.toBeVisible();

  const lightCard = page.locator("article").filter({ hasText: "光" });
  const like = lightCard.getByRole("button", { name: "Like", exact: true });
  const likeSaved = page.waitForResponse(
    (response) => response.url().endsWith("/api/feedback/candidate") && response.request().method() === "POST",
  );
  await like.focus();
  await page.keyboard.press("Enter");
  expect((await likeSaved).status()).toBe(200);
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  const reloadedCard = page.locator("article").filter({ hasText: "光" });
  await expect(reloadedCard.getByRole("button", { name: "Like", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const dislikeSaved = page.waitForResponse(
    (response) => response.url().endsWith("/api/feedback/candidate") && response.request().method() === "POST",
  );
  await reloadedCard.getByRole("button", { name: "Dislike" }).click();
  expect((await dislikeSaved).status()).toBe(200);
  await page.reload();
  await expect(
    page.locator("article").filter({ hasText: "光" }).getByRole("button", {
      name: "Dislike",
    }),
  ).toHaveAttribute("aria-pressed", "true");

  const detailLink = page.getByRole("link", { name: "詳細を見る" });
  await detailLink.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/detail$/);
  await expect(page.getByTestId("scatter-plot")).toBeVisible();
  await expect(page.getByTestId("scatter-point")).toHaveCount(3);
  const legend = page.getByRole("button", { name: "星", exact: true });
  await expect(legend).toHaveAttribute("aria-pressed", "true");
  const darkLegend = page.getByRole("button", { name: "闇", exact: true });
  await darkLegend.focus();
  await page.keyboard.press("Enter");
  await expect(darkLegend).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "闇" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sound", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Semantic", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "星", exact: true }).click();
  const valid = page.getByRole("button", { name: "妥当" });
  const validSaved = page.waitForResponse(
    (response) => response.url().endsWith("/api/feedback/sound-score") && response.request().method() === "POST",
  );
  await valid.focus();
  await page.keyboard.press("Enter");
  expect((await validSaved).status()).toBe(200);
  await expect(valid).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: "妥当" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const highSaved = page.waitForResponse(
    (response) => response.url().endsWith("/api/feedback/sound-score") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "高すぎる" }).click();
  expect((await highSaved).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("button", { name: "高すぎる" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("Reroll中は旧結果を保ち、同一Sessionで新しいlatest Roundへ更新する", async ({
  page,
}) => {
  const sessionId = await generateSession(page);
  await page.route(`**/api/sessions/${sessionId}/reroll`, async (route) => {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
    await route.continue();
  });

  await page.getByRole("button", { name: "もう一度探す" }).click();
  await expect(page.getByRole("button", { name: "探しています…" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "光" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/sessions/${sessionId}$`));
  await expect(
    page.getByText("今回は表示できる候補がありませんでした。"),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/sessions/${sessionId}$`));
});

test("SessionとDetailを直接reloadでき、unknown Sessionを案内する", async ({ page }) => {
  const sessionId = await generateSession(page);
  await page.goto(`/sessions/${sessionId}`);
  await expect(page.getByRole("heading", { name: "光" })).toBeVisible();
  await page.goto(`/sessions/${sessionId}/detail`);
  await expect(page.getByTestId("scatter-plot")).toBeVisible();

  await page.goto(`/sessions/${randomUUID()}`);
  await expect(
    page.getByText("このセッションは見つかりませんでした。"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "ホームへ戻る" })).toBeVisible();
});
