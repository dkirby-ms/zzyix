import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import './Tooltip.css'

const cx = (...classNames: Array<string | undefined>): string => classNames.filter(Boolean).join(' ')

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cx('ui-tooltip-content', className)}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = 'TooltipContent'

const TooltipArrow = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Arrow>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Arrow>
>(({ className, ...props }, ref) => (
  <TooltipPrimitive.Arrow ref={ref} className={cx('ui-tooltip-arrow', className)} {...props} />
))
TooltipArrow.displayName = 'TooltipArrow'

export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent, TooltipArrow }
