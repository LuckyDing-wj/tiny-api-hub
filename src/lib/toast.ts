type Listener = (message: string) => void

const listeners = new Set<Listener>()

/** 任意层级（含 service 调用点）弹一条轻提示，由 ToastHost 渲染。 */
export function showToast(message: string): void {
  for (const listener of listeners) listener(message)
}

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
