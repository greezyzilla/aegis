interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /** Shown next to the switch; `label` stays the accessible name. */
  children?: React.ReactNode;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, children, disabled }: SwitchProps) {
  return (
    <label className="switch-row">
      {children}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className="switch"
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
    </label>
  );
}
