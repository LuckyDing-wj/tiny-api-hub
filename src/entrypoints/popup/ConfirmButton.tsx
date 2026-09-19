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

/** 武装态统一外观：工具类覆盖 .ta-btn-danger 的透明底。 */
export const CONFIRM_ARMED_CLASS =
  "bg-red-600 text-white border-red-600 hover:bg-red-600 dark:bg-red-600 dark:text-white dark:border-red-600 dark:hover:bg-red-600"

/** 两态确认：点一下武装，再点执行；3 秒、失焦或 Esc 回弹。替代原生 confirm。 */
export default function ConfirmButton({
  onConfirm,
  children,
  // 默认「确认」与常见 children（「删除」）等宽，叠放后常态宽度不变
  confirmLabel = "确认",
  armedClassName = CONFIRM_ARMED_CLASS,
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

  const disarm = () => {
    if (timer.current) clearTimeout(timer.current)
    setArmed(false)
  }

  return (
    <button
      type="button"
      className={`${className}${armed ? ` ${armedClassName}` : ""}`}
      disabled={disabled}
      title={title}
      onBlur={disarm}
      onKeyDown={(e) => {
        if (e.key === "Escape") disarm()
      }}
      onClick={() => {
        if (armed) {
          disarm()
          onConfirm()
        } else {
          if (timer.current) clearTimeout(timer.current)
          setArmed(true)
          timer.current = setTimeout(() => setArmed(false), ARMED_MS)
        }
      }}
    >
      {/*
        宽度稳定：两态内容同格叠放，按钮宽度始终取最大态，
        武装时文字变长不挤压行内相邻按钮
      */}
      <span className="grid place-items-center">
        <span
          className="col-start-1 row-start-1"
          style={{ visibility: armed ? "hidden" : "visible" }}
        >
          {children}
        </span>
        <span
          className="col-start-1 row-start-1"
          style={{ visibility: armed ? "visible" : "hidden" }}
        >
          {armed ? confirmLabel : children}
        </span>
      </span>
    </button>
  )
}
