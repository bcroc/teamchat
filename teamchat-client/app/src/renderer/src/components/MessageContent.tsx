import { useMemo } from 'react';
import { clsx } from 'clsx';
import LinkPreview, { extractUrls } from './LinkPreview';

interface MessageContentProps {
  content: string;
  className?: string;
  showLinkPreviews?: boolean;
}

// Simple markdown-like parsing without external dependencies
export default function MessageContent({ content, className, showLinkPreviews = true }: MessageContentProps) {
  const parsed = useMemo(() => parseMessage(content), [content]);
  const urls = useMemo(() => showLinkPreviews ? extractUrls(content) : [], [content, showLinkPreviews]);

  return (
    <div className={clsx('whitespace-pre-wrap break-words', className)}>
      {parsed}
      {/* Link previews - show max 3 */}
      {urls.slice(0, 3).map((url) => (
        <LinkPreview key={url} url={url} />
      ))}
    </div>
  );
}

function parseMessage(text: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  let key = 0;

  // First, handle code blocks
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  const parts: { type: 'text' | 'codeblock'; content: string; language?: string }[] = [];

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'codeblock', content: match[2], language: match[1] || undefined });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  for (const part of parts) {
    if (part.type === 'codeblock') {
      elements.push(
        <pre
          key={key++}
          className="bg-gray-100 rounded-lg p-3 my-2 overflow-x-auto text-sm font-mono"
        >
          {part.language && (
            <div className="text-xs text-gray-500 mb-2">{part.language}</div>
          )}
          <code>{part.content}</code>
        </pre>
      );
    } else {
      elements.push(...parseInlineElements(part.content, key));
      key += 1000; // Skip ahead to avoid key collisions
    }
  }

  return elements;
}

function parseInlineElements(text: string, startKey: number): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  let key = startKey;

  // Regex patterns for inline formatting
  const patterns = [
    { regex: /\*\*(.+?)\*\*/g, render: (content: string) => <strong key={key++}>{content}</strong> },
    { regex: /__(.+?)__/g, render: (content: string) => <strong key={key++}>{content}</strong> },
    { regex: /\*(.+?)\*/g, render: (content: string) => <em key={key++}>{content}</em> },
    { regex: /_(.+?)_/g, render: (content: string) => <em key={key++}>{content}</em> },
    { regex: /~~(.+?)~~/g, render: (content: string) => <del key={key++}>{content}</del> },
    { regex: /`([^`]+)`/g, render: (content: string) => (
      <code key={key++} className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-pink-600">
        {content}
      </code>
    )},
    // Mentions
    { regex: /@(\w+)/g, render: (content: string) => (
      <span key={key++} className="bg-primary-100 text-primary-700 px-1 rounded font-medium">
        @{content}
      </span>
    )},
    // Channel links
    { regex: /#(\w[-\w]*)/g, render: (content: string) => (
      <span key={key++} className="bg-blue-100 text-blue-700 px-1 rounded font-medium cursor-pointer hover:underline">
        #{content}
      </span>
    )},
    // URLs
    { regex: /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g, render: (url: string) => (
      <a
        key={key++}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary-600 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    )},
  ];

  // Process text with all patterns
  let processedText = text;
  const replacements: { start: number; end: number; element: React.ReactNode }[] = [];

  for (const { regex, render } of patterns) {
    let match;
    const newRegex = new RegExp(regex.source, regex.flags);
    while ((match = newRegex.exec(processedText)) !== null) {
      // Check if this position is already replaced
      const overlaps = replacements.some(
        (r) => (match!.index >= r.start && match!.index < r.end) ||
               (match!.index + match![0].length > r.start && match!.index + match![0].length <= r.end)
      );
      if (!overlaps) {
        replacements.push({
          start: match.index,
          end: match.index + match[0].length,
          element: render(match[1] || match[0]),
        });
      }
    }
  }

  // Sort by position
  replacements.sort((a, b) => a.start - b.start);

  // Build result
  let lastEnd = 0;
  for (const replacement of replacements) {
    if (replacement.start > lastEnd) {
      elements.push(<span key={key++}>{processedText.slice(lastEnd, replacement.start)}</span>);
    }
    elements.push(replacement.element);
    lastEnd = replacement.end;
  }

  if (lastEnd < processedText.length) {
    elements.push(<span key={key++}>{processedText.slice(lastEnd)}</span>);
  }

  return elements.length > 0 ? elements : [<span key={key}>{text}</span>];
}

// Export utility for mention parsing
export function extractMentions(text: string): string[] {
  const mentions: string[] = [];
  const mentionRegex = /@(\w+)/g;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }

  return mentions;
}

// Export utility for special mentions
export function hasSpecialMention(text: string): { channel: boolean; here: boolean; everyone: boolean } {
  return {
    channel: /@channel\b/i.test(text),
    here: /@here\b/i.test(text),
    everyone: /@everyone\b/i.test(text),
  };
}
