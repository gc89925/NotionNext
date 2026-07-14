import { loadExternalResource } from '@/lib/utils'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
// import AOS from 'aos'

const refreshAOS = () => {
  if (!window.AOS) return

  if (window.AOS.refreshHard) {
    window.AOS.refreshHard()
  } else if (window.AOS.refresh) {
    window.AOS.refresh()
  }
}

const refreshAOSAfterPaint = () => {
  window.requestAnimationFrame(refreshAOS)
}

/**
 * 加载滚动动画
 * 改从外部CDN读取
 * https://michalsnik.github.io/aos/
 */
export default function AOSAnimation() {
  const router = useRouter()
  const initAOS = () => {
    if (
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }

    Promise.all([
      loadExternalResource('/js/aos.js', 'js'),
      loadExternalResource('/css/aos.css', 'css')
    ]).then(() => {
      if (window.AOS) {
        window.AOS.init({
          disableMutationObserver: true,
          debounceDelay: 100,
          throttleDelay: 120,
          once: true
        })
        refreshAOSAfterPaint()
      }
    })
  }
  useEffect(() => {
    if (window.requestIdleCallback) {
      const id = window.requestIdleCallback(initAOS, { timeout: 3000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(initAOS, 2000)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    const handleRouteChangeComplete = () => {
      refreshAOSAfterPaint()
    }

    router.events.on('routeChangeComplete', handleRouteChangeComplete)
    return () => {
      router.events.off('routeChangeComplete', handleRouteChangeComplete)
    }
  }, [router.events])

  return null
}
