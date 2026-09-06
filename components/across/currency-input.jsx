'use client'

import { Input } from '@/components/ui/input'
import { formatNumber } from '@/lib/format'

export function CurrencyInput({ value, onChange, placeholder = 'Rp0', ...props }) {
  const display = value === '' || value === null || value === undefined ? '' : `Rp${formatNumber(value)}`
  return (
    <Input
      inputMode="numeric"
      value={display}
      placeholder={placeholder}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, '')
        onChange(digits === '' ? '' : Number(digits))
      }}
      className="tabular"
      {...props}
    />
  )
}

export default CurrencyInput
