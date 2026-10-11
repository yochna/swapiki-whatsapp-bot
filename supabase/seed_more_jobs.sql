-- More real openings: paid internships (Internshala detail pages, verified
-- active: apply-by dates after 2026-09-26) and a couple of Naukri listings
-- (freshest scraped URLs; Naukri bot-blocks automated verification, so check
-- for 404s after applying and delete/unpublish via Admin -> Jobs Board if any
-- go dead). Safe to re-run (idempotent by title + company).
--
-- Source details:
--   internshala.com/internships/internship-in-bangalore/ (Sep 2026)

insert into public.jobs
  (title, company, location, category, salary, contact, source, skills, status, raw_text, description)
select v.title, v.company, v.location, v.category, v.salary, v.contact, 'direct-post', v.skills, 'published', v.raw_text, v.description
from (
  values
    (
      'Full Stack Development Internship',
      'Think41',
      'Bengaluru (Onsite)',
      'it',
      '₹20,000 - 25,000 /month (internship)',
      'https://internshala.com/internship/detail/full-stack-development-internship-in-bangalore-at-think411788514773',
      array['React', 'Node.js', 'JavaScript', 'Python', 'Generative AI', 'HTML/CSS'],
      'Full Stack Development Internship - Think41
Source: Internshala
Stipend: ₹20,000 - 25,000/month
Duration: 6 months
Apply by: 4 Oct 2026',
      'Build and improve full-stack applications with AI-assisted workflows. 6 months, Bangalore. Apply on Internshala.'
    ),
    (
      'Python API Backend Development Internship',
      'SIRPI Products & Services',
      'Bengaluru (Onsite)',
      'it',
      '₹14,999 - 15,000 /month (internship)',
      'https://internshala.com/internship/detail/python-api-backend-development-graduates-postgraduates-only-internship-in-bangalore-at-sirpi-products-services-private-limited1788496967',
      array['Python', 'FastAPI', 'Django', 'Flask', 'SQL', 'REST API', 'Git'],
      'Python API Backend Development Internship - SIRPIProducts & Services
Source: Internshala
Stipend: ₹15,000/month
Duration: 3 months
Apply by: 4 Oct 2026',
      'Backend/API development internship (graduates/postgraduates only) at a Bangalore data-science company. Apply on Internshala.'
    ),
    (
      'iOS App Development Internship',
      'Indus AI',
      'Bengaluru (Hybrid)',
      'it',
      '₹10,000 - 29,000 /month (internship)',
      'https://internshala.com/internship/detail/ios-app-development-internship-in-bangalore-at-indus-ai1788518280',
      array['Swift', 'Xcode', 'REST API', 'Objective-C'],
      'iOS App Development Internship - Indus AI
Source: Internshala
Stipend: ₹10,000 - 29,000/month
Duration: 2 months
Apply by: 4 Oct 2026',
      'Develop and maintain iOS apps using Xcode and Swift. 2 months, Bangalore (hybrid). Apply on Internshala.'
    ),
    (
      'Full Stack Development Internship (Work From Home)',
      'Codeatrix',
      'Remote (India)',
      'it',
      '₹8,000 - 20,000 /month (internship)',
      'https://internshala.com/internship/detail/work-from-home-full-stack-development-internship-at-codeatrix1788249430',
      array['HTML/CSS', 'JavaScript', 'React', 'API Development', 'Databases'],
      'Full Stack Development Internship (WFH) - Codeatrix
Source: Internshala
Stipend: ₹8,000 - 20,000/month
Duration: 2 months
Apply by: 1 Oct 2026',
      'Work-from-home full-stack internship with mentor guidance and hands-on projects. Apply on Internshala.'
    ),
    (
      'Python Developer',
      'CGI',
      'Bengaluru (Hybrid)',
      'it',
      null,
      'https://www.naukri.com/job-listings-python-developer-cgi-bengaluru-4-to-5-years-260826018602',
      array['Python', 'Django', 'Flask', 'NumPy', 'SQL'],
      'Python Developer - CGI
Source: Naukri (scraped Sep 2026)
Experience: 4-5 years
Location: Bengaluru (Hybrid)',
      'Experienced Python developer (4-5 yrs) at CGI, Bengaluru. Apply on Naukri. NOTE: Naukri shortlists expire - if this link 404s, delete from Admin -> Jobs Board.'
    ),
    (
      'Python Django Developer',
      'Infosys',
      'Bengaluru, Hyderabad, Chennai',
      'it',
      null,
      'https://www.naukri.com/job-listings-python-django-developer-inf-infosys-hyderabad-chennai-bengaluru-3-to-5-years-210626004101',
      array['Python', 'Django'],
      'Python Django Developer - Infosys
Source: Naukri (recent listing)
Experience: 3-5 years
Locations: Bengaluru, Hyderabad, Chennai',
      'Python/Django developer (3-5 yrs) at Infosys across Bengaluru, Hyderabad, Chennai. Apply on Naukri. NOTE: Naukri shortlists expire - if this link 404s, delete from Admin -> Jobs Board.'
    )
) as v (title, company, location, category, salary, contact, skills, raw_text, description)
where not exists (
  select 1 from public.jobs j
  where j.title = v.title and j.company = v.company
);

-- Verify what will be visible to a qualified candidate:
select title, company, category, status
from public.jobs
order by created_at desc;