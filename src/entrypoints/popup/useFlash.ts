import { useCallback, useEffect, useRef, useState } from "react"

/** 微提示：flash(消息) 后 N 毫秒自动清空；同 hook 内连刷会重置计时。卸载时清定时器。 */
export function useFlash(
  duration = 2000,
): [string | null, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const flash = useCallback(
    (msg: string) => {
      setMessage(msg)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setMessage(null), duration)
    },
    [duration],
  )

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return [message, flash]
}
