import { useState, type ReactNode } from 'react';
import { t } from '../i18n';

/** Acção irreversível: o primeiro clique pede confirmação, o segundo executa. */
export function ConfirmButton(props: {
  onConfirm: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      className={
        props.className ??
        'rounded border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50'
      }
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        props.onConfirm();
      }}
    >
      {armed ? t('common.confirm') : props.children}
    </button>
  );
}
