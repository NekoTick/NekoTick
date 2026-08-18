import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { openExternalHref } from '@/lib/navigation/externalLinks';
import {
  aboutHeroBadgeClassName,
  aboutHeroLogoRadiusClassName,
  aboutHeroRuleClassName,
  appLogoUrl,
  officialWebsiteUrl,
} from './aboutTabShared';

export function AboutHero({ version }: { version: string }) {
  const { t } = useI18n();
  const openWebsite = useCallback(() => void openExternalHref(officialWebsiteUrl), []);

  return (
    <div className="flex min-w-0 flex-col items-center justify-center py-6 text-center">
      <div className="grid w-full max-w-[var(--vlaina-size-500px)] grid-cols-[1fr_var(--vlaina-size-48px)_auto_var(--vlaina-size-48px)_1fr] items-center gap-4 max-[640px]:grid-cols-[1fr_auto_1fr] max-[640px]:gap-2">
        <div className="flex min-w-0 justify-end">
          <button
            type="button"
            onClick={openWebsite}
            aria-label={t('settings.about.openWebsite')}
            className={cn(
              aboutHeroBadgeClassName,
              'cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--vlaina-accent)]'
            )}
          >
            <span className="text-[var(--vlaina-color-about-wordmark)]">vlaina</span>
          </button>
        </div>

        <div className={cn(aboutHeroRuleClassName, 'bg-gradient-to-r from-transparent to-[var(--vlaina-color-accent)]')} />

        <button
          type="button"
          onClick={openWebsite}
          aria-label={t('settings.about.openWebsite')}
          className={cn(
            'group relative shrink-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--vlaina-accent)]',
            aboutHeroLogoRadiusClassName
          )}
        >
          <div
            className={cn(
              'absolute -inset-[var(--vlaina-size-4px)] animate-[vlaina-about-logo-aura_var(--vlaina-duration-about-logo-aura)_var(--vlaina-ease-in-out)_infinite] bg-gradient-to-tr from-[var(--vlaina-color-accent)] to-[var(--vlaina-color-brand-pink)] blur-[var(--vlaina-blur-md)] motion-reduce:animate-none motion-reduce:opacity-[var(--vlaina-opacity-30)]',
              aboutHeroLogoRadiusClassName
            )}
          />
          <img
            src={appLogoUrl}
            alt="vlaina"
            className={cn(
              'relative h-[var(--vlaina-size-160px)] w-[var(--vlaina-size-160px)] shrink-0 object-contain shadow-[var(--vlaina-shadow-about-logo)] transition-all duration-[var(--vlaina-duration-300)] group-hover:scale-[var(--vlaina-scale-105)] max-[640px]:h-[var(--vlaina-size-112px)] max-[640px]:w-[var(--vlaina-size-112px)]',
              aboutHeroLogoRadiusClassName
            )}
            draggable={false}
          />
        </button>

        <div className={cn(aboutHeroRuleClassName, 'bg-gradient-to-l from-transparent to-[var(--vlaina-color-brand-pink)]')} />

        <div className="flex min-w-0 justify-start">
          <span className={cn(aboutHeroBadgeClassName, 'select-none')}>
            <span className="text-[var(--vlaina-color-about-version)]">v{version}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
