import { Fragment } from 'react';

type Segment = { type: 'text' | 'url'; value: string };

const URL_REGEX = /https?:\/\/[^\s]+/gi;

function trimTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?)\]}>]+$/, '');
}

function splitTextWithUrls(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_REGEX)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, index) });
    }
    const raw = match[0];
    const url = trimTrailingPunctuation(raw);
    segments.push({ type: 'url', value: url });
    lastIndex = index + raw.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments.length ? segments : [{ type: 'text', value: text }];
}

interface LinkifiedTextProps {
  text: string;
  className?: string;
}

export function LinkifiedText({ text, className }: LinkifiedTextProps) {
  const segments = splitTextWithUrls(text);

  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.type === 'url' ? (
          <a
            key={i}
            href={seg.value}
            target="_blank"
            rel="noopener noreferrer"
            className="linkified-url"
            onClick={(e) => e.stopPropagation()}
          >
            {seg.value}
          </a>
        ) : (
          <Fragment key={i}>{seg.value}</Fragment>
        ),
      )}
    </span>
  );
}
