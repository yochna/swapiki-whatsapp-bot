-- More real openings across India: full-time jobs AND paid internships, covering
-- the IT and BFSI tabs, from Internshala detail pages (verified at seed time:
-- apply-by dates are after 2026-09-26 unless noted "Apply By Not Provided").
-- Safe to re-run (idempotent by title + company).
--
-- Locations now span Bangalore, Delhi, Noida, Chennai, Gurgaon, Ahmedabad,
-- Mumbai/Pune and multiple remote (WFH) roles.

insert into public.jobs
  (title, company, location, category, salary, contact, source, skills, status, raw_text, description)
select v.title, v.company, v.location, v.category, v.salary, v.contact, 'direct-post', v.skills, 'published', v.raw_text, v.description
from (
  values
    -- ---------- IT tab: internships, all-India / WFH ----------
    (
      'AI/ML & Web Development Intern',
      'Curious Bay',
      'Remote (India)',
      'it',
      '₹30,000 - 45,000 /month (internship)',
      'https://internshala.com/internship/detail/work-from-home-ai-ml-web-development-internship-at-curious-bay1789381176',
      array['Python', 'JavaScript', 'React', 'Machine Learning', 'Generative AI'],
      'AI/ML & Web Development Intern - Curious Bay
Source: Internshala (WFH)
Stipend: ₹30,000 - 45,000/month
Duration: 3 months
Apply by: 14 Oct 2026',
      'Build AI/ML solutions and web features on a global learning platform. Remote. Apply on Internshala.'
    ),
    (
      'Software Development Engineering (Web) Intern',
      'FreighAi',
      'Remote (India)',
      'it',
      '₹20,000 - 21,000 /month (internship)',
      'https://internshala.com/internship/detail/work-from-home-software-development-engineering-web-internship-at-freighai1790187569',
      array['Python', 'React.js', 'MongoDB', 'LangGraph', 'LLMOps', 'Prompt Engineering'],
      'Software Development Engineering (Web) Intern - FreighAi
Source: Internshala (WFH)
Stipend: ₹20,000 - 21,000/month
Duration: 6 months
Apply by: 24 Oct 2026',
      'Ship features across Python microservices and React.js for an AI-native freight platform. Remote. Apply on Internshala.'
    ),
    (
      'Software Development Intern',
      'Namekart',
      'Delhi (Hybrid)',
      'it',
      '₹20,000 - 25,000 /month (internship)',
      'https://internshala.com/internship/detail/software-development-internship-in-delhi-at-namekart1789361996',
      array['Python', 'Node.js', 'React', 'Next.js', 'LangChain', 'Docker', 'TypeScript'],
      'Software Development Intern - Namekart
Source: Internshala (Delhi, hybrid)
Stipend: ₹20,000 - 25,000/month
Duration: 6 months
Apply by: 14 Oct 2026',
      'Build agentic AI systems end-to-end on production workloads. Delhi (hybrid). Apply on Internshala.'
    ),
    (
      'Full Stack Development Intern (Work From Home)',
      'D4-XAI',
      'Remote (India)',
      'it',
      '₹5,000 - 10,000 /month (internship)',
      'https://internshala.com/internship/detail/work-from-home-full-stack-development-internship-at-d4-xai1790073214',
      array['MERN', 'Machine Learning', 'Cloud Computing', 'Optimization', 'AI'],
      'Full Stack Development Intern - D4-XAI
Source: Internshala (WFH)
Stipend: ₹5,000 - 10,000/month
Duration: 3 months
Apply by: 22 Oct 2026',
      'Full-stack work on an agentic AI data platform. Remote. Apply on Internshala.'
    ),
    (
      'Machine Learning Intern',
      'Bash.AI',
      'Remote (India)',
      'it',
      '₹9,999 - 10,000 /month (internship)',
      'https://internshala.com/internship/detail/work-from-home-machine-learning-internship-at-bashai1789985159',
      array['Python', 'FastAPI', 'LangChain', 'RAG', 'LLM evaluation'],
      'Machine Learning Intern - Bash.AI
Source: Internshala (WFH)
Stipend: ~₹10,000/month
Duration: 6 months
Apply by: 21 Oct 2026',
      'Build agent workflows, RAG pipelines and MCP servers in production. Remote. Apply on Internshala.'
    ),
    (
      'Machine Learning Intern (Part Time, Work From Home)',
      'CareerNest',
      'Remote (India)',
      'it',
      '₹10,000 - 25,000 /month (internship)',
      'https://internshala.com/internship/detail/work-from-home-part-time-machine-learning-internship-at-careernest1789970016',
      array['Python', 'scikit-learn', 'TensorFlow', 'PyTorch', 'Pandas', 'NumPy'],
      'Machine Learning Intern (Part Time, WFH) - CareerNest
Source: Internshala (WFH)
Stipend: ₹10,000 - 25,000/month
Duration: 2 months
Apply by: 21 Oct 2026',
      'Build, test and deploy ML models with a data science team. Remote, part-time. Apply on Internshala.'
    ),
    (
      'Search Engineer Intern',
      'Lokips By Stan Hartley',
      'Delhi, Pune, Hyderabad, Mumbai, Bengaluru (Hybrid)',
      'it',
      '₹31,000 - 44,000 /month (internship)',
      'https://internshala.com/internship/detail/search-engineer-internship-in-multiple-locations-at-lokips-by-stan-hartley1788322718',
      array['PostgreSQL', 'Python', 'Node.js', 'TypeScript', 'JSON', 'REST API'],
      'Search Engineer Intern - Lokips
Source: Internshala (multiple cities, hybrid)
Stipend: ₹31,000 - 44,000/month
Duration: 3 months
Apply by: 2 Oct 2026',
      'Build and improve search across a social/web network platform. Hybrid in Delhi, Pune, Hyderabad, Mumbai or Bengaluru. Apply on Internshala.'
    ),
    (
      'Software Developer/Claude AI Prompt Engineer Intern',
      'AppSynergies Private Limited',
      'Remote (India)',
      'it',
      '₹5,000 - 10,000 /month (internship)',
      'https://internshala.com/internship/detail/work-from-home-software-developer-claude-ai-prompt-engineer-internship-at-appsynergies-private-limited1789468471',
      array['Python', 'Flask', 'JavaScript', 'Generative AI', 'APIs'],
      'Software Developer/Claude AI Prompt Engineer Intern - AppSynergies
Source: Internshala (WFH)
Stipend: ₹5,000 - 10,000/month
Duration: 3 months
Apply by: 15 Oct 2026',
      'Develop software and craft AI prompts for a fintech/ed-tech SaaS builder. Remote. Apply on Internshala.'
    ),

    -- ---------- BFSI tab: full-time jobs ----------
    (
      'Associate Business Analyst',
      'Kinvora Consulting',
      'Bengaluru (Onsite)',
      'bfsi',
      '₹4,10,000 - 8,60,000 /year',
      'https://internshala.com/job/detail/associate-business-analyst-job-in-bangalore-at-kinvora-consulting-private-limited1788928106',
      array['Financial Analysis', 'Financial Modeling', 'MIS Reporting', 'MS-Excel', 'Financial Reporting'],
      'Associate Business Analyst - Kinvora Consulting
Source: Internshala (Job)
CTC: ₹4.1 - 8.6 LPA (1+ yr)
Apply by: 9 Oct 2026',
      'Finance and treasury management analyst - MIS, profitability and budgeting across projects. Bengaluru. Apply on Internshala.'
    ),
    (
      'Finance Analyst - COD',
      'Zippee',
      'Gurgaon (Onsite)',
      'bfsi',
      '₹2,40,000 - 3,00,000 /year',
      'https://internshala.com/job/detail/finance-analyst-cod-job-in-gurgaon-at-zippee1789034785',
      array['Reconciliation', 'Advanced Excel', 'Financial Analysis', 'GST/TDS', 'MIS'],
      'Finance Analyst - COD - Zippee
Source: Internshala (Job)
CTC: ₹2.4 - 3 LPA (1+ yr)
Apply by: 10 Oct 2026',
      'COD reconciliation, settlements and MIS reporting. Gurgaon. Apply on Internshala.'
    ),
    (
      'Analyst - Commercial Lending Operations (Fresher)',
      'Anaptyss',
      'Noida (Onsite)',
      'bfsi',
      null,
      'https://internshala.com/job/detail/fresher-analyst-job-in-noida-at-anaptyss1788395445',
      array['Banking Operations', 'Commercial Lending', 'Loan Servicing', 'Compliance'],
      'Analyst - Commercial Lending Operations - Anaptyss
Source: Internshala (Job, fresher)
Experience: 0-2 years, CFA/FRM preferred
Location: Noida',
      'Board commercial credit facilities into loan servicing systems for a bank. Noida. Apply on Internshala.'
    ),
    (
      'Transactional Banking Data Analyst (Fresher)',
      'Saaki Argus And Averil Consulting',
      'Chennai (Onsite)',
      'bfsi',
      null,
      'https://internshala.com/job/detail/fresher-transactional-banking-data-analyst-job-in-chennai-at-saaki-argus-and-averil-consulting1789929254',
      array['Data Analysis', 'Banking Ops', 'SQL', 'Power BI'],
      'Transactional Banking Data Analyst - Saaki Argus & Averil Consulting
Source: Internshala (Job, fresher)
Experience: Not provided
Location: Chennai',
      'Analytics and data support for transactional banking. Chennai. Apply on Internshala.'
    ),
    (
      'Stock Analyst (Fresher, Part Time, Work From Home)',
      'Infoskaters Technologies',
      'Remote (India)',
      'bfsi',
      '₹5,60,000 /year',
      'https://internshala.com/job/detail/fresher-remote-part-time-stock-analyst-job-at-infoskaters-technologies-private-limited1788416355',
      array['Stock Trading', 'Technical Analysis', 'Fundamental Analysis', 'Research'],
      'Stock Analyst (Fresher, PT, WFH) - Infoskaters Technologies
Source: Internshala (Job, fresher)
CTC: ₹5.6 LPA
Apply by: 3 Oct 2026',
      'Technical and fundamental analysis of stock markets, research reports and insights. Remote, part-time. Apply on Internshala.'
    ),

    -- ---------- BFSI tab: internships ----------
    (
      'Finance: Business Valuation Internship',
      'Marcken Consulting LLP',
      'Ahmedabad (Onsite)',
      'bfsi',
      '₹5,000 /month (internship)',
      'https://internshala.com/internship/detail/finance-business-valuation-internship-in-ahmedabad-at-marcken-consulting-llp1789707788',
      array['Financial Modeling', 'MS-Excel', 'Financial Analysis', 'Valuation'],
      'Finance: Business Valuation Internship - Marcken Consulting LLP
Source: Internshala
Stipend: ₹5,000/month
Duration: 6 months
Apply by: 18 Oct 2026',
      'Company valuations and financial modeling for BFSI-sector clients. Ahmedabad. Apply on Internshala.'
    ),
    (
      'Research & Expert Network Intern',
      'Wisefolio (Utkarsh Pandey)',
      'Remote (India)',
      'bfsi',
      '₹5,000 - 10,000 /month (internship)',
      'https://internshala.com/internship/detail/work-from-home-research-expert-network-internship-at-utkarsh-pandey1788322883',
      array['Equity Research', 'Financial Analysis', 'MS-Excel', 'LinkedIn Research'],
      'Research & Expert Network Intern - Wisefolio
Source: Internshala (WFH)
Stipend: ₹5,000 - 10,000/month
Duration: 6 months
Apply by: 2 Oct 2026',
      'Source and screen industry experts for investor sessions (PMS/AIF/markets). Remote. Apply on Internshala.'
    ),

    -- ---------- Ops & Talent tab: non-Bengaluru variety ----------
    (
      'Business Development (Sales) Intern',
      'Emphasis Corporate Services',
      'Remote (India)',
      'any',
      '₹6,000 - 10,000 /month (internship)',
      'https://internshala.com/internship/detail/work-from-home-business-development-sales-internship-at-emphasis-corporate-services1789551437',
      array['Sales', 'MS-Excel', 'Email Marketing', 'Lead Generation'],
      'Business Development (Sales) Intern - Emphasis Corporate Services
Source: Internshala (WFH)
Stipend: ₹6,000 - 10,000/month
Duration: 3 months
Apply by: 16 Oct 2026',
      'Sales and BD internship with a 15+ yr recruitment/HR consulting firm. Remote. Apply on Internshala.'
    ),
    (
      'Media & Public Relations (PR) Internship',
      'Veritas Reputation PR',
      'Mumbai (Onsite)',
      'any',
      '₹10,000 - 15,000 /month (internship)',
      'https://internshala.com/internship/detail/media-public-relations-pr-internship-in-multiple-locations-at-veritas-reputation-pr-private-limited1789821664',
      array['PR', 'Media Relations', 'Communications', 'BFSI Sector'],
      'Media & Public Relations (PR) Internship - Veritas Reputation PR
Source: Internshala
Stipend: ₹10,000 - 15,000/month
Duration: 2 months
Apply by: 19 Oct 2026',
      'Strategic communications for BFSI leaders (banking, mutual funds, wealth management). Mumbai (Bandra). Apply on Internshala.'
    )
) as v (title, company, location, category, salary, contact, skills, raw_text, description)
where not exists (
  select 1 from public.jobs j
  where j.title = v.title and j.company = v.company
);

-- Verify tab coverage:
select
  count(*) filter (where category = 'it')   as it_jobs,
  count(*) filter (where category = 'bfsi') as bfsi_jobs,
  count(*) filter (where category = 'any')  as ops_talent_jobs,
  count(*) filter (where status = 'published') as total_published
from public.jobs;