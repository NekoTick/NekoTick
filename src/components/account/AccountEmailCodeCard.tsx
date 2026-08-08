import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { requestNativeCaretOverlayRefresh } from '@/hooks/useNativeCaretOverlay';

const HAN_CHARACTERS_REGEX = /\p{Script=Han}/gu;

interface AccountEmailCodeCardProps {
  isCompact?: boolean;
  disabled?: boolean;
  onEmailCodeRequest: (email: string) => Promise<boolean>;
  onEmailCodeVerify: (email: string, code: string) => Promise<boolean>;
}

export function AccountEmailCodeCard({
  disabled,
  onEmailCodeRequest,
  onEmailCodeVerify,
}: AccountEmailCodeCardProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [isLoading, setIsLoading] = useState(false);
  const isVerificationCodeComplete = code.length === 6;
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const requestCodePromiseRef = useRef<{ email: string; promise: Promise<boolean> } | null>(null);
  const verifyCodePromiseRef = useRef<{ email: string; code: string; promise: Promise<boolean> } | null>(null);

  const returnToEmailStep = () => {
    setStep('email');
  };

  useEffect(() => {
    if (step !== 'code' || disabled || isLoading) {
      return;
    }

    codeInputRef.current?.focus();
  }, [step, disabled, isLoading]);

  useEffect(() => {
    if (step !== 'email' || disabled || isLoading) {
      return;
    }

    emailInputRef.current?.focus();
  }, [step, disabled, isLoading]);

  useLayoutEffect(() => {
    return () => {
      const activeElement = document.activeElement;
      if (activeElement === emailInputRef.current || activeElement === codeInputRef.current) {
        (activeElement as HTMLElement).blur();
      }
      requestNativeCaretOverlayRefresh();
    };
  }, []);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || isLoading) return;
    if (requestCodePromiseRef.current?.email === normalizedEmail) {
      const success = await requestCodePromiseRef.current.promise;
      if (success) {
        setStep('code');
      }
      return;
    }
    setIsLoading(true);
    let requestPromise: Promise<boolean> | null = null;
    try {
      requestPromise = onEmailCodeRequest(email);
      requestCodePromiseRef.current = { email: normalizedEmail, promise: requestPromise };
      const success = await requestPromise;
      if (success) {
        setStep('code');
      }
    } finally {
      if (!requestPromise || requestCodePromiseRef.current?.promise === requestPromise) {
        requestCodePromiseRef.current = null;
        setIsLoading(false);
      }
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isVerificationCodeComplete || isLoading) return;
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.trim();
    if (
      verifyCodePromiseRef.current?.email === normalizedEmail &&
      verifyCodePromiseRef.current.code === normalizedCode
    ) {
      await verifyCodePromiseRef.current.promise;
      return;
    }
    setIsLoading(true);
    let verifyPromise: Promise<boolean> | null = null;
    try {
      verifyPromise = onEmailCodeVerify(email, code);
      verifyCodePromiseRef.current = { email: normalizedEmail, code: normalizedCode, promise: verifyPromise };
      await verifyPromise;
    } finally {
      if (!verifyPromise || verifyCodePromiseRef.current?.promise === verifyPromise) {
        verifyCodePromiseRef.current = null;
        setIsLoading(false);
      }
    }
  };

  if (step === 'email') {
    return (
      <form noValidate onSubmit={handleRequestCode} className="space-y-4 w-full">
        <input
          ref={emailInputRef}
          type="text"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value.replace(HAN_CHARACTERS_REGEX, ''))}
          placeholder={t('account.emailAddress')}
          disabled={disabled || isLoading}
          className={cn(
            "h-14 w-full rounded-full px-5 py-3 text-center text-[var(--vlaina-font-sm)] font-medium text-[var(--vlaina-color-text-strong)] transition-all duration-[var(--vlaina-duration-200)] outline-none sm:h-[var(--vlaina-size-60px)] sm:px-6 sm:py-3.5 sm:text-[var(--vlaina-font-15)] md:h-16",
            "placeholder:text-[var(--vlaina-sidebar-notes-text-soft)]",
            "focus:ring-2 focus:ring-[var(--vlaina-color-accent-focus-ring)]",
            "disabled:cursor-not-allowed disabled:opacity-[var(--vlaina-opacity-50)]",
            raisedPillSurfaceClass
          )}
        />
        <button
          type="submit"
          disabled={disabled || isLoading || !email}
          className={cn(
            "h-14 w-full rounded-full px-5 text-[var(--vlaina-font-sm)] font-semibold text-[var(--vlaina-color-text-strong)] transition-all duration-[var(--vlaina-duration-200)] active:scale-[var(--vlaina-scale-985)] sm:h-[var(--vlaina-size-60px)] sm:text-[var(--vlaina-font-15)] md:h-16",
            "disabled:cursor-not-allowed disabled:opacity-[var(--vlaina-opacity-50)] disabled:active:scale-[var(--vlaina-scale-100)]",
            raisedPillSurfaceClass
          )}
        >
          {isLoading ? t('account.sending') : t('account.continueWithEmail')}
        </button>
      </form>
    );
  }

  return (
    <form noValidate onSubmit={handleVerifyCode} className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-[var(--vlaina-duration-100)]">
      <div className="space-y-2">
        <button
          type="button"
          onClick={returnToEmailStep}
          disabled={disabled || isLoading}
          className="mx-auto block max-w-full truncate px-2 text-center text-[var(--vlaina-font-11)] font-bold text-[var(--vlaina-sidebar-notes-text-soft)] transition-colors hover:text-[var(--vlaina-color-text-strong)] disabled:cursor-not-allowed disabled:opacity-[var(--vlaina-opacity-50)]"
        >
          {email}
        </button>
        <input
          ref={codeInputRef}
          type="text"
          spellCheck={false}
          value={code}
          onChange={(e) => {
            const nextCode = e.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(nextCode);
          }}
          placeholder=""
          disabled={disabled || isLoading}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          className={cn(
            "h-14 w-full rounded-full text-center text-[var(--vlaina-font-26)] font-black tracking-[var(--vlaina-tracking-code-sm)] text-[var(--vlaina-color-text-strong)] transition-all duration-[var(--vlaina-duration-200)] outline-none sm:h-[var(--vlaina-size-60px)] sm:text-[var(--vlaina-font-30)] sm:tracking-[var(--vlaina-tracking-code-md)] md:h-16 md:text-3xl md:tracking-[var(--vlaina-tracking-code-lg)]",
            "focus:ring-2 focus:ring-[var(--vlaina-color-accent-focus-ring)]",
            "disabled:cursor-not-allowed disabled:opacity-[var(--vlaina-opacity-50)]",
            raisedPillSurfaceClass
          )}
        />
      </div>
      <div className="flex flex-col gap-3">
        <button
          type="submit"
          disabled={disabled || isLoading || !isVerificationCodeComplete}
          className={cn(
            "h-14 w-full rounded-full px-5 text-[var(--vlaina-font-sm)] font-semibold text-[var(--vlaina-color-text-strong)] transition-all duration-[var(--vlaina-duration-200)] active:scale-[var(--vlaina-scale-985)] sm:h-[var(--vlaina-size-60px)] sm:text-[var(--vlaina-font-15)] md:h-16",
            "disabled:cursor-not-allowed disabled:opacity-[var(--vlaina-opacity-50)] disabled:active:scale-[var(--vlaina-scale-100)]",
            raisedPillSurfaceClass
          )}
        >
          {isLoading ? t('account.verifying') : t('account.verifyCode')}
        </button>
      </div>
    </form>
  );
}
