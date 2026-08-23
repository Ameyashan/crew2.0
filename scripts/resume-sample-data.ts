// Shared fixture for the two sample-render scripts. Dev aid, not shipped.
import type { TailoredResume } from "../src/lib/agents/resume-tailor/types.ts";

// A fixture that exercises every branch the template has: a multi-track
// employer, a single-stint employer, inline bold, a ventures section, and an
// education entry with a GPA and coursework.
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
          title: "Product Lead, AWM Private Markets",
          context: "Scaled Polaris Into a Strategic Platform Across Credit, Equity and Real Estate",
          bullets: [
            "**Spearheaded the development of Polaris**, a unified portfolio management platform serving Private Credit, Equity, and Real Estate, enabling fund performance tracking and liquidity forecasting for senior leadership.",
            "Consolidated fragmented, underused strats-built tools into a strategic platform recognized by senior leadership as a **competitive differentiator**, achieving record-high user engagement across all three pillars.",
            "Created and executed a one-year roadmap in partnership with COOs of all three pillars, supporting **$9B+ AUM growth**.",
          ],
        },
        {
          title: "Liquidity Risk: Unsecured Funding Lead",
          context: "Strategic Execution, Cross-Regional Reporting, and Scalable Automation",
          bullets: [
            "Owned regulatory and internal liquidity risk reporting across **US, EMEA, and APAC** for FR2052a, PRA110, and MLO, driving accuracy across metrics like LCR and NSFR.",
            "Built Python and Slang automation for monthly reconciliation and commentary, **cutting reporting cycles from ME+45 to ME+15** and eliminating hours of manual work.",
          ],
        },
        {
          title: "Technical Product Lead, GS Accelerate",
          context: "Delivered Capital Efficiency and Drove Product-Market Fit for CostQ",
          bullets: [
            "Prototyped a Python scenario engine, later productionized in Kotlin, **cutting runtime from 45 minutes to under 20 seconds** and unlocking scalable scenario analysis.",
            "Resolved a critical data reconciliation issue during CostQ's Credit Risk integration, **reducing capital requirements by $5B**.",
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
          title: "Agile Product Lead",
          context: "Drove Regulatory Compliance, Enterprise Dashboards, and High-Scale User Initiatives",
          bullets: [
            "**Led two agile teams** (25+ developers and analysts) in end-to-end delivery of enterprise initiatives, running backlog refinement, sprint planning, and scaled scrum ceremonies.",
            "Designed and launched a Straight Through Processing index and analytics dashboard, **improving data processing speed by 20%** through parallel processing of large datasets.",
            "Delivered regulatory and enterprise projects including RROE (**60,000+ users**) and Federal Reserve mortgage lending reports under tight deadlines.",
          ],
        },
      ],
    },
  ],
  extras: [
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
          context:
            "Entrepreneurial venture guiding engineering students through career decisions, later pivoted into a scalable alumni engagement platform.",
          bullets: [
            "Launched a student-focused non-profit democratizing access to higher education resources, guiding students between MS and MBA paths.",
            "Pivoted the venture into an alumni networking platform, **later acquired by the founding college**.",
          ],
        },
        {
          role: "Cofounder and Founding Android Developer",
          org: "Baking Bytes / CATKing",
          location: "Mumbai, IN",
          start: "Jun 2015",
          end: "Dec 2015",
          context:
            "Tech-services startup empowering non-technical entrepreneurs with digital solutions that accelerated their business growth.",
          bullets: [
            "Delivered end-to-end Android apps and websites in Java with Material Design and Cognalys mobile verification for early-stage founders.",
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
    generated_at: new Date().toISOString(),
  },
};
