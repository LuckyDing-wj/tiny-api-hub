interface Props {
  /** 行数，默认 3 */
  count?: number
  /** 单行高度类，须与真实卡片高度对齐避免加载完成后跳变 */
  rowClassName?: string
}

/** 列表加载占位：ta-skeleton 灰块竖排。 */
export default function SkeletonRows({
  count = 3,
  rowClassName = "h-24",
}: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`ta-skeleton ${rowClassName}`} />
      ))}
    </div>
  )
}
