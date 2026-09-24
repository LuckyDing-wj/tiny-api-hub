import { useCallback, useEffect, useState } from "react"

import { subscribeToast } from "~/lib/toast"

import Toast from "./Toast"

/** 订阅全局 toast 事件并渲染。放在 App 顶层一处即可。 */
export default function ToastHost() {
  const [message, setMessage] = useState<string | null>(null)
  const dismiss = useCallback(() => setMessage(null), [])

  useEffect(() => subscribeToast(setMessage), [])

  if (!message) return null
  return <Toast message={message} onDone={dismiss} />
}
