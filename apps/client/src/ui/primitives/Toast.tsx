import * as React from 'react'
import * as ToastPrimitive from '@radix-ui/react-toast'
import './Toast.css'

const cx = (...classNames: Array<string | undefined>): string => classNames.filter(Boolean).join(' ')

const ToastProvider = ToastPrimitive.Provider

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport ref={ref} className={cx('ui-toast-viewport', className)} {...props} />
))
ToastViewport.displayName = 'ToastViewport'

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Root ref={ref} className={cx('ui-toast', className)} {...props} />
))
Toast.displayName = 'Toast'

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title ref={ref} className={cx('ui-toast-title', className)} {...props} />
))
ToastTitle.displayName = 'ToastTitle'

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description ref={ref} className={cx('ui-toast-description', className)} {...props} />
))
ToastDescription.displayName = 'ToastDescription'

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Action ref={ref} className={cx('ui-toast-action', className)} {...props} />
))
ToastAction.displayName = 'ToastAction'

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Close ref={ref} className={cx('ui-toast-close', className)} {...props} />
))
ToastClose.displayName = 'ToastClose'

export {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastAction,
  ToastClose,
}
