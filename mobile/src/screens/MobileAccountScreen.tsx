import { useState } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { AccountAvatarImage } from '@/components/layout/AccountAvatarImage';
import { Icon } from '@/components/ui/icons';
import { useUserAvatar } from '@/hooks/useUserAvatar';
import { useI18n } from '@/lib/i18n';
import { useAccountSessionStore } from '@/stores/accountSession';
import { MobileLayer } from '../components/MobileLayer';

const fallbackAvatarUrl = `${import.meta.env.BASE_URL}logo.png?v=20260327`;

interface MobileAccountScreenProps {
  open: boolean;
  onClose: () => void;
  onSwitchAccount: () => void;
}

export function MobileAccountScreen({
  open,
  onClose,
  onSwitchAccount,
}: MobileAccountScreenProps) {
  const { t } = useI18n();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const isConnected = useAccountSessionStore((state) => state.isConnected);
  const username = useAccountSessionStore((state) => state.username);
  const primaryEmail = useAccountSessionStore((state) => state.primaryEmail);
  const membershipName = useAccountSessionStore((state) => state.membershipName);
  const membershipTier = useAccountSessionStore((state) => state.membershipTier);
  const isLoading = useAccountSessionStore((state) => state.isLoading);
  const error = useAccountSessionStore((state) => state.error);
  const signOut = useAccountSessionStore((state) => state.signOut);
  const avatar = useUserAvatar();
  const displayName = username || primaryEmail || 'vlaina';

  return (
    <>
      <MobileLayer
        open={open}
        title={t('account.membership')}
        variant="screen"
        onClose={onClose}
        contentClassName="mobile-account-screen"
      >
        <div className="mobile-account-card">
          <AccountAvatarImage
            src={avatar}
            fallbackSrc={fallbackAvatarUrl}
            alt={displayName}
            className="mobile-account-card__avatar"
          />
          <div className="mobile-account-card__identity">
            <strong>{displayName}</strong>
            {primaryEmail && primaryEmail !== displayName ? <span>{primaryEmail}</span> : null}
          </div>
          {membershipName || membershipTier ? (
            <span className="mobile-account-card__membership">
              {membershipName || membershipTier}
            </span>
          ) : null}
        </div>

        {error ? <p className="mobile-account-error" role="alert">{error}</p> : null}

        <div className="mobile-account-actions">
          <button
            type="button"
            className="mobile-action-row"
            disabled={isLoading}
            onClick={onSwitchAccount}
          >
            <Icon name="user.switch" size="lg" />
            <span>{t('account.switchAccount')}</span>
            <Icon name="nav.chevronRight" size="md" />
          </button>
          <button
            type="button"
            className="mobile-action-row mobile-action-row--danger"
            disabled={isLoading || !isConnected}
            onClick={() => setConfirmLogout(true)}
          >
            <Icon name="user.logout" size="lg" />
            <span>{t('account.logOut')}</span>
          </button>
        </div>
      </MobileLayer>

      <ConfirmDialog
        isOpen={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={() => {
          void signOut().then(() => {
            setConfirmLogout(false);
            onClose();
          }).catch(() => undefined);
        }}
        title={t('account.logOutTitle')}
        description={t('account.logOutDescription')}
        confirmText={t('account.logOut')}
        cancelText={t('account.logOutCancel')}
        variant="danger"
      />
    </>
  );
}
