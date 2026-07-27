import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  isComputerCommandApprovalForSession,
  respondToComputerCommandApproval,
  usePendingComputerCommandApprovals,
  type ComputerCommandApprovalDecision,
} from '@/lib/ai/computerUse/approvalState';
import { useI18n } from '@/lib/i18n';
import { managedQuotaNoticeSurfaceClass } from '@/components/Chat/features/Input/components/ManagedQuotaNotice';
import { cn } from '@/lib/utils';

interface ComputerCommandApprovalNoticeProps {
  sessionId?: string | null;
}

export function ComputerCommandApprovalNotice({ sessionId }: ComputerCommandApprovalNoticeProps) {
  const { t } = useI18n();
  const approvals = usePendingComputerCommandApprovals();
  const approval = approvals.find((item) => isComputerCommandApprovalForSession(item, sessionId));
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    setResponding(false);
  }, [approval?.id]);

  if (!approval) return null;

  const respond = async (decision: ComputerCommandApprovalDecision) => {
    if (responding) return;
    setResponding(true);
    try {
      const accepted = await respondToComputerCommandApproval(approval.id, decision);
      if (!accepted) setResponding(false);
    } catch {
      setResponding(false);
    }
  };

  return (
    <div
      data-computer-command-approval="true"
      data-no-focus-input="true"
      aria-label={t('chat.computerUse')}
      className={cn(
        managedQuotaNoticeSurfaceClass,
        'items-stretch justify-start px-4 text-left',
      )}
    >
      <div className="min-w-0 basis-full font-normal">
        {approval.purpose ? (
          <div className="mb-1 text-[var(--vlaina-text-secondary)]">
            {t('chat.computerUse.purpose')}: {approval.purpose}
          </div>
        ) : null}
        <pre className="max-h-[var(--vlaina-size-160px)] overflow-auto whitespace-pre-wrap break-words rounded-[var(--vlaina-radius-8px)] bg-[var(--vlaina-code-block-background)] px-2 py-1.5 font-mono text-[var(--vlaina-font-xs)] leading-5 text-[var(--vlaina-code-syntax-foreground)]">
          {approval.command}
        </pre>
        {approval.cwd ? (
          <div className="mt-1 break-all text-[var(--vlaina-font-xs)] text-[var(--vlaina-text-tertiary)]">
            {t('chat.computerUse.workingDirectory')}: {approval.cwd}
          </div>
        ) : null}
      </div>
      <div className="flex basis-full flex-wrap items-center justify-end gap-1.5">
        <Button
          type="button"
          size="sm"
          className="!rounded-[var(--vlaina-radius-pill)]"
          disabled={responding}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void respond('run_once')}
        >
          {t('chat.computerUse.runOnce')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="!rounded-[var(--vlaina-radius-pill)]"
          disabled={responding || !approval.canAlwaysAllow}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void respond('always')}
        >
          {t('chat.computerUse.alwaysRun')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="!rounded-[var(--vlaina-radius-pill)]"
          disabled={responding}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void respond('cancel')}
        >
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
