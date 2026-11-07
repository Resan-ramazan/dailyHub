#!/usr/bin/env python3
"""Fill Jobs/ with fictional demo data for the README screenshots.

Usage (from the repo root): python3 docs/make_demo_data.py
Then build and start the dashboard and open http://127.0.0.1:3333/jobs.
Companies are Microsoft's standard fictional names; the candidate is the fictional
"Alex Example" from profile/master_profile.md. Jobs/ is git-ignored.
"""
import csv
import datetime as dt
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JOBS = ROOT / "Jobs"
TODAY = dt.date.today()
day = lambda ago: (TODAY - dt.timedelta(days=ago)).isoformat()

# days ago, rank (0 = found by hand), match, company, title, location, status
DEMO = [
    (0, 1, 86, "Northwind AI", "Working Student AI Engineer (LLMs & RAG)", "Hamburg", "to apply"),
    (0, 2, 81, "Contoso Energy", "Werkstudent:in AI & Automation", "Hamburg / remote", "to apply"),
    (0, 3, 77, "Fabrikam Robotics", "Working Student Machine Learning", "Hamburg", "to apply"),
    (0, 4, 72, "Tailspin Data", "Werkstudent Data Engineering", "Remote (Germany)", "to apply"),
    (0, 5, 68, "Woodgrove Labs", "Working Student Frontend (React)", "Berlin, hybrid", "to apply"),
    (0, 0, 74, "Adatum Cloud", "Working Student Integrations", "Remote (Germany)", "applied"),
    (1, 1, 83, "Litware", "Junior AI Engineer", "Hamburg", "applied"),
    (1, 2, 79, "Proseware", "Working Student Software Engineer", "Remote (Germany)", "interview"),
    (1, 3, 70, "Lumen Health", "Werkstudent Softwareentwicklung", "Lübeck", "to apply"),
    (2, 1, 88, "Northwind AI", "Frontend Engineer Intern", "Remote (Germany)", "applied"),
    (2, 2, 73, "Wingtip Games", "Working Student Data Science", "Hamburg", "rejected"),
    (2, 3, 66, "Fourth Coffee", "Working Student QA Automation", "Hamburg", "skipped"),
    (9, 1, 75, "Contoso Energy", "Working Student Data Analytics", "Hamburg", "to apply"),
    (9, 2, 71, "Margie's Travel", "Werkstudent Web Development", "Remote (Germany)", "to apply"),
    (9, 3, 64, "Graphic Design Institute", "Junior Software Developer", "Bremen", "to apply"),
]

POSTING = """# {title} at {company}

**Link:** https://example.com/careers/{slug}

Matching Rate: {match} %

| Criterion | Points | Reason |
|---|---|---|
| Career fit | 20 / 20 | LLM applications and RAG pipelines: core AI-engineering work |
| Skills match | 18 / 30 | Python, LLM APIs and REST APIs evidenced; no RAG or vector-database project yet |
| Role fit | 20 / 20 | Working student, 20 h/week |
| Language | 15 / 15 | English only |
| Location | 13 / 15 | Hamburg office |

## ATS keyword check
| Keyword (ad wording) | In CV? | Where | Note |
|---|---|---|---|
| Python | yes | skills, project | |
| Large Language Models (LLMs) | yes | skills, project | LLM Study Buddy |
| REST APIs | yes | skills, experience | |
| TypeScript | yes | skills | |
| Retrieval-Augmented Generation (RAG) | no | – | Gap: mention honestly in the letter |
| Vector databases | no | – | Gap |

**Coverage: 4 of 6 keywords covered** (20 + 18 + 20 + 15 + 13 = 86).

## Strengths
- Python and REST API experience from an internship, plus an LLM project with structured JSON output.

## Gaps and how to address them honestly
- **RAG / vector databases:** no project yet. A small public RAG demo would close this gap.
"""

LETTER = {
    "{{FULL_NAME}}": "Alex Example",
    "{{CITY}}": "Hamburg, Germany", "{{PHONE}}": "+49 000 0000000", "{{EMAIL}}": "alex@example.com",
    "{{LINKEDIN}}": "linkedin.com/in/alex-example", "{{GITHUB}}": "github.com/alex-example",
    "{{COMPANY_NAME}}": "Northwind AI", "{{CONTACT_PERSON_OR_HIRING_TEAM}}": "Engineering Team", "{{COMPANY_CITY}}": "Hamburg, Germany",
    "{{CITY_AND_DATE}}": f"Hamburg, {TODAY:%-d %B %Y}",
    "{{SALUTATION}}": "Dear Northwind AI team,",
    "{{CLOSING_SENTENCE}}": "I would be glad to show you my LLM project in a short call.",
    "{{SIGN_OFF}}": "Kind regards,",
}
PARAGRAPHS = [
    "Your assistant answers questions from thousands of internal documents, and keeping those answers grounded is exactly the kind of LLM engineering I want to learn. I am an M.Sc. Computer Science student and would like to help your team build and test retrieval pipelines.",
    "During my internship at Example GmbH, I integrated a React dashboard with internal REST APIs and wrote unit tests for new features. In my own project, LLM Study Buddy, a Python app sends lecture notes to an LLM API and turns the answers into quiz questions as structured JSON, so prompt design and output validation are familiar ground.",
    "I have not built a RAG system or worked with vector databases yet, and I would not pretend otherwise. I learn quickly and would bring careful, test-driven habits from day one. I can work up to 20 hours per week during the semester at your Hamburg office.",
]


def tailored_cv():
    s = (ROOT / "CV" / "base_cv.html").read_text()
    s = s.replace("Working Student – Software Development | M.Sc. Computer Science Student",
                  "Working Student AI Engineer (LLMs &amp; RAG) | M.Sc. Computer Science Student")
    s = re.sub(r"(<h2>Summary</h2>\s*<p>).*?(</p>)",
               r"\1M.Sc. Computer Science student working with Python, Large Language Models (LLMs) and REST APIs. Built LLM Study Buddy, a Python app that turns LLM output into structured JSON quiz questions, and integrated REST APIs during a software engineering internship. Looking for a working student position in AI engineering – up to 20 hours per week.\2",
               s, flags=re.S)
    return s


def letter():
    s = (ROOT / "templates" / "cover_letter_template.html").read_text()
    s = re.sub(r"<!--.*?-->\s*", "", s, flags=re.S)  # the template's instructions for the agent
    s = re.sub(r"\{\{SUBJECT_LINE[^}]*\}\}", "Application: Working Student AI Engineer (LLMs &amp; RAG)", s)
    for i, text in enumerate(PARAGRAPHS):
        s = re.sub(r"\{\{PARAGRAPH_%d_[^}]*\}\}" % (i + 1), text, s)
    for k, v in LETTER.items():
        s = s.replace(k, v)
    assert "{{" not in s, "unfilled placeholder"
    return s


def main():
    rows = [["date", "rank", "matching_rate", "company", "title", "location", "url", "folder", "status"]]
    for ago, rank, match, company, title, loc, status in DEMO:
        words = re.sub(r"[^A-Za-z0-9 ]", "", title.replace("&", "and")).split()[:4]
        folder = ("M" if rank == 0 else f"{rank:02d}") + "_" + re.sub(r"[^A-Za-z0-9]", "", company.split()[0]) + "_" + "_".join(words)
        slug = folder.lower()
        rows.append([day(ago), rank, match, company, title, loc, f"https://example.com/careers/{slug}", folder, status])
        d = JOBS / day(ago) / folder
        d.mkdir(parents=True, exist_ok=True)
        (d / "job_posting.md").write_text(POSTING.format(title=title, company=company, slug=slug, match=match))
    JOBS.mkdir(exist_ok=True)
    with open(JOBS / "tracker.csv", "w", newline="") as f:
        csv.writer(f, lineterminator="\n").writerows(rows)

    # The top job gets real tailored documents, rendered to PDF like a normal run.
    top = JOBS / day(0) / rows[1][7]
    (top / "CV_Northwind.html").write_text(tailored_cv())
    (top / "Cover_Letter_Northwind.html").write_text(letter())
    subprocess.run(["python3", str(ROOT / "automation" / "render_pdf.py"), str(top / "CV_Northwind.html"), str(top / "Cover_Letter_Northwind.html")], check=True)

    today = JOBS / day(0)
    (today / "raw_candidates.json").write_text(json.dumps([{}] * 54))
    (today / "00_Daily_Report.md").write_text(f"# Daily Job Report: {TODAY:%A, %d %B %Y}\n\n## All Jobs (scored)\n| Match | Role | Company | Location | Reason |\n|---|---|---|---|---|\n| 86 % | [Working Student AI Engineer](https://example.com) | Northwind AI | Hamburg | LLM + RAG work |\n\n## Skill gaps seen today\n- **RAG and vector databases** (5 of 9 AI ads). Suggestion: a small public RAG demo over PDFs with an evaluation script.\n- **Docker** (4 ads) and **cloud basics** (3 ads).\n")
    (JOBS / "seen_jobs.json").write_text(json.dumps([f"https://example.com/{i}" for i in range(212)]))
    (JOBS / "logs").mkdir(exist_ok=True)
    (JOBS / "logs" / f"{day(0)}.log").write_text("=== demo 08:30 start ===\n54 candidates\n=== demo 08:41 end (exit 0) ===\n")
    print(f"Demo data for {len(DEMO)} jobs written to {JOBS}")


if __name__ == "__main__":
    main()
