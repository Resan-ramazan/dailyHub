You are preparing ONE job application for the candidate, for a job they found on their own. Work from the repository root. Do everything autonomously, without asking questions.
These documents matter a lot: they must get past ATS filters (applicant tracking systems that rank or reject CVs automatically) AND convince a human recruiter.

## The job
- Request id: {{ID}}
- Link (may be empty): {{URL}}
- Pasted ad text (may be empty) is in: {{TEXT_FILE}}
- The candidate's notes for this application (may be empty): {{NOTE}}
  Notes are true facts from the candidate (e.g. "I used Docker in my thesis") or wishes (e.g. "stress my React work"). Use them, but never stretch them.

## Inputs (read first)
- profile/master_profile.md: the SOURCE OF TRUTH about the candidate. Never invent skills, tools, numbers, employers, grades or certificates.
- CV/base_cv.html: the base ATS CV. Copy and tailor it; keep its structure and CSS.
- templates/cover_letter_template.html: the cover-letter layout.
- automation/daily_prompt.md: read "Step 2" (the scoring rubric) and "Step 4" (the rules for job_posting.md, the CV, the cover letter and the PDF checks). Follow them exactly, except for the folder and file rules below.

## Step 1: Read the ad
- If a link is given, open it with WebFetch. If it is a job-board copy (StepStone, Indeed, LinkedIn, Arbeitnow…), also try to find the original posting on the company's own career page or ATS.
  Note in job_posting.md whether the ad is still open. If the page cannot be read, use the pasted text; if there is neither, stop and write the failure (see Step 4).
- If text is pasted, it is the primary source for requirements, even when a link is also given.
- Visit the company's website briefly to learn its product or mission for the cover letter.

## Step 2: ATS keyword analysis (do this BEFORE writing the CV)
- List the ad's hard requirements, nice-to-haves, tools, methods and soft skills, using the ad's EXACT wording (e.g. "TypeScript", not "TS"; "Machine Learning", not "ML" if the ad writes it out).
- For each keyword decide: supported by master_profile.md or the notes → it MUST appear in the CV in the ad's exact wording (skills section and, where true, inside a bullet);
  not supported → it is a gap: never put it in the CV; mention it honestly in the cover letter only if there is a true learning angle.
- Score the job with the Step 2 rubric from daily_prompt.md.

## Step 3: Write the documents
Today's output folder is Jobs/{{DATE}}/. Create ONE new folder there named M_<Company>_<Role> (ASCII only, words joined with "_", max 60 chars; if that name already exists, append _2, _3 …).
NEVER modify or delete any existing folder or file in Jobs/ (except appending to Jobs/tracker.csv).
Inside the new folder write, following Step 4 of daily_prompt.md:
1. job_posting.md: start with "# <Role> at <Company>", then "**Link:** <url or 'pasted ad'>", "Matching Rate: NN %" with the breakdown, and everything Step 4 asks for.
   Add a section "## ATS keyword check": a table of keyword | in CV? | where (skills / bullet / summary) | note. End it with the coverage: X of Y must-have keywords covered.
2. CV_<Company>.html, tailored per Step 4. ATS rules: standard headings (Summary, Technical Skills, Experience, Projects, Education, Languages),
   single column, no tables/images/icons/text boxes, the exact job title in the headline, dates in a consistent format, both the long form and the
   acronym once for key terms where natural (e.g. "Large Language Models (LLMs)").
3. Cover_Letter_<Company>.html per Step 4 (language of the ad; 250–350 words; one page; specific to the company).
4. Render the PDFs and check the page counts exactly as Step 4 says. Re-render until the CV is at most 2 pages and the letter is 1 page.

## Step 4: Bookkeeping
- Append one row to Jobs/tracker.csv: date={{DATE}}, rank=0 (0 marks a job the candidate found on their own), matching_rate, company, title, location, url (the original link, or empty), folder (just the folder name), status="to apply".
- Write Jobs/mine/{{ID}}.result.json with: {"folder": "<folder name>", "company": "...", "title": "...", "match": NN, "open": true|false|null}.
  If you could not prepare the documents, write {"error": "<one short sentence why>"} instead.
- Finish by printing 3 lines: the job, the matching rate, and the ATS keyword coverage.
