import React from "react";
import ReactMarkdown from "react-markdown";

export default function MarkdownContent({ children, className = "" }) {
  return (
    <div className={`text-sm leading-relaxed text-ink ${className}`}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
          em: ({ children }) => <em className="text-ink-muted">{children}</em>,
          ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-1 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-1 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-glow underline underline-offset-2 hover:text-cyan-glow/80">
              {children}
            </a>
          ),
          h1: ({ children }) => <p className="mb-2 font-display text-base font-semibold text-ink">{children}</p>,
          h2: ({ children }) => <p className="mb-2 font-display text-sm font-semibold text-ink">{children}</p>,
          h3: ({ children }) => <p className="mb-1.5 text-sm font-semibold text-ink">{children}</p>,
          code: ({ children }) => <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-xs text-ink">{children}</code>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}