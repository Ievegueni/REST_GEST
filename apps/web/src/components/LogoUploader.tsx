import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { t } from '../i18n';
import { api, apiUpload } from '../lib/api';
import { ErrorBox, secondaryCls } from './ui';

/** Pré-visualização + carregar/remover o logotipo (PNG ou JPG até 512 KB). */
export function LogoUploader(props: {
  logoUrl: string | null;
  /** endpoint: PUT (multipart) para carregar, DELETE para remover */
  path: string;
  canEdit: boolean;
  onChange: (logoUrl: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<{ logoUrl: string | null }>) => {
    setBusy(true);
    setError('');
    try {
      props.onChange((await fn()).logoUrl);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const pick = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 512 * 1024) return setError(t('logo.tooBig'));
    void run(() => apiUpload(props.path, file, {}, 'PUT'));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-44 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
          {props.logoUrl ? (
            <img
              src={props.logoUrl}
              alt={t('logo.alt')}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-center text-xs text-gray-400">{t('logo.none')}</span>
          )}
        </div>
        {props.canEdit && (
          <div className="flex flex-col gap-2">
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className={secondaryCls}
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <ImagePlus className="size-4" />
              {props.logoUrl ? t('logo.replace') : t('logo.upload')}
            </button>
            {props.logoUrl && (
              <button
                type="button"
                className={`${secondaryCls} text-red-600 hover:bg-red-50`}
                disabled={busy}
                onClick={() => run(() => api<{ logoUrl: null }>(props.path, { method: 'DELETE' }))}
              >
                <Trash2 className="size-4" />
                {t('logo.remove')}
              </button>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500">{t('logo.hint')}</p>
      <ErrorBox>{error}</ErrorBox>
    </div>
  );
}
