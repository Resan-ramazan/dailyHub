import Link from "next/link";
import type { Issue } from "@/lib/news";
import Markdown from "./Markdown";
import { PageHead, Section, prettyDate } from "./ui";

export function IssueView({ issue, archive }: { issue: Issue; archive: string[] }) {
  return (
    <>
      <PageHead eyebrow={`AI brief · ${prettyDate(issue.date)}`} title={issue.headline} sub={issue.intro}>
        <div className="chips">
          {archive.slice(0, 7).map((d) => (
            <Link key={d} href={`/news/${d}`} className="chip" data-active={d === issue.date}>{prettyDate(d, { day: "numeric", month: "short" })}</Link>
          ))}
        </div>
      </PageHead>

      <Section n="01" title="Stories" aside={`${issue.items.length} ${issue.items.length === 1 ? "item" : "items"}`}>
        <div className="panel" style={{ padding: "4px 24px" }}>
          <div className="news-items">
            {issue.items.map((it, i) => (
              <article className="news-item" id={`item-${i + 1}`} key={i}>
                <span className="news-n">{String(i + 1).padStart(2, "0")}</span>
                <div style={{ minWidth: 0 }}>
                  <h3 className="news-title">{it.url ? <a href={it.url} target="_blank" rel="noreferrer">{it.title} ↗</a> : it.title}</h3>
                  <p className="news-sum">{it.summary}</p>
                  {it.why && <p className="news-why"><b>Why it matters:</b> {it.why}</p>}
                  {it.details && it.details.length > 0 && (
                    <dl className="news-details">
                      {it.details.map((d, k) => (
                        <div key={k}><dt>{d.label}</dt><dd><Markdown>{d.text}</Markdown></dd></div>
                      ))}
                    </dl>
                  )}
                  <div className="news-src">
                    {it.tag && <span className="tag">{it.tag}</span>}
                    {it.source && <span>{it.source}</span>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </Section>

      {(issue.sections ?? []).map((sec, i) => (
        <Section key={i} n={String(i + 2).padStart(2, "0")} title={sec.title}>
          <div className="panel"><Markdown>{sec.body}</Markdown></div>
        </Section>
      ))}

      {issue.for_you && (
        <Section n={String((issue.sections?.length ?? 0) + 2).padStart(2, "0")} title="For you" aside="Linked to your Job Radar skill gaps">
          <div className="panel"><Markdown>{issue.for_you}</Markdown></div>
        </Section>
      )}

      <p className="muted" style={{ fontSize: 12.5, marginTop: 40 }}>
        Written by {issue.model ?? "OpenAI"}{issue.generatedAt && <> · {new Date(issue.generatedAt).toLocaleString("en-GB")}</>}. AI summaries can be wrong; open the source before relying on a detail.
      </p>
    </>
  );
}

export function NewsSetup() {
  return (
    <>
      <PageHead eyebrow="AI brief" title="Your AI newsletter" sub="Written every morning by ChatGPT through the Codex tool in your ChatGPT app. It uses your ChatGPT plan: no API credits, no Claude tokens." />
      <Section n="01" title="Prompt" aside="newsletter/prompt.md">
        <div className="panel md"><p>Your instructions live in <code>newsletter/prompt.md</code>. The script adds today’s date, your profile, your Job Radar skill gaps and the output format.</p></div>
      </Section>
      <Section n="02" title="Run it" aside="Once by hand, then daily at 07:30">
        <div className="panel md"><p>Go to <Link href="/system">System</Link> and press <b>Run newsletter now</b>. It takes a few minutes. Then turn on the 07:30 schedule from the same page.</p></div>
      </Section>
    </>
  );
}
