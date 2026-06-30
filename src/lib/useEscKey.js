import { useEffect } from 'react'

export function useEscKey(callback) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') callback() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [callback])
}
