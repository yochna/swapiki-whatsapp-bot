const ROLE_STOPWORDS=new Set(["job","jobs","intern","internship","internships","hiring","opening","openings","vacancy","vacancies","role","roles","position","work","the","a","an","in","for","at","with","of","and","or","to"]);function norm(e){return String(e||"").toLowerCase().trim()}function words(e){return norm(e).split(/[^a-z0-9+#.\-]+/).filter(t=>t.length>=2)}function termHits(e,t){const s=e.length<=t.length?e:t,n=e.length<=t.length?t:e;return s===n||s.length>=3&&n.includes(s)}function collectList(e){const t=new Set;return(Array.isArray(e)?e:[]).forEach(s=>{const n=norm(s);n.length>=2&&t.add(n)}),t}function requiredSkills(e={}){return[...collectList(e.skills)]}function candidateSkills(e={}){const t=new Set(collectList(e.expertise));return(Array.isArray(e.projects)?e.projects:[]).forEach(s=>{collectList(s.tags).forEach(n=>t.add(n))}),[...t]}function profileYears(e={}){const t=String(e.experience||"").match(/(\d+)\s*\+?\s*(?:years?|yrs?\b)/i);return t?parseInt(t[1],10):/\b(fresher|entry[-\s]?level|student)\b/i.test(e.experience||"")?0:null}function requiredYears(e={}){const t=[e.description,e.raw_text,e.title].join(" ");let s=t.match(/(\d+)\s*(?:-|to)\s*(\d+)\s*(?:years?|yrs?\b)/i);if(s)return{min:parseInt(s[1],10),max:parseInt(s[2],10)};if(s=t.match(/(\d+)\s*\+?\s*(?:years?|yrs?\b)/i),s){const n=parseInt(s[1],10);return{min:n,max:n}}return/\b(fresher|freshers|entry[-\s]?level)\b/i.test(t)?{min:0,max:1}:null}function skillsScore(e,t){if(e.length===0)return{pct:50,matched:[],missing:[]};const s=e.filter(n=>t.some(i=>termHits(n,i)));return{pct:Math.round(s.length/e.length*100),matched:s,missing:e.filter(n=>!s.includes(n))}}function experienceScore(e,t){if(!e||t===null)return 60;if(t===0&&e.max>=1)return 100;const s=e.max||e.min;return s<=0?100:Math.min(100,Math.round(t/s*100))}function focusScore(e,t){const s=[e.title,...(e.projects||[]).map(a=>a.title&&typeof a.title=="string"?a.title:"")].join(" "),n=new Set(words(s).filter(a=>a.length>=3&&!ROLE_STOPWORDS.has(a))),i=words(t.title||"").filter(a=>a.length>=3&&!ROLE_STOPWORDS.has(a));if(i.length===0)return 60;const o=i.filter(a=>[...n].some(r=>termHits(a,r))).length;return Math.max(35,Math.round(o/i.length*100))}function band(e){return e>=80?"Strong match":e>=60?"Good match":e>=40?"Fair match":"Low match"}function computeProfileMatch(e={},t={}){const s=requiredSkills(t),n=candidateSkills(e),i=skillsScore(s,n),o=experienceScore(requiredYears(t),profileYears(e)),a=focusScore(e,t),r=Math.round(i.pct*.6+o*.25+a*.15);let l;return s.length===0?l="This listing doesn\u2019t list specific skills yet. Rated on experience and role focus.":i.missing.length===0?l=`You already list every required skill (${i.matched.length}/${s.length}).`:l=`You match ${i.matched.length} of ${s.length} required skills${i.missing.length?`; consider highlighting: ${i.missing.slice(0,3).join(", ")}${i.missing.length>3?"\u2026":""}`:""}.`,{overall:r,band:band(r),summary:l,part:[{key:"skills",label:"Required skills",pct:i.pct,detail:`${i.matched.length} of ${s.length} matched${i.missing.length?` (missing: ${i.missing.join(", ")})`:""}`},{key:"experience",label:"Experience level",pct:o,detail:humanizeExperience(requiredYears(t),profileYears(e))},{key:"focus",label:"Role focus",pct:a,detail:`Your headline${(e.projects||[]).length?" and projects":""} vs "${t.title||"this role"}"`}],matched:i.matched,missing:i.missing,requiredYears:requiredYears(t),profileYears:profileYears(e)}}function humanizeExperience(e,t){if(!e)return"Listing does not state a requirement";const s=e.min===e.max?`${e.min}+ years`:`${e.min}-${e.max} years`;return t===null?`${s} required`:e.max>=1&&t===0?`${s} required and open to freshers`:`${s} required; your profile shows ${t} year${t===1?"":"s"}${t===0?" (fresher)":""}`}function barRow(e){const[t]=e.pct>=60?["bg-blue-800"]:e.pct>=40?["bg-blue-600"]:["bg-blue-400"];return`
        <div>
          <div class="flex items-center justify-between text-[11px] mb-1">
            <span class="font-semibold text-blue-950">${e.label}</span>
            <span class="font-bold text-blue-900">${e.pct}%</span>
          </div>
          <div class="h-1.5 rounded-full bg-blue-100 overflow-hidden">
            <div class="h-full rounded-full ${t}" style="width:${e.pct}%"></div>
          </div>
          <p class="text-[10px] text-blue-800 mt-1 leading-snug">${e.detail}</p>
        </div>`}function renderProfileMatchHtml(e){if(!e)return"";const t=e.overall>=60?["bg-blue-900 text-white","#1e3a8a"]:e.overall>=40?["bg-blue-600 text-white","#2563eb"]:["bg-blue-500 text-white","#3b82f6"],[s,n]=t,i=30,o=2*Math.PI*i,a=o-o*e.overall/100,r=`
      <div class="relative w-[86px] h-[86px] shrink-0">
        <svg viewBox="0 0 86 86" class="w-full h-full -rotate-90">
          <circle cx="43" cy="43" r="${i}" fill="none" stroke="#dbeafe" stroke-width="7"/>
          <circle cx="43" cy="43" r="${i}" fill="none" stroke="${n}" stroke-width="7" stroke-linecap="round"
            stroke-dasharray="${o.toFixed(1)}" stroke-dashoffset="${a.toFixed(1)}" style="transition: stroke-dashoffset .6s ease"/>
        </svg>
        <div class="absolute inset-0 flex items-center justify-center">
          <span class="text-xl font-black text-blue-900">${e.overall}%</span>
        </div>
      </div>`;let l="";if(e.missing&&e.missing.length){const c=e.missing.slice(0,3).join(", ");l+=`<p class="text-sm text-indigo-800 mt-2"><strong>Missing skills:</strong> ${c}${e.missing.length>3?"\u2026":""}</p>`}if(e.requiredYears&&e.profileYears!=null&&e.profileYears<e.requiredYears.min){const c=e.profileYears||0,u=e.requiredYears.min;l+=`<p class="text-sm text-indigo-800 mt-1"><strong>Experience gap:</strong> ${c} yr${c===1?"":"s"} vs required ${u}+ yr${u===1?"":"s"}.</p>`}return l||(l='<p class="text-sm text-indigo-800 mt-2">You are a great fit! No immediate actions needed.</p>'),`
    <div class="bg-white/90 backdrop-blur-md border border-indigo-100 rounded-xl p-5 shadow-lg max-w-md mx-auto animate-fade-in">
      <div class="flex items-center gap-4 mb-4">
        ${r}
        <div class="flex flex-col">
          <span class="text-lg font-semibold ${s}">${e.band}</span>
          <span class="text-sm text-gray-600 mt-1">${e.summary}</span>
        </div>
      </div>
      ${l}
      <div class="mt-4 flex justify-between">
        <button onclick="app.openJobApplyModal('${e.jobId||""}')" class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition">Apply now</button>
        <button onclick="app.closeJobApplyModal()" class="px-3 py-2 text-gray-600 rounded-lg hover:bg-gray-100 transition">Close</button>
      </div>
    </div>`}const KNOWN_CITIES=[{slug:"bangalore",name:"Bengaluru",aliases:["bangalore","bengaluru","blr"]},{slug:"hyderabad",name:"Hyderabad",aliases:["hyderabad","hyd"]},{slug:"mumbai",name:"Mumbai",aliases:["mumbai","bombay","navi mumbai"]},{slug:"pune",name:"Pune",aliases:["pune"]},{slug:"delhi-ncr",name:"Delhi NCR",aliases:["delhi","new delhi","noida","gurgaon","gurugram","faridabad","ghaziabad","ncr"]},{slug:"chennai",name:"Chennai",aliases:["chennai","madras"]},{slug:"kolkata",name:"Kolkata",aliases:["kolkata","calcutta"]},{slug:"ahmedabad",name:"Ahmedabad",aliases:["ahmedabad"]},{slug:"coimbatore",name:"Coimbatore",aliases:["coimbatore","kovai"]},{slug:"kochi",name:"Kochi",aliases:["kochi","cochin"]},{slug:"jaipur",name:"Jaipur",aliases:["jaipur"]},{slug:"indore",name:"Indore",aliases:["indore"]},{slug:"chandigarh",name:"Chandigarh",aliases:["chandigarh","mohali","panchkula"]},{slug:"nagpur",name:"Nagpur",aliases:["nagpur"]},{slug:"thane",name:"Thane",aliases:["thane"]},{slug:"vadodara",name:"Vadodara",aliases:["vadodara","baroda"]},{slug:"lucknow",name:"Lucknow",aliases:["lucknow"]},{slug:"bhopal",name:"Bhopal",aliases:["bhopal"]},{slug:"visakhapatnam",name:"Visakhapatnam",aliases:["visakhapatnam","vizag"]}];function parseProfileLocation(e=""){const t=norm(e),s=/\b(remote|wfh|work\s*from\s*home|anywhere|flexible)\b/i.test(e),n=KNOWN_CITIES.filter(a=>a.aliases.some(r=>t.includes(r))),i=n.length>0?n[0]:null;let o="";if(!i&&t){const a=e.split(/[,(/]/)[0].trim();a.length>=3&&!/\b(remote|ready|india)\b/i.test(a)&&(o=a)}return{raw:e,isRemoteReady:s,matchedCities:n,primaryCity:i,cityName:i?i.name:o,citySlug:i?i.slug:o?o.toLowerCase():""}}function matchJobLocation(e,t={}){const s=norm(t.location),n=norm(t.description),i=norm(t.title),o=`${s} ${i} ${n}`,a=/\b(remote|work\s*from\s*home|\bwfh\b|anywhere)\b/i.test(s)||/\b(100%\s*remote|fully\s*remote)\b/i.test(o);if(!e||!e.raw)return{score:70,isCityMatch:!1,isRemote:a,cityName:"",reason:a?"Remote role":t.location||"Pan-India"};if(a)return{score:100,isCityMatch:!1,isRemote:!0,cityName:"",reason:"Remote / WFH role"};if(e.matchedCities&&e.matchedCities.length>0){for(const r of e.matchedCities)if(r.aliases.some(l=>s.includes(l)))return{score:100,isCityMatch:!0,isRemote:!1,cityName:r.name,reason:`Matches your city (${r.name})`}}else if(e.cityName&&s.includes(e.cityName.toLowerCase()))return{score:100,isCityMatch:!0,isRemote:!1,cityName:e.cityName,reason:`Matches your city (${e.cityName})`};return/\b(pan\s*india|all\s*india|across\s*india|^india$)\b/i.test(s)||!s?{score:65,isCityMatch:!1,isRemote:!1,cityName:"",reason:"Pan-India location"}:e.isRemoteReady?{score:35,isCityMatch:!1,isRemote:!1,cityName:"",reason:`Onsite in ${t.location||"another city"}`}:{score:20,isCityMatch:!1,isRemote:!1,cityName:"",reason:`Located in ${t.location||"another city"}`}}function matchJobProjects(e={},t={}){const s=Array.isArray(e.projects)?e.projects:[];if(s.length===0)return{score:50,matchedProjects:[],bestProject:null,matchedTags:[],reason:"No proof projects added yet"};const n=[t.title,t.company,Array.isArray(t.skills)?t.skills.join(" "):"",t.category,t.description,t.raw_text].filter(Boolean).join(" ").toLowerCase(),i=new Set(words(n).filter(c=>c.length>=3&&!ROLE_STOPWORDS.has(c)));let o=0,a=null;const r=[],l=new Set;return s.forEach(c=>{let u=0;const f=[];(Array.isArray(c.tags)?c.tags:[]).forEach(d=>{const h=norm(d);h.length>=2&&(n.includes(h)||[...i].some(b=>termHits(b,h)))&&(f.push(d),l.add(d),u+=35)}),words(c.title||"").filter(d=>d.length>=3&&!ROLE_STOPWORDS.has(d)).forEach(d=>{[...i].some(h=>termHits(h,d))&&(u+=15)}),words(c.role||"").filter(d=>d.length>=3&&!ROLE_STOPWORDS.has(d)).forEach(d=>{[...i].some(h=>termHits(h,d))&&(u+=10)}),u=Math.min(100,u),(f.length>0||u>=25)&&r.push({project:c,score:u,matchedTags:f}),u>o&&(o=u,a=c)}),{score:a?Math.max(40,o):40,matchedProjects:r.map(c=>c.project.title),bestProject:a?{title:a.title,tags:a.tags}:null,matchedTags:[...l],reason:a&&o>=30?`Matches proof in "${a.title}"`:"Evaluated against candidate projects"}}function matchJobSkills(e={},t={}){const s=requiredSkills(t),n=candidateSkills(e);if(s.length===0){const o=norm([t.title,t.description,t.raw_text].join(" ")),a=n.filter(l=>l.length>=3&&o.includes(l)),r=a.length>0?Math.min(100,50+a.length*20):55;return{score:r,pct:r,matched:a,missing:[],reason:a.length>0?`Matches ${a.length} skill${a.length===1?"":"s"} (${a.slice(0,3).join(", ")})`:"Skills evaluated"}}const i=skillsScore(s,n);return{score:i.pct,pct:i.pct,matched:i.matched,missing:i.missing,reason:i.matched.length>0?`Matches ${i.matched.length} of ${s.length} required skill${s.length===1?"":"s"} (${i.matched.slice(0,3).join(", ")})`:`Missing required skills (${i.missing.slice(0,3).join(", ")})`}}function computePersonalizedMatch(e={},t={}){const s=parseProfileLocation(e.location),n=matchJobLocation(s,t),i=matchJobSkills(e,t),o=matchJobProjects(e,t),a=focusScore(e,t),r=experienceScore(requiredYears(t),profileYears(e)),l=Math.min(100,Math.max(10,Math.round(i.score*.3+o.score*.25+n.score*.25+(a*.6+r*.4)*.2))),m=[];n.isCityMatch?m.push(`\u{1F4CD} ${n.cityName||"City"} match`):n.isRemote&&m.push("\u{1F310} Remote role"),i.matched&&i.matched.length>0&&m.push(`\u{1F6E0}\uFE0F ${i.matched.length} skill${i.matched.length>1?"s":""} (${i.matched.slice(0,2).join(", ")})`),o.bestProject&&o.score>=30&&m.push(`\u{1F680} Proof in "${o.bestProject.title}"`);let c="";return m.length>=2?c=m.join(" \xB7 "):m.length===1?c=m[0]:c="General profile fit",{overall:l,band:band(l),summary:c,reasons:m,location:n,skills:i,projects:o,focusScore:a,experienceScore:r,profileLocation:s}}function generateVoicePitchTips(e={},t={},s={}){const n=[],i=s.projects&&s.projects.bestProject?s.projects.bestProject:null,o=s.location||{},a=s.skills||{};if(i&&i.title?n.push(`Lead with your proof in "${i.title}" \u2014 explain the specific problem you solved and the measurable impact you delivered.`):Array.isArray(e.projects)&&e.projects.length>0?n.push(`Reference your work on "${e.projects[0].title}" to anchor your pitch in concrete evidence rather than generic claims.`):n.push(`Highlight your core domain strengths and why this role at ${t.company||"this team"} aligns with your expertise.`),a.matched&&a.matched.length>0){const r=a.matched.slice(0,3).join(", ");n.push(`Emphasize your hands-on mastery of ${r} and how you've applied them to deliver production-ready outcomes.`)}else n.push("Talk about the tools, architecture patterns, and practices you rely on to ship quality work on schedule.");return o.isCityMatch&&o.cityName?n.push(`Clarify that you are based in ${o.cityName} for seamless in-person collaboration.`):o.isRemote?n.push("Reassure the hiring manager with your proven remote discipline, async habits, and clear communication."):n.push("Conclude by stating your current notice period and readiness to contribute from day one."),n}function renderPersonalizedFitModalHtml(e={},t={},s={}){const n=typeof s.overall=="number"?s.overall:0,i=s.band||"Match",o=s.location||{},a=s.skills||{},r=s.projects||{},l=typeof s.focusScore=="number"?s.focusScore:60,m=typeof s.experienceScore=="number"?s.experienceScore:60,c=generateVoicePitchTips(t,e,s),u=n>=80?"#059669":n>=60?"#2563eb":n>=40?"#4f46e5":"#64748b",f=n>=80?"bg-emerald-50 text-emerald-800 border-emerald-200":n>=60?"bg-blue-50 text-blue-800 border-blue-200":n>=40?"bg-indigo-50 text-indigo-800 border-indigo-200":"bg-slate-100 text-slate-700 border-slate-200",x=32,y=2*Math.PI*x,$=y-y*n/100;function d(g,p,k,w,j="text-indigo-600"){const C=p>=80?"bg-emerald-600":p>=60?"bg-blue-600":p>=40?"bg-indigo-600":"bg-slate-400";return`
      <div>
        <div class="flex items-center justify-between text-xs mb-1">
          <span class="font-bold text-slate-800 flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[15px] ${j}">${w}</span>
            ${g}
          </span>
          <span class="font-extrabold text-slate-900">${p}%</span>
        </div>
        <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div class="h-full rounded-full ${C} transition-all duration-500" style="width:${p}%"></div>
        </div>
        <p class="text-[11px] text-slate-500 mt-1 leading-snug">${k}</p>
      </div>`}const h=(a.matched||[]).map(g=>`<span class="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2.5 py-1 rounded-lg text-[10px]"><span class="material-symbols-outlined text-[12px]">check</span>${g}</span>`).join(""),b=(a.missing||[]).slice(0,4).map(g=>`<span class="inline-flex items-center gap-1 bg-slate-50 text-slate-600 border border-slate-200 font-medium px-2.5 py-1 rounded-lg text-[10px]"><span class="material-symbols-outlined text-[12px]">add</span>${g}</span>`).join(""),v=c.map((g,p)=>`
    <li class="flex items-start gap-2.5 text-xs text-indigo-100 leading-relaxed">
      <span class="w-5 h-5 rounded-full bg-indigo-700/80 text-amber-300 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5 border border-indigo-500/50">${p+1}</span>
      <span>${g}</span>
    </li>
  `).join("");return`
    <div class="space-y-6">
      <div class="bg-gradient-to-br from-indigo-50/70 to-blue-50/50 border border-indigo-100 rounded-2xl p-5 flex items-center gap-5">
        <div class="relative w-20 h-20 shrink-0">
          <svg viewBox="0 0 86 86" class="w-full h-full -rotate-90">
            <circle cx="43" cy="43" r="${x}" fill="none" stroke="#e2e8f0" stroke-width="7"/>
            <circle cx="43" cy="43" r="${x}" fill="none" stroke="${u}" stroke-width="7" stroke-linecap="round"
              stroke-dasharray="${y.toFixed(1)}" stroke-dashoffset="${$.toFixed(1)}"/>
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <span class="text-xl font-black text-slate-900">${n}%</span>
            <span class="text-[9px] uppercase font-bold text-slate-500">Fit</span>
          </div>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${f}">${i}</span>
            <span class="text-xs text-slate-400 font-medium">Personalized Assessment</span>
          </div>
          <p class="text-sm font-semibold text-slate-800 leading-snug">${s.summary||"Matched against your profile"}</p>
        </div>
      </div>

      <div class="space-y-3.5 bg-white border border-slate-200 rounded-2xl p-5">
        <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Compatibility Dimensions</h4>
        ${d("City & Location",o.score||70,o.reason||"Location fit","location_on","text-amber-500")}
        ${d("Required Skills",a.score||50,a.reason||"Skills fit","psychology","text-sky-500")}
        ${d("Proof Projects Fit",r.score||50,r.reason||"Projects evaluated","rocket_launch","text-emerald-500")}
        ${d("Role Alignment & Experience",Math.round(l*.6+m*.4),`Role alignment ${l}% \xB7 Experience match ${m}%`,"work","text-indigo-500")}
      </div>

      ${h||b?`
      <div class="bg-white border border-slate-200 rounded-2xl p-5">
        <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">Skills Breakdown</h4>
        ${h?`
          <p class="text-[11px] font-bold text-emerald-800 mb-1.5 flex items-center gap-1">
            <span class="material-symbols-outlined text-[13px]">verified</span> Skills on your profile:
          </p>
          <div class="flex flex-wrap gap-1.5 mb-3">${h}</div>`:""}
        ${b?`
          <p class="text-[11px] font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
            <span class="material-symbols-outlined text-[13px]">lightbulb</span> Mentioned in listing:
          </p>
          <div class="flex flex-wrap gap-1.5">${b}</div>`:""}
      </div>`:""}

      <div class="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white rounded-2xl p-5 shadow-sm border border-indigo-800/40">
        <div class="flex items-center gap-2 mb-3">
          <span class="material-symbols-outlined text-amber-400 text-lg">mic</span>
          <h4 class="text-xs font-bold uppercase tracking-wider text-indigo-200">Suggested 2-Minute Walkthrough Talking Points</h4>
        </div>
        <p class="text-[11px] text-indigo-200/80 mb-3">Ground your audio walkthrough in these role-specific points to make an immediate impression on this hiring manager:</p>
        <ul class="space-y-2.5 bg-indigo-900/40 border border-indigo-700/40 rounded-xl p-3.5 text-indigo-100">
          ${v}
        </ul>
      </div>
    </div>`}typeof module!="undefined"&&module.exports&&(module.exports={computeProfileMatch,renderProfileMatchHtml,profileYears,requiredYears,requiredSkills,candidateSkills,computePersonalizedMatch,parseProfileLocation,matchJobLocation,matchJobProjects,matchJobSkills,generateVoicePitchTips,renderPersonalizedFitModalHtml}),typeof window!="undefined"&&(window.profileMatch=Object.assign(window.profileMatch||{},{computeProfileMatch,renderProfileMatchHtml,requiredYears,profileYears,computePersonalizedMatch,parseProfileLocation,matchJobLocation,matchJobProjects,matchJobSkills,generateVoicePitchTips,renderPersonalizedFitModalHtml}));
