import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Globe, Mail, QrCode } from 'lucide-react';
import { FaDiscord, FaGithub, FaQq, FaWeixin } from 'react-icons/fa';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { useI18n } from '@/lib/i18n';
import { openExternalHref } from '@/lib/navigation/externalLinks';
import { cn } from '@/lib/utils';
import { themeColorTokens, themeIconTokens, themeQrTokens } from '@/styles/themeTokens';
import type { CommunitySettings } from './aboutCommunitySettings';
import {
  communityPillClassName,
  discordInviteUrl,
  githubRepositoryUrl,
  officialWebsiteLabel,
  officialWebsiteUrl,
  slackInviteUrl,
  supportEmail,
  supportEmailHref,
} from './aboutTabShared';

type CommunityQrPillId = 'qq' | 'wechat';

function CommunityQrPill({
  id,
  title,
  label,
  icon,
  qrText,
  detail,
  isOpen,
  onOpen,
  onClose,
}: {
  id: CommunityQrPillId;
  title: string;
  label: string;
  icon: ReactNode;
  qrText: string;
  detail?: string;
  isOpen: boolean;
  onOpen: (id: CommunityQrPillId) => void;
  onClose: (id: CommunityQrPillId) => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const panelId = `settings-community-${id}-qr`;

  useEffect(() => {
    if (!isOpen || !qrText) {
      setQrDataUrl('');
      return;
    }

    let cancelled = false;
    void import('qrcode')
      .then((QRCode) => QRCode.toString(qrText, {
        color: {
          dark: themeColorTokens.qrForeground,
          light: themeColorTokens.transparentWhite,
        },
        errorCorrectionLevel: 'M',
        margin: themeQrTokens.marginModules,
        type: 'svg',
        width: themeQrTokens.widthPx,
      }))
      .then((svg) => {
        if (!cancelled) {
          setQrDataUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [qrText, isOpen]);

  return (
    <div
      className="relative"
      data-community-qr-pill={id}
      onBlur={() => onClose(id)}
      onFocus={() => onOpen(id)}
      onMouseEnter={() => onOpen(id)}
      onMouseLeave={() => onClose(id)}
    >
      <button
        type="button"
        aria-label={title}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className={cn(communityPillClassName, raisedPillSurfaceClass)}
      >
        {icon}
        <span>{label}</span>
      </button>
      <div className={cn(
        'pointer-events-none absolute left-1/2 top-full z-[var(--vlaina-z-20)] mt-3 w-[var(--vlaina-size-168px)] -translate-x-1/2 rounded-[var(--vlaina-ui-radius-panel)] p-3 opacity-[var(--vlaina-opacity-0)] transition-opacity duration-[var(--vlaina-duration-150)]',
        isOpen && 'opacity-[var(--vlaina-opacity-100)]',
        raisedPillSurfaceClass
      )}
        id={panelId}
        aria-hidden={!isOpen}
        data-community-qr-panel={id}
      >
        {detail ? (
          <div className="mb-1 truncate text-center text-[var(--vlaina-font-xs)] font-bold tabular-nums text-[var(--vlaina-sidebar-notes-text)]">
            {detail}
          </div>
        ) : null}
        <div className="flex aspect-square w-full items-center justify-center rounded-[var(--vlaina-radius-20px)] text-[var(--vlaina-sidebar-notes-text-soft)]">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={title} className="h-full w-full rounded-[var(--vlaina-radius-16px)] object-contain" draggable={false} />
          ) : (
            <div className="flex flex-col items-center gap-2 text-[var(--vlaina-font-xs)] font-medium">
              <QrCode
                size={themeIconTokens.sizeQrPlaceholder}
                strokeWidth={themeIconTokens.strokeQrPlaceholder}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WebsitePill() {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={() => void openExternalHref(officialWebsiteUrl)}
      aria-label={t('settings.about.openWebsite')}
      className={cn(communityPillClassName, raisedPillSurfaceClass)}
    >
      <Globe size={themeIconTokens.sizeSidebar} className="text-[var(--vlaina-accent)]" />
      <span>{officialWebsiteLabel}</span>
    </button>
  );
}

function EmailPill() {
  return (
    <button
      type="button"
      onClick={() => void openExternalHref(supportEmailHref)}
      aria-label={supportEmail}
      className={cn(communityPillClassName, raisedPillSurfaceClass)}
    >
      <Mail size={themeIconTokens.sizeSidebar} className="text-[var(--vlaina-accent)]" />
      <span>{supportEmail}</span>
    </button>
  );
}

function DiscordPill() {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={() => void openExternalHref(discordInviteUrl)}
      aria-label={t('settings.about.openDiscord')}
      className={cn(communityPillClassName, raisedPillSurfaceClass)}
    >
      <FaDiscord size={themeIconTokens.sizeSidebar} className="text-[var(--vlaina-brand-discord)]" />
      <span>{t('settings.about.discord')}</span>
    </button>
  );
}

function SlackLogoIcon({ size }: { size: number }) {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      focusable="false"
      height={size}
      viewBox={themeIconTokens.viewBoxDefault}
      width={size}
    >
      <path fill={themeColorTokens.brandSlackRed} d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52z" />
      <path fill={themeColorTokens.brandSlackRed} d="M6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" />
      <path fill={themeColorTokens.brandSlackBlue} d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834z" />
      <path fill={themeColorTokens.brandSlackBlue} d="M8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" />
      <path fill={themeColorTokens.brandSlackGreen} d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834z" />
      <path fill={themeColorTokens.brandSlackGreen} d="M17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" />
      <path fill={themeColorTokens.brandSlackYellow} d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52z" />
      <path fill={themeColorTokens.brandSlackYellow} d="M15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
    </svg>
  );
}

function SlackPill() {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={() => void openExternalHref(slackInviteUrl)}
      aria-label={t('settings.about.openSlack')}
      className={cn(communityPillClassName, raisedPillSurfaceClass)}
    >
      <SlackLogoIcon size={themeIconTokens.sizeSidebar} />
      <span>{t('settings.about.slack')}</span>
    </button>
  );
}

function GithubPill() {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={() => void openExternalHref(githubRepositoryUrl)}
      aria-label={t('settings.about.openGithub')}
      className={cn(communityPillClassName, raisedPillSurfaceClass)}
    >
      <FaGithub size={themeIconTokens.sizeSidebar} className="text-[var(--vlaina-sidebar-notes-text)]" />
      <span>{t('settings.about.github')}</span>
    </button>
  );
}

export function CommunityPills({ community }: { community: CommunitySettings }) {
  const { t } = useI18n();
  const [activeQrPill, setActiveQrPill] = useState<CommunityQrPillId | null>(null);
  const rowClassName =
    'flex min-w-0 max-w-full flex-wrap items-center gap-1.5 gap-y-2 overflow-visible max-[420px]:gap-1 max-[420px]:gap-y-2';

  const closeQrPill = useCallback((id: CommunityQrPillId) => {
    setActiveQrPill((current) => current === id ? null : current);
  }, []);

  return (
    <div className="space-y-2 overflow-visible px-1.5 py-1 max-[420px]:px-0">
      <div className={rowClassName}>
        <WebsitePill />
        <EmailPill />
      </div>
      <div className={rowClassName}>
        <GithubPill />
        <DiscordPill />
        <SlackPill />
        <CommunityQrPill
          id="qq"
          title={t('settings.about.qqGroup')}
          label="QQ"
          icon={<FaQq size={themeIconTokens.sizeSidebar} className="text-[var(--vlaina-brand-qq)]" />}
          qrText={community.qqQrCodeText}
          detail={community.qqGroupNumber || undefined}
          isOpen={activeQrPill === 'qq'}
          onOpen={setActiveQrPill}
          onClose={closeQrPill}
        />
        <CommunityQrPill
          id="wechat"
          title={t('settings.about.wechatGroup')}
          label="WeChat"
          icon={<FaWeixin size={themeIconTokens.sizeSidebar} className="text-[var(--vlaina-brand-wechat)]" />}
          qrText={community.wechatQrCodeText}
          isOpen={activeQrPill === 'wechat'}
          onOpen={setActiveQrPill}
          onClose={closeQrPill}
        />
      </div>
    </div>
  );
}
