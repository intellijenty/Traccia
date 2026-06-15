import { useEffect, useState } from "react"

export function useAlphaUser(): boolean {
  const [isAlpha, setIsAlpha] = useState(false)
  useEffect(() => {
    window.electronAPI.isAlphaUser().then(setIsAlpha)
  }, [])
  return isAlpha
}
