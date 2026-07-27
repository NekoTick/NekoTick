import type { Attachment } from '@/lib/storage/attachmentStorage';
import { getStorageAdapter } from '@/lib/storage/adapter';
import {
  extractTrustedManagedAttachmentPathFilename,
  isTextAttachment,
  MAX_CHAT_MESSAGE_FILE_ATTACHMENTS,
  MAX_CHAT_MESSAGE_FILE_CONTEXT_CHARS,
} from './attachmentKinds';
import { trimString } from './helperCore';

function escapeAttachedFileName(name: string): string {
  return name.replace(/[<>&"]/g, (character) => {
    switch (character) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      default: return character;
    }
  });
}

async function readTextAttachmentContent(attachment: Attachment): Promise<string | null> {
  if (typeof attachment.textContent === 'string') {
    return attachment.textContent;
  }

  if (!extractTrustedManagedAttachmentPathFilename(attachment.path)) {
    return null;
  }

  try {
    const storage = getStorageAdapter();
    return await storage.readFile(attachment.path, MAX_CHAT_MESSAGE_FILE_CONTEXT_CHARS);
  } catch {
    return null;
  }
}

export async function buildMessageFileAttachmentContext(attachments: Attachment[]): Promise<string> {
  const sections: string[] = [];
  let usedChars = 0;

  for (const attachment of attachments) {
    if (!isTextAttachment(attachment)) {
      continue;
    }
    if (sections.length >= MAX_CHAT_MESSAGE_FILE_ATTACHMENTS) {
      break;
    }

    const rawContent = await readTextAttachmentContent(attachment);
    const content = rawContent?.replace(/\r\n?/g, '\n').trim();
    if (!content) {
      continue;
    }

    const safeName = escapeAttachedFileName(trimString(attachment.name) || 'attachment.txt');
    const remainingChars = MAX_CHAT_MESSAGE_FILE_CONTEXT_CHARS - usedChars;
    if (remainingChars <= 0) {
      break;
    }

    const header = `<attached_file name="${safeName}">\n`;
    const footer = '\n</attached_file>';
    const availableContentChars = remainingChars - header.length - footer.length - (sections.length > 0 ? 2 : 0);
    if (availableContentChars <= 0) {
      break;
    }

    const boundedContent = content.slice(0, availableContentChars);
    const section = `${header}${boundedContent}${footer}`;
    sections.push(section);
    usedChars += section.length + (sections.length > 1 ? 2 : 0);
  }

  return sections.length > 0 ? `Attached files:\n\n${sections.join('\n\n')}` : '';
}

export function buildMessageFileAttachmentMentionText(attachments: Attachment[]): string {
  return attachments
    .filter(isTextAttachment)
    .slice(0, MAX_CHAT_MESSAGE_FILE_ATTACHMENTS)
    .map((attachment) => `@${trimString(attachment.name) || 'attachment.txt'}`)
    .join(' ');
}
