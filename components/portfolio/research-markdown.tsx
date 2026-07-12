import { Fragment, type ReactNode } from "react";

/**
 * Safe, dependency-free renderer for the Markdown subset used in stock
 * research notes. It deliberately renders text as React nodes rather than
 * injecting HTML, so Obsidian note content cannot execute browser code.
 */
export function ResearchMarkdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line) {
      index++;
      continue;
    }

    if (/^\|.*\|$/.test(line) && isTableDivider(lines[index + 1] ?? "")) {
      const headers = parseTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && /^\|.*\|$/.test(lines[index].trim())) {
        rows.push(parseTableRow(lines[index].trim()));
        index++;
      }
      blocks.push(
        <div key={`table-${index}`} className="my-3 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-dashboard-border bg-dashboard-surface-2/70">
                {headers.map((header, headerIndex) => (
                  <th
                    key={headerIndex}
                    className="px-3 py-2 font-semibold text-dashboard-muted"
                  >
                    {renderInline(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="border-b border-dashboard-border/70 align-top"
                >
                  {headers.map((_, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="px-3 py-2 leading-relaxed text-dashboard-text"
                    >
                      {renderInline(row[cellIndex] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const className =
        level <= 2
          ? "mt-4 text-[15px] font-semibold text-dashboard-text"
          : "mt-3 text-[13px] font-semibold text-dashboard-muted";
      blocks.push(
        <div key={`heading-${index}`} className={className}>
          {renderInline(heading[2])}
        </div>,
      );
      index++;
      continue;
    }

    if (/^(---|\*\*\*|___)$/.test(line)) {
      blocks.push(
        <hr key={`rule-${index}`} className="my-3 border-dashboard-border" />,
      );
      index++;
      continue;
    }

    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*+]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*+]\s+/, ""));
        index++;
      }
      blocks.push(
        <ul
          key={`list-${index}`}
          className="my-2 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-dashboard-text"
        >
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const candidate = lines[index].trim();
      if (
        !candidate ||
        /^(#{1,4}\s+|[-*+]\s+|\|.*\|$|---$|\*\*\*$|___$)/.test(candidate)
      )
        break;
      paragraph.push(candidate);
      index++;
    }
    blocks.push(
      <p
        key={`paragraph-${index}`}
        className="my-2 text-[13px] leading-relaxed text-dashboard-text"
      >
        {renderInline(paragraph.join(" "))}
      </p>,
    );
  }

  return <div className="text-dashboard-text">{blocks}</div>;
}

function isTableDivider(value: string): boolean {
  const cells = parseTableRow(value.trim());
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseTableRow(row: string): string[] {
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderInline(value: string): ReactNode[] {
  return value
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={index} className="font-semibold text-dashboard-text">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={index}
            className="rounded bg-dashboard-surface-2 px-1 py-0.5 font-mono text-[11px] text-dashboard-accent"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return <Fragment key={index}>{part}</Fragment>;
    });
}
