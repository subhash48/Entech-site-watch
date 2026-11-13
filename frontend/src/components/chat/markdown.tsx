import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders assistant Markdown (lists, tables, emphasis). Raw HTML is not rendered. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: (props) => <p {...props} />,
          ul: (props) => <ul className="list-disc space-y-1 pl-5" {...props} />,
          ol: (props) => <ol className="list-decimal space-y-1 pl-5" {...props} />,
          strong: (props) => <strong className="font-semibold" {...props} />,
          a: ({ href, ...props }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" className="text-primary underline underline-offset-2" {...props} />
          ),
          code: (props) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8em]" {...props} />,
          h1: (props) => <p className="font-semibold" {...props} />,
          h2: (props) => <p className="font-semibold" {...props} />,
          h3: (props) => <p className="font-semibold" {...props} />,
          table: (props) => (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs" {...props} />
            </div>
          ),
          th: (props) => <th className="border-b bg-muted/60 px-2 py-1.5 text-left font-medium" {...props} />,
          td: (props) => <td className="border-b px-2 py-1.5 align-top tabular" {...props} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
