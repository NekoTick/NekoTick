import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { useAccountSessionStore } from '@/stores/accountSession';
import { useUserAvatar } from '@/hooks/useUserAvatar';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { openExternalHref } from '@/lib/navigation/externalLinks';
import { ManagedQuotaMeter } from './ManagedQuotaMeter';
import {
  ghostIconButtonClass,
  raisedPillSurfaceClass,
} from '@/components/ui/surfaceStyles';
import { getSidebarIdleRowSurfaceClass } from '@/components/layout/sidebar/sidebarLabelStyles';
import { AccountAvatarImage } from './AccountAvatarImage';
import { themeRenderingTokens } from '@/styles/themeTokens';

const fallbackAvatarUrl = `${import.meta.env.BASE_URL}logo.png?v=20260327`;
const membershipPlanUrl = 'https://vlaina.com/r/account_plan';
const identityMaxFontSizePx = 11;
const identityMinFontSizePx = 6;

interface UserIdentityCardProps {
  onLogout: () => void | Promise<void>;
  onSwitchAccount: () => void;
}

function getPixelValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function AutoFitIdentityText({ value }: { value: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [fontSizePx, setFontSizePx] = useState(identityMaxFontSizePx);
  const [scaleX, setScaleX] = useState(1);

  const updateLayout = useCallback(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) {
      return;
    }

    const styles = window.getComputedStyle(container);
    const availableWidth = Math.max(
      0,
      container.clientWidth - getPixelValue(styles.paddingLeft) - getPixelValue(styles.paddingRight)
    );

    if (availableWidth <= 0) {
      setFontSizePx(identityMaxFontSizePx);
      setScaleX(1);
      return;
    }

    const previousFontSize = text.style.fontSize;
    const previousTransform = text.style.transform;
    text.style.fontSize = `${identityMaxFontSizePx}px`;
    text.style.transform = themeRenderingTokens.transformNone;
    const naturalWidth = Math.max(text.scrollWidth, text.getBoundingClientRect().width);
    text.style.fontSize = previousFontSize;
    text.style.transform = previousTransform;

    if (naturalWidth <= 0 || naturalWidth <= availableWidth) {
      setFontSizePx(identityMaxFontSizePx);
      setScaleX(1);
      return;
    }

    const exactFontSize = identityMaxFontSizePx * (availableWidth / naturalWidth);
    const nextFontSize = Math.max(identityMinFontSizePx, Math.min(identityMaxFontSizePx, exactFontSize));
    const roundedFontSize = Math.floor(nextFontSize * 10) / 10;
    const nextScaleX = exactFontSize < identityMinFontSizePx
      ? exactFontSize / identityMinFontSizePx
      : 1;

    setFontSizePx((current) => Math.abs(current - roundedFontSize) < 0.05 ? current : roundedFontSize);
    setScaleX((current) => Math.abs(current - nextScaleX) < 0.01 ? current : nextScaleX);
  }, []);

  useLayoutEffect(() => {
    updateLayout();

    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    let isDisposed = false;
    const rafId = window.requestAnimationFrame(updateLayout);
    void document.fonts?.ready.then(() => {
      if (!isDisposed) {
        updateLayout();
      }
    });

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateLayout);
      return () => {
        isDisposed = true;
        window.cancelAnimationFrame(rafId);
        window.removeEventListener('resize', updateLayout);
      };
    }

    const observer = new ResizeObserver(updateLayout);
    observer.observe(container);
    return () => {
      isDisposed = true;
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [updateLayout, value]);

  return (
    <span
      ref={containerRef}
      className="min-w-0 flex-1 overflow-hidden pr-2 text-[var(--vlaina-text-primary)]"
      title={value}
    >
      <span
        ref={textRef}
        className="inline-block max-w-none origin-left whitespace-nowrap font-bold leading-none"
        style={{
          fontSize: `${fontSizePx}px`,
          transform: scaleX < 1 ? `scaleX(${scaleX})` : undefined,
        }}
      >
        {value}
      </span>
    </span>
  );
}

export const UserIdentityCard: React.FC<UserIdentityCardProps> = ({ onLogout, onSwitchAccount }) => {
  const username = useAccountSessionStore((state) => state.username);
  const primaryEmail = useAccountSessionStore((state) => state.primaryEmail);
  const isConnected = useAccountSessionStore((state) => state.isConnected);
  const provider = useAccountSessionStore((state) => state.provider);
  const membershipTier = useAccountSessionStore((state) => state.membershipTier);
  const membershipName = useAccountSessionStore((state) => state.membershipName);
  const { t } = useI18n();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const displayName = username || primaryEmail || 'vlaina';
  const displayIdentity = primaryEmail || username || 'vlaina';
  const userAvatar = useUserAvatar();
  const shouldUseAvatarSurface = provider === 'google';
  const isMembershipPending = isConnected && !membershipTier && !membershipName;
  const shouldShowMembershipBadge = isConnected && !isMembershipPending && membershipTier !== 'free';
  const membershipBadgeLabel = membershipName || '';

  const membershipPillClassName = membershipTier === 'plus'
    ? 'bg-[var(--vlaina-color-membership-plus-bg)] text-[var(--vlaina-color-membership-plus-fg)]'
    : membershipTier === 'pro'
      ? 'bg-[var(--vlaina-color-membership-pro-bg)] text-[var(--vlaina-color-membership-pro-fg)]'
      : membershipTier === 'max'
        ? 'bg-[var(--vlaina-color-membership-max-bg)] text-[var(--vlaina-color-membership-max-fg)]'
        : membershipTier === 'ultra'
          ? 'bg-[var(--vlaina-color-membership-ultra-bg)] text-[var(--vlaina-color-membership-ultra-fg)]'
          : 'bg-[var(--vlaina-color-setting-field)] text-[var(--vlaina-sidebar-notes-text)]';

  return (
    <div className="group relative flex select-none items-start gap-3 px-3 pb-2.5 pt-3">
      <div className="relative shrink-0 group/avatar">
        <div
          className={cn(
            'relative flex h-12 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-lg transition-all duration-[var(--vlaina-duration-300)] hover:scale-[var(--vlaina-scale-105)]',
            shouldUseAvatarSurface &&
              'border border-[var(--vlaina-border)] bg-[var(--vlaina-color-input-surface)] shadow-[var(--vlaina-shadow-sm)] backdrop-blur-[var(--vlaina-backdrop-blur-sm)]'
          )}
        >
          <AccountAvatarImage
            src={userAvatar}
            fallbackSrc={fallbackAvatarUrl}
            alt={displayName}
            className="h-full w-full object-cover"
          />
        </div>
        {shouldShowMembershipBadge ? (
          <span
            role="button"
            tabIndex={0}
            onClick={() => void openExternalHref(membershipPlanUrl)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                void openExternalHref(membershipPlanUrl);
              }
            }}
            className={cn(
              'absolute -bottom-1 -right-1.5 z-[var(--vlaina-z-10)] inline-flex cursor-pointer select-none items-center rounded-[var(--vlaina-radius-pill)] px-2 py-[var(--vlaina-space-3px)] [font-size:var(--vlaina-font-10)] font-semibold normal-case tracking-normal leading-none',
              membershipPillClassName
            )}
          >
            {membershipBadgeLabel}
          </span>
        ) : null}
      </div>
      <div className="flex h-12 min-w-0 flex-1 flex-col justify-between py-0.5">
        <div className="flex min-h-7 items-center justify-between">
          <AutoFitIdentityText value={displayIdentity} />

          <div className="flex items-center gap-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(!isMenuOpen);
              }}
              className={cn(
                'group -mr-1 flex h-7 w-7 cursor-pointer items-center justify-center text-[var(--vlaina-sidebar-chat-text)]',
                ghostIconButtonClass,
                isMenuOpen && 'bg-[var(--vlaina-color-pill-surface-hover)] text-[var(--vlaina-accent)] shadow-[var(--vlaina-shadow-menu-hover)]'
              )}
            >
              <Icon
                size="md"
                name="common.more"
                className={cn(
                  'transition-colors group-hover:text-[var(--vlaina-accent)]',
                  isMenuOpen ? 'text-[var(--vlaina-accent)]' : 'text-[var(--vlaina-sidebar-chat-text)]'
                )}
              />
            </button>
          </div>
        </div>

        {isConnected ? <ManagedQuotaMeter className="mt-0" /> : null}

        {isMenuOpen && (
          <>
            <div className="fixed inset-0 z-[var(--vlaina-z-60)]" onClick={() => setIsMenuOpen(false)} />
            <div
              className={cn(
                "absolute left-[var(--vlaina-offset-account-menu-anchor-x)] top-8 z-[var(--vlaina-z-70)] w-48 rounded-[var(--vlaina-ui-radius-panel)] border-transparent p-1 animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-[var(--vlaina-duration-75)]",
                raisedPillSurfaceClass
              )}
            >
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  onSwitchAccount();
                }}
                className={cn(
                  'group/item flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 text-left text-[var(--vlaina-font-base)] font-medium transition-[background-color,color,box-shadow]',
                  getSidebarIdleRowSurfaceClass('chat'),
                  'text-[var(--vlaina-sidebar-chat-text)] hover:!bg-[var(--vlaina-accent-light)] hover:text-[var(--vlaina-accent)] hover:shadow-[var(--vlaina-shadow-menu-hover)]'
                )}
              >
                <Icon size="md" name="user.switch" className="text-[var(--vlaina-accent)]" />
                <span className="whitespace-nowrap">{t('account.switchAccount')}</span>
              </button>
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  void Promise.resolve(onLogout()).catch(() => undefined);
                }}
                className={cn(
                  'group/item flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 text-left text-[var(--vlaina-font-base)] font-medium transition-[background-color,color,box-shadow]',
                  getSidebarIdleRowSurfaceClass('chat'),
                  'text-[var(--vlaina-sidebar-chat-text)] hover:!bg-[var(--vlaina-accent-light)] hover:text-[var(--vlaina-accent)] hover:shadow-[var(--vlaina-shadow-menu-hover)]'
                )}
              >
                <Icon size="md" name="user.logout" className="text-[var(--vlaina-accent)]" />
                {t('account.logOut')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
