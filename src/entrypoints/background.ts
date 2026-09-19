import { TEMP_PAGE_FETCH_TYPE, handleTempPageFetchMessage } from "~/services/tempPage"

export default defineBackground(() => {
  // 阶段 1：账号刷新仍在 popup 侧直连；这里只挂临时页过盾任务（tempPage.ts）。
  chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
    if (
      !msg ||
      typeof msg !== "object" ||
      (msg as { type?: unknown }).type !== TEMP_PAGE_FETCH_TYPE
    ) {
      return
    }
    return handleTempPageFetchMessage(
      msg,
      sendResponse as (res: unknown) => void,
    )
  })
  console.log("[tiny-api-hub] background loaded")
})
