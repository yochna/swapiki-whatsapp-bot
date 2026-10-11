const ROLE_STOPWORDS=new Set(["job","jobs","intern","internship","internships","hiring","opening","openings","vacancy","vacancies","role","roles","position","work","the","a","an","in","for","at","with","of","and","or","to"]);function norm(e){return String(e||"").toLowerCase().trim()}function words(e){return norm(e).split(/[^a-z0-9+#.\-]+/).filter(t=>t.length>=2)}function termHits(e,t){const n=e.length<=t.length?e:t,i=e.length<=t.length?t:e;return n===i||n.length>=3&&i.includes(n)}function collectList(e){const t=new Set;return(Array.isArray(e)?e:[]).forEach(n=>{const i=norm(n);i.length>=2&&t.add(i)}),t}function requiredSkills(e={}){return[...collectList(e.skills)]}function candidateSkills(e={}){const t=new Set(collectList(e.expertise));return(Array.isArray(e.projects)?e.projects:[]).forEach(n=>{collectList(n.tags).forEach(i=>t.add(i))}),[...t]}function profileYears(e={}){const t=String(e.experience||"").match(/(\d+)\s*\+?\s*(?:years?|yrs?\b)/i);return t?parseInt(t[1],10):/\b(fresher|entry[-\s]?level|student)\b/i.test(e.experience||"")?0:null}function requiredYears(e={}){const t=[e.description,e.raw_text,e.title].join(" ");let n=t.match(/(\d+)\s*(?:-|to)\s*(\d+)\s*(?:years?|yrs?\b)/i);if(n)return{min:parseInt(n[1],10),max:parseInt(n[2],10)};if(n=t.match(/(\d+)\s*\+?\s*(?:years?|yrs?\b)/i),n){const i=parseInt(n[1],10);return{min:i,max:i}}return/\b(fresher|freshers|entry[-\s]?level)\b/i.test(t)?{min:0,max:1}:null}function skillsScore(e,t){if(e.length===0)return{pct:50,matched:[],missing:[]};const n=e.filter(i=>t.some(s=>termHits(i,s)));return{pct:Math.round(n.length/e.length*100),matched:n,missing:e.filter(i=>!n.includes(i))}}function experienceScore(e,t){if(!e||t===null)return 60;if(t===0&&e.max>=1)return 100;const n=e.max||e.min;return n<=0?100:Math.min(100,Math.round(t/n*100))}function focusScore(e,t){const n=[e.title,...(e.projects||[]).map(l=>l.title&&typeof l.title=="string"?l.title:"")].join(" "),i=new Set(words(n).filter(l=>l.length>=3&&!ROLE_STOPWORDS.has(l))),s=words(t.title||"").filter(l=>l.length>=3&&!ROLE_STOPWORDS.has(l));if(s.length===0)return 60;const r=s.filter(l=>[...i].some(a=>termHits(l,a))).length;return Math.max(35,Math.round(r/s.length*100))}function band(e){return e>=80?"Strong match":e>=60?"Good match":e>=40?"Fair match":"Low match"}function computeProfileMatch(e={},t={}){const n=requiredSkills(t),i=candidateSkills(e),s=skillsScore(n,i),r=experienceScore(requiredYears(t),profileYears(e)),l=focusScore(e,t),a=Math.round(s.pct*.6+r*.25+l*.15);let o;return n.length===0?o="This listing doesn\u2019t list specific skills yet. Rated on experience and role focus.":s.missing.length===0?o=`You already list every required skill (${s.matched.length}/${n.length}).`:o=`You match ${s.matched.length} of ${n.length} required skills${s.missing.length?`; consider highlighting: ${s.missing.slice(0,3).join(", ")}${s.missing.length>3?"\u2026":""}`:""}.`,{overall:a,band:band(a),summary:o,part:[{key:"skills",label:"Required skills",pct:s.pct,detail:`${s.matched.length} of ${n.length} matched${s.missing.length?` (missing: ${s.missing.join(", ")})`:""}`},{key:"experience",label:"Experience level",pct:r,detail:humanizeExperience(requiredYears(t),profileYears(e))},{key:"focus",label:"Role focus",pct:l,detail:`Your headline${(e.projects||[]).length?" and projects":""} vs "${t.title||"this role"}"`}],matched:s.matched,missing:s.missing}}function humanizeExperience(e,t){if(!e)return"Listing does not state a requirement";const n=e.min===e.max?`${e.min}+ years`:`${e.min}-${e.max} years`;return t===null?`${n} required`:e.max>=1&&t===0?`${n} required and open to freshers`:`${n} required; your profile shows ${t} year${t===1?"":"s"}${t===0?" (fresher)":""}`}function barRow(e){const[t]=e.pct>=60?["bg-blue-800"]:e.pct>=40?["bg-blue-600"]:["bg-blue-400"];return`
        <div>
          <div class="flex items-center justify-between text-[11px] mb-1">
            <span class="font-semibold text-blue-950">${e.label}</span>
            <span class="font-bold text-blue-900">${e.pct}%</span>
          </div>
          <div class="h-1.5 rounded-full bg-blue-100 overflow-hidden">
            <div class="h-full rounded-full ${t}" style="width:${e.pct}%"></div>
          </div>
          <p class="text-[10px] text-blue-800 mt-1 leading-snug">${e.detail}</p>
        </div>`}function renderProfileMatchHtml(e){if(!e)return"";const t=e.overall>=60?["bg-blue-900 text-white","#1e3a8a"]:e.overall>=40?["bg-blue-600 text-white","#2563eb"]:["bg-blue-500 text-white","#3b82f6"],[n,i]=t,s=30,r=2*Math.PI*s,l=r-r*e.overall/100,a=`
      <div class="relative w-[86px] h-[86px] shrink-0">
        <svg viewBox="0 0 86 86" class="w-full h-full -rotate-90">
          <circle cx="43" cy="43" r="${s}" fill="none" stroke="#dbeafe" stroke-width="7"/>
          <circle cx="43" cy="43" r="${s}" fill="none" stroke="${i}" stroke-width="7" stroke-linecap="round"
            stroke-dasharray="${r.toFixed(1)}" stroke-dashoffset="${l.toFixed(1)}" style="transition: stroke-dashoffset .6s ease"/>
        </svg>
        <div class="absolute inset-0 flex items-center justify-center">
          <span class="text-xl font-black text-blue-900">${e.overall}%</span>
        </div>
      </div>`,o=e.part.find(d=>d.key==="skills"),f=e.part.filter(d=>d.key!=="skills"),u=`
        ${o?barRow(o):""}
        <div class="grid sm:grid-cols-2 gap-x-6 gap-y-2">
          ${f.map(barRow).join("")}
        </div>`,c=[];return e.matched.length&&c.push(`<span class="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-blue-900 rounded-full px-2.5 py-0.5"><span class="material-symbols-outlined text-[11px]">check</span>${e.matched.slice(0,6).join(", ")}${e.matched.length>6?` +${e.matched.length-6}`:""}</span>`),e.missing.length&&c.push(`<span class="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-white border border-blue-300 rounded-full px-2.5 py-0.5"><span class="material-symbols-outlined text-[11px]">add_circle</span>${e.missing.slice(0,6).join(", ")}${e.missing.length>6?` +${e.missing.length-6}`:""}</span>`),`
      <div class="rounded-xl border border-blue-100 bg-white p-5">
        <div class="flex items-center justify-between gap-2 mb-4">
          <p class="text-[10px] font-bold uppercase tracking-wide text-blue-800">Match score</p>
          <span class="text-[10px] font-bold px-2.5 py-1 rounded-full ${n}">${e.band}</span>
        </div>
        <div class="flex items-center gap-4 mb-5">
          ${a}
          <p class="flex-1 text-sm text-blue-900 leading-snug">${e.summary}</p>
        </div>
        <div class="space-y-2.5">${u}</div>
        ${c.length?`<div class="flex flex-wrap gap-1.5 pt-4 mt-4 border-t border-blue-100">${c.join("")}</div>`:""}
      </div>`}typeof module!="undefined"&&module.exports&&(module.exports={computeProfileMatch,renderProfileMatchHtml,profileYears,requiredYears,requiredSkills,candidateSkills}),typeof window!="undefined"&&!window.profileMatch&&(window.profileMatch={computeProfileMatch,renderProfileMatchHtml,requiredYears,profileYears});
