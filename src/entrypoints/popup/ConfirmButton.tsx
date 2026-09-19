import { useEffect, useRef, useState, type ReactNode } from "react"

interface Props {
  onConfirm: () => void
  /** 常态内容 */
  children: ReactNode
  /** 武装态内容，默认「确认？」 */
  confirmLabel?: string
  /** 武装态追加类（Tailwind 工具类可覆盖 ta-* 组件类） */
  armedClassName?: string
  className?: string
  title?: string
  disabled?: boolean
}

const ARMED_MS = 3000

/** 两态确认：点一下武装，再点执行；3 秒、失焦或 Esc 回弹。替代原生 confirm。 */
export default function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = "确认？",
  armedClassName = "",
  className = "",
  title,
  disabled,
}: Props) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return (
    <button
      type="button"
      className={`${className}${armed ? ` ${armedClassName}` : ""}`}
      disabled={disabled}
      title={title}
      onBlur={() => setArmed(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setArmed(false)
      }}
      onClick={() => {
        if (armed) {
          if (timer.current) clearTimeout(timer.current)
          setArmed(false)
          onConfirm()
        } else {
          setArmed(true)
          timer.current = setTimeout(() => setArmed(false), ARMED_MS)
        }
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  )
}
