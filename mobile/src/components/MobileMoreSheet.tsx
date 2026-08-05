import { AccountAvatarImage } from '@/components/layout/AccountAvatarImage';
import { Icon } from '@/components/ui/icons';
import { useUserAvatar } from '@/hooks/useUserAvatar';
import { useI18n } from '@/lib/i18n';
import { useAccountSessionStore } from '@/stores/accountSession';
import { MobileLayer } from './MobileLayer';

const fallbackAvatarUrl = `${import.meta.env.BASE_URL}logo.png?v=20260327`;

interface MobileMoreSheetProps {
  open: boolean;
  onClose: () => void;
  onOpenAccount: () => void;
  onOpenSettings: () => void;
  onShare?: () => void;
}

export function MobileMoreSheet({
  open,
  onClose,
  onOpenAccount,
  onOpenSettings,
  onShare,
}: MobileMoreSheetProps) {
  const { t } = useI18n();
  const isConnected = useAccountSessionStore((state) => state.isConnected);
  const username = useAccountSessionStore((state) => state.username);
  const primaryEmail = useAccountSessionStore((state) => state.primaryEmail);
  const membershipName = useAccountSessionStore((state) => state.membershipName);
  const avatar = useUserAvatar();
  const displayName = isConnected
    ? username || primaryEmail || t('account.membership')
    : t('account.signIn');
  const secondaryLabel = isConnected
    ? primaryEmail || membershipName || t('account.membership')
    : 'Vlaina';

  const runAndClose = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <MobileLayer
      open={open}
      title={t('sidebar.more')}
      variant="sheet"
      onClose={onClose}
      contentClassName="mobile-more-sheet"
    >
      <button
        type="button"
        className="mobile-more-sheet__profile"
        onClick={() => runAndClose(onOpenAccount)}
      >
        <span className="mobile-more-sheet__avatar" aria-hidden="true">
          {isConnected ? (
            <AccountAvatarImage
              src={avatar}
              fallbackSrc={fallbackAvatarUrl}
              alt=""
            />
          ) : (
            <Icon name="user.profile" size="xl" />
          )}
        </span>
        <span className="mobile-more-sheet__identity">
          <strong>{displayName}</strong>
          <span>{secondaryLabel}</span>
        </span>
        <Icon name="nav.chevronRight" size="md" />
      </button>

      <div className="mobile-more-sheet__actions">
        {onShare ? (
          <button type="button" onClick={() => runAndClose(onShare)}>
            <span className="mobile-more-sheet__action-icon" aria-hidden="true">
              <Icon name="common.share" size="lg" />
            </span>
            <span>{t('mobile.share')}</span>
            <Icon name="nav.chevronRight" size="md" />
          </button>
        ) : null}
        <button type="button" onClick={() => runAndClose(onOpenSettings)}>
          <span className="mobile-more-sheet__action-icon" aria-hidden="true">
            <Icon name="common.settings" size="lg" />
          </span>
          <span>{t('account.settings')}</span>
          <Icon name="nav.chevronRight" size="md" />
        </button>
      </div>
    </MobileLayer>
  );
}
