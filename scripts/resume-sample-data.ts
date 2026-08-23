// Shared fixture for the two sample-render scripts. Dev aid, not shipped.
//
// It deliberately exercises every branch the template has: a three-stint employer
// with dated tracks, a single-stint employer, inline **bold**, an Independent
// Building section, dated ventures, and an education entry with GPA and
// coursework. The copy also follows the generation rules the prompt enforces
// (number in the lead clause, no em dashes, no trailing participle padding), so a
// render doubles as a check that those read well on the page.
import type { TailoredResume } from "../src/lib/agents/resume-tailor/types.ts";

export const sampleResume: TailoredResume = {
  header: {
    full_name: "Ameya Shanbhag",
    headline: "Staff Product Manager · Consumer Web, AI Products, Creative Tools",
    location: "New York, NY",
    email: "ameya.shanbhag@gmail.com",
    phone: "+1 (646) 290-0134",
    links: {
      linkedin: "https://linkedin.com/in/ameya-shanbhag/",
      website: "https://linktr.ee/Growwithameya",
    },
  },
  summary:
    "Technical product manager with 6+ years shipping complex tools at scale, an MS in Computer Science, and a track record of turning AI capabilities into products real users rely on. Launched H1BPulse to **70,000 users in one week**; built an AI knowledge tool now presented to a C-suite audience for commercialization.",
  experience: [
    {
      company: "Goldman Sachs",
      role: "Senior Vice President",
      location: "New York, NY",
      start: "Aug 2021",
      end: "Present",
      bullets: [],
      tracks: [
        {
          // Band plus function: "Senior Vice President" alone is a pay grade, and
          // a reader outside finance gets no scope from it.
          title: "Senior Vice President, Product Lead for AWM Private Markets",
          start: "Mar 2023",
          end: "Present",
          // Scope, not adjectives: what was owned, how big, who depended on it.
          context: "Owned Polaris across Private Credit, Equity and Real Estate. Used by three pillar COOs.",
          bullets: [
            "Supported **$9B+ AUM growth** with a one-year roadmap built with the COOs of all three pillars, prioritized on a T-shaped model: broad oversight, deep focus on Asset Finance.",
            "**Consolidated four underused strats-built tools** into Polaris, a single portfolio management platform senior leadership now names as a competitive differentiator.",
            "Won over skeptical engineering and senior strats (VPs and MDs) by embedding structure, transparency and feedback loops, and established the team's first product leadership presence.",
            "Introduced dashboards, standups, sprints and retros from scratch, turning unpredictable delivery into a **predictable weekly cadence**.",
          ],
        },
        {
          title: "Vice President, Liquidity Risk: Unsecured Funding Lead",
          start: "Nov 2022",
          end: "Mar 2023",
          context: "Owned regulatory liquidity reporting across US, EMEA and APAC. Team of 5.",
          bullets: [
            "**Cut reporting cycles from ME+45 to ME+15** with Python and Slang automation for monthly reconciliation and commentary, removing a standing month-end crunch.",
            "Owned FR2052a, PRA110 and MLO reporting across three regions, driving accuracy on LCR and NSFR for global stakeholders.",
            "**Enabled T+1 signoff against a T+2 standard** by partnering with Treasury, Controllers and Strats on issue prioritization.",
            "Grew the team from 3 to 5 mid-project and embedded a documentation-first culture, ending the year with **zero attrition**.",
          ],
        },
        {
          title: "Vice President, Technical Product Lead for GS Accelerate",
          start: "Aug 2021",
          end: "Nov 2022",
          context: "Led CostQ, the firm's capital-efficiency product, inside the internal incubator.",
          bullets: [
            "**Cut scenario runtime from 45 minutes to under 20 seconds** by prototyping a Python engine, later productionized in Kotlin, unlocking analysis the business could not run at speed.",
            "**Reduced capital requirements by $5B** by tracing and fixing a data reconciliation defect during CostQ's Credit Risk integration.",
            "Rebuilt CostQ's strategy and roadmap around user needs and enterprise vision, which drove product-market fit and secured long-term platform funding.",
          ],
        },
      ],
    },
    {
      company: "Morgan Stanley",
      role: "Product Manager",
      location: "New York, NY",
      start: "Aug 2019",
      end: "Aug 2021",
      bullets: [],
      tracks: [
        {
          title: "Product Manager, Agile Product Lead",
          start: "Aug 2019",
          end: "Aug 2021",
          context: "Ran two delivery teams, 25+ developers and analysts, on enterprise platform work.",
          bullets: [
            "**Improved data processing speed 20%** with a Straight Through Processing index and analytics dashboard, parallelizing large datasets as part of a front-to-back platform overhaul.",
            "Shipped regulatory and enterprise programs including RROE (**60,000+ users**) and Federal Reserve mortgage lending reports under fixed deadlines.",
            "Led two agile teams through end-to-end delivery, running backlog refinement, sprint planning and scaled scrum ceremonies.",
          ],
        },
      ],
    },
  ],
  extras: [
    {
      // Self-initiated products belong in their own section, not buried in a job.
      heading: "Independent Building",
      items: [],
      roles: [
        {
          role: "H1BPulse",
          start: "2025",
          context: "Consumer tool for tracking H-1B filing data.",
          bullets: [
            "**Reached 70,000 users in the first week** from a standing start, with no paid acquisition.",
          ],
        },
        {
          role: "Jugaadu",
          start: "2025",
          end: "Present",
          context: "AI job-application product: resume tailoring, outreach and application tracking.",
          bullets: [
            "Built and shipped the full product solo on Next.js and Claude, including a resume tailoring agent that measures its own PDF output to hit a real page count.",
          ],
        },
      ],
    },
    {
      heading: "Entrepreneurial Ventures",
      items: [],
      roles: [
        {
          role: "Cofounder",
          org: "Cafe Enginerd",
          location: "Mumbai, IN",
          start: "Jan 2017",
          end: "Oct 2018",
          context: "Non-profit guiding engineering students through MS and MBA career decisions.",
          bullets: [
            "Built a contributor network of alumni and working professionals to supply mentorship content.",
            "Pivoted the venture into an alumni networking platform, **acquired by the founding college**.",
          ],
        },
        {
          role: "Cofounder and Founding Android Developer",
          org: "Baking Bytes / CATKing",
          location: "Mumbai, IN",
          start: "Jun 2015",
          end: "Dec 2015",
          context: "Tech-services startup building digital products for non-technical founders.",
          bullets: [
            "Shipped Android apps and websites in Java with Material Design and Cognalys mobile verification for early-stage founders.",
          ],
        },
      ],
    },
  ],
  education: [
    {
      school: "New York University",
      degree: "Master of Science",
      field: "Computer Science",
      end: "May 2019",
      gpa: "3.73/4.00",
      coursework:
        "Deep Learning, Machine Learning, Foundations of Data Science, Principles of Database, Programming for Big Data",
    },
    {
      school: "CFA Institute",
      degree: "CFA Level 2 Candidate",
      end: "Present",
    },
  ],
  meta: {
    target_role: "Staff Product Manager",
    page_count: 2,
    model: "sample",
    generated_at: "2026-01-01T00:00:00Z",
  },
};
