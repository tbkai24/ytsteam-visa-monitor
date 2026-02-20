import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'ghost'
  }
>

function Button({ children, variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button className={`btn btn-${variant} ${className ?? ''}`.trim()} {...props}>
      {children}
    </button>
  )
}

export default Button
