import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { writeTextToClipboard } from '@/lib/clipboard';
import { normalizeEscapedUrlSchemes } from '@/lib/notes/markdown/markdownSerializationUtils';
import { NOTES_COPY_FEEDBACK_DURATION_MS } from '../../../shared/copyFeedback';
import { BARE_DOMAIN_HREF_PATTERN } from '../../utils/constants';
import { sanitizeEditorLinkHref } from '../../utils/linkHref';

const EMAIL_ADDRESS_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
export const MAX_LINK_TOOLTIP_URL_CHARS = 16 * 1024;

export interface UseLinkStateProps {
    href: string;
    initialText?: string;
    isAutolink?: boolean;
    autoFocus?: boolean;
    containerElement?: HTMLElement | null;
    onEdit: (text: string, url: string, shouldClose?: boolean) => void;
    onClose: () => void;
}

function getPlainMailtoEmail(href: string, initialText: string): string | null {
    const normalizedHref = boundLinkTooltipUrl(normalizeEscapedUrlSchemes(href)).trim();
    if (!normalizedHref.toLowerCase().startsWith('mailto:')) return null;

    const email = normalizedHref.slice('mailto:'.length).split(/[?#]/, 1)[0]?.trim() ?? '';
    const label = initialText.trim();
    if (!EMAIL_ADDRESS_PATTERN.test(email)) return null;
    if (label && label.toLowerCase() !== email.toLowerCase()) return null;
    return email;
}

function boundLinkTooltipUrl(value: string): string {
    return value.length > MAX_LINK_TOOLTIP_URL_CHARS
        ? value.slice(0, MAX_LINK_TOOLTIP_URL_CHARS)
        : value;
}

function getUserFacingAutolinkText(href: string, initialText: string): string {
    const normalizedText = normalizeEscapedUrlSchemes(initialText).trim();
    return boundLinkTooltipUrl(normalizedText || normalizeEscapedUrlSchemes(href));
}

function isAutolinkTextForHref(href: string, initialText: string): boolean {
    const normalizedHref = normalizeEscapedUrlSchemes(href).trim();
    const normalizedText = normalizeEscapedUrlSchemes(initialText).trim();
    if (!normalizedText) return true;
    if (normalizedText === normalizedHref) return true;
    if (normalizedText.startsWith('www.') && `https://${normalizedText}` === normalizedHref) return true;
    if (BARE_DOMAIN_HREF_PATTERN.test(normalizedText) && `https://${normalizedText}` === normalizedHref) return true;
    return normalizedHref.toLowerCase().startsWith('mailto:') &&
        normalizedHref.slice('mailto:'.length) === normalizedText;
}

export function useLinkState({
    href,
    initialText = '',
    isAutolink: isAutolinkOverride,
    autoFocus = false,
    containerElement,
    onEdit,
    onClose
}: UseLinkStateProps) {
    const isNewLink = !href;
    const [mode, setMode] = useState<'view' | 'edit'>(isNewLink ? 'edit' : 'view');
    const [showCopied, setShowCopied] = useState(false);
    const [invalidUrlAttempt, setInvalidUrlAttempt] = useState(0);
    const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Detect if this is an autolink (pure URL) vs a Markdown link [text](url)
    const isAutolink = useMemo(() => {
        return isAutolinkOverride ?? isAutolinkTextForHref(href, initialText);
    }, [initialText, href, isAutolinkOverride]);

    const userFacingUrl = useMemo(
        () => isAutolink
            ? getUserFacingAutolinkText(href, initialText)
            : boundLinkTooltipUrl(normalizeEscapedUrlSchemes(href)),
        [href, initialText, isAutolink]
    );

    const getInitialEditText = () => {
        if (isAutolink) return '';
        return initialText;
    };

    const [editUrl, setEditUrlState] = useState(userFacingUrl);
    const [editText, setEditText] = useState(getInitialEditText);
    const setEditUrl = useCallback((value: string) => {
        setEditUrlState(boundLinkTooltipUrl(value));
    }, []);

    useEffect(() => {
        setEditUrlState(userFacingUrl);
        setEditText(isAutolink ? '' : initialText);
    }, [userFacingUrl, initialText, isAutolink]);

    useEffect(() => () => {
        if (copyFeedbackTimerRef.current) {
            clearTimeout(copyFeedbackTimerRef.current);
        }
    }, []);

    // Sync edit mode to parent container
    useEffect(() => {
        const container = containerElement ?? document.querySelector('.link-tooltip-container');
        if (container) {
            if (mode === 'edit') {
                container.setAttribute('data-editing', 'true');
            } else {
                container.removeAttribute('data-editing');
            }
        }
    }, [containerElement, mode]);

    const handleSaveEdit = useCallback((shouldClose: boolean = false) => {
        const trimmedUrl = editUrl.trim();
        if (trimmedUrl && !sanitizeEditorLinkHref(trimmedUrl)) {
            setInvalidUrlAttempt((attempt) => attempt + 1);
            return false;
        }

        const isEmptyOrMatchesUrl = !editText.trim() || editText.trim() === trimmedUrl;
        const textToSave = isEmptyOrMatchesUrl ? trimmedUrl : editText;

        const container = containerElement ?? document.querySelector('.link-tooltip-container');
        container?.removeAttribute('data-editing');

        onEdit(textToSave, trimmedUrl, shouldClose);
        if (!shouldClose) {
            setMode('view');
        }
        return true;
    }, [containerElement, editText, editUrl, onEdit]);

    const handleCancelEdit = useCallback(() => {
        const container = containerElement ?? document.querySelector('.link-tooltip-container');
        container?.removeAttribute('data-editing');

        setEditUrl(userFacingUrl);
        setEditText(isAutolink ? '' : initialText);
        onClose();
    }, [containerElement, userFacingUrl, initialText, isAutolink, onClose]);

    const handleCopy = useCallback(() => {
        let copyText: string;
        const normalizedHref = boundLinkTooltipUrl(normalizeEscapedUrlSchemes(href));
        const plainMailtoEmail = getPlainMailtoEmail(href, initialText);
        if (plainMailtoEmail) {
            copyText = plainMailtoEmail;
        } else if (isAutolink) {
            copyText = userFacingUrl;
        } else {
            copyText = normalizedHref;
        }
        void writeTextToClipboard(copyText).then((didCopy) => {
            if (!didCopy) return;

            setShowCopied(true);
            if (copyFeedbackTimerRef.current) {
                clearTimeout(copyFeedbackTimerRef.current);
            }
            copyFeedbackTimerRef.current = setTimeout(() => {
                copyFeedbackTimerRef.current = null;
                setShowCopied(false);
            }, NOTES_COPY_FEEDBACK_DURATION_MS);
        }, () => undefined);
    }, [isAutolink, href, initialText, userFacingUrl]);

    const displayUrl = userFacingUrl;

    return {
        mode, setMode,
        isAutolink,
        editUrl, setEditUrl,
        editText, setEditText,
        handleSaveEdit,
        handleCancelEdit,
        handleCopy,
        showCopied,
        displayUrl,
        isNewLink,
        autoFocus,
        invalidUrlAttempt
    };
}
