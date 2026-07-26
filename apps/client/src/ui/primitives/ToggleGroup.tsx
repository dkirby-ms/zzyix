import * as React from 'react'
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group'
import './ToggleGroup.css'

const cx = (...classNames: Array<string | undefined>): string => classNames.filter(Boolean).join(' ')

const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Root ref={ref} className={cx('ui-toggle-group', className)} {...props} />
))
ToggleGroup.displayName = 'ToggleGroup'

const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Item ref={ref} className={cx('ui-toggle-group-item', className)} {...props} />
))
ToggleGroupItem.displayName = 'ToggleGroupItem'

export { ToggleGroup, ToggleGroupItem }
