import icon from '../../../../resources/icon.svg'

/**
 * The Sanchay mark: a stack of coins with a sprout — savings that grow. Drawn once in
 * resources/icon.svg, which also builds the app icon and the start-up screen.
 */
export function Logo({ className }: { className?: string }): React.JSX.Element {
  // The drawing has the macOS icon margin; scale it so the tile fills the box.
  return (
    <span className={className} style={{ display: 'inline-block', overflow: 'hidden' }}>
      <img
        src={icon}
        alt="Sanchay"
        className="size-full max-w-none scale-[1.243]"
        draggable={false}
      />
    </span>
  )
}
