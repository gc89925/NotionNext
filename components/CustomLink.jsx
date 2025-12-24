export default function CustomLink({ href, children, ...props }) {
  const isExternal =
    href &&
    (href.startsWith('http://') || href.startsWith('https://'))

  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    )
  }

  return (
    <a href={href} {...props}>
      {children}
    </a>
  )
}
