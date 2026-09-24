import { useEffect } from "react"

interface Props {
  message: string
  onDone: () => void
}

/** 底部浮出的轻提示，3 秒自动消失。 */
export default function Toast({ message, onDone }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3000)
    return () => clearTimeout(timer)
  }, [message, onDone])

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-14 z-50 flex justify-center px-3">
      <div className="rounded-md bg-gray-900 px-3 py-1.5 text-[11px] text-white shadow-lg dark:bg-dark-bg-tertiary dark:text-dark-text-primary">
        {message}
      </div>
    </div>
  )
}
