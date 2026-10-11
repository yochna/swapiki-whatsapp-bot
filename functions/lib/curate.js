// Curation rules for the imported draft queue.
//
// WHY THIS EXISTS
//   The Adzuna importer can add 400+ drafts a run. Approving them one at a time
//   is not a review, it is a chore nobody does, and the result is a board that
//   stops being curated at all. So the queue is triaged by explicit rules here
//   instead, and the rules are the thing under test.
//
// THE SAFETY MODEL, STATED PLAINLY
//   Before this file, nothing could reach the public board without a human
//   clicking approve. That is deliberately no longer true: the owner asked for
//   the board to fill itself without hand-approval. To keep that safe the
//   default is the opposite of the old one - a listing publishes only if it
//   matches a KNOWN GOOD role family, and anything unrecognised is left as a
//   draft for a human. Unknown titles must never publish by accident.
//
//   Every decision is reversible: publishing is a status change, so a bad batch
//   is undone by flipping the same rows back to 'draft'.

/**
 * Role families we are willing to publish on our own judgement.
 *
 * Deliberately matched on the ROLE, not the company, so a good role at an
 * unknown employer can still make the board while a well-known employer cannot
 * smuggle a bad role through.
 */
/**
 * How long a draft may sit undecided - neither published nor rejected by the
 * rules, and not looked at by a human - before the queue retires it.
 *
 * Fourteen days, and the reasoning is the point. A draft is not a lead: nobody
 * has applied through it and nothing depends on it staying open, so the only
 * cost of holding it is the admin being asked to re-read the same undecidable
 * titles on every run. Rejecting is reversible (the row is kept, and the status
 * is one click away), so the expiry is a way of saying "we are not going to
 * decide this" rather than a way of destroying it.
 */
export const UNDECIDED_EXPIRY_DAYS = 14;

const PUBLISH_FAMILIES = [
  {
    id: "software",
    label: "software / engineering",
    // "engineering" is matched as well as "engineer": real titles are things
    // like "Manager Software Engineering" and "Embedded Software Engineering
    // Technical Leader", where the bare noun is the only engineering signal.
    // "Software" and "development" are in here on the evidence of the live
    // queue. "Software Development Manager" (Amazon Freight, Delivery
    // Experience) and "Software Test Specialist" (Avaloq) name no engineer and
    // no developer anywhere, so the previous noun list could not see them. Bare
    // "development" is safe only because "business development" is caught by the
    // sales reject family first, and reject rules outrank publish rules.
    test: /\b(engineer|engineering|developer|development|programmer|devops|sde|architect|full\s*stack|backend|frontend|web\s+developer|android|ios|mobile|embedded|firmware|platform|infrastructure|site\s+reliability|sre|network|security\s+(engineer|analyst|architect|specialist|consultant)|threat|malware|qa|tester|test\s+engineer|test\s+specialist|automation|software|plc)\b/,
    // Stricter in body text, and the reason is a live mistake. An advert names
    // its own discipline far more often than a bare noun does: "we are looking
    // for a software engineer" is a role, while "a diploma in mechanical
    // engineering" is a qualification. Running the title regex over a
    // description published a Cummins "Engine Field Service Technician" as a
    // software role on the strength of the word "engineering" in that one
    // sentence. So the description pass needs the role phrase, not the noun.
    descriptionTest: /\b(software\s+(engineer|developer|architect|development|consultant)|(java|python|c\+\+|c#|\.net|node\.?js|react|angular|vue|android|ios|embedded|firmware)\s+(developer|engineer|architect)|devops|site\s+reliability|\bsre\b|full\s*stack|back\s*end|back-end|backend|front\s*end|front-end|frontend|web\s+developer|systems?\s+engineer|cloud\s+(engineer|architect)|solutions?\s+architect|technical\s+(lead|architect|manager|consultant)|test\s+engineer|automation\s+engineer|qa\s+engineer|quality\s+assurance\s+engineer|machine\s+learning\s+(engineer|scientist)|\bmlops\b|network\s+(engineer|administrator)|security\s+(engineer|analyst|specialist)|information\s+security)\b/
  },
  {
    id: "data",
    label: "data / analytics / risk",
    // "Data Protection Officer" (Axis) and "Data Stewardship" (MSD) came out of
    // the live queue as reviews: they are governance roles and the old list had
    // no word for governance at all.
    test: /\b(data\s+scientist|data\s+science|data\s*engineer|data\s+model|data\s+architect|data\s+protection|data\s+stewardship|data\s+governance|data\s+management|data\s+migration|analytics|analyst|business\s+intelligence|statistician|actuarial|quant|risk|credit\s+analyst|financial\s+analyst)\b/,
    // Same reason as software: bare "risk" and bare "quant" in a paragraph mean
    // almost nothing ("we manage risk", "quantitative easing"). The body pass
    // wants the role or the discipline attached to a noun.
    //
    // The title pass above is allowed the bare discipline words, and the
    // difference is the point: "Managing Consultant, Data Management (data
    // migration, verification, EQuIS, SQL)" is a data role by its own name,
    // whereas a paragraph that mentions "data management" is not evidence of
    // anything. The body pass below still insists on a role noun.
    descriptionTest: /\b(data\s+(scientist|engineer|analyst|architect|science|modeller|modeler|management|migration|governance|engineer|warehouse|platform)|business\s+intelligence|business\s+analyst|financial\s+analyst|credit\s+analyst|risk\s+(analyst|manager|engineer|scientist)|market\s+research\s+analyst|statistician|actuarial|analytics\s+(analyst|engineer|manager)|esg\s+(data\s+)?(analyst|reporting)|predictive\s+modelling|predictive\s+modeling)\b/
  },
  {
    id: "data-platforms",
    label: "data platforms / AI tooling",
    // The India feed names the tool far more often than the discipline:
    // "Snowflake", "Hadoop / PySpark", "IBM InfoSphere DataStage" and "Collibra
    // Data Governance" are all real data roles that no amount of matching on
    // "data scientist" would catch.
    test: /\b(snowflake|hadoop|pyspark|\bspark\b|datastage|informatica|collibra|tableau|power\s*bi|etl|ssis|alteryx|microstrategy|datagovernance|data\s+governance|master\s+data|data\s*modeling|data\s+operations|artificial\s+intelligence|\bai\b|mlops|iiot|industrial\s+iot|information\s+archive|sap\s+(bw|hana|hcm)|\bkdn\b|mdm)\b/,
    // This family is mostly tool names, which are specific enough to trust in a
    // paragraph. The loose members are the bare discipline words: "data
    // governance", "artificial intelligence" and "data operations" are all
    // things any large employer says about itself, so the body pass wants the
    // tool or a role noun with them.
    descriptionTest: /\b(snowflake|hadoop|pyspark|\bspark\b|datastage|informatica|collibra|tableau|power\s*bi|alteryx|microstrategy|qlik|looker|\betl\b|\bssis\b|apache\s+kafka|airflow|dbt\b|fivetran|artificial\s+intelligence\s+(engineer|scientist|researcher|developer|specialist)|\bai\s+(engineer|scientist|developer|researcher)|machine\s+learning\s+(engineer|scientist|developer)|data\s+governance\s+(manager|analyst|engineer|specialist|consultant)|master\s+data\s+management|data\s+(modelling|modeling)\s+(analyst|engineer|manager|consultant|specialist)|data\s+operations\s+(analyst|engineer|manager|lead)|information\s+archive|industrial\s+iot|\biiot\b|\bmlops\b|\bkdn\b|master\s+data\s+manager|\bmdm\s+(analyst|engineer|architect|consultant)|sap\s+(bw|hana|hcm)|power\s+apps)\b/
  },
  {
    id: "research",
    label: "research / science",
    // "R&D" survives normalizeTitle as "r&d" (only _ - / | are turned into
    // spaces), which is how "Strategic Planner - R&D" at TVS Motor was missed.
    test: /\b(scientist|researcher|research|r\s*&\s*d)\b/,
    // Bare "research" in a paragraph is a sentence, not a job. "Research and
    // development" is a department, which is why it is allowed, but "the
    // research shows" is not evidence of a research role.
    descriptionTest: /\b(research\s+(scientist|engineer|analyst|associate|manager|director|lead)|research\s+and\s+development|r&d\s+(scientist|engineer|engineer|manager|lead)|scientist|researcher|research\s+intern|phd\s+(in|from)\s+(computer\s+science|statistics|physics|chemistry|biology|mathematics))\b/
  },
  {
    id: "product-delivery",
    label: "product & technical delivery",
    test: /\b(product\s+(owner|manager|management)|program\s+manager|programme\s+manager|project\s+manager|project\s+management\s+office|pmo|delivery\s+manager|technical\s+(lead|program|project)|scrum|agile|chief\s+technology)\b/,
    // "We work in agile squads" is a culture line, not a job, so the body pass
    // wants the role noun attached to it.
    descriptionTest: /\b(product\s+(owner|manager)|program\s+manager|programme\s+manager|project\s+manager|project\s+management\s+office|delivery\s+(manager|lead|director)|technical\s+(lead|program|project|programme)|scrum\s+(master|owner)|agile\s+(coach|lead)|head\s+of\s+delivery|chief\s+technology\s+officer|implementation\s+(manager|lead)|transformation\s+(manager|lead))\b/
  },
  {
    id: "finance",
    label: "finance & accounting",
    // Covers the shared-services vocabulary: "R2R - Ops Specialist",
    // "Sr. Associate - F&A - I2C", "Record to Report", "FP&A".
    // Extended from the live queue, where the BFSI half of the feed kept
    // arriving as drafts: "Transfer Pricing", "Tax Services", "Accounts
    // Preparer", "Middle Office" and "Stress Test" are all standard Chartered /
    // Deloitte / PKF finance titles that named none of the words above.
    test: /\b(finance|financial|accounting|accountant|accounts?\s+(payable|receivable|preparer)|audit|auditor|taxation|\btax\b|treasury|chartered\s+accountant|fp&a|f&a|r2r|i2c|o2c|record\s+to\s+report|management\s+controller|order\s+to\s+cash|cash\s+application|transfer\s+pricing|middle\s+office|stress\s+test|product\s+control|payroll|statutory|regulatory\s+(accounting|reporting)|balance\s+sheet|general\s+ledger|\bgl\s+(accountant|analyst)|tax\s+(services|incentives|preparation)|statutory\s+accounts)\b/,
    // "We audit our vendors" and "treasury operations" appear in adverts for
    // almost any back-office job, so the body pass wants the discipline
    // qualified: an accountant, a controller, an FP&A role.
    descriptionTest: /\b(chartered\s+accountant|financial\s+(analyst|controller|manager|planning|accountant|advisor|adviser|modeller|modeler)|management\s+controller|accounts?\s+(payable|receivable)\s+(executive|officer|manager|analyst)|taxation\s+(executive|officer|analyst|manager)|direct\s+tax|statutory\s+audit|internal\s+audit|external\s+audit|audit\s+(associate|executive|officer|manager|analyst)|treasury\s+(analyst|manager|associate|executive)|fp&a|f&a|r2r|i2c|o2c|record\s+to\s+report|order\s+to\s+cash|cash\s+application|valuation\s+(analyst|associate|manager)|equity\s+research\s+analyst|investment\s+analyst|credit\s+analyst|actuarial)\b/
  },
  {
    id: "early-career",
    label: "intern / trainee (India's main entry route)",
    test: /\b(intern|internship|trainee|graduate\s+engineer|apprentice|fresher)\b/,
    descriptionTest: /\b(intern|internship|trainee|traineeship|graduate\s+engineer|engineering\s+graduate|apprentice|apprenticeship|fresher|campus\s+hiring|entry\s+level\s+(analyst|engineer|associate))\b/
  },
  {
    id: "technical-consulting",
    label: "technical consulting",
    // The live feed spells it both ways, including the typo: "Workday Techno
    // Funtional Consultant" (Poshmark) has no second 'c', so a fixed spelling
    // would not have caught it.
    test: /\b(sap|salesforce|technical\s+consultant|solutions?\s+architect|systems?\s+consultant|techno\s*f+unctional\s+consultant|functional\s+consultant|advisory|cyberark|workday|dynamics\s+365|service\s*now)\b/,
    descriptionTest: /\b(sap|salesforce|dynamics\s+365|service\s*now|workday|technical\s+consultant|techno\s*functional\s+consultant|systems?\s+consultant|solutions?\s+architect|functional\s+consultant|oracle\s+(cloud|ebs|net\s*suite)|integration\s+(consultant|engineer|architect|specialist))\b/
  },
  {
    id: "enterprise-platforms",
    label: "enterprise platforms & integrations",
    // "Workday" and "CyberArk" were both in the live queue as reviews. Both are
    // single-vendor platform names with no ambiguous readings, the same reason
    // Salesforce and SAP are in the consulting family.
    test: /\b(oracle\s+(fusion|cloud|ebs)|fusion\s+(cloud|scm)|bigquery|\bgcp\b|\bmstr\b|adp\s+payroll|integrations?|middleware|mulesoft|boomi|tableau\s+specialist|workday|cyberark|\biam\b|identity\s+(and\s+)?access\s+management|\bioc\b)\b/,
    // "Integrations" on its own is a sentence in almost any advert ("we integrate
    // with 40 systems"), so the body pass needs the platform or the job title.
    descriptionTest: /\b(oracle\s+(fusion|cloud|ebs|net\s*suite)|fusion\s+(cloud|scm|scm)|sap\s+(bw|hana|hcm|s4)|bigquery|google\s+cloud|\bgcp\b|azure\s+(devops|data|cloud)|microsoft\s+dynamics|\bmstr\b|mulesoft|boomi|adp\s+payroll|integration\s+(engineer|architect|consultant|specialist|manager)|middleware\s+(engineer|developer|architect)|api\s+(engineer|architect|developer|integration)|data\s+integration|edi\s+(engineer|consultant)|single\s+sign\s+on|\bsso\b)\b/
  }
];

/**
 * Families that get rejected outright.
 *
 * This list came out of the first real feed run, not from theory: 53 of the 422
 * drafts were Kotak retail-banking sales posts (Relationship Manager, Elite
 * Banker, Gold Loan Officer) that were real vacancies but wrong for a board
 * aimed at candidates looking for technical and analytical work.
 *
 * Note what is NOT here. There is no bare /sales/ rule, because "Salesforce" is
 * a product and "Sales Pipeline Data Analyst" is a data role - a naive sales
 * filter deletes good listings. Only specific sales job titles are rejected.
 */
const REJECT_FAMILIES = [
  {
    id: "retail-banking-sales",
    label: "retail banking / relationship sales",
    // Handles the underscore-separated Kotak style too, via normalizeTitle:
    // "Acquisition Manager_Sales", "Team Collections Manager_Tractors",
    // "Relationship Officer-811", "Customer Relationship Officer| Karnal".
    //
    // The lookbehind on "acquisition" is not decoration. "Talent Acquisition
    // Manager" is an HR role and is already rejected as one by hr-and-teaching,
    // but this family is checked first, so a bare "acquisition manager" deleted a
    // recruiting post on a board for BFSI and IT candidates. normalizeTitle
    // collapses runs of whitespace to one space first, so "talent  acquisition"
    // cannot slip past the guard.
    test: /\b(relationship\s+(manager|officer)|personal\s+banker|elite\s+banker|gold\s+loan|(?<!talent\s)acquisition\s+(manager|executive|specialist|officer)|branch\s+manager|assistant\s+branch\s+manager|field\s+(monitor|sales|officer|manager)|outbound|loan\s+officer|collections?\s+(manager|executive|officer)|banker|wealth\s+manager|customer\s+(assistance|service|relationship)\s+manager|customer\s+service\s+officer|hardship\s+assistance)\b/
  },
  {
    id: "sales-nontechnical",
    label: "sales / business development (non-technical)",
    test: /\b(accounts?\s+executive|account\s+director|sales\s+(development|representative|executive|manager|director|associate|compensation|lead)|business\s+development|inside\s+sales|cluster\s+revenue\s+manager|team\s+lead\s+sales|preferred\s+account|key\s+account\s+manager|sales\s+and\s+distributions?|senior\s+sales|head\s+of\s+sales)\b/
  },
  {
    id: "hr-and-teaching",
    label: "recruitment / teaching",
    // "recruiter" was missing while "recruitment" was here, so the noun form of
    // the same job fell through to review.
    test: /\b(recruiter|recruiting|recruitment|talent\s+acquisition|assistant\s+professor|professor|lecturer|faculty|human\s+resources|\bhr\s+(generalist|manager|recruiter|business\s+partner))\b/
  },
  {
    id: "training-placement",
    label: "training / placement / teaching",
    test: /\b(trainer|training|tutor|coach|placement|admissions?\s+counsell?or|instructor|instructional\s+designer)\b/
  },
  {
    id: "admin-marketing",
    label: "admin / marketing / office",
    test: /\b(marketing|receptionist|front\s+office|office\s+assistant|personal\s+assistant|secretary|clerk|cashier|store\s+manager|delivery\s+agent|data\s+entry|copywriter|telecalling|tele\s*caller)\b/
  },
  {
    id: "facilities-security",
    label: "facilities / security guarding",
    // Found by a test, and the reason it is here rather than left implicit: the
    // software family once matched a bare "security", so "Security Guard" at a
    // bank published as a security-engineering role. A guard contract is not a
    // technology job, and this is the other half of the fix - the publish family
    // now requires a role noun after "security" as well.
    test: /\b(security\s+(guard|officer|supervisor|personnel|staff|service\s+officer)|housekeeping\s+(supervisor|manager|executive)|office\s+boy|peon|helper\s+mal|floor\s+supervisor|manpower\s+(supply|executive))\b/
  },
  {
    id: "off-target-professional",
    label: "off-target professional roles (field service, logistics, procurement, support)",
    // Verbatim from the queue left after the known-employer pass, and the reason
    // an admin should not have to open them: "Engine Field Service Technician -
    // Level III" (Alstom), "Import/Export Logistics", "Strategic Sourcing -
    // Renewable Energy", "Procurement Lead", "Associate Director - Affluent
    // Relations", "CRM and Lifecycle Manager", "Area Manager", "EH&S
    // Sustainability Technician". None are BFSI or IT openings, so they only
    // dilute the board a candidate is searching.
    //
    // Two exclusions are load-bearing. "technician" where "engineer" would not be:
    // "Field Service Engineer" is a genuine IT support role in this feed, while
    // the automotive technician is not. And "customer success" is absent because a
    // test already ruled it a near miss worth a human's judgement - a CSM is a
    // real BFSI-facing opening, unlike a courier.
    //
    // Everything else is pinned to a full phrase. Note normalizeTitle only
    // rewrites [_\-/|], so an ampersand survives: "EH&S" is still "eh&s" here,
    // and "Import/Export" has become "import export".
    test: /\b(field\s+service\s+technician|engine\s+field\s+service|import\s+export|logistics\s+(executive|manager|coordinator|officer|analyst|lead)|strategic\s+sourcing|procurement\s+(lead|manager|executive|specialist|analyst|director)|global\s+procurement|affluent\s+relations|crm\s+and\s+lifecycle|area\s+manager|eh\s*&\s*s\s+sustainability)\b/
  },
  {
    id: "commercial",
    label: "commercial / revenue (non-technical)",
    test: /\b(commercial\s+(enablement|executive|manager)|key\s+account|pre\s*sales|inside\s+sales)\b/
  },
  {
    id: "hospitality-food",
    label: "hospitality / food service",
    // Verbatim from the live queue, and the reason the admin should not have to
    // look at them: Hyatt "Chef de Partie - Pizza", Park Hyatt "Assistant
    // Manager - In Room Dining", IHG "Food and Beverage Manager | voco
    // Amritsar". A jobs board for BFSI and IT candidates has no use for a pizza
    // station, whatever the advertiser pays.
    test: /\b(chef|chef\s+de\s+partie|sous\s+chef|patissier|food\s+and\s+beverage|\bf&b\b|in[\s-]*room\s+dining|room\s+service|restaurant|banquet|housekeeping|barista|waiter|waitress|food\s+production|catering|confectioner)\b/
  },
  {
    id: "courier-field-ops",
    label: "courier / sort-centre field operations",
    // Blue Dart "Senior Territory Service Representative - ATR(Amritsar)" and
    // "Area Manager, Sort center". Title phrases only, deliberately: "Senior
    // Operations Staff" and "Manager - Operations" also appear on genuine
    // BFSI operations rows, so those are left to the expiry sweep instead of
    // being rejected on a guess.
    test: /\b(territory\s+service\s+representative|sort\s+cent(re|er|re)|courier|delivery\s+(rider|agent|person|executive\s+executive)|last[\s-]*mile\s+(rider|agent|driver|executive)|warehouse\s+(executive|operator|agent|helper|man))\b/
  },
  {
    id: "voice-bpo-support",
    label: "voice / chat BPO support",
    // Mindtel "Customer Voice Process (upto 30k)" and Aura Gold "Chat &
    // Customer Support Lead". Note what is NOT here: a bare /customer/ rule
    // would delete "Customer success manager" at Merkle Science, which is a
    // real SaaS role, so the phrase has to name the channel.
    test: /\b(customer\s+voice\s+process|voice\s+process|chat\s*(&|and)\s*customer\s+support|international\s+voice|customer\s+support\s+(executive|agent|representative|associate|executive)|customer\s+care\s+(executive|agent|representative))\b/
  }
];

/**
 * Employers that are agencies or training providers rather than employers of
 * record. Their listings are frequently reposts of vacancies that some other
 * company posted, which is where the duplicate clusters come from.
 */
const BLOCKED_COMPANY = /\b(placement|staffing|manpower|recruitment|education|training|academy|institute|niit|school\s+of|coaching)\b/i;

/**
 * Employers whose postings this board should keep even when the title is
 * useless on its own.
 *
 * The use case is narrow and deliberate. Titles like "Associate Manager",
 * "Manager Operations", "Product Specialist" and "Senior Executive Officer" name
 * no discipline, so every title family misses them and the row would sit in the
 * queue until the 14-day expiry rejects a job that was worth posting. But those
 * same titles at a bank, a fund administrator or a payments company are ordinary
 * BFSI roles, and the feed is India-scoped enough that a company appearing on it
 * is itself evidence.
 *
 * What this is NOT: a general allowlist. It is only consulted after every reject
 * family has passed, only for rows the feed already categorised as bfsi or it,
 * and only on the stored company field - never on description text, because a
 * company name in an advert is boilerplate. A recognised employer running a
 * campus drive for a "Security Guard" is still rejected above, by title.
 *
 * Matching is on distinctive whole words only, so "Axis My India Limited" cannot
 * be matched by the bare token "axis" appearing inside another company's name.
 */
const KNOWN_EMPLOYERS = /\b(standard\s+chartered|hsbc|hdfc\s+bank|icici\s+bank|axis\s+my\s+india|axis\s+bank|kotak\s+mahindra|yes\s+bank|idfc\s+first|au\s+small\s+finance|bandhan\s+bank|indusind\s+bank|state\s+street|citi|northern\s+trust|blackrock|amundi|jpmorgan|goldman\s+sachs|morgan\s+stanley|ubs|barclays|deloitte|ernst\s+young|kpmg|pwc|pricewaterhousecoopers|ey\b|grant\s+thruston|accenture|capgemini|cognizant|tech\s+mahindra|infosys|hsbc\s+technology|wipro|tcs|tata\s+consultancy|hcltech|ibm|amazon|google|microsoft|salesforce|adobe|oracle|sap\b|coinbase|kraken|ripple|stripe|bybit|bitgo|upgrad|zerodha|razorpay|paytm|phonepe|mindtickle|medtronic|dow\b|honeywell|siemens|alstom|hitachi|lti\s+technology|ltimindtree)\b/i;

/**
 * True when the stored company names an employer we recognise as hiring for
 * BFSI and technology roles.
 */
export function isKnownEmployer(company) {
  const name = String(company || "").replace(/\b(pvt|private|ltd|limited|llp|inc|corp|corporation|india|technologies|technology|services|solutions|global)\b\.?/gi, " ");
  return KNOWN_EMPLOYERS.test(name);
}

/**
 * Annual INR bounds. Outside these the feed has mixed up monthly and annual.
 *
 * The floor is deliberately low. India's trainee and intern postings legitimately
 * sit at 60,000-96,000 a year, and an earlier 1,00,000 floor rejected real entry
 * level roles. What it must catch is a monthly figure left in an annual field,
 * which lands around 18,000-33,000 - a third of minimum wage for a year, so
 * below half a lakh nothing on this feed is a real annual salary.
 */
const MIN_PLAUSIBLE_ANNUAL = 50000; // 50,000
const MAX_PLAUSIBLE_ANNUAL = 10000000; // 1,00,00,000

/**
 * Pulls the rupee figures out of a stored salary string like
 * "₹13,28,844 - ₹27,38,736" or "From ₹30,00,000".
 *
 * Parsed rather than kept alongside, because the only other place these numbers
 * exist is inside the feed response, which is gone by the time a human looks at
 * the queue.
 */
export function parseSalaryNumbers(salary) {
  if (!salary) return [];
  return (String(salary).match(/[\d,]+/g) || [])
    .map(s => Number(s.replace(/,/g, "")))
    .filter(n => Number.isFinite(n) && n > 0);
}

/**
 * Turns a raw title into something the patterns can match reliably.
 *
 * Banks and agencies write titles as "Relationship Manager_Tractors and Farm
 * Equipment_Retail-Sales", joining the parts with underscores and pipes. A word
 * boundary does not exist before an underscore, so /\brelationship manager\b/
 * silently failed to match "Relationship Manager_Tractors" - which is how the
 * single largest family of unwanted rows kept slipping past the rules. Separators
 * are flattened to spaces first so the boundary is where a reader expects it.
 *
 * "&" is deliberately preserved so "FP&A" and "F&A" stay matchable.
 */
export function normalizeTitle(title, company) {
  return `${title || ""} ${company || ""}`
    .toLowerCase()
    .replace(/[_\-/|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Decides what happens to one row.
 *
 * @returns {{ outcome: "publish"|"reject"|"review", reason: string }}
 *   "review" means: leave it as a draft and tell a human. It is the safe
 *   default, and the count of rows landing there is a health metric - a rising
 *   review pile means the rules have stopped fitting the feed.
 */
export function decideListing(row, opts) {
  const title = String((row && row.title) || "");
  const company = String((row && row.company) || "");
  const haystack = normalizeTitle(title, company);

  // Employer identity is checked before the title families. "Paradise Placement
  // Consultancy" would otherwise be caught by the *title* rule for the word
  // "placement" and reported as a posting about placements, when the real
  // finding is that the employer is an agency rather than the hiring company.
  if (BLOCKED_COMPANY.test(company)) {
    return { outcome: "reject", reason: "agency or training provider, not an employer of record", family: "agency" };
  }

  // Rejects first among the title rules: a "Senior Relationship Manager, Data
  // Analyst" should not be rescued by the data-analyst words later in the title.
  for (const fam of REJECT_FAMILIES) {
    if (fam.test.test(haystack)) {
      return { outcome: "reject", reason: fam.label, family: fam.id };
    }
  }

  if (opts && opts.duplicate) {
    return { outcome: "reject", reason: "same title and company already in this batch", family: "duplicate" };
  }

  const figures = parseSalaryNumbers(row && row.salary);
  if (figures.length) {
    const bad = figures.filter(
      n => n < MIN_PLAUSIBLE_ANNUAL || n > MAX_PLAUSIBLE_ANNUAL
    );
    if (bad.length) {
      return {
        outcome: "reject",
        reason: `salary outside a plausible annual range: ${row.salary}`,
        family: "salary-range"
      };
    }
  }

  for (const fam of PUBLISH_FAMILIES) {
    if (fam.test.test(haystack)) {
      return { outcome: "publish", reason: fam.label, family: fam.id };
    }
  }

  // Title said nothing useful, so try the description. A meaningful share of the
  // feed titles a vacancy with a code or a level ("Executive", "SPE-Policy
  // Servicing", "TPM", "Manager") where the actual role is only in the body
  // text. Without this the whole queue of those rows is stuck forever: the
  // title can never match, and a review pile that cannot drain is the same as
  // no automation at all.
  //
  // Reject families are deliberately NOT consulted here. A description is prose
  // that mentions every function in the business - a software job advert will
  // happily say "you will work with the sales team" - so a reject rule keyed on
  // body text would delete good technical listings. The description can only
  // rescue a row towards publishing, never towards rejection. Both directions
  // are still reversible by flipping status back to draft.
  const body = String((row && row.raw_text) || "");
  if (body) {
    const bodyHaystack = normalizeTitle(body, "");
    for (const fam of PUBLISH_FAMILIES) {
      if ((fam.descriptionTest || fam.test).test(bodyHaystack)) {
        return {
          outcome: "publish",
          reason: `${fam.label} (named in the description; the title is generic)`,
          family: fam.id
        };
      }
    }
  }

  // Last resort before a human, and the reason a meaningful slice of the queue
  // is not permanently stuck: the employer can carry the decision when the title
  // cannot. "Associate Manager" on its own says nothing, but "Associate Manager"
  // at Standard Chartered, or "Manager Operations" at HSBC, is a BFSI operations
  // role worth publishing, because the feed only carries listings from employers
  // that hire for these functions at all. An agency or a training provider never
  // reaches here (rejected above), so a known employer plus a bfsi/it category
  // is a positive signal rather than a guess.
  //
  // This runs after every reject family, so it can only ever rescue a row that
  // nothing has objected to. It does NOT run on the description: a company name
  // in a job advert is boilerplate, so only the stored company field counts.
  if (isKnownEmployer(company) && (row && (row.category === "bfsi" || row.category === "it"))) {
    return { outcome: "publish", reason: "recognised BFSI / tech employer, though the title does not name a discipline", family: "known-employer" };
  }

  return { outcome: "review", reason: "no known role family matched", family: "unknown" };
}

/**
 * Triages a whole batch.
 *
 * Duplicates are collapsed on a normalised title+company signature. Adzuna is a
 * meta-aggregator, so one real vacancy syndicated to several boards arrives as
 * several ids that the per-id dedupe key cannot see - the first real run
 * returned the same Accenture "Custom Software Engineer" eight times.
 *
 * @param {Array} rows  candidate rows
 * @returns {{ decisions: Array, summary: object }}
 */
export function curateBatch(rows) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  const norm = s =>
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  // Oldest first, so the survivor of a duplicate cluster is the listing that has
  // been in the queue longest rather than an arbitrary feed ordering.
  list.sort((a, b) => String(a.first_seen_at || "").localeCompare(String(b.first_seen_at || "")));

  const seen = new Set();
  const decisions = [];
  for (const row of list) {
    const sig = `${norm(row.title)}|${norm(row.company)}`;
    const isDuplicate = sig !== "|" && seen.has(sig);
    if (!isDuplicate) seen.add(sig);
    const decision = decideListing(row, { duplicate: isDuplicate });
    decisions.push({ id: row.id, title: row.title, company: row.company, category: row.category || "any", first_seen_at: row.first_seen_at || null, source: row.source || null, ...decision });
  }

  const summary = { total: decisions.length, publish: 0, reject: 0, review: 0, byReason: {}, byCategory: {} };
  for (const d of decisions) {
    summary[d.outcome]++;
    summary.byReason[d.reason] = (summary.byReason[d.reason] || 0) + 1;
    // Outcome counts alone don't answer "post these by category" - this is the
    // cross-tab that shows which feed a rejection came from.
    const cat = summary.byCategory[d.category] || (summary.byCategory[d.category] = { publish: 0, reject: 0, review: 0, total: 0 });
    cat[d.outcome]++;
    cat.total++;
  }

  return { decisions, summary };
}

export const CURATE_RULES = {
  publishFamilies: PUBLISH_FAMILIES.map(f => ({ id: f.id, label: f.label })),
  rejectFamilies: REJECT_FAMILIES.map(f => ({ id: f.id, label: f.label })),
  undecidedExpiryDays: UNDECIDED_EXPIRY_DAYS,
  minPlausibleAnnual: MIN_PLAUSIBLE_ANNUAL,
  maxPlausibleAnnual: MAX_PLAUSIBLE_ANNUAL
};
