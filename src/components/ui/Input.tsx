import type { InputHTMLAttributes } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement>

function Input({ className, ...props }: InputProps) {
  return <input className={`input ${className ?? ''}`.trim()} {...props} />
}

export default Input
