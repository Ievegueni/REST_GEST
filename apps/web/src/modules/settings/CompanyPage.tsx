import { LogoUploader } from '../../components/LogoUploader';
import { Panel } from '../../components/ui';
import { useCan, useSession } from '../../features/session';
import { t } from '../../i18n';

export function CompanyPage() {
  const { session, reload } = useSession();
  const canEdit = useCan('settings.manage');
  if (!session) return null;
  return (
    <div className="max-w-2xl space-y-6">
      <Panel title={t('company.logo')}>
        <div className="p-5">
          <p className="mb-4 text-sm text-gray-500">{t('company.logoHelp')}</p>
          <LogoUploader
            logoUrl={session.tenant.logoUrl}
            path="/settings/logo"
            canEdit={canEdit}
            onChange={() => void reload()}
          />
        </div>
      </Panel>
    </div>
  );
}
