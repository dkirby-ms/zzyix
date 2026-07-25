import * as React from 'react'
import * as VisuallyHiddenPrimitive from '@radix-ui/react-visually-hidden'

const cx = (...classNames: Array<string | undefined>): string => classNames.filter(Boolean).join(' ')

const VisuallyHidden = React.forwardRef<
  React.ElementRef<typeof VisuallyHiddenPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof VisuallyHiddenPrimitive.Root>
>(({ className, ...props }, ref) => (
  <VisuallyHiddenPrimitive.Root ref={ref} className={cx('visually-hidden', className)} {...props} />
))

VisuallyHidden.displayName = 'VisuallyHidden'

export { VisuallyHidden }
