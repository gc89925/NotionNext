import { siteConfig } from '@/lib/config'
import { compressImage, mapImgUrl } from '@/lib/notion/mapImage'
import { isBrowser, loadExternalResource } from '@/lib/utils'
import mediumZoom from '@fisch0920/medium-zoom'
import 'katex/dist/katex.min.css'
import dynamic from 'next/dynamic'
import { useEffect, useRef } from 'react'
import { NotionRenderer } from 'react-notion-x'

/**
 * React 层兜底（不是最终胜负手）
 */
const CustomLink = ({ href, children, ...props }) => {
  if (href && href.startsWith('http')) {
    return (
      <a {...props} href={href}>
        {children}
        <span style={{ marginLeft: 4, opacity: 0.7 }}>↗</span>
      </a>
    )
  }
  return <a {...props} href={href}>{children}</a>
}

const NotionPage = ({ post, className }) => {
  const POST_DISABLE_GALLERY_CLICK = siteConfig('POST_DISABLE_GALLERY_CLICK')
  const POST_DISABLE_DATABASE_CLICK = siteConfig('POST_DISABLE_DATABASE_CLICK')
  const SPOILER_TEXT_TAG = siteConfig('SPOILER_TEXT_TAG')

  const zoom =
    isBrowser &&
    mediumZoom({
      background: 'rgba(0,0,0,.2)',
      margin: getMediumZoomMargin()
    })

  const zoomRef = useRef(zoom ? zoom.clone() : null)
  const IMAGE_ZOOM_IN_WIDTH = siteConfig('IMAGE_ZOOM_IN_WIDTH', 1200)

  useEffect(() => {
    autoScrollToHash()
  }, [])

  useEffect(() => {
    if (POST_DISABLE_GALLERY_CLICK) processGalleryImg(zoomRef.current)
    if (POST_DISABLE_DATABASE_CLICK) processDisableDatabaseUrl()

    const observer = new MutationObserver(mutations => {
      mutations.forEach(m => {
        if (
          m.type === 'attributes' &&
          m.attributeName === 'class' &&
          m.target.classList.contains('medium-zoom-image--opened')
        ) {
          setTimeout(() => {
            const src = m.target.getAttribute('src')
            m.target.setAttribute(
              'src',
              compressImage(src, IMAGE_ZOOM_IN_WIDTH)
            )
          }, 800)
        }
      })
    })

    observer.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['class']
    })

    return () => observer.disconnect()
  }, [post])

  /**
   * ⭐⭐⭐ 终极胜负手 ⭐⭐⭐
   * react-notion-x 会在 DOM 层把 target 改回 _self
   * 我们在最后阶段强制修正
   */
  useEffect(() => {
    if (!isBrowser) return

    const fixLinks = () => {
      document
        .querySelectorAll('a.notion-link[href^="http"]')
        .forEach(a => {
          a.setAttribute('target', '_blank')
          a.setAttribute('rel', 'noopener noreferrer nofollow')
        })
    }

    fixLinks()

    const observer = new MutationObserver(() => fixLinks())
    observer.observe(document.body, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (SPOILER_TEXT_TAG) {
      import('lodash/escapeRegExp').then(escapeRegExp => {
        Promise.all([
          loadExternalResource('/js/spoilerText.js', 'js'),
          loadExternalResource('/css/spoiler-text.css', 'css')
        ]).then(() => {
          window.textToSpoiler &&
            window.textToSpoiler(escapeRegExp.default(SPOILER_TEXT_TAG))
        })
      })
    }

    const timer = setTimeout(() => {
      document
        .querySelectorAll('.notion-collection-page-properties')
        .forEach(e => e.remove())
    }, 1000)

    return () => clearTimeout(timer)
  }, [post])

  return (
    <div id='notion-article' className={`mx-auto overflow-hidden ${className || ''}`}>
      <NotionRenderer
        recordMap={post?.blockMap}
        mapPageUrl={mapPageUrl}
        mapImageUrl={mapImgUrl}
        components={{
          Code,
          Collection,
          Equation,
          Modal,
          Pdf,
          Tweet,
          a: CustomLink,
          link: CustomLink
        }}
      />

      <AdEmbed />
      <PrismMac />
    </div>
  )
}

/* ===== 原有函数，完全未删 ===== */

const processDisableDatabaseUrl = () => {
  if (isBrowser) {
    document.querySelectorAll('.notion-table a').forEach(e => {
      e.removeAttribute('href')
    })
  }
}

const processGalleryImg = zoom => {
  setTimeout(() => {
    if (!isBrowser) return
    document
      .querySelectorAll('.notion-collection-card-cover img')
      .forEach(img => zoom && zoom.attach(img))
    document
      .querySelectorAll('.notion-collection-card')
      .forEach(e => e.removeAttribute('href'))
  }, 800)
}

const autoScrollToHash = () => {
  setTimeout(() => {
    const hash = window.location.hash
    if (hash) {
      const el = document.getElementById(hash.substring(1))
      el && el.scrollIntoView({ behavior: 'smooth' })
    }
  }, 180)
}

const mapPageUrl = id => '/' + id.replace(/-/g, '')

function getMediumZoomMargin() {
  const w = window.innerWidth
  if (w < 500) return 8
  if (w < 800) return 20
  if (w < 1280) return 30
  if (w < 1600) return 40
  if (w < 1920) return 48
  return 72
}

/* ===== 第三方组件 ===== */

const Code = dynamic(() =>
  import('react-notion-x/build/third-party/code').then(m => m.Code),
  { ssr: false }
)

const Equation = dynamic(() =>
  import('@/components/Equation').then(async m => {
    await import('@/lib/plugins/mhchem')
    return m.Equation
  }),
  { ssr: false }
)

const Pdf = dynamic(() => import('@/components/Pdf').then(m => m.Pdf), { ssr: false })
const PrismMac = dynamic(() => import('@/components/PrismMac'), { ssr: false })
const TweetEmbed = dynamic(() => import('react-tweet-embed'), { ssr: false })
const AdEmbed = dynamic(() => import('@/components/GoogleAdsense').then(m => m.AdEmbed))
const Collection = dynamic(() =>
  import('react-notion-x/build/third-party/collection').then(m => m.Collection)
)
const Modal = dynamic(() =>
  import('react-notion-x/build/third-party/modal').then(m => m.Modal)
)

const Tweet = ({ id }) => <TweetEmbed tweetId={id} />

export default NotionPage
