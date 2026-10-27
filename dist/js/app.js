var H=Object.defineProperty;var M=(P,e,t)=>e in P?H(P,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):P[e]=t;var B=(P,e,t)=>M(P,typeof e!="symbol"?e+"":e,t);const DISPOSABLE_EMAIL_DOMAINS=new Set(["mailinator.com","mailinator.net","mailinator.org","mailinator2.com","guerrillamail.com","guerrillamail.org","guerrillamail.net","guerrillamail.info","guerrillamail.biz","guerrilla-mail.com","grr.la","sharklasers.com","10minutemail.com","10minutemail.net","temp-mail.org","temp-mail.io","tempmail.top","throwawaymail.com","trashmail.com","trash-mail.com","trashymail.com","yopmail.com","yopmail.fr","yopmail.net","yopmail.org","maildrop.cc","mailnesia.com","dispostable.com","mailcatch.com","getnada.com","nada.email","dropmail.me","mailsac.com","tempail.com","temporary-mail.net","tempsky.net","emailnator.com","moakt.com","moakt.co","fakemail.net","femail.com","quickinbox.com","harakirimail.com","discard.email","discardmail.com","discardmail.de","spambox.us","spambox.me","burner.email","jetable.com","33mail.com","spamgourmet.com","mytrashmail.com","mailmetrash.com","wuzupmail.com","freeml.net","zemail.eu","inboxbear.com"]);function isDisposableEmail(P){const e=(P||"").lastIndexOf("@");if(e<0)return!1;const t=(P||"").slice(e+1).toLowerCase();return DISPOSABLE_EMAIL_DOMAINS.has(t)}const ADMIN_PAGE_SIZE=15,DAILY_TOOL_JOB_LIMIT=5,JOBS_PAGE_SIZE=40;class Router{constructor(){this.currentView="landing",window.addEventListener("popstate",()=>this.handleHash())}init(){document.querySelectorAll(".view-section").forEach(e=>{e.classList.remove("active-view")}),this.handleHash(),window.addEventListener("hashchange",()=>this.handleHash())}handleHash(){const e=window.location.hostname,t=window.location.pathname,s=window.location.hash.replace("#","")||"",i="swapiki.com";if(e===i||e.endsWith("."+i)){const r=e===i?"":e.slice(0,-(i.length+1));if(r&&r!=="www"){app.publicUsername=r,app._adminPreviewMode=!1,this.navigate("candidate",!1);return}}if(t.startsWith("/sites/")){app.publicUsername=t.split("/sites/")[1].split("/")[0],app._adminPreviewMode=!1,this.navigate("candidate",!1);return}else if(s.startsWith("sites/")){app.publicUsername=s.slice(6),app._adminPreviewMode=!1,this.navigate("candidate",!1);return}else if(s.startsWith("profile/")){app.publicUsername=decodeURIComponent(s.slice(8)),app._adminPreviewMode=!1,this.navigate("candidate",!1);return}else if(s.startsWith("admin-preview/")){app.publicUsername=decodeURIComponent(s.slice(14)),app._adminPreviewMode=!0,this.navigate("candidate",!1);return}if(s==="continue-with-google"){app.publicUsername=null,app._adminPreviewMode=!1,this.navigate("landing",!1),app.openLoginModal();return}if(s.startsWith("resume-draft/")){app._resumeJobId=decodeURIComponent(s.slice(13).split("?")[0])||null,app._adminPreviewMode=!1,this.navigate("resume-draft",!1);return}if(s.startsWith("interview-prep/")){app._interviewJobId=decodeURIComponent(s.slice(15).split("?")[0])||null,app._adminPreviewMode=!1,this.navigate("interview-prep",!1);return}if(app.publicUsername=null,app._adminPreviewMode=!1,(t==="/jobs"||t==="/jobs/")&&!(!!s&&s!=="jobs")){this.navigate("jobs",!1);return}if(s&&this.currentView===s)return;const n=s||(window.app&&app.isAuthenticated()?"dashboard":"landing");this.navigate(n,!1)}goHome(){this.navigate(window.app&&app.isAuthenticated()?"dashboard":"landing")}navigate(e,t=!0){["landing","dashboard","candidate","jobs","add-project","admin","admin-jobs","resume-draft","interview-prep"].includes(e)||(e="landing"),["dashboard","add-project"].includes(e)&&!app.isAuthenticated()&&(e="landing",app.showToast("Please log in to access your dashboard."),app.openLoginModal()),e==="admin"&&!(window.swapikiStore&&swapikiStore.isAdminUser)&&(e="landing",app.showToast("Admin access required.")),e==="admin-jobs"&&!(window.swapikiStore&&swapikiStore.isAdminUser)&&(e="landing",app.showToast("Admin access required.")),this.currentView=e,t&&(window.location.hash=e);const o={"add-project":"dashboard","resume-draft":"jobs","interview-prep":"jobs"}[e]||e;document.querySelectorAll("[data-nav-view]").forEach(r=>{const l=r.getAttribute("data-nav-view")===o;r.classList.toggle("is-active",l),l?r.setAttribute("aria-current","page"):r.removeAttribute("aria-current")}),document.querySelectorAll(".view-section").forEach(r=>{r.classList.remove("active-view")});const a=e,n=document.getElementById(`view-${a}`);if(n&&(n.classList.add("active-view"),window.scrollTo({top:0,left:0,behavior:"instant"})),e==="dashboard")app.renderDashboard();else if(e==="candidate")window.app&&app._adminPreviewMode||swapikiStore.incrementViews(),app.renderCandidateProfile();else if(e==="landing"){if(window.posthog&&typeof window.posthog.capture=="function")try{window.posthog.capture("view_landing")}catch(r){}app.renderLandingView()}else if(e==="jobs"){if(window.posthog&&typeof window.posthog.capture=="function")try{window.posthog.capture("view_jobs")}catch(r){}app.renderJobsView()}else e==="resume-draft"?app.renderResumeDraftView():e==="interview-prep"?app.renderInterviewPrepView():e==="admin"?app.renderAdminDashboard():e==="admin-jobs"&&app.renderAdminJobsView()}}class SwapikiApp{constructor(){B(this,"_closeMobileMenuOnClickOutside",e=>{const t=e&&e.target&&e.target.closest&&e.target.closest('[onclick="app.toggleMobileMenu()"]'),s=document.getElementById("mobile-nav-menu");if(!t&&s&&!s.contains(e.target)){s.classList.add("hidden");const i=document.getElementById("mobile-menu-icon");i&&(i.textContent="menu"),document.removeEventListener("click",this._closeMobileMenuOnClickOutside)}});B(this,"_closeAdminMenuOnClickOutside",e=>{const t=e&&e.target&&e.target.closest&&e.target.closest('[onclick*="toggleAdminMenu"]'),s=document.getElementById("admin-menu");!t&&s&&!s.contains(e.target)&&(s.classList.add("hidden"),document.removeEventListener("click",this._closeAdminMenuOnClickOutside))});this.heroPlaying=!1,this.currentRecordingProjectId=null,this.recordedAudioUrl=null,this.recordedDurationStr=null,this.recordingValid=!1,this.activeAudioElement=null,this._adminJobs=[],this._adminJobBusy={},this._adminRenderInFlight=null,this._adminRenderQueued=!1}async init(){var e;try{await swapikiStore.applyConfig(),typeof swapikiStore.captureReferralFromUrl=="function"&&swapikiStore.captureReferralFromUrl();const t=window.location.hostname==="swapiki.com"||window.location.hostname.endsWith(".swapiki.com");(swapikiStore.siteEnv==="prod"||t)&&(this.ensureGoogleScript(),this.initGoogleButtons(),typeof window.SWAPIKI_initPosthog=="function"&&("requestIdleCallback"in window?window.requestIdleCallback(window.SWAPIKI_initPosthog,{timeout:2500}):window.setTimeout(window.SWAPIKI_initPosthog,2500)));let s;const i=new Promise(o=>{s=setTimeout(o,2500)});try{await Promise.race([Promise.resolve(swapikiStore.getSession()).catch(()=>{}),i])}finally{clearTimeout(s)}this.refreshAuthUI();try{this.maybeStartGuidedTour()}catch(o){}document.addEventListener("click",o=>{const a=o.target&&o.target.closest?o.target.closest("[data-tg-link]"):null;a&&(o.preventDefault(),this._openTelegramDeepLink(a))}),this.initBadgeTooltips(),this._ghHydrateNotes().catch(()=>{}),window.router=new Router,window.router.init()}finally{(e=document.getElementById("initial-loader"))==null||e.remove();try{window.__swapikiSplash&&typeof window.__swapikiSplash.markReady=="function"&&window.__swapikiSplash.markReady()}catch(t){}}}formatBytes(e){if(e==null||isNaN(e))return"\u2014";if(e===0)return"0 B";const t=["B","KB","MB","GB","TB"],s=Math.min(Math.floor(Math.log(e)/Math.log(1024)),t.length-1),i=e/Math.pow(1024,s);return`${i>=100?Math.round(i):i.toFixed(1)} ${t[s]}`}formatDuration(e){if(e==null||isNaN(e))return"\u2014";if(e=Math.round(e),e<60)return`${e}s`;const t=Math.floor(e/60),s=e%60;return`${t}m ${s}s`}renderAdminStatCards(e,t,s){const i=e?e.published_count:s.filter(u=>u.profile_status==="published").length,o=e?e.unpublished_count:s.length-i,a=e?e.total_users:s.length,n=window.SWAPIKI_CONFIG&&window.SWAPIKI_CONFIG.STORAGE_QUOTA_BYTES||1024*1024*1024;let r="\u2014",l=e?"":"Run admin_stats_migration.sql";if(e&&e.space_utilized_bytes!=null){const u=e.space_utilized_bytes,m=n>0?u/n*100:0;r=`${m<10?m.toFixed(1):Math.round(m)}%`,l=`${e.file_count!=null?`${e.file_count} files \xB7 `:""}${this.formatBytes(u)} of ${this.formatBytes(n)}`}const p=t&&t.configured&&t.avg_session_seconds!=null?this.formatDuration(t.avg_session_seconds):"\u2014",d=t&&t.configured?`avg. / session, last ${t.window_days||30}d`:"Connect PostHog to enable",h=[{label:"Published",value:String(i),sub:"candidate profiles",icon:"visibility",color:"emerald"},{label:"Unpublished",value:String(o),sub:"candidate profiles",icon:"visibility_off",color:"slate"},{label:"Total Users",value:String(a),sub:"all accounts",icon:"group",color:"primary"},{label:"Space Utilized",value:r,sub:l,icon:"cloud",color:"amber"},{label:"Avg. Time Spent",value:p,sub:d,icon:"schedule",color:"indigo"}],b={emerald:{bg:"bg-emerald-50",icon:"text-emerald-600",bar:"bg-emerald-500"},slate:{bg:"bg-slate-100",icon:"text-slate-500",bar:"bg-slate-400"},primary:{bg:"bg-primary-fixed",icon:"text-primary",bar:"bg-primary"},amber:{bg:"bg-amber-50",icon:"text-amber-600",bar:"bg-amber-500"},indigo:{bg:"bg-indigo-50",icon:"text-indigo-600",bar:"bg-indigo-500"}};return`
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        ${h.map(u=>{const m=b[u.color]||b.slate,v=/^\d+$/.test(u.value);return`
          <div class="admin-stat-card group relative overflow-hidden border border-slate-200 rounded-xl p-4 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <div class="absolute top-0 left-0 right-0 h-0.5 ${m.bar}"></div>
            <div class="flex items-center justify-between mb-3">
              <span class="text-[11px] font-bold uppercase tracking-wide text-slate-500">${u.label}</span>
              <span class="w-8 h-8 rounded-lg ${m.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200">
                <span class="material-symbols-outlined text-lg ${m.icon}">${u.icon}</span>
              </span>
            </div>
            <div class="admin-stat-value text-2xl font-bold text-slate-900 tracking-tight" ${v?`data-target="${u.value}"`:""}>${v?"0":u.value}</div>
            <div class="text-xs text-slate-400 mt-0.5 truncate">${u.sub}</div>
          </div>
        `}).join("")}
      </div>
    `}animateAdminStatCards(){document.querySelectorAll(".admin-stat-value[data-target]").forEach(t=>{const s=parseInt(t.getAttribute("data-target"),10)||0,i=700,o=performance.now(),a=n=>{const r=Math.min((n-o)/i,1),l=1-Math.pow(1-r,3);t.textContent=String(Math.round(l*s)),r<1?requestAnimationFrame(a):t.textContent=String(s)};requestAnimationFrame(a)})}renderAdminCharts(e,t,s){const i=s?s.published_count:e.filter(m=>m.profile_status==="published").length,o=e.length||1,a=Math.max(o-i,0),n=Math.round(i/o*100),r=42,l=2*Math.PI*r,p=i/o*l,d=`
      <div class="border border-slate-200 rounded-xl bg-white shadow-sm p-4 flex items-center gap-5">
        <svg width="104" height="104" viewBox="0 0 104 104" class="shrink-0 -rotate-90">
          <circle cx="52" cy="52" r="${r}" fill="none" stroke="#E2E8F0" stroke-width="12"></circle>
          <circle cx="52" cy="52" r="${r}" fill="none" stroke="#10B981" stroke-width="12"
            stroke-linecap="round"
            class="admin-donut-ring"
            stroke-dasharray="${p} ${l-p}"></circle>
        </svg>
        <div class="flex-1 min-w-0">
          <div class="text-2xl font-bold text-slate-900 leading-none mb-1">${n}%</div>
          <div class="text-xs text-slate-400 mb-3">of candidate profiles published</div>
          <div class="flex items-center gap-2 text-xs mb-1.5">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
            <span class="text-slate-600 font-medium">Published</span>
            <span class="ml-auto font-bold text-slate-800">${i}</span>
          </div>
          <div class="flex items-center gap-2 text-xs">
            <span class="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0"></span>
            <span class="text-slate-600 font-medium">Unpublished</span>
            <span class="ml-auto font-bold text-slate-800">${a}</span>
          </div>
        </div>
      </div>
    `,h=[{label:"Candidates",value:e.length,color:"bg-primary"},{label:"Admins",value:t.length,color:"bg-indigo-500"}],b=Math.max(...h.map(m=>m.value),1),u=`
      <div class="border border-slate-200 rounded-xl bg-white shadow-sm p-4">
        <div class="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Accounts by role</div>
        <div class="space-y-3">
          ${h.map(m=>`
            <div>
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="font-medium text-slate-600">${m.label}</span>
                <span class="font-bold text-slate-800">${m.value}</span>
              </div>
              <div class="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div class="admin-bar-fill h-full ${m.color} rounded-full" style="width: 0%" data-bar-target="${m.value/b*100}"></div>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;return`
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        ${d}
        ${u}
      </div>
    `}renderAdminEngagementStats(e,t){const s=!!(e&&e.profile_not_started_count!=null),i=(d,h)=>t.filter(b=>{var m;const u=(m=b.completion_score)!=null?m:30;return u>=d&&u<=h}).length,o=s?e.login_only_count:null,a=s?e.profile_partial_count+e.profile_near_complete_count:i(31,99),n=s?e.voice_missing_count:null,r=s?e.profile_complete_count:i(100,100),l="Run updated admin_stats_migration.sql";return`
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        ${[{label:"Login Only",value:o!=null?String(o):"\u2014",sub:o!=null?"signed up, no profile":l,icon:"login",bg:"bg-slate-100",iconColor:"text-slate-500",bar:"bg-slate-400"},{label:"Half-Filled",value:String(a),sub:"candidates, profile in progress",icon:"hourglass_top",bg:"bg-amber-50",iconColor:"text-amber-600",bar:"bg-amber-500"},{label:"No Voice Recorded",value:n!=null?String(n):"\u2014",sub:n!=null?"candidates, no audio yet":l,icon:"mic_off",bg:"bg-rose-50",iconColor:"text-rose-600",bar:"bg-rose-500"},{label:"Fully Complete",value:String(r),sub:"profile + voice recorded",icon:"task_alt",bg:"bg-emerald-50",iconColor:"text-emerald-600",bar:"bg-emerald-500"}].map(d=>{const h=/^\d+$/.test(d.value);return`
          <div class="admin-stat-card group relative overflow-hidden border border-slate-200 rounded-xl p-4 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <div class="absolute top-0 left-0 right-0 h-0.5 ${d.bar}"></div>
            <div class="flex items-center justify-between mb-3">
              <span class="text-[11px] font-bold uppercase tracking-wide text-slate-500">${d.label}</span>
              <span class="w-8 h-8 rounded-lg ${d.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200">
                <span class="material-symbols-outlined text-lg ${d.iconColor}">${d.icon}</span>
              </span>
            </div>
            <div class="admin-stat-value text-2xl font-bold text-slate-900 tracking-tight" ${h?`data-target="${d.value}"`:""}>${h?"0":d.value}</div>
            <div class="text-xs text-slate-400 mt-0.5 truncate">${d.sub}</div>
          </div>
        `}).join("")}
      </div>
    `}renderAdminEngagementCharts(e,t){const s=!!(e&&e.profile_not_started_count!=null),i=t.length||1,o=(h,b)=>t.filter(u=>{var v;const m=(v=u.completion_score)!=null?v:30;return m>=h&&m<=b}).length,a=s?e.voice_recorded_count:null,n=s?e.voice_missing_count:i-(a||0);let r;if(a==null)r=`
        <div class="border border-slate-200 rounded-xl bg-white shadow-sm p-4 flex items-center justify-center text-center">
          <div>
            <span class="material-symbols-outlined text-2xl text-slate-300 block mb-1">mic</span>
            <p class="text-xs text-slate-400">Run updated admin_stats_migration.sql to enable voice-recording stats.</p>
          </div>
        </div>
      `;else{const b=2*Math.PI*42,u=Math.max(a+n,1),m=a/u*b,v=Math.round(a/u*100);r=`
        <div class="border border-slate-200 rounded-xl bg-white shadow-sm p-4 flex items-center gap-5">
          <svg width="104" height="104" viewBox="0 0 104 104" class="shrink-0 -rotate-90">
            <circle cx="52" cy="52" r="42" fill="none" stroke="#E2E8F0" stroke-width="12"></circle>
            <circle cx="52" cy="52" r="42" fill="none" stroke="#6366F1" stroke-width="12"
              stroke-linecap="round"
              class="admin-donut-ring"
              stroke-dasharray="${m} ${b-m}"></circle>
          </svg>
          <div class="flex-1 min-w-0">
            <div class="text-2xl font-bold text-slate-900 leading-none mb-1">${v}%</div>
            <div class="text-xs text-slate-400 mb-3">of candidates recorded a voice clip</div>
            <div class="flex items-center gap-2 text-xs mb-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0"></span>
              <span class="text-slate-600 font-medium">Recorded</span>
              <span class="ml-auto font-bold text-slate-800">${a}</span>
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0"></span>
              <span class="text-slate-600 font-medium">Not recorded</span>
              <span class="ml-auto font-bold text-slate-800">${n}</span>
            </div>
          </div>
        </div>
      `}const l=s?[{label:"Not started",value:e.profile_not_started_count,color:"bg-slate-400"},{label:"Basic info added",value:e.profile_partial_count,color:"bg-amber-500"},{label:"Missing voice only",value:e.profile_near_complete_count,color:"bg-orange-500"},{label:"Fully complete",value:e.profile_complete_count,color:"bg-emerald-500"}]:[{label:"Not started",value:o(0,30),color:"bg-slate-400"},{label:"Basic info added",value:o(31,69),color:"bg-amber-500"},{label:"Missing voice only",value:o(70,99),color:"bg-orange-500"},{label:"Fully complete",value:o(100,100),color:"bg-emerald-500"}],p=Math.max(...l.map(h=>h.value),1),d=`
      <div class="border border-slate-200 rounded-xl bg-white shadow-sm p-4">
        <div class="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Profile completion funnel</div>
        <div class="space-y-3">
          ${l.map(h=>`
            <div>
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="font-medium text-slate-600">${h.label}</span>
                <span class="font-bold text-slate-800">${h.value}</span>
              </div>
              <div class="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div class="admin-bar-fill h-full ${h.color} rounded-full" style="width: 0%" data-bar-target="${h.value/p*100}"></div>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;return`
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        ${r}
        ${d}
      </div>
    `}animateAdminBars(){requestAnimationFrame(()=>{document.querySelectorAll(".admin-bar-fill[data-bar-target]").forEach(e=>{const t=e.getAttribute("data-bar-target");e.style.width=`${t}%`})})}renderAdminDashboardSkeleton(){const e=Array.from({length:6}).map(()=>`
      <div class="border border-slate-200 rounded-xl p-4 bg-white animate-pulse">
        <div class="flex items-center justify-between mb-3">
          <div class="h-2.5 w-16 bg-slate-200 rounded"></div>
          <div class="w-8 h-8 rounded-lg bg-slate-100"></div>
        </div>
        <div class="h-6 w-12 bg-slate-200 rounded mb-2"></div>
        <div class="h-2.5 w-20 bg-slate-100 rounded"></div>
      </div>
    `).join(""),t=i=>`
      <div class="border border-slate-200 rounded-xl overflow-hidden bg-white animate-pulse">
        <div class="bg-slate-50 h-9 border-b border-slate-100"></div>
        ${Array.from({length:i}).map((o,a)=>`
          <div class="h-12 flex items-center gap-4 px-4 ${a!==i-1?"border-b border-slate-100":""}">
            <div class="w-8 h-8 rounded-full bg-slate-200 shrink-0"></div>
            <div class="h-2.5 w-32 bg-slate-200 rounded"></div>
            <div class="h-2.5 w-24 bg-slate-100 rounded hidden sm:block"></div>
          </div>
        `).join("")}
      </div>
    `;return`
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">${e}</div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        <div class="border border-slate-200 rounded-xl bg-white p-4 h-[132px] animate-pulse flex items-center gap-5">
          <div class="w-24 h-24 rounded-full bg-slate-100 shrink-0"></div>
          <div class="flex-1 space-y-2">
            <div class="h-4 w-16 bg-slate-200 rounded"></div>
            <div class="h-2.5 w-32 bg-slate-100 rounded"></div>
          </div>
        </div>
        <div class="border border-slate-200 rounded-xl bg-white p-4 h-[132px] animate-pulse space-y-3">
          <div class="h-2.5 w-24 bg-slate-200 rounded"></div>
          <div class="h-2 w-full bg-slate-100 rounded-full"></div>
          <div class="h-2 w-full bg-slate-100 rounded-full"></div>
          <div class="h-2 w-full bg-slate-100 rounded-full"></div>
        </div>
      </div>
    
      <div class="mb-8">
        <div class="h-5 w-40 bg-slate-200 rounded mb-3 animate-pulse"></div>
        ${t(4)}
      </div>
      <div>
        <div class="h-5 w-40 bg-slate-200 rounded mb-3 animate-pulse"></div>
        ${t(3)}
      </div>
    `}adminInitials(e){const t=(e||"").trim();if(!t)return"?";const s=t.split(/\s+/).filter(Boolean);return(s.length>1?s[0][0]+s[1][0]:t.slice(0,2)).toUpperCase()}adminAvatarColor(e){const t=["bg-primary-fixed text-primary","bg-emerald-100 text-emerald-700","bg-amber-100 text-amber-700","bg-indigo-100 text-indigo-700","bg-rose-100 text-rose-700","bg-slate-200 text-slate-600"],s=String(e||"");let i=0;for(let o=0;o<s.length;o++)i=i*31+s.charCodeAt(o)|0;return t[Math.abs(i)%t.length]}adminSectionHeader(e,t,s,i="",o=""){return`
      <div class="flex items-center gap-2 mb-3">
        <span class="material-symbols-outlined text-lg text-slate-400">${s}</span>
        <h3 class="text-lg font-bold text-slate-900">${e}</h3>
        <span class="text-xs font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5"${o?` data-admin-total="${o}"`:""}>${t}</span>
        ${i?`<span class="ml-auto">${i}</span>`:""}
      </div>
    `}feedbackCategoryColor(e){return{broken:"bg-rose-50 text-rose-600",confusing:"bg-amber-50 text-amber-700",missing:"bg-indigo-50 text-indigo-700",idea:"bg-emerald-50 text-emerald-700"}[e]||"bg-slate-100 text-slate-600"}escapeHtml(e){return String(e==null?"":e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}csvEscape(e){const t=e==null?"":String(e);return/[",\n\r]/.test(t)?`"${t.replace(/"/g,'""')}"`:t}async exportCandidatesCSV(){const e=document.getElementById("admin-export-csv-btn"),t=e?e.innerHTML:null;e&&(e.disabled=!0,e.innerHTML='<span class="material-symbols-outlined text-lg animate-spin">progress_activity</span> Exporting\u2026');try{const s=this._adminCandidatesCache||await swapikiStore.adminListCandidates();if(!s||s.length===0){this.showToast("No candidates to export yet.");return}const i=[{key:"name",label:"Name"},{key:"username",label:"Handle"},{key:"email",label:"Email"},{key:"phone",label:"Phone"},{key:"profile_status",label:"Status"},{key:"title",label:"Headline"},{key:"experience",label:"Experience"},{key:"expertise",label:"Skills & Expertise"},{key:"location",label:"Location"},{key:"education",label:"Education"},{key:"linkedin",label:"LinkedIn"},{key:"twitter",label:"Twitter / X"},{key:"resumeLink",label:"Resume Link"},{key:"portfolio",label:"Portfolio"},{key:"created_at",label:"Joined"}],o=i.map(h=>this.csvEscape(h.label)).join(","),a=s.map(h=>i.map(b=>{let u=h[b.key];return Array.isArray(u)&&(u=u.join("; ")),this.csvEscape(u)}).join(",")),n="\uFEFF"+[o,...a].join(`\r
`),r=new Blob([n],{type:"text/csv;charset=utf-8;"}),l=URL.createObjectURL(r),p=document.createElement("a"),d=new Date().toISOString().slice(0,10);p.href=l,p.download=`swapiki-candidates-${d}.csv`,document.body.appendChild(p),p.click(),document.body.removeChild(p),URL.revokeObjectURL(l),this.showToast(`\u2705 Exported ${s.length} candidate${s.length===1?"":"s"} to CSV.`)}catch(s){this.showToast(`\u274C ${s&&s.message||"Could not export CSV."}`)}finally{e&&(e.disabled=!1,e.innerHTML=t)}}adminEmptyState(e,t,s){return`
      <tr>
        <td colspan="${e}" class="py-10 text-center">
          <div class="flex flex-col items-center gap-2">
            <span class="material-symbols-outlined text-3xl text-slate-300">${this.escapeHtml(t)}</span>
            <span class="text-sm text-slate-400">${this.escapeHtml(s)}</span>
          </div>
        </td>
      </tr>
    `}adminReportsSection(e){const t=e||[],s=new Map((this._adminCandidatesCache||[]).map(r=>[r.id,r])),i={scam:"Scam / fraud",impersonation:"Fake person",stolen_work:"Stolen work",contact:"Money / off-platform contact",spam:"Spam",other:"Other"},o=r=>`animation-delay:${Math.min(r*.03,.3)}s`,a=t.map((r,l)=>{const p=s.get(r.candidate_id)||{};return`
        <tr class="admin-row-fade border-b border-slate-100 last:border-0 hover:bg-rose-50/40 transition-colors align-top" style="${o(l)}">
          <td class="py-3 px-3 text-xs text-slate-400 whitespace-nowrap">${swapikiStore.timeAgo(r.created_at)}</td>
          <td class="py-3 px-3">
            <button onclick="app.adminViewCandidateProfile(this.dataset.username)" data-username="${this.escapeHtml(p.username||"")}"
              class="text-sm font-bold text-slate-800 hover:text-primary hover:underline" ${p.username?"":"disabled"}>${this.escapeHtml(p.name||"(no name)")}</button>
            <div class="text-xs text-slate-400">${p.username?"@"+this.escapeHtml(p.username):"\u2014"}</div>
          </td>
          <td class="py-3 px-3 whitespace-nowrap">
            <span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">${this.escapeHtml(i[r.reason]||r.reason||"Report")}</span>
          </td>
          <td class="py-3 px-3 text-sm text-slate-700 max-w-md whitespace-pre-line">${this.escapeHtml(r.details||"")}</td>
          <td class="py-3 px-3 text-xs text-slate-400 break-all max-w-[12rem]">${this.escapeHtml(r.reporter_email||"\u2014")}</td>
          <td class="py-3 px-3 text-right whitespace-nowrap">
            ${r.candidate_id?`<button onclick="app.adminSuspendReportedProfile(this.dataset.id, this.dataset.report)" data-id="${this.escapeHtml(r.candidate_id)}" data-report="${this.escapeHtml(r.id)}" title="Suspend and mark actioned"
              class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:scale-90 transition-all">
              <span class="material-symbols-outlined text-lg">block</span></button>`:""}
            <button onclick="app.adminResolveReport(this.dataset.id, 'dismissed')" data-id="${this.escapeHtml(r.id)}" title="Dismiss"
              class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-90 transition-all">
              <span class="material-symbols-outlined text-lg">done</span></button>
          </td>
        </tr>`}).join(""),n=t.map((r,l)=>{const p=s.get(r.candidate_id)||{};return`
        <div class="admin-row-fade border border-rose-100 rounded-xl bg-white shadow-sm p-3.5" style="${o(l)}">
          <div class="flex items-center gap-2 mb-1.5">
            <span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">${this.escapeHtml(i[r.reason]||r.reason||"Report")}</span>
            <span class="text-xs text-slate-400">${swapikiStore.timeAgo(r.created_at)}</span>
          </div>
          <button onclick="app.adminViewCandidateProfile(this.dataset.username)" data-username="${this.escapeHtml(p.username||"")}"
            class="text-sm font-bold text-slate-800 ${p.username?"hover:text-primary hover:underline":""}" ${p.username?"":"disabled"}>${this.escapeHtml(p.name||"(no name)")}</button>
          <p class="text-sm text-slate-700 whitespace-pre-line mt-1">${this.escapeHtml(r.details||"")}</p>
          ${r.reporter_email?`<p class="text-xs text-slate-400 mt-1.5 break-all">${this.escapeHtml(r.reporter_email)}</p>`:""}
          <div class="mt-3 flex gap-2">
            ${r.candidate_id?`<button onclick="app.adminSuspendReportedProfile(this.dataset.id, this.dataset.report)" data-id="${this.escapeHtml(r.candidate_id)}" data-report="${this.escapeHtml(r.id)}"
              class="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 active:scale-[0.97] transition-all">
              <span class="material-symbols-outlined text-base">block</span> Suspend</button>`:""}
            <button onclick="app.adminResolveReport(this.dataset.id, 'dismissed')" data-id="${this.escapeHtml(r.id)}"
              class="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 active:scale-[0.97] transition-all">
              <span class="material-symbols-outlined text-base">done</span> Dismiss</button>
          </div>
        </div>`}).join("");return`
      <div class="admin-fade-in mb-8">
        ${this.adminSectionHeader("Reported profiles",t.length,"flag")}
        <div class="hidden md:block overflow-x-auto border border-rose-100 rounded-xl bg-white shadow-sm">
          <table class="w-full">
            <thead class="bg-rose-50/60 sticky top-0">
              <tr>
                <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">When</th>
                <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Profile</th>
                <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Reason</th>
                <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">What they saw</th>
                <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Reporter</th>
                <th class="text-right text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Actions</th>
              </tr>
            </thead>
            <tbody>${a||this.adminEmptyState(6,"flag","No open reports. Nothing to review right now.")}</tbody>
          </table>
        </div>
        <div class="md:hidden space-y-2.5">
          ${n||'<div class="border border-slate-200 rounded-xl bg-white p-8 text-center"><span class="material-symbols-outlined text-3xl text-slate-300 block mb-2">flag</span><span class="text-sm text-slate-400">No open reports.</span></div>'}
        </div>
      </div>
    `}async renderAdminDashboard(){return this._adminRenderInFlight?(this._adminRenderQueued=!0,this._adminRenderInFlight):(this._adminRenderInFlight=(async()=>{try{for(let e=0;e<2&&(this._adminRenderQueued=!1,await this.renderAdminDashboardPass(),!!this._adminRenderQueued);e++);}finally{this._adminRenderInFlight=null,this._adminRenderQueued=!1}})(),this._adminRenderInFlight)}async renderAdminDashboardPass(){const e=document.getElementById("admin-dashboard-container");if(!e)return;const t=document.getElementById("admin-refresh-btn");t&&(t.disabled=!0,t.innerHTML='<span class="material-symbols-outlined text-lg animate-spin">progress_activity</span> Refreshing\u2026'),e.innerHTML=this.renderAdminDashboardSkeleton();try{const[s,i,o,a,n,r,l]=await Promise.all([swapikiStore.adminListCandidates(),swapikiStore.adminListAdmins(),swapikiStore.adminGetStats().catch(()=>null),swapikiStore.adminGetTimeStats().catch(()=>({configured:!1})),swapikiStore.adminListFeedback().catch(()=>[]),swapikiStore.adminListJobs().catch(()=>[]),swapikiStore.adminListProfileReports().catch(()=>[])]);this._adminJobs=r||[],this.watchAdminBreakpoint(),this._adminCandidatesCache=s;const p=this.renderAdminStatCards(o,a,s),d=this.renderAdminCharts(s,i,o),h=this.renderAdminEngagementStats(o,s),b=this.renderAdminEngagementCharts(o,s),u=g=>`animation-delay: ${Math.min(g*.03,.3)}s`,m=this.adminCandidatePage(s),{rows:v,cards:_}=this.adminCandidatesMarkup(m.page),x=i.map((g,y)=>`
        <tr class="admin-row-fade border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors" style="${u(y)}">
          <td class="py-3 px-3">
            <div class="flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-full ${this.adminAvatarColor(g.email)} flex items-center justify-center text-[11px] font-bold shrink-0">${this.adminInitials(g.email)}</span>
              <span class="text-sm font-bold text-slate-800 whitespace-nowrap">${g.email||"(no email on file)"}</span>
            </div>
          </td>
          <td class="py-3 px-3 text-sm text-slate-400 whitespace-nowrap">${g.created_at?new Date(g.created_at).toLocaleDateString():"\u2014"}</td>
          <td class="py-3 px-3 text-right whitespace-nowrap">
            <button onclick="app.adminRemoveAdmin(this.dataset.uid, this.dataset.email)" data-uid="${this.escapeHtml(g.user_id||"")}" data-email="${this.escapeHtml(g.email||"")}" title="Remove admin access"
              class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:scale-90 transition-all">
              <span class="material-symbols-outlined text-lg">person_remove</span>
            </button>
          </td>
        </tr>
      `).join(""),$=i.map((g,y)=>`
        <div class="admin-row-fade admin-mobile-card border border-slate-200 rounded-xl bg-white shadow-sm p-3.5 flex items-center gap-2.5" style="${u(y)}">
          <span class="w-9 h-9 rounded-full ${this.adminAvatarColor(g.email)} flex items-center justify-center text-xs font-bold shrink-0">${this.adminInitials(g.email)}</span>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-bold text-slate-800 truncate">${g.email||"(no email on file)"}</div>
            <div class="text-xs text-slate-400">${g.created_at?new Date(g.created_at).toLocaleDateString():"\u2014"}</div>
          </div>
          <button onclick="app.adminRemoveAdmin(this.dataset.uid, this.dataset.email)" data-uid="${this.escapeHtml(g.user_id||"")}" data-email="${this.escapeHtml(g.email||"")}"
            class="inline-flex items-center justify-center w-9 h-9 rounded-lg text-rose-600 bg-rose-50 active:scale-90 transition-all shrink-0">
            <span class="material-symbols-outlined text-lg">person_remove</span>
          </button>
        </div>
      `).join("");e.innerHTML=`
        ${p}
        ${d}

        <div class="admin-fade-in">
          ${this.adminSectionHeader("Profile Completion & Engagement",s.length,"insights")}
          ${h}
          ${b}
        </div>

        <div class="admin-fade-in mb-8">
          ${this.adminSectionHeader("Candidates",s.length,"badge","","candidates")}
          ${this.adminSearchToolbar("candidates",{view:m,placeholder:"Search candidates \u2014 name, handle, email, phone",label:"Search candidates",extra:`<button type="button" onclick="app.adminSortCandidates()" data-admin-sort="candidates" title="Sort by name" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all whitespace-nowrap"><span class="material-symbols-outlined text-sm">sort_by_alpha</span> <span data-admin-sort-label="candidates">${this.adminSortLabel()}</span></button>`})}
          <div class="hidden md:block overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
            <table class="w-full">
              <thead class="bg-slate-50 sticky top-0">
                <tr>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Name</th>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Handle</th>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Email</th>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Phone</th>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Status</th>
                  <th class="text-right text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Actions</th>
                </tr>
              </thead>
              <tbody id="admin-candidates-tbody">${v||this.adminEmptyState(6,"badge",this.adminCandidateEmptyText(m))}</tbody>
            </table>
          </div>
          <div class="md:hidden space-y-2.5" id="admin-candidates-cards">
            ${_||this.adminCandidateCardsEmpty(m)}
          </div>
          <div id="admin-candidates-pager">${this.adminPager("candidates",m)}</div>
        </div>

        ${this.adminReportsSection(l)}

        <div class="admin-fade-in mb-8">
          ${this.adminSectionHeader("Feedback",n.length,"edit_note")}
          <div class="hidden md:block overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
            <table class="w-full">
              <thead class="bg-slate-50 sticky top-0">
                <tr>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">When</th>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Type</th>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Message</th>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">From</th>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Page</th>
                </tr>
              </thead>
              <tbody>${n.map(g=>`
                <tr class="border-b border-slate-100 last:border-0 align-top">
                  <td class="py-3 px-3 text-xs text-slate-400 whitespace-nowrap">${swapikiStore.timeAgo(g.created_at)}</td>
                  <td class="py-3 px-3 whitespace-nowrap">
                    <span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${this.feedbackCategoryColor(g.category)}">${g.category}</span>
                  </td>
                  <td class="py-3 px-3 text-sm text-slate-700 max-w-md whitespace-pre-line">${this.escapeHtml(g.message)}</td>
                  <td class="py-3 px-3 text-sm text-slate-500 whitespace-nowrap">${this.escapeHtml(g.name||"")}${g.email?'<span class="block text-xs text-slate-400">'+this.escapeHtml(g.email)+"</span>":""}</td>
                  <td class="py-3 px-3 text-xs text-slate-400 break-all max-w-[12rem]">${this.escapeHtml(g.url||"")}</td>
                </tr>
              `).join("")||this.adminEmptyState(5,"edit_note","No feedback yet \u2014 the widget on every page feeds this list.")}</tbody>
            </table>
          </div>
          <div class="md:hidden space-y-2.5">
            ${n.map(g=>`
              <div class="border border-slate-200 rounded-xl bg-white shadow-sm p-3.5">
                <div class="flex items-center gap-2 mb-1.5">
                  <span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${this.feedbackCategoryColor(g.category)}">${g.category}</span>
                  <span class="text-xs text-slate-400">${swapikiStore.timeAgo(g.created_at)}</span>
                </div>
                <p class="text-sm text-slate-700 whitespace-pre-line">${this.escapeHtml(g.message)}</p>
                <p class="text-xs text-slate-400 mt-1.5">${this.escapeHtml(g.name||"Anonymous")}${g.email?" \xB7 "+this.escapeHtml(g.email):""}</p>
                <p class="text-[11px] text-slate-400 break-all">${this.escapeHtml(g.url||"")}</p>
              </div>
            `).join("")||'<div class="border border-slate-200 rounded-xl bg-white p-8 text-center"><span class="material-symbols-outlined text-3xl text-slate-300 block mb-2">edit_note</span><span class="text-sm text-slate-400">No feedback yet.</span></div>'}
          </div>
        </div>

        <div class="admin-fade-in">
          ${this.adminSectionHeader("Admins",i.length,"shield_person")}
          <div class="border border-slate-200 rounded-xl bg-white shadow-sm p-4 mb-4">
            <form onsubmit="app.adminPromoteSubmit(event)" class="flex flex-col sm:flex-row gap-2">
              <div class="relative flex-1">
                <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">mail</span>
                <input id="admin-promote-email-input" type="email" required placeholder="colleague@company.com"
                  class="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
              </div>
              <button type="submit"
                class="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 active:scale-[0.98] transition-all whitespace-nowrap">
                <span class="material-symbols-outlined text-lg">person_add</span> Grant Admin Access
              </button>
            </form>
            <p class="text-xs text-slate-400 mt-2.5 flex items-start gap-1">
              <span class="material-symbols-outlined text-sm mt-0.5">info</span>
              <span>They must already have a Swapiki account (candidate or plain login) before you can promote them.</span>
            </p>
          </div>
          <div class="hidden md:block overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
            <table class="w-full">
              <thead class="bg-slate-50 sticky top-0">
                <tr>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Email</th>
                  <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Granted</th>
                  <th class="text-right text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>${x||this.adminEmptyState(3,"shield_person","No admins yet.")}</tbody>
            </table>
          </div>
          <div class="md:hidden space-y-2.5">
            ${$||'<div class="border border-slate-200 rounded-xl bg-white p-8 text-center"><span class="material-symbols-outlined text-3xl text-slate-300 block mb-2">shield_person</span><span class="text-sm text-slate-400">No admins yet.</span></div>'}
          </div>
        </div>
      `,this.bindAdminSelection(e),["draft","published"].forEach(g=>this.adminSyncBulkBar(g));const E=document.getElementById("admin-last-refreshed");E&&(E.textContent=`Updated ${new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`),this.animateAdminStatCards(),this.animateAdminBars()}catch(s){e.innerHTML=`
        <div class="border border-rose-200 bg-rose-50 rounded-xl p-6 flex items-start gap-3">
          <span class="material-symbols-outlined text-rose-500 text-2xl">error</span>
          <div>
            <p class="text-sm font-bold text-rose-700">Could not load admin data</p>
            <p class="text-sm text-rose-600 mt-0.5">${s&&s.message||"Please try refreshing."}</p>
          </div>
        </div>
      `}finally{t&&(t.disabled=!1,t.innerHTML='<span class="material-symbols-outlined text-lg">refresh</span> Refresh')}}async adminTogglePublish(e,t){const s=t==="published"?"draft":"published";try{await swapikiStore.adminSetProfileStatus(e,s),this.showToast(`Profile ${s==="published"?"published":"unpublished"}.`),this.renderAdminDashboard()}catch(i){this.showToast(`\u274C ${i&&i.message||"Could not update profile status."}`)}}async adminDeleteCandidate(e,t){if(confirm(`Permanently delete "${t||"this candidate"}"? This cannot be undone.`))try{await swapikiStore.adminDeleteCandidate(e),this.showToast("Candidate deleted."),this.renderAdminDashboard()}catch(s){this.showToast(`\u274C ${s&&s.message||"Could not delete candidate."}`)}}async adminResolveReport(e,t){try{await swapikiStore.adminResolveProfileReport(e,t),this.showToast(t==="actioned"?"Report marked actioned.":"Report dismissed."),this.renderAdminDashboard()}catch(s){this.showToast(`\u274C ${s&&s.message||"Could not update the report."}`)}}async adminSuspendReportedProfile(e,t){try{if(await swapikiStore.adminSetProfileStatus(e,"suspended"),t)try{await swapikiStore.adminResolveProfileReport(t,"actioned")}catch(s){}this.showToast("Profile suspended and report marked actioned."),this.renderAdminDashboard()}catch(s){this.showToast(`\u274C ${s&&s.message||"Could not suspend the profile."}`)}}adminPrefersCards(){try{if(typeof window!="undefined"&&window.matchMedia)return window.matchMedia("(max-width: 767px)").matches}catch(e){}return!0}watchAdminBreakpoint(){if(!this._adminBreakpointWatched)try{if(typeof window=="undefined"||!window.matchMedia)return;const e=window.matchMedia("(max-width: 767px)");if(typeof e.addEventListener!="function")return;e.addEventListener("change",()=>{this.repaintAdminJobs()}),this._adminBreakpointWatched=e}catch(e){}}adminListState(e){return this._adminLists||(this._adminLists={}),this._adminLists[e]||(this._adminLists[e]={q:"",page:1,dir:1}),this._adminLists[e]}adminMatchesQuery(e,t){const s=String(e==null?"":e).toLowerCase().split(/\s+/).filter(Boolean);if(!s.length)return!0;const i=(t||[]).filter(Boolean).join(" ").toLowerCase();return s.every(o=>i.includes(o))}adminPaged(e,t,s){const i=this.adminListState(t),o=e||[],a=o.filter(h=>this.adminMatchesQuery(i.q,s(h))),n=Math.max(1,Math.ceil(a.length/ADMIN_PAGE_SIZE)),r=Math.floor(Number(i.page)||1),l=Math.min(Math.max(r,1),n);i.page!==l&&(i.page=l);const p=(l-1)*ADMIN_PAGE_SIZE,d=a.slice(p,p+ADMIN_PAGE_SIZE);return{page:d,total:o.length,matched:a.length,shown:d.length,pageNo:l,pageCount:n,hasPrev:l>1,hasNext:l<n}}adminPager(e,t){if(!t||t.pageCount<=1)return"";const s="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95",i="text-primary bg-primary-fixed hover:opacity-80",o="text-slate-400 bg-slate-100 cursor-not-allowed active:scale-100";return`
      <div class="flex items-center justify-center gap-2 mt-3" data-admin-pager="${e}">
        <button type="button" onclick="app.adminPrevPage('${e}')" data-admin-prev="${e}" ${t.hasPrev?"":"disabled"}
          title="Previous page" class="${s} ${t.hasPrev?i:o}">
          <span class="material-symbols-outlined text-sm">chevron_left</span> Back
        </button>
        <span class="text-[11px] font-bold text-slate-500 tabular-nums whitespace-nowrap px-1" data-admin-pageinfo="${e}">Page ${t.pageNo} of ${t.pageCount}</span>
        <button type="button" onclick="app.adminShowMore('${e}')" data-admin-more="${e}" ${t.hasNext?"":"disabled"}
          title="Next page" class="${s} ${t.hasNext?i:o}">
          Show more <span class="material-symbols-outlined text-sm">expand_more</span>
        </button>
      </div>`}adminViewFor(e){return e==="candidates"?this.adminCandidatePage(this._adminCandidatesCache||[]):this.adminJobPage(this._adminJobs||[],e)}adminSearchToolbar(e,t){const s=this.adminListState(e),i=t||{},o=i.view||{matched:0,total:0,pageCount:1,pageNo:1};return`
      <div class="flex flex-col sm:flex-row sm:items-center gap-2 mb-3" data-admin-toolbar="${e}">
        <div class="relative flex-1 min-w-0">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
          <input type="search" value="${this.escapeHtml(s.q)}" data-admin-search="${e}"
            oninput="app.adminOnSearch('${e}', this.value)"
            placeholder="${this.escapeHtml(i.placeholder||"Search this list")}"
            aria-label="${this.escapeHtml(i.label||"Search this list")}"
            class="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
        </div>
        ${i.extra||""}
        <span class="text-[11px] text-slate-400 whitespace-nowrap tabular-nums" data-admin-count="${e}">${this.adminViewCountText(o,s.q)}</span>
        <button type="button" onclick="app.adminClearSearch('${e}')" data-admin-clear="${e}"
          class="text-[11px] font-bold text-slate-500 hover:text-primary whitespace-nowrap ${s.q?"":"hidden"}">Clear</button>
      </div>`}adminViewCountText(e,t){const s=e&&e.matched||0;return t&&!s?"nothing matches":t?`${s} matching`:`${s} ${s===1?"row":"rows"}`}adminSyncViewControls(e,t){const s=this.adminListState(e),i=t||this.adminViewFor(e),o=document.querySelector(`[data-admin-count="${e}"]`);o&&(o.textContent=this.adminViewCountText(i,s.q));const a=document.querySelector(`[data-admin-total="${e}"]`);a&&(a.textContent=String(i.total));const n=document.querySelector(`[data-admin-clear="${e}"]`);n&&n.classList.toggle("hidden",!s.q);const r=document.querySelector('[data-admin-sort-label="candidates"]');r&&(r.textContent=this.adminSortLabel())}adminRepaintList(e){const t=e==="candidates"?this.repaintAdminCandidates():this.repaintAdminJobs();return t||this.renderAdminDashboard(),t}adminOnSearch(e,t){const s=this.adminListState(e),i=String(t==null?"":t);i!==s.q&&(s.q=i,s.page=1,this.adminRepaintList(e))}adminClearSearch(e){const t=this.adminListState(e);if(!t.q&&t.page===1)return;t.q="",t.page=1;const s=document.querySelector(`[data-admin-search="${e}"]`);s&&(s.value=""),this.adminRepaintList(e)}adminShowMore(e){const t=this.adminListState(e);t.page=this.adminViewFor(e).pageNo+1,this.adminRepaintList(e)}adminPrevPage(e){const t=this.adminListState(e);t.page=Math.max(1,this.adminViewFor(e).pageNo-1),this.adminRepaintList(e)}adminSortCandidates(){const e=this.adminListState("candidates");e.dir=e.dir===1?-1:1,this.repaintAdminCandidates()||this.renderAdminDashboard()}adminSortLabel(){return this.adminListState("candidates").dir===-1?"Z\u2013A":"A\u2013Z"}adminJobFields(e){return[e.title,e.company,e.location,e.category,e.source,e.contact_email,e.contact_phone,e.raw_text]}adminJobPage(e,t){const s=(e||[]).filter(o=>o&&o.status===t),i=this.adminFeaturedFirst(s);return this.adminPaged(i,t,o=>this.adminJobFields(o))}adminIsFeatured(e){return!!(e&&(e.featured===!0||e.featured==="true"||e.featured==="t"))}adminFeaturedFirst(e){const t=[],s=[];for(const i of e)(this.adminIsFeatured(i)?t:s).push(i);return t.concat(s)}adminCandidatePage(e){const s=this.adminListState("candidates").dir===-1?-1:1,i=(e||[]).slice().sort((o,a)=>{const n=String(o&&o.name||"").trim(),r=String(a&&a.name||"").trim();return!n&&r?1:n&&!r?-1:!n&&!r?0:n.localeCompare(r,void 0,{sensitivity:"base"})*s});return this.adminPaged(i,"candidates",o=>[o.name,o.username,o.email,o.phone,o.title,o.location,o.status,Array.isArray(o.expertise)?o.expertise.join(" "):o.expertise])}adminCandidatesMarkup(e){const t=e||[],s=a=>`animation-delay:${Math.min(a*.03,.3)}s`,i=t.map((a,n)=>`
      <tr class="admin-row-fade border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors" style="${s(n)}">
        <td class="py-3 px-3">
          <button onclick="app.adminViewCandidateProfile(this.dataset.username)" data-username="${this.escapeHtml(a.username||"")}"
            class="flex items-center gap-2.5 text-left group" ${a.username?"":"disabled"}>
            <span class="w-8 h-8 rounded-full ${this.adminAvatarColor(a.email||a.name)} flex items-center justify-center text-[11px] font-bold shrink-0">${this.adminInitials(a.name)}</span>
            <span class="text-sm font-bold text-slate-800 whitespace-nowrap ${a.username?"group-hover:text-primary group-hover:underline":""}">${this.escapeHtml(a.name||"(no name)")}</span>
          </button>
        </td>
        <td class="py-3 px-3 text-sm text-slate-500 whitespace-nowrap">${this.escapeHtml(a.username||"\u2014")}</td>
        <td class="py-3 px-3 text-sm text-slate-500 whitespace-nowrap">${this.escapeHtml(a.email||"\u2014")}</td>
        <td class="py-3 px-3 text-sm text-slate-500 whitespace-nowrap">${this.escapeHtml(a.phone||"\u2014")}</td>
        <td class="py-3 px-3">
          <span class="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${a.profile_status==="published"?"bg-emerald-50 text-emerald-700":a.profile_status==="suspended"?"bg-rose-50 text-rose-700":"bg-slate-100 text-slate-600"}">
            <span class="w-1.5 h-1.5 rounded-full ${a.profile_status==="published"?"bg-emerald-500":a.profile_status==="suspended"?"bg-rose-500":"bg-slate-400"}"></span>
            ${this.escapeHtml(a.profile_status||"draft")}
          </span>
          <span title="${a.voice_verified?"Recording confirmed live: the candidate read a random code into a microphone. This is not an identity check.":"No confirmed live recording yet - useful spam triage signal"}"
            class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full mt-1 ${a.voice_verified?"bg-emerald-50 text-emerald-700":a.voice_verification_count>=3&&!a.voice_verified?"bg-rose-50 text-rose-600":"bg-slate-50 text-slate-400"}">
            <span class="material-symbols-outlined text-[12px]">${a.voice_verified?"verified":"record_voice_over"}</span>
            ${a.voice_verified?"Live recording confirmed":a.voice_verification_count>=3&&!a.voice_verified?"Flagged (3+ fails)":a.voice_verification_count?`${a.voice_verification_count} attempt${a.voice_verification_count===1?"":"s"}, not confirmed`:"No recording check"}
          </span>
        </td>
        <td class="py-3 px-3 text-right whitespace-nowrap">
          <button onclick="app.adminTogglePublish('${a.id}', '${a.profile_status}')" title="${a.profile_status==="published"?"Unpublish":a.profile_status==="suspended"?"Restore":"Publish"}"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-primary hover:bg-primary-fixed active:scale-90 transition-all">
            <span class="material-symbols-outlined text-lg">${a.profile_status==="published"?"visibility_off":a.profile_status==="suspended"?"restart_alt":"visibility"}</span>
          </button>
          <button onclick="app.adminDeleteCandidate(this.dataset.id, this.dataset.name)" data-id="${this.escapeHtml(a.id||"")}" data-name="${this.escapeHtml(a.name||"")}" title="Delete"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:scale-90 transition-all">
            <span class="material-symbols-outlined text-lg">delete</span>
          </button>
        </td>
      </tr>`),o=t.map((a,n)=>`
      <div class="admin-row-fade admin-mobile-card border border-slate-200 rounded-xl bg-white shadow-sm p-3.5" style="${s(n)}">
        <div class="flex items-start justify-between gap-2">
          <button onclick="app.adminViewCandidateProfile(this.dataset.username)" data-username="${this.escapeHtml(a.username||"")}"
            class="flex items-center gap-2.5 min-w-0 text-left" ${a.username?"":"disabled"}>
            <span class="w-9 h-9 rounded-full ${this.adminAvatarColor(a.email||a.name)} flex items-center justify-center text-xs font-bold shrink-0">${this.adminInitials(a.name)}</span>
            <div class="min-w-0">
              <div class="text-sm font-bold text-slate-800 truncate ${a.username?"hover:text-primary hover:underline":""}">${this.escapeHtml(a.name||"(no name)")}</div>
              <div class="text-xs text-slate-400 truncate">${a.username?"@"+this.escapeHtml(a.username):"\u2014"}</div>
            </div>
          </button>
          <span class="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${a.profile_status==="published"?"bg-emerald-50 text-emerald-700":a.profile_status==="suspended"?"bg-rose-50 text-rose-700":"bg-slate-100 text-slate-600"}">
            <span class="w-1.5 h-1.5 rounded-full ${a.profile_status==="published"?"bg-emerald-500":a.profile_status==="suspended"?"bg-rose-500":"bg-slate-400"}"></span>
            ${this.escapeHtml(a.profile_status||"draft")}
          </span>
        </div>
        <div class="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-y-1.5 text-xs">
          <span class="text-slate-400">Email</span>
          <span class="text-slate-600 text-right truncate">${this.escapeHtml(a.email||"\u2014")}</span>
          <span class="text-slate-400">Phone</span>
          <span class="text-slate-600 text-right truncate">${this.escapeHtml(a.phone||"\u2014")}</span>
        </div>
        <div class="mt-3 flex gap-2">
          <button onclick="app.adminTogglePublish('${a.id}', '${a.profile_status}')"
            class="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold text-primary bg-primary-fixed active:scale-[0.97] transition-all">
            <span class="material-symbols-outlined text-base">${a.profile_status==="published"?"visibility_off":a.profile_status==="suspended"?"restart_alt":"visibility"}</span>
            ${a.profile_status==="published"?"Unpublish":a.profile_status==="suspended"?"Restore":"Publish"}
          </button>
          <button onclick="app.adminDeleteCandidate(this.dataset.id, this.dataset.name)" data-id="${this.escapeHtml(a.id||"")}" data-name="${this.escapeHtml(a.name||"")}"
            class="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold text-rose-600 bg-rose-50 active:scale-[0.97] transition-all">
            <span class="material-symbols-outlined text-base">delete</span> Delete
          </button>
        </div>
      </div>`);return{rows:i.join(""),cards:o.join("")}}repaintAdminCandidates(){const e=document.getElementById("admin-candidates-tbody"),t=document.getElementById("admin-candidates-cards"),s=document.getElementById("admin-candidates-pager");if(!e&&!t)return!1;const i=this.adminCandidatePage(this._adminCandidatesCache||[]),{rows:o,cards:a}=this.adminCandidatesMarkup(i.page);return e&&(e.innerHTML=o||this.adminEmptyState(6,"badge",this.adminCandidateEmptyText(i))),t&&(t.innerHTML=a||this.adminCandidateCardsEmpty(i)),s&&(s.innerHTML=this.adminPager("candidates",i)),this.adminSyncViewControls("candidates",i),!0}adminCandidateEmptyText(e){const t=this.adminListState("candidates").q;return t&&!e.matched?`No candidate matches \u201C${t}\u201D.`:e.total?"No candidates match the search.":"No candidates yet."}adminCandidateCardsEmpty(e){const t=this.adminCandidateEmptyText(e);return`<div class="border border-slate-200 rounded-xl bg-white p-8 text-center"><span class="material-symbols-outlined text-3xl text-slate-300 block mb-2">badge</span><span class="text-sm text-slate-400">${this.escapeHtml(t)}</span></div>`}repaintAdminJobs(){const e=document.getElementById("admin-draft-inner"),t=document.getElementById("admin-published-inner");if(!e||!t)return!1;const s=this._adminJobs||[],i={draft:this.adminJobPage(s,"draft"),published:this.adminJobPage(s,"published")},o=this.adminJobsMarkup(s,i);return e.innerHTML=o.draft,t.innerHTML=o.published,["draft","published"].forEach(a=>{this.adminSyncBulkBar(a),this.adminSyncViewControls(a,i[a])}),!0}renderAdminJobsSection(e){const t=e||[],s={draft:this.adminJobPage(t,"draft"),published:this.adminJobPage(t,"published")},i=this.adminJobsMarkup(t,s);return`<div id="admin-jobs-section" class="admin-fade-in mb-8">
      ${this.adminSectionHeader("Job Review",s.draft.total,"work","","draft")}
      ${this.adminSearchToolbar("draft",{view:s.draft,placeholder:"Search drafts \u2014 title, company, place, or the original post",label:"Search drafts waiting for review"})}
      <div id="admin-draft-inner">${i.draft}</div>
      <h4 class="text-sm font-bold text-slate-700 mb-2 mt-6">Published (<span data-admin-total="published">${s.published.total}</span>)</h4>
      ${this.adminSearchToolbar("published",{view:s.published,placeholder:"Search published jobs \u2014 title, company, or place",label:"Search published jobs"})}
      <div id="admin-published-inner">${i.published}</div>
    </div>`}adminJobsMarkup(e,t){const s=e||[],i=t||{draft:this.adminJobPage(s,"draft"),published:this.adminJobPage(s,"published")},o=i.draft.page,a=i.published.page,n=this.adminListState("draft").q,r=this.adminListState("published").q,l=s.filter(c=>c.status==="rejected"),p=o.map(c=>`
      <tr class="admin-row-fade border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors">
        <td class="py-3 px-3 w-8">
          <input type="checkbox" class="admin-job-check w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" value="${c.id}" data-group="draft" aria-label="Select ${this.escapeHtml(c.title||"this job")}"/>
        </td>
        <td class="py-3 px-3">
          <div class="flex items-start gap-1.5">
            <div class="min-w-0 flex-1">
              <div class="text-sm font-bold text-slate-800">${this.escapeHtml(c.title||"(untitled)")}</div>
              <div class="text-xs text-slate-400">${this.escapeHtml(c.company||"-")}${c.location?" \xB7 "+this.escapeHtml(c.location):""}</div>
              ${this.adminJobProvenance(c)}
              ${c.raw_text?`<details class="mt-1"><summary class="text-[10px] font-bold text-slate-400 cursor-pointer hover:text-primary">Original post</summary><p class="text-[11px] text-slate-500 mt-1 whitespace-pre-wrap leading-relaxed">${this.escapeHtml(c.raw_text)}</p></details>`:""}
            </div>
            ${this.adminFeaturedBadge(c)}
          </div>
        </td>

        <td class="py-3 px-3 text-xs text-slate-500">${this.escapeHtml(c.category||"\u2014")}</td>
        <td class="py-3 px-3">
          <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Draft</span>
        </td>
        <td class="py-3 px-3 text-right whitespace-nowrap">
          ${this.adminFeatureButton(c)}
          <button onclick="app.adminApproveJob('${c.id}')" title="Publish to the board"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-emerald-600 hover:bg-emerald-50 active:scale-90 transition-all"><span class="material-symbols-outlined text-lg">check_circle</span></button>
          <button onclick="app.adminRejectJob('${c.id}')" title="Reject \u2014 the row is kept and can be reopened"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-amber-600 hover:bg-amber-50 active:scale-90 transition-all"><span class="material-symbols-outlined text-lg">block</span></button>
          <button onclick="app.adminDeleteJob('${c.id}')" title="Delete permanently \u2014 this cannot be undone"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-rose-500 hover:bg-rose-50 active:scale-90 transition-all"><span class="material-symbols-outlined text-lg">delete</span></button>
        </td>
      </tr>`),d=a.map(c=>`
      <tr class="admin-row-fade border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors">
        <td class="py-3 px-3 w-8">
          <input type="checkbox" class="admin-job-check w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" value="${c.id}" data-group="published" aria-label="Select ${this.escapeHtml(c.title||"this job")}"/>
        </td>
        <td class="py-3 px-3">
          <div class="flex items-start gap-1.5">
            <div class="min-w-0 flex-1">
              <div class="text-sm font-bold text-slate-800">${this.escapeHtml(c.title||"(untitled)")}</div>
              <div class="text-xs text-slate-400">${this.escapeHtml(c.company||"-")}${c.location?" \xB7 "+this.escapeHtml(c.location):""}</div>
            </div>
            ${this.adminFeaturedBadge(c)}
          </div>
        </td>
        <td class="py-3 px-3 text-xs text-slate-500">${this.escapeHtml(c.category||"-")}</td>
        <td class="py-3 px-3">
          <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Published</span>
        </td>
        <td class="py-3 px-3 text-right whitespace-nowrap">
          ${this.adminFeatureButton(c)}
          <button onclick="app.adminUnpublishJob('${c.id}')" title="Move back to draft"

            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-primary hover:bg-primary-fixed active:scale-90 transition-all"><span class="material-symbols-outlined text-lg">visibility_off</span></button>
          <button onclick="app.adminRejectJob('${c.id}')" title="Reject \u2014 the row is kept and can be reopened"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-amber-600 hover:bg-amber-50 active:scale-90 transition-all"><span class="material-symbols-outlined text-lg">block</span></button>
          <button onclick="app.adminDeleteJob('${c.id}')" title="Delete permanently \u2014 this cannot be undone"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-rose-500 hover:bg-rose-50 active:scale-90 transition-all"><span class="material-symbols-outlined text-lg">delete</span></button>
        </td>
      </tr>`),h={emerald:"text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-50",rose:"text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-rose-50",slate:"text-slate-500 bg-slate-50 border border-slate-200 hover:bg-slate-100 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-50"},b={draft:[{status:"published",label:"Publish selected",icon:"check_circle",tone:"emerald"},{status:"rejected",label:"Reject selected",icon:"block",tone:"rose"}],published:[{status:"draft",label:"Move to draft",icon:"visibility_off",tone:"slate"},{status:"rejected",label:"Reject selected",icon:"block",tone:"rose"}]},u=(c,k)=>`
      <div class="hidden md:flex flex-wrap items-center gap-2 mb-3">
        <label class="inline-flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none">
          <input type="checkbox" class="admin-job-check-all w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" data-group="${c}" aria-label="Select all ${k}"/>
          Select all
        </label>
        <span class="text-xs text-slate-400" data-selected-count="${c}">0 selected</span>
        <span class="flex-1"></span>
        ${b[c].map(S=>`
        <button type="button" onclick="app.adminBulkSetStatus('${c}', '${S.status}')" data-bulk-action="${S.status}" data-group="${c}"
          class="admin-bulk-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold ${h[S.tone]}">
          <span class="material-symbols-outlined text-base">${S.icon}</span> ${S.label}
        </button>`).join("")}
      </div>`,m=(c,k,S,C)=>`
      <button onclick="app.${C.action}('${c}')" title="${this.escapeHtml(C.title)}"
        class="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold ${C.cls} active:scale-[0.97] transition-all">
        <span class="material-symbols-outlined text-base">${S}</span> ${k}
      </button>`,v={publish:{cls:"text-emerald-700 bg-emerald-50",title:"Publish to the board",action:"adminApproveJob"},reject:{cls:"text-amber-700 bg-amber-50",title:"Reject \u2014 the row is kept and can be reopened",action:"adminRejectJob"},unpublish:{cls:"text-slate-600 bg-slate-100",title:"Move back to draft",action:"adminUnpublishJob"},destroy:{cls:"text-rose-600 bg-rose-50",title:"Delete permanently \u2014 this cannot be undone",action:"adminDeleteJob"}},_=(c,k)=>k==="draft"?m(c.id,"Publish","check_circle",v.publish)+m(c.id,"Reject","block",v.reject)+m(c.id,"Delete","delete",v.destroy):m(c.id,"To draft","visibility_off",v.unpublish)+m(c.id,"Reject","block",v.reject)+m(c.id,"Delete","delete",v.destroy),x=(c,k,S)=>c.length?c.map((C,I)=>{const j=k[I]||{},A=[j.company,j.location].filter(Boolean).map(T=>this.escapeHtml(T)).join(" \xB7 ");return`
          <div class="admin-mobile-card border border-slate-200 rounded-xl bg-white shadow-sm p-3.5 admin-row-fade" style="animation-delay:${Math.min(I*.03,.3)}s">
            <div class="text-sm font-bold text-slate-800 truncate">${this.escapeHtml(j.title||"(untitled)")}</div>
            ${A?`<div class="text-xs text-slate-400 truncate">${A}</div>`:""}
            ${this.adminJobProvenance(j)}
            ${j.raw_text?`<details class="mt-1"><summary class="text-[10px] font-bold text-slate-400 cursor-pointer hover:text-primary">Original post</summary><p class="text-[11px] text-slate-500 mt-1 whitespace-pre-wrap leading-relaxed">${this.escapeHtml(j.raw_text)}</p></details>`:""}
            <div class="mt-3 flex gap-2">${j.id?_(j,S):""}</div>
          </div>`}).join(""):"",$=this.adminPrefersCards(),E=(c,k,S,C)=>$?`<div class="md:hidden space-y-2 mt-3">${c.length?x(c,k,C):this.escapeHtml(S)}</div>`:"",g=(c,k,S,C,I)=>`
      <div class="${k?"hidden md:block":""} overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
        <table class="w-full">
          <thead class="bg-slate-50">
            <tr>
              <th class="w-8 py-2.5 px-3"></th>
              <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Job</th>
              <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Category</th>
              <th class="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Status</th>
              <th class="text-right text-[11px] font-bold uppercase tracking-wide text-slate-500 py-2.5 px-3">Actions</th>
            </tr>
          </thead>
          <tbody>${c.length?c.join(""):this.adminEmptyState(5,"work_off",S)}</tbody>
        </table>
      </div>
      ${E(c,C,S,I)}`,y=(c,k)=>`No ${c} match \u201C${k}\u201D. Clear the search to see the rest.`,w=n?y("drafts",n):"Nothing to review. New openings arrive here from the jobs page.",f=r?y("published jobs",r):"No published jobs yet. Review an opening above to fill the board.";return{draft:`
        ${o.length?u("draft","drafts"):""}
        ${g(p,!0,w,o,"draft")}
        ${this.adminPager("draft",i.draft)}
        ${l.length?this.rejectedNote(l):""}`,published:`
        ${a.length?u("published","published jobs"):""}
        ${g(d,!1,f,a,"published")}
        ${this.adminPager("published",i.published)}`}}rejectedNote(e){const t=e.length,s=e.slice(0,25).map(a=>`
      <li class="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
        <span class="text-xs text-slate-600 truncate">${this.escapeHtml(a.title||"(untitled)")}<span class="text-slate-400"> \xB7 ${this.escapeHtml(a.company||"\u2014")}</span></span>
        <button onclick="app.adminReopenJob('${a.id}')" title="Put this back in the review queue"
          class="shrink-0 text-[10px] font-bold text-primary hover:underline whitespace-nowrap">Reopen</button>
      </li>`).join(""),i=t>25?`<li class="pt-1.5 text-[10px] text-slate-400">and ${t-25} more</li>`:"",o=e.filter(a=>a.source==="user-submission").length;return`
      <details class="mt-3 border border-slate-200 rounded-xl bg-white">
        <summary class="cursor-pointer select-none px-3.5 py-2.5 text-xs font-bold text-slate-600 hover:text-primary">
          Rejected (${t}) \u2014 kept, and can be reopened
        </summary>
        <div class="px-3.5 pb-3">
          <p class="text-[11px] text-slate-400 mb-1">${o} of these ${o===1?"was":"were"} posted by an employer. Nothing here is deleted.</p>
          <ul class="mt-1">${s}${i}</ul>
        </div>
      </details>`}adminJobProvenance(e){const t=String(e&&e.source||"").trim();if(t==="user-submission"){const n=String(e&&(e.contact||e.apply_url)||"").trim();let r="";if(n)try{const p=new URL(n);(p.protocol==="http:"||p.protocol==="https:")&&(r=p.href)}catch(p){}return`<div class="mt-1 flex items-center gap-2 flex-wrap">
        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Posted by employer</span>
        ${n?r?`<a href="${this.escapeHtml(r)}" target="_blank" rel="noopener noreferrer nofollow" class="text-[10px] font-bold text-primary hover:underline break-all">${this.escapeHtml(n)}</a>`:`<span class="text-[10px] text-slate-500 break-all">${this.escapeHtml(n)}</span>`:'<span class="text-[10px] text-rose-500">no contact given</span>'}
      </div>`}if(t!=="adzuna")return"";const s="From Adzuna",i=String(e&&(e.apply_url||e.contact)||"").trim();let o="";if(i)try{const n=new URL(i);(n.protocol==="http:"||n.protocol==="https:")&&(o=n.href)}catch(n){}const a=o?`<a href="${this.escapeHtml(o)}" target="_blank" rel="noopener noreferrer nofollow"
           class="text-[10px] font-bold text-primary hover:underline">view on Adzuna</a>`:"";return`<div class="mt-1 flex items-center gap-2">
      <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">${s}</span>
      ${a}
    </div>`}adminFeaturedBadge(e){return this.adminIsFeatured(e)?`<button type="button" onclick="app.adminSetFeatured(this.dataset.id, false)" data-id="${this.escapeHtml(e.id||"")}"
      title="Pinned above every other listing on the board and in the emails. Click to unpin."
      class="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 active:scale-95 transition-all shrink-0 align-middle">
      <span class="material-symbols-outlined" style="font-size:12px">push_pin</span> Pinned
    </button>`:""}adminFeatureButton(e){return this.adminIsFeatured(e)?"":`<button type="button" onclick="app.adminSetFeatured(this.dataset.id, true)" data-id="${this.escapeHtml(e.id||"")}"
      title="Pin to the top of the jobs board, the weekly digest and the nudge emails"
      class="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 active:scale-90 transition-all shrink-0"
      aria-label="Pin this listing to the top"><span class="material-symbols-outlined text-base">push_pin</span></button>`}jobFeaturedLabel(e){return this.adminIsFeatured(e)?`<span class="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 align-middle" title="Featured listing">
      <span class="material-symbols-outlined" style="font-size:12px">push_pin</span> Pinned
    </span>`:""}async adminSetFeatured(e,t){const s=String(e||"");if(!s)return!1;const i=!!t;try{await swapikiStore.adminSetJobFeatured(s,i);const o=(this._adminJobs||[]).map(a=>a.id===s?{...a,featured:i}:a);return this._adminJobs=o,this.repaintAdminJobs(),this.showToast(i?"Pinned to the top of the board and the emails.":"Unpinned."),!0}catch(o){return this.showToast(`Could not change the pin: ${o&&o.message||"try again."}`),!1}}renderJobSubmitForm(){const e="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all";return`
      <details class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-6" id="post-a-job">
        <summary class="flex items-center gap-3 px-5 py-4 cursor-pointer select-none hover:bg-slate-50 transition-colors">
          <span class="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-lg">campaign</span>
          </span>
          <span class="min-w-0">
            <span class="block text-sm font-bold text-slate-800">Hiring? Post a job</span>
            <span class="block text-xs text-slate-400">Anyone can post. An admin reviews it before it goes live.</span>
          </span>
          <span class="material-symbols-outlined text-slate-400 ml-auto">expand_more</span>
        </summary>
        <form onsubmit="app.submitJobForm(event)" class="px-5 pb-5 pt-1 space-y-3 border-t border-slate-100">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input id="job-form-title" placeholder="Job title *" maxlength="120" class="${e}"/>
            <input id="job-form-company" placeholder="Company *" maxlength="120" class="${e}"/>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input id="job-form-location" placeholder="Location (e.g. Bengaluru, Remote)" maxlength="120" class="${e}"/>
            <input id="job-form-salary" placeholder="Salary (optional)" maxlength="60" class="${e}"/>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select id="job-form-category" class="${e}">
              <option value="it">IT</option>
              <option value="bfsi">BFSI</option>
              <option value="any">Other / any role</option>
            </select>
            <input id="job-form-contact" placeholder="Apply link, email or phone *" maxlength="200" class="${e}"/>
          </div>
          <input id="job-form-skills" placeholder="Skills, comma separated (optional)" maxlength="400" class="${e}"/>
          <textarea id="job-form-description" rows="4" maxlength="2000" placeholder="Describe the role: responsibilities, requirements, experience needed." class="${e} resize-y"></textarea>
          <textarea id="job-form-raw" rows="2" maxlength="2000" placeholder="Original post text (optional \u2014 paste the whole thing if you have it)" class="${e} resize-y"></textarea>
          <input id="job-form-hp" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" class="hidden" name="honeypot"/>
          <div class="flex flex-wrap items-center gap-3 pt-1">
            <button type="submit" id="job-form-submit" class="px-5 py-2.5 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 active:scale-[0.98] transition-all">Submit for review</button>
            <p class="text-xs text-slate-400">Goes to the review queue. Not published automatically.</p>
          </div>
          <div id="job-form-result"></div>
        </form>
      </details>`}renderChannelJoinCard(){const e=typeof window!="undefined"&&window.SWAPIKI_CONFIG||{},t=String(e.TELEGRAM_CHANNEL_URL||"").trim(),s=String(e.WHATSAPP_CHANNEL_URL||"").trim(),i=String(e.TELEGRAM_BOT_USERNAME||"").trim(),o=this.isAuthenticated&&this.isAuthenticated();if(!t&&!s&&!i)return"";const a=d=>"https://api.qrserver.com/v1/create-qr-code/?size=176x176&margin=0&data="+encodeURIComponent(d),n=(d,h,b,u,m)=>`
      <a href="${this.escapeHtml(m)}" target="_blank" rel="noopener noreferrer"
         class="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 hover:border-primary/40 hover:shadow-sm transition-all">
        <img src="${a(m)}" alt="QR code to join the ${this.escapeHtml(d)} channel" width="88" height="88"
             loading="lazy" referrerpolicy="no-referrer" class="w-[88px] h-[88px] rounded-lg border border-slate-100 shrink-0"/>
        <span class="min-w-0">
          <span class="flex items-center gap-2 text-sm font-bold text-slate-800">
            <span class="material-symbols-outlined text-[18px] ${u}">${b}</span>
            ${this.escapeHtml(d)}
          </span>
          <span class="block text-xs text-slate-500 mt-1">${this.escapeHtml(h)}</span>
        </span>
      </a>`,r=i?`https://t.me/${encodeURIComponent(i)}?start=channel`:t,l=[];if(r&&l.push(n("Telegram","Job alerts the moment they are approved, plus profile tips.","send","text-sky-500",r)),s&&l.push(n("WhatsApp","Job alerts on WhatsApp. Tap the link or scan to join.","chat","text-emerald-500",s)),!l.length)return"";const p=o&&i?'<button type="button" class="mt-3 text-xs font-bold text-primary hover:underline" data-tg-link>Get your personal Telegram link</button>':"";return`
      <section class="mb-6" aria-label="Join our channels">
        <div class="flex items-center gap-2 mb-3">
          <span class="material-symbols-outlined text-primary text-[18px]">notifications_active</span>
          <h2 class="text-sm font-bold text-slate-800">Get new jobs the moment they go live</h2>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${l.join("")}</div>
        ${p}
      </section>`}async _openTelegramDeepLink(e){if(e.dataset.busy==="1")return;e.dataset.busy="1";const t=e.textContent;e.textContent="Creating your link\u2026",e.disabled=!0;try{const{deepLink:s,token:i}=await swapikiStore.getTelegramLink();if(s){window.open(s,"_blank","noopener"),i&&this._showTelegramCode(e,i);return}window.open(String((window.SWAPIKI_CONFIG||{}).TELEGRAM_CHANNEL_URL||"https://t.me/"),"_blank","noopener")}catch(s){typeof console!="undefined"&&console.warn("telegram link failed:",s&&s.message),window.open(String((window.SWAPIKI_CONFIG||{}).TELEGRAM_CHANNEL_URL||"https://t.me/"),"_blank","noopener")}finally{e.textContent=t,e.disabled=!1,delete e.dataset.busy}}_showTelegramCode(e,t){const s=e&&e.closest?e.closest("section"):null;if(!s)return;let i=s.querySelector("[data-tg-code]");i||(i=document.createElement("div"),i.setAttribute("data-tg-code",""),i.className="mt-2 text-xs text-slate-500",s.appendChild(i)),i.innerHTML=`On the phone? Send this code to the bot chat instead: <button type="button" class="font-mono font-bold text-primary underline-offset-2 hover:underline" data-tg-copy>${this.escapeHtml(String(t))}</button>`;const o=i.querySelector("[data-tg-copy]");o&&navigator&&navigator.clipboard&&o.addEventListener("click",()=>{navigator.clipboard.writeText(String(t)).catch(()=>{}),o.textContent="Copied!"})}async submitJobForm(e){e.preventDefault();const t=l=>document.getElementById(l),s=l=>((t(l)||{}).value||"").trim(),i=t("job-form-result"),o=t("job-form-submit"),a=(l,p)=>{i&&(i.innerHTML=`<div class="text-xs rounded-lg px-3 py-2 border ${p}">${l}</div>`)},n={title:s("job-form-title"),company:s("job-form-company"),location:s("job-form-location"),salary:s("job-form-salary"),category:s("job-form-category")||"any",contact:s("job-form-contact"),description:s("job-form-description"),rawText:s("job-form-raw"),skills:s("job-form-skills").split(",").map(l=>l.trim()).filter(Boolean),honeypot:s("job-form-hp")},r=[];if(n.title||r.push("a job title"),n.company||r.push("the company name"),n.contact||r.push("an apply link, email or phone number"),r.length){a(`Add ${r.join(", ")}.`,"bg-amber-50 border-amber-200 text-amber-700");return}o&&(o.disabled=!0,o.textContent="Submitting\u2026");try{await swapikiStore.submitJob(n),a("\u2705 Received. An admin reviews every submission before it appears on the board.","bg-emerald-50 border-emerald-200 text-emerald-700");const l=document.querySelector("#post-a-job form");l&&typeof l.reset=="function"&&l.reset()}catch(l){const p=l&&l.message||"Could not submit that job. Please try again.";a(`\u274C ${this.escapeHtml(p)}`,"bg-rose-50 border-rose-200 text-rose-700")}finally{o&&(o.disabled=!1,o.textContent="Submit for review")}}adminSelectedJobIds(e){return Array.from(document.querySelectorAll(`.admin-job-check[data-group="${e}"]:checked`)).map(t=>t.value)}adminSyncBulkBar(e){const t=document.querySelectorAll(`.admin-job-check[data-group="${e}"]`).length,s=this.adminSelectedJobIds(e).length,i=document.querySelector(`[data-selected-count="${e}"]`);i&&(i.textContent=`${s} of ${t} selected`),document.querySelectorAll(`.admin-bulk-btn[data-group="${e}"]`).forEach(a=>{a.disabled=s===0});const o=document.querySelector(`.admin-job-check-all[data-group="${e}"]`);o&&(o.checked=t>0&&s===t,o.indeterminate=s>0&&s<t)}bindAdminSelection(e){!e||e._adminSelectionBound||typeof e.addEventListener=="function"&&(e._adminSelectionBound=!0,e.addEventListener("change",t=>{const s=t.target;!s||typeof s.matches!="function"||(s.matches(".admin-job-check[data-group]")?this.adminSyncBulkBar(s.dataset.group):s.matches(".admin-job-check-all[data-group]")&&this.adminToggleAllJobs(s.dataset.group,s.checked))}))}adminToggleAllJobs(e,t){document.querySelectorAll(`.admin-job-check[data-group="${e}"]`).forEach(s=>{s.checked=!!t}),this.adminSyncBulkBar(e)}async adminBulkSetStatus(e,t){const s=this.adminSelectedJobIds(e);if(!s.length)return;const i={published:{verb:"published",detail:"published to the board"},rejected:{verb:"rejected",detail:"rejected (kept, not deleted, and reversible)"},draft:{verb:"moved back to draft",detail:"moved back to draft and taken off the board"}}[t]||{verb:t,detail:`set to ${t}`},o=`${s.length} ${s.length===1?"job":"jobs"}`;if(!confirm(`${o} will be ${i.detail}. Continue?`))return;document.querySelectorAll(`.admin-bulk-btn[data-group="${e}"]`).forEach(r=>{r.disabled=!0});const n=new Map;(this._adminJobs||[]).forEach(r=>{r&&s.indexOf(r.id)!==-1&&n.set(r.id,r.status)}),this.applyAdminJobStatuses(Array.from(s),t);try{const r=await swapikiStore.adminSetJobStatusBulk(s,t);this.showToast(`\u2705 ${r} ${r===1?"job":"jobs"} ${i.verb}.`)}catch(r){this.applyAdminJobStatuses(Array.from(n.keys()),null,n),this.showToast(`\u274C ${r&&r.message||"Could not update the selected jobs."}`),this.adminSyncBulkBar(e)}}applyAdminJobStatuses(e,t,s){const i=new Set(e||[]);let o=!1;return(this._adminJobs||[]).forEach(a=>{!a||!i.has(a.id)||(a.status=t===null?s?s.get(a.id):a.status:t,o=!0)}),o&&!this.repaintAdminJobs()&&this.renderAdminDashboard(),o}async adminDecideJob(e,t,s){if(!e||this._adminJobBusy[e])return;this._adminJobBusy[e]=!0;const i=(this._adminJobs||[]).find(n=>n&&n.id===e),o=i?i.status:null,a=s||{published:"Job published to the board.",draft:"Job moved back to draft.",rejected:"Job rejected. The row is kept \u2014 reopen it from the Rejected list below."}[t]||`Job set to ${t}.`;this.applyAdminJobStatuses([e],t);try{await swapikiStore.adminSetJobStatus(e,t),this.showToast(a)}catch(n){this.applyAdminJobStatuses([e],null,new Map([[e,o]])),this.showToast(`\u274C ${n&&n.message||"Could not update the job."}`)}finally{delete this._adminJobBusy[e]}}adminApproveJob(e){return this.adminDecideJob(e,"published")}adminUnpublishJob(e){return this.adminDecideJob(e,"draft")}async adminRejectJob(e){if(!e||this._adminJobBusy[e])return;const t=this.adminJobTitle(e);if(confirm(`Reject "${t}"? The row is kept, not deleted, and can be reopened later.`))return this.adminDecideJob(e,"rejected")}adminReopenJob(e){return this.adminDecideJob(e,"draft","Reopened. The job is back in the review queue.")}async adminDeleteJob(e){const t=this.adminJobTitle(e);if(!confirm(`Delete "${t}" permanently?

This cannot be undone. If you only want it off the board, use Reject instead \u2014 that keeps the row.`)||this._adminJobBusy[e])return;this._adminJobBusy[e]=!0;const s=(this._adminJobs||[]).findIndex(i=>i&&i.id===e);try{await swapikiStore.adminDeleteJob(e),s!==-1&&this._adminJobs.splice(s,1),this.repaintAdminJobs()||this.renderAdminDashboard(),this.showToast("Job deleted.")}catch(i){this.showToast(`\u274C ${i&&i.message||"Could not delete the job."}`)}finally{delete this._adminJobBusy[e]}}adminJobTitle(e){const t=(this._adminJobs||[]).find(s=>s&&s.id===e);return t&&t.title||"this job"}async adminPromoteSubmit(e){e.preventDefault();const t=document.getElementById("admin-promote-email-input"),s=t?t.value.trim():"";if(!s)return;const i=e.target.querySelector('button[type="submit"]'),o=i?i.textContent:"";i&&(i.disabled=!0,i.textContent="Granting\u2026");try{const a=await swapikiStore.adminPromoteByEmail(s);this.showToast(`\u2705 ${a.email} is now an admin.`),t&&(t.value=""),this.renderAdminDashboard()}catch(a){this.showToast(`\u274C ${a&&a.message||"Could not grant admin access."}`)}finally{i&&(i.disabled=!1,i.textContent=o)}}async adminRemoveAdmin(e,t){const s=swapikiStore.currentUser;if(s&&e&&s.id===e){this.showToast("That is you. You cannot remove your own admin access \u2014 ask another admin to do it.");return}if(confirm(`Remove admin access for ${t||"this user"}?`))try{await swapikiStore.adminRemoveAdmin(e),this.showToast("Admin access removed."),this.renderAdminDashboard()}catch(i){this.showToast(`\u274C ${i&&i.message||"Could not remove admin access."}`)}}async renderAdminJobsView(){const e=document.getElementById("admin-jobs-container");if(!e)return;const t=document.getElementById("admin-jobs-refresh-btn");t&&(t.disabled=!0,t.innerHTML='<span class="material-symbols-outlined text-lg animate-spin">progress_activity</span> Refreshing\u2026'),e.innerHTML=`
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        ${Array.from({length:4}).map(()=>`
          <div class="border border-slate-200 rounded-xl p-4 bg-white animate-pulse">
            <div class="flex items-center justify-between mb-3">
              <div class="h-2.5 w-20 bg-slate-200 rounded"></div>
              <div class="w-8 h-8 rounded-lg bg-slate-100"></div>
            </div>
            <div class="h-6 w-12 bg-slate-200 rounded mb-2"></div>
            <div class="h-2.5 w-24 bg-slate-100 rounded"></div>
          </div>`).join("")}
      </div>
      ${Array.from({length:2}).map(()=>`
        <div class="border border-slate-200 rounded-xl overflow-hidden bg-white animate-pulse mb-6">
          <div class="bg-slate-50 h-9 border-b border-slate-100"></div>
          ${Array.from({length:4}).map(()=>'<div class="h-12 border-b border-slate-100 last:border-0"></div>').join("")}
        </div>`).join("")}`;const[s,i]=await Promise.all([swapikiStore.adminListJobs().catch(()=>[]),swapikiStore.adminGetJobsStats().catch(()=>({configured:!1}))]);try{this._adminJobs=s||[],this.watchAdminBreakpoint(),e.innerHTML=this.renderAdminJobsStats(i)+this.renderAdminJobsSection(s),["draft","published"].forEach(a=>this.adminSyncBulkBar(a)),this.bindAdminSelection(e),this.animateAdminStatCards();const o=document.getElementById("admin-jobs-last-refreshed");o&&(o.textContent=`Updated ${new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`)}catch(o){e.innerHTML=`<div class="border border-rose-200 bg-rose-50 rounded-xl p-6 flex items-start gap-3">
        <span class="material-symbols-outlined text-rose-500 text-2xl">error</span>
        <div>
          <p class="text-sm font-bold text-rose-700">Could not load the jobs admin</p>
          <p class="text-sm text-rose-600 mt-0.5">${this.escapeHtml(o&&o.message||"Please try refreshing.")}</p>
        </div>
      </div>`}finally{t&&(t.disabled=!1,t.innerHTML='<span class="material-symbols-outlined text-lg">refresh</span> Refresh')}}renderAdminJobsStats(e){if(!e||!e.configured)return`<div class="mb-6">
        ${this.adminSectionHeader("Usage","","insights")}
        <div class="border border-slate-200 rounded-xl bg-white p-6 text-center">
          <span class="material-symbols-outlined text-3xl text-slate-300 block mb-2">insights</span>
          <p class="text-sm text-slate-400">Usage statistics aren't set up on this deployment yet.</p>
        </div>
      </div>`;const t=e.window_days||30,s=e.tools||{},i=e.clicks||{},o=e.traffic||{},a=e.searches||{},n=(c,k,S)=>`${c} ${c===1?k:S}`,r=(c,k)=>`${n(c||0,"person","people")} \xB7 ${n(k||0,"job","jobs")}`,l=(c,k,S,C)=>{if(!s.available)return{label:c,value:"\u2014",sub:"Run tool_usage_migration.sql",icon:S,color:C};const I=k||{uses:0,users:0,jobs:0};return{label:c,value:String(I.uses||0),sub:r(I.users,I.jobs),icon:S,color:C}},p=[l("Resume Drafts",s.resume,"description","primary"),l("Interview Prep",s.interview,"record_voice_over","indigo"),i.available?{label:"Apply Clicks",value:String(i.total||0),sub:r(i.users,i.jobs),icon:"ads_click",color:"emerald"}:{label:"Apply Clicks",value:"\u2014",sub:"Run job_clicks migration",icon:"ads_click",color:"emerald"},o.available?{label:"Profile Opens",value:String(o.total||0),sub:o.profiles?`across ${n(o.profiles,"profile","profiles")}`:"opens recorded so far",icon:"visibility",color:"amber"}:{label:"Profile Opens",value:"\u2014",sub:"Tracking not set up",icon:"visibility",color:"amber"}],d={primary:{bg:"bg-primary-fixed",icon:"text-primary",bar:"bg-primary"},indigo:{bg:"bg-indigo-50",icon:"text-indigo-600",bar:"bg-indigo-500"},emerald:{bg:"bg-emerald-50",icon:"text-emerald-600",bar:"bg-emerald-500"},amber:{bg:"bg-amber-50",icon:"text-amber-600",bar:"bg-amber-400"}},h=p.map(c=>{const k=d[c.color]||d.primary,S=/^\d+$/.test(c.value);return`
        <div class="admin-stat-card group relative overflow-hidden border border-slate-200 rounded-xl p-4 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div class="absolute top-0 left-0 right-0 h-0.5 ${k.bar}"></div>
          <div class="flex items-center justify-between mb-3">
            <span class="text-[11px] font-bold uppercase tracking-wide text-slate-500">${c.label}</span>
            <span class="w-8 h-8 rounded-lg ${k.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200">
              <span class="material-symbols-outlined text-lg ${k.icon}">${c.icon}</span>
            </span>
          </div>
          <div class="admin-stat-value text-2xl font-bold text-slate-900 tracking-tight"${S?` data-target="${c.value}"`:""}>${S?"0":c.value}</div>
          <div class="text-xs text-slate-400 mt-0.5 truncate">${c.sub}</div>
        </div>`}).join(""),b=Array.isArray(i.top_jobs)?i.top_jobs:[],u=b.length?b.map((c,k)=>`
        <tr class="border-b border-slate-100 last:border-0">
          <td class="py-2.5 px-3 text-xs font-bold text-slate-400 w-8">${k+1}</td>
          <td class="py-2.5 px-3">
            <div class="text-sm font-bold text-slate-800">${this.escapeHtml(c.title||"(untitled)")}</div>
            <div class="text-xs text-slate-400">${this.escapeHtml(c.company||"-")}</div>
          </td>
          <td class="py-2.5 px-3 text-right text-sm font-bold text-slate-700 whitespace-nowrap">${c.clicks||0}</td>
        </tr>`).join(""):'<tr><td colspan="3" class="py-6 text-center text-sm text-slate-400">No outbound clicks recorded in this window yet.</td></tr>',m=Array.isArray(o.referrers)?o.referrers:[],v=m.reduce((c,k)=>Math.max(c,k.views||0),0),_=m.length?m.map(c=>`
        <div class="py-2.5 px-3 border-b border-slate-100 last:border-0">
          <div class="flex items-center justify-between gap-3 mb-1.5">
            <span class="text-sm font-bold text-slate-700 truncate">${this.escapeHtml(c.source||"-")}</span>
            <span class="text-xs font-bold text-slate-500 tabular-nums shrink-0">${c.views||0}</span>
          </div>
          <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div class="h-full rounded-full bg-amber-400" style="width:${v?Math.max(3,Math.round((c.views||0)/v*100)):0}%"></div>
          </div>
        </div>`).join(""):'<p class="py-6 text-center text-sm text-slate-400">No profile opens recorded in this window yet.</p>',x=Array.isArray(o.top_profiles)?o.top_profiles:[],$=x.length?x.map((c,k)=>{const S=c.username?swapikiStore.formatNickname(c.username):"",C=c.name||(S?`@${S}`:"(profile not found)"),I=S?`<a class="text-xs text-primary hover:underline" href="https://${S}.swapiki.com/" target="_blank" rel="noopener">${this.escapeHtml(S)}.swapiki.com</a>`:"";return`
          <tr class="border-b border-slate-100 last:border-0">
            <td class="py-2.5 px-3 text-xs font-bold text-slate-400 w-8">${k+1}</td>
            <td class="py-2.5 px-3">
              <div class="text-sm font-bold text-slate-800">${this.escapeHtml(C)}</div>
              <div class="text-xs text-slate-400">${I||this.escapeHtml(c.title||"")}</div>
            </td>
            <td class="py-2.5 px-3 text-right text-sm font-bold text-slate-700 whitespace-nowrap">${c.views||0}</td>
          </tr>`}).join(""):'<tr><td colspan="3" class="py-6 text-center text-sm text-slate-400">No profile opens recorded in this window yet.</td></tr>',E=Array.isArray(a.top)?a.top:[],g=E.length?E.map((c,k)=>`
        <tr class="border-b border-slate-100 last:border-0">
          <td class="py-2.5 px-3 text-xs font-bold text-slate-400 w-8">${k+1}</td>
          <td class="py-2.5 px-3">
            <div class="text-sm font-bold text-slate-800 truncate">${this.escapeHtml(c.query||"-")}</div>
            <div class="text-xs text-slate-400">${n(c.occurrences||0,"search","searches")} logged</div>
          </td>
          <td class="py-2.5 px-3 text-right text-sm font-bold text-slate-700 whitespace-nowrap">${c.days||0}${c.days===1?" day":" days"}</td>
        </tr>`).join(""):'<tr><td colspan="3" class="py-6 text-center text-sm text-slate-400">No searches recorded in this window yet.</td></tr>',y=o.available?`
      <div class="admin-fade-in mb-8">
        ${this.adminSectionHeader("Profile Traffic","","visibility")}
        <p class="text-xs text-slate-400 -mt-1 mb-3">Last ${t} days. Counts profile opens, not unique visitors.</p>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
            <div class="bg-slate-50 border-b border-slate-200 px-3 py-2.5">
              <p class="text-[11px] font-bold uppercase tracking-wide text-slate-500">Where they came from</p>
            </div>
            <div class="max-h-80 overflow-y-auto">${_}</div>
          </div>
          <div class="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
            <table class="w-full">
              <thead class="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th class="py-2.5 px-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">#</th>
                  <th class="py-2.5 px-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Most Viewed Profile</th>
                  <th class="py-2.5 px-3 text-right text-[11px] font-bold uppercase tracking-wide text-slate-500">Opens</th>
                </tr>
              </thead>
              <tbody>${$}</tbody>
            </table>
          </div>
        </div>
      </div>`:"",w=a.available?`
      <div class="admin-fade-in mb-8">
        ${this.adminSectionHeader("Top Searches","","search")}
        <p class="text-xs text-slate-400 -mt-1 mb-3">Last ${t} days. ${n(a.terms||0,"distinct term","distinct terms")}.</p>
        <div class="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
          <table class="w-full">
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr>
                <th class="py-2.5 px-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">#</th>
                <th class="py-2.5 px-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Searched For</th>
                <th class="py-2.5 px-3 text-right text-[11px] font-bold uppercase tracking-wide text-slate-500">Days</th>
              </tr>
            </thead>
            <tbody>${g}</tbody>
          </table>
        </div>
      </div>`:"",f=e.capped?`<p class="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
           These counts came from a capped scan and are a lower bound.
         </p>`:"";return`
      <div class="admin-fade-in mb-6">
        ${this.adminSectionHeader("Usage","","insights")}
        <p class="text-xs text-slate-400 -mt-1 mb-3">Last ${t} days.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">${h}</div>
        ${f}
      </div>
      ${y}
      ${w}
      <div class="admin-fade-in mb-8">
        ${this.adminSectionHeader("Most Clicked","","ads_click")}
        <p class="text-xs text-slate-400 -mt-1 mb-3">Outbound apply clicks per listing.</p>
        <div class="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
          <table class="w-full">
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr>
                <th class="py-2.5 px-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">#</th>
                <th class="py-2.5 px-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Listing</th>
                <th class="py-2.5 px-3 text-right text-[11px] font-bold uppercase tracking-wide text-slate-500">Clicks</th>
              </tr>
            </thead>
            <tbody>${u}</tbody>
          </table>
        </div>
      </div>`}isAuthenticated(){return!!(window.swapikiStore&&swapikiStore.currentUser)}refreshAuthUI(){const e=swapikiStore.currentUser;document.querySelectorAll(".auth-guest-only").forEach(t=>t.classList.toggle("hidden",!!e)),document.querySelectorAll(".auth-user-only").forEach(t=>t.classList.toggle("hidden",!e)),document.querySelectorAll(".admin-only").forEach(t=>t.classList.toggle("hidden",!(e&&swapikiStore.isAdminUser))),document.querySelectorAll(".nav-user-label").forEach(t=>{if(!e){t.textContent="";return}const s=e.user_metadata&&e.user_metadata.full_name;t.textContent=s?s.split(" ")[0]:(e.email||"").split("@")[0]}),this.maybeShowInviteBanner()}ensureGoogleScript(){if(document.querySelector("script[data-swapiki-gsi]"))return;const e=document.createElement("script");e.src="https://accounts.google.com/gsi/client",e.async=!0,e.defer=!0,e.setAttribute("data-swapiki-gsi","1"),document.head.appendChild(e)}initGoogleButtons(){window.googleAuth&&(window.googleAuth.initGoogleSignIn("google-signin-button-signup",e=>this.handleGoogleCredentialResponse(e)),window.googleAuth.initGoogleSignIn("google-signin-button-login",e=>this.handleGoogleCredentialResponse(e)))}openLoginModal(){const e=document.getElementById("modal-login");e&&e.classList.remove("hidden"),this.initGoogleButtons()}closeLoginModal(){const e=document.getElementById("modal-login");e&&e.classList.add("hidden")}switchToLogin(){this.closeSignupModal(),this.openLoginModal()}switchToSignup(){this.closeLoginModal(),this.openSignupModal()}async handleLogin(e){e.preventDefault();const t=document.getElementById("login-email-input"),s=document.getElementById("login-password-input"),i=t?t.value.trim():"",o=s?s.value:"";if(!i||!o){this.showToast("\u26A0\uFE0F Enter your email and password.");return}const a=e.target.querySelector('button[type="submit"]'),n=a?a.textContent:"";a&&(a.disabled=!0,a.textContent="Logging in\u2026");try{const{user:r}=await swapikiStore.signInWithPassword(i,o);await swapikiStore.loadProfileForUser(r),this.refreshAuthUI(),this._ghHydrateNotes().catch(()=>{}),this.closeLoginModal(),s&&(s.value=""),this.showToast(`Welcome back, ${swapikiStore.getProfile().name.split(" ")[0]||"there"}!`),router.navigate("dashboard"),this.maybeShowProfileReminder(),this.maybeStartGuidedTour()}catch(r){this.showToast(`\u274C ${r&&r.message||"Could not log in. Check your email and password."}`)}finally{a&&(a.disabled=!1,a.textContent=n)}}timeoutAfter(e,t){return new Promise((s,i)=>setTimeout(()=>i(new Error(t)),e))}showGoogleSignInProgress(){const e=`<div class="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-slate-400">
      <span class="material-symbols-outlined text-lg animate-spin">progress_activity</span> Signing in with Google\u2026
    </div>`;["google-signin-button-signup","google-signin-button-login"].forEach(t=>{const s=document.getElementById(t);s&&(s.innerHTML=e)})}async handleGoogleCredentialResponse(e){this.showGoogleSignInProgress();const t=(async()=>{if(!e||!e.credential)throw new Error("Google sign-in did not return a credential.");const{user:s}=await swapikiStore.signInWithGoogleIdToken(e.credential),i=window.googleAuth?window.googleAuth.parseGoogleJwtPayload(e.credential):null,o=swapikiStore.formatNickname(i&&i.name||(s.email||"").split("@")[0]);return await swapikiStore.loadProfileForUser(s,o),swapikiStore.data.username&&swapikiStore.registerNickname(swapikiStore.data.username,s.id),{user:s,payload:i}})();try{const{payload:s}=await Promise.race([t,this.timeoutAfter(2e4,"That's taking longer than it should \u2014 check your connection and try again.")]);t.catch(()=>{}),this.refreshAuthUI(),this.closeLoginModal(),this.closeSignupModal(),this.showToast(`Welcome, ${s&&s.name?s.name.split(" ")[0]:"there"}!`),router.navigate("dashboard"),this.maybeShowProfileReminder(),this.maybeStartGuidedTour()}catch(s){t.catch(()=>{}),this.showToast(`\u274C ${s&&s.message||"Google sign-in failed. Please try again."}`),this.initGoogleButtons()}}async logout(){await swapikiStore.signOut(),this.refreshAuthUI(),this.showToast("Logged out."),router.navigate("landing")}toggleMobileMenu(){const e=document.getElementById("mobile-nav-menu"),t=document.getElementById("mobile-menu-icon");e&&(e.classList.contains("hidden")?(e.classList.remove("hidden"),t&&(t.textContent="close"),document.addEventListener("click",this._closeMobileMenuOnClickOutside)):(e.classList.add("hidden"),t&&(t.textContent="menu"),document.removeEventListener("click",this._closeMobileMenuOnClickOutside)))}toggleAdminMenu(e){const t=document.getElementById("admin-menu");t&&(t.classList.toggle("hidden"),t.classList.contains("hidden")?document.removeEventListener("click",this._closeAdminMenuOnClickOutside):document.addEventListener("click",this._closeAdminMenuOnClickOutside),e&&e.stopPropagation&&e.stopPropagation())}closeMobileMenu(){const e=document.getElementById("mobile-nav-menu"),t=document.getElementById("mobile-menu-icon");e&&e.classList.add("hidden"),t&&(t.textContent="menu")}showToast(e){const t=document.getElementById("toast"),s=document.getElementById("toast-message");t&&(s?s.textContent=e:t.textContent=e,t.classList.remove("opacity-0","translate-y-4","pointer-events-none"),t.classList.add("opacity-100","translate-y-0"),setTimeout(()=>{t.classList.add("opacity-0","translate-y-4","pointer-events-none"),t.classList.remove("opacity-100","translate-y-0")},3e3))}showNotFoundToast(e){if(!e)return this.showToast("This profile could not be found.");this.showToast(`No Swapiki profile at "${e}" yet.`)}clearNotFoundPanel(){this._showCandidatePanel(null)}_showCandidatePanel(e){const t={loading:"candidate-loading",error:"candidate-load-error",notfound:"candidate-not-found"},s=Object.keys(t),i={};s.forEach(n=>{i[n]=document.getElementById(t[n])});const o=e?i[e]:null;s.forEach(n=>{i[n]&&(i[n]===o?i[n].classList.remove("hidden"):i[n].classList.add("hidden"))});const a=document.querySelector("#view-candidate > main");if(a){const n=r=>s.some(l=>i[l]===r);[...a.children].forEach(r=>{n(r)||(e?r.classList.add("hidden"):r.classList.remove("hidden"))})}}isCandidateHost(){const e=window.location&&window.location.hostname||"",t="swapiki.com";if(!e.endsWith("."+t))return!1;const s=e.slice(0,-(t.length+1));return!!s&&s!=="www"}_showCandidateLoadError(e){const t=String(e&&e.message||e||""),s=/timeout/i.test(t)?"This profile took too long to load.":"Something went wrong while loading this profile.";this._showCandidatePanel("error");const i=document.getElementById("candidate-load-error-handle");i&&(i.textContent=`${this.publicUsername||""}.swapiki.com`);const o=document.getElementById("candidate-load-error-reason");o&&(o.textContent=`${s} Check your connection and try again.`),this.setPageMeta("Could not load profile","This Swapiki profile could not be loaded right now. Please try again."),console.warn("Candidate profile failed to load:",t)}retryCandidateProfile(){return this.renderCandidateProfile()}_safeHttpUrl(e){const t=String(e==null?"":e).trim();return/^https?:\/\//i.test(t)?t:""}initBadgeTooltips(){this._badgeTipsBound||(this._badgeTipsBound=!0,document.addEventListener("click",e=>{const t=e.target&&e.target.closest?e.target.closest(".group[tabindex]"):null;if(t&&t.querySelector('[role="tooltip"]')){e.preventDefault(),this.toggleBadgeTooltip(t);return}this.closeBadgeTooltips()}),document.addEventListener("keydown",e=>{if(e.key!=="Enter"&&e.key!==" ")return;const t=document.activeElement,s=t&&t.closest?t.closest(".group[tabindex]"):null;s&&s.querySelector('[role="tooltip"]')&&(e.preventDefault(),this.toggleBadgeTooltip(s))}))}toggleBadgeTooltip(e){const t=e.querySelector('[role="tooltip"]');if(!t)return;const s=e.getAttribute("data-tip-open")==="1";this.closeBadgeTooltips(),s||(t.style.visibility="visible",t.style.opacity="1",e.setAttribute("data-tip-open","1"))}closeBadgeTooltips(){document.querySelectorAll('[data-tip-open="1"]').forEach(e=>{const t=e.querySelector('[role="tooltip"]');t&&(t.style.visibility="",t.style.opacity=""),e.removeAttribute("data-tip-open"),document.activeElement===e&&e.blur()})}setPageMeta(e,t,s={}){const i=e||"Swapiki | 2 Minutes to a Confident Interview Decision";if(document.title=i,t){const o=(a,n,r)=>{let l=document.head.querySelector(`meta[${a}="${n}"]`);l||(l=document.createElement("meta"),l.setAttribute(a,n),document.head.appendChild(l)),l.setAttribute("content",r)};o("name","description",t),o("property","og:description",t),o("property","og:title",i),s.url&&o("property","og:url",s.url)}}getShareUrl(){if(this.publicUsername)return{username:this.publicUsername,shareUrl:`https://${this.publicUsername}.swapiki.com`};const e=swapikiStore.getProfile(),t=e.username||e.id||"ananya-sharma";return{username:t,shareUrl:`https://${t}.swapiki.com`}}copyShareLink(){const{username:e,shareUrl:t}=this.getShareUrl(),s=`Profile URL copied: ${e}.swapiki.com`;if(navigator.clipboard)navigator.clipboard.writeText(t).then(()=>{swapikiStore.recordShareEvent("copied"),this.showToast(s)}).catch(()=>{swapikiStore.recordShareEvent("share_attempted"),this.showToast(s)});else{const i=document.createElement("textarea");i.value=t,i.style.position="fixed",i.style.opacity="0",document.body.appendChild(i),i.select();try{document.execCommand("copy")}catch(o){}document.body.removeChild(i),this.showToast(s)}this.closeShareModal()}openShareModal(){const{shareUrl:e}=this.getShareUrl(),t=document.getElementById("share-modal-url");t&&(t.textContent=e);const s=document.getElementById("share-card-preview");s&&(s.innerHTML=this.buildShareCardHtml());const i=document.getElementById("modal-share-profile");i&&i.classList.remove("hidden")}closeShareModal(){const e=document.getElementById("modal-share-profile");e&&e.classList.add("hidden")}shareSubject(){return this.publicUsername?null:swapikiStore.getProfile()}buildShareCardHtml(){const e=this.shareSubject(),{shareUrl:t}=this.getShareUrl(),s=e&&e.name||this.publicUsername||"My Swapiki profile",i=e&&e.title||"Developer & problem-solver",o=!!(e&&e.voiceVerified),a=s.split(/\s+/).filter(Boolean).slice(0,2).map(n=>n[0]).join("").toUpperCase()||"?";return`
      <div class="border border-slate-200 rounded-2xl bg-gradient-to-br from-slate-50 to-white p-4 text-center shadow-sm">
        <span class="w-12 h-12 rounded-full ${o?"bg-emerald-100 text-emerald-700":"bg-primary-fixed text-primary"} flex items-center justify-center text-base font-bold mx-auto mb-2">${this.escapeHtml(a)}</span>
        <div class="text-sm font-bold text-slate-900 line-clamp-1">${this.escapeHtml(s)}</div>
        <div class="text-xs text-slate-500 mb-2">${this.escapeHtml(i)}</div>
        ${o?'<span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700"><span class="material-symbols-outlined text-[12px]">verified</span> Live recording confirmed</span>':'<span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-50 text-amber-700"><span class="material-symbols-outlined text-[12px]">record_voice_over</span> Record a pitch to get a live-recording badge</span>'}
        <div class="text-[11px] text-slate-400 mt-3">Listen to my 2-minute project walkthrough</div>
        <div class="text-[11px] font-mono text-primary break-all">${this.escapeHtml(t)}</div>
      </div>
    `}buildShareText(){const e=this.shareSubject(),{shareUrl:t}=this.getShareUrl();return`Hi,

Here's my proof-of-work profile on Swapiki \u2014 it has my project evidence and a 2-minute voice walkthrough.

${e&&e.voiceVerified?"The recording was captured live in one session, reading a random code that could not have been pre-recorded.":"Recording a live walkthrough so I can add a live-recording badge."}
${t}

Thanks!`}shareViaWhatsApp(){const e=this.shareSubject(),{shareUrl:t}=this.getShareUrl(),i=`Check out my Swapiki profile \u2014 projects with a 2-minute voice walkthrough. ${e&&e.voiceVerified?"The recording was made live in one session, reading a random code that could not have been pre-recorded.":"Recording a live walkthrough so I can add a live-recording badge."} ${t}`;window.open(`https://wa.me/?text=${encodeURIComponent(i)}`,"_blank","noopener"),swapikiStore.recordShareEvent("whatsapp"),this.closeShareModal()}shareViaEmail(){const{shareUrl:e}=this.getShareUrl(),t="My Swapiki proof-of-work profile",s=this.buildShareText();window.location.href=`mailto:?subject=${encodeURIComponent(t)}&body=${encodeURIComponent(s)}`,swapikiStore.recordShareEvent("email"),this.closeShareModal()}_shareJobSubject(){return Array.isArray(this._jobsCache)?this._jobsCache.find(e=>e.id===this._shareJobId):null}jobShareUrl(e){return`https://swapiki.com/jobs/${encodeURIComponent(e.id)}`}jobShareText(e){const t=e.title||"Job opening",s=e.company?` at ${e.company}`:"",i=e.location?` \xB7 ${e.location}`:"";return`${t}${s}${i} \u2014 on Swapiki Jobs`}buildJobShareCardHtml(e){const t=this._jobType(e),s=this._jobMode(e),i=`<span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${t==="internship"?"bg-rose-50 text-rose-600 border border-rose-200":"bg-emerald-50 text-emerald-700 border border-emerald-200"}">${t==="internship"?"Internship":"Job"}</span>`,o=`<span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${s==="remote"?"bg-sky-50 text-sky-700 border border-sky-200":s==="hybrid"?"bg-violet-50 text-violet-700 border border-violet-200":"bg-slate-100 text-slate-600 border border-slate-200"}">${s==="remote"?"Remote / WFH":s==="hybrid"?"Hybrid":"Onsite"}</span>`;return`
      <div class="border border-slate-200 rounded-2xl bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
        <p class="text-[10px] font-bold uppercase tracking-wider text-primary">Swapiki Jobs</p>
        <div class="text-sm font-bold text-slate-900 mt-1">${this.escapeHtml(e.title||"")}</div>
        <p class="text-xs text-slate-500 mt-0.5">${this.escapeHtml(e.company||"")}${e.location?" \xB7 "+this.escapeHtml(e.location):""}</p>
        <div class="flex flex-wrap gap-1.5 mt-2">${i}${o}</div>
      </div>`}openJobShareModal(e){const t=Array.isArray(this._jobsCache)?this._jobsCache.find(a=>a.id===e):null;if(!t)return;if(window.posthog&&typeof window.posthog.capture=="function")try{window.posthog.capture("job_share_open",{job_id:e,title:t.title||"",company:t.company||""})}catch(a){}this._shareJobId=e;const s=document.getElementById("share-job-url");s&&(s.textContent=this.jobShareUrl(t));const i=document.getElementById("share-job-preview");i&&(i.innerHTML=this.buildJobShareCardHtml(t));const o=document.getElementById("modal-share-job");o&&o.classList.remove("hidden")}closeJobShareModal(){const e=document.getElementById("modal-share-job");e&&e.classList.add("hidden")}shareJobVia(e){const t=this._shareJobSubject();if(!t)return;const s=encodeURIComponent(this.jobShareUrl(t)),i=encodeURIComponent(this.jobShareText(t)),a={x:`https://twitter.com/intent/tweet?text=${i}&url=${s}`,linkedin:`https://www.linkedin.com/sharing/share-offsite/?url=${s}`,whatsapp:`https://wa.me/?text=${i}%20${s}`,email:`mailto:?subject=${i}&body=${s}`}[e];if(a){if(window.posthog&&typeof window.posthog.capture=="function")try{window.posthog.capture("job_share",{channel:e,job_id:t.id,title:t.title||"",company:t.company||""})}catch(n){}e==="email"?window.location.href=a:window.open(a,"_blank","noopener"),this.closeJobShareModal()}}copyJobLink(){const e=this._shareJobSubject();if(e){if(window.posthog&&typeof window.posthog.capture=="function")try{window.posthog.capture("job_share",{channel:"copy",job_id:e.id,title:e.title||"",company:e.company||""})}catch(t){}try{Promise.resolve(this._copyToClipboard(this.jobShareUrl(e))).catch(()=>{})}catch(t){}this.showToast("Job link copied."),this.closeJobShareModal()}}_copyToClipboard(e){if(navigator.clipboard)return navigator.clipboard.writeText(e);const t=document.createElement("textarea");t.value=e,t.style.position="fixed",t.style.opacity="0",document.body.appendChild(t),t.select();try{document.execCommand("copy")}catch(s){}return document.body.removeChild(t),Promise.resolve()}toggleHeroAudio(){const e=document.getElementById("hero-play-icon"),t=document.querySelector(".audio-wave-anim");if(this.heroPlaying=!this.heroPlaying,e&&(e.textContent=this.heroPlaying?"pause":"play_arrow"),t&&(this.heroPlaying?t.classList.add("audio-playing"):t.classList.remove("audio-playing")),this.heroPlaying){if(this.showToast("Playing demo voice preview. This is not a real candidate recording."),"speechSynthesis"in window){window.speechSynthesis.cancel();const s="Hi there! I'm Ananya Sharma. At Razorpay, I architected the Vernacular UPI payment flow across six Indian languages. Our goal was simple \u2014 make digital payments effortless for Bharat users. We reduced checkout drop-offs by 34% across 12 million monthly transactions. I designed the one-tap intent interaction model that cut payment failures dramatically.",i=new SpeechSynthesisUtterance(s);i.rate=.93,i.pitch=1.05;const a=window.speechSynthesis.getVoices().find(n=>n.lang.includes("en-IN")||n.name.includes("India")||n.name.includes("Google UK English Female")||n.name.includes("Natural")||n.name.includes("Samantha")||n.name.includes("Zira"));a&&(i.voice=a),i.onend=()=>{this.heroPlaying=!1,e&&(e.textContent="play_arrow"),t&&t.classList.remove("audio-playing")},window.speechSynthesis.speak(i)}}else"speechSynthesis"in window&&window.speechSynthesis.cancel()}renderLandingView(){const e=swapikiStore.getProfile();this.setPageMeta("Swapiki | 2 Minutes to a Confident Interview Decision","Swapiki turns resumes into 2-minute voice walkthroughs hiring managers actually watch. Skip r\xE9sum\xE9 rejections \u2014 hire for evidence, not formatting."),this._loadLandingStats()}_loadLandingStats(){const e=document.getElementById("lp-live-stats");e&&fetch("/api/site-stats").then(t=>t&&t.ok?t.json():null).then(t=>{const s=t&&t.stats;if(!s)return;const i=(a,n)=>{const r=document.getElementById(a);return!r||typeof n!="number"?!1:(r.textContent=n.toLocaleString("en-IN"),!0)};i("lp-live-profiles",s.published)|i("lp-live-week",s.publishedThisWeek)|i("lp-live-jobs",s.jobs)&&(e.hidden=!1)}).catch(()=>{})}setJobsFilter(e){this.jobsFilter=e,this.jobsPersonalized=e==="personalized",this.jobsShown=JOBS_PAGE_SIZE;const t=document.getElementById("jobs-controls");t?(t.innerHTML=this._jobsBoardControls(),this._renderJobsResults()):this.renderJobsView()}togglePersonalizedJobs(){this.jobsFilter==="personalized"?(this.jobsFilter="all",this.jobsPersonalized=!1):(this.jobsFilter="personalized",this.jobsPersonalized=!0),this.jobsShown=JOBS_PAGE_SIZE;const e=document.getElementById("jobs-controls");e?(e.innerHTML=this._jobsBoardControls(),this._renderJobsResults()):this.renderJobsView()}previewDemoPersonalization(){this.jobsFilter="personalized",this.jobsPersonalized=!0,this.jobsShown=JOBS_PAGE_SIZE;const e=document.getElementById("jobs-controls");e&&(e.innerHTML=this._jobsBoardControls()),this._renderJobsResults()}toggleJobsMinFit(e=75){this.jobsMinFit=this.jobsMinFit===e?0:e,this.jobsShown=JOBS_PAGE_SIZE;const t=document.getElementById("jobs-controls");t&&(t.innerHTML=this._jobsBoardControls()),this._renderJobsResults()}setJobsType(e){this.jobsType=e,this.renderJobsView()}setJobsMode(e){this.jobsMode=e,this.renderJobsView()}setJobsQuery(e){this.jobsQuery=(e||"").toLowerCase().trim(),this.jobsShown=JOBS_PAGE_SIZE,this._syncJobsQueryToUrl(),this._scheduleSearchLog(),this._renderJobsResults()}_jobsQueryFromUrl(){try{if(typeof window=="undefined"||!window.location)return"";const e=typeof window.location.search=="string"?window.location.search:"";return e?(new URLSearchParams(e).get("q")||"").toLowerCase().trim():""}catch(e){return""}}_syncJobsQueryToUrl(){try{if(typeof window=="undefined"||!window.location||!window.history||typeof window.history.replaceState!="function")return;const e=window.location.href;if(typeof e!="string"||!e)return;const t=new URL(e),s=(this.jobsQuery||"").trim();s?t.searchParams.set("q",s):t.searchParams.delete("q");const i=o=>o.pathname+(o.search||"")+(o.hash||"");window.history.replaceState(null,"",i(t))}catch(e){}}_scheduleSearchLog(){this._searchLogTimer&&clearTimeout(this._searchLogTimer),this._searchLogTimer=setTimeout(()=>this._logJobsQuery(),1200)}commitJobsQueryNow(){this._searchLogTimer&&clearTimeout(this._searchLogTimer),this._logJobsQuery()}_logJobsQuery(){this._searchLogTimer=null;const e=(this.jobsQuery||"").trim();e.length<2||(this._loggedSearches=this._loggedSearches||new Set,!this._loggedSearches.has(e)&&(this._loggedSearches.add(e),swapikiStore.recordSearchEvent(e)))}_jobType(e){const t=[e.salary,e.title,e.description||""].join(" ");return/\(internship\)|\bInternship\b|\bIntern\b/i.test(t)?"internship":"job"}_jobMode(e){const t=[e.location||"",e.description||""].join(" ");return/hybrid/i.test(t)?"hybrid":/remote|work from home|\bwfh\b/i.test(t)?"remote":"onsite"}_jobSearchTokens(e){const t=new Set(["job","jobs","opening","openings","vacancy","vacancies","position","positions","role","roles","hiring","hire","work","in","at","for","the","a","an","and","or","of","to","with","on","near","from","as","is","are","want","wanted","looking"]);return(String(e||"").toLowerCase().match(/[a-z0-9+#]+/g)||[]).filter(i=>i.length>=2&&!t.has(i))}_jobSearchHaystack(e){return e.__searchHay||(e.__searchHay=[e.title,e.company,Array.isArray(e.skills)?e.skills.join(" "):"",e.location,e.category,e.description].filter(Boolean).join(" ").toLowerCase()),e.__searchHay}_jobMatchesTokens(e,t){if(!t.length)return!0;const s=this._jobSearchHaystack(e);return t.every(i=>s.includes(i))}_filterChip(e,t,s,i){return`<button onclick="${i}" class="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${s===t?"bg-slate-900 text-white":"bg-slate-100 text-slate-600 hover:bg-slate-200"}">${e}</button>`}async renderJobsView(){this.setPageMeta("Swapiki Jobs \u2014 IT, BFSI & Internships in India","Hand-sourced IT, BFSI and other openings across India on Swapiki Jobs. Apply with a proof-backed profile \u2014 real projects and a 2-minute voice walkthrough, no AI screening.",{url:"https://swapiki.com/jobs"});const e=document.getElementById("jobs-container");if(!e)return;const t=this.renderJobSubmitForm(),s=this.renderChannelJoinCard(),i=swapikiStore.currentUser?swapikiStore.getProfile():null,o=i&&typeof i.completionScore=="number"?i.completionScore:0,a=!!swapikiStore.currentUser&&o>=80,n=a?"":`
      <div class="bg-white border border-slate-200 rounded-2xl p-5 mb-4 flex items-start gap-3">
        <span class="material-symbols-outlined text-amber-500">lock</span>
        <div>
          <p class="text-sm font-semibold text-slate-800">Search, filters and match are for proof-backed profiles</p>
          <p class="text-xs text-slate-500 mt-1 leading-relaxed">${swapikiStore.currentUser?`You're at ${o}% \u2014 reach 80% to search, filter and match these openings. Every listing is shown below.`:"Sign in and complete your profile to 80% to search, filter and match these openings. Every listing is shown below."}</p>
          <button onclick="${swapikiStore.currentUser?"router.navigate('dashboard')":"app.openLoginModal()"}" class="mt-3 px-4 py-2 bg-primary text-white font-bold text-xs rounded-lg hover:bg-primary/90 transition-all">${swapikiStore.currentUser?"Finish my profile":"Sign in"}</button>
        </div>
      </div>`;e.innerHTML=`
      <div class="max-w-4xl mx-auto">
        <div class="mb-6">
          <h1 class="text-2xl font-bold text-primary tracking-tight">Jobs for proof-backed profiles</h1>
          <p class="text-sm text-slate-500 mt-1">${a?"Hand-sourced openings, vetted and posted by Swapiki. Apply with your proof profile.":"Hand-sourced openings, vetted and posted by Swapiki."}</p>
        </div>
        <div id="jobs-pool-strip" class="mb-4"></div>
        ${s}
        ${t}
        ${n}
        <div id="jobs-controls">${a?this._jobsBoardControls():""}</div>
        <div id="jobs-results"></div>
      </div>`;const r=a?await swapikiStore.getPublishedJobs():await swapikiStore.getPublicJobs();if(this._jobsCache=r,this.jobsShown=JOBS_PAGE_SIZE,a&&this._injectJobsJsonLd(r),a&&!this.jobsQuery){const l=this._jobsQueryFromUrl();l&&(this.jobsQuery=l)}this._renderJobsResults(),this._loadJobsPoolStrip()}_jobsBoardControls(){const e=this.jobsFilter||"all",t=this.jobsType||"all",s=this.jobsMode||"all",i=this.jobsQuery||"",o=e==="personalized"||!!this.jobsPersonalized;return`
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <button onclick="app.setJobsFilter('all')" class="px-4 py-2 rounded-lg text-xs font-bold transition-colors ${e==="all"?"bg-primary text-white shadow-xs":"bg-slate-100 text-slate-700 hover:bg-slate-200"}">All</button>
        <button onclick="app.setJobsFilter('personalized')" id="btn-tab-personalized" class="px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${e==="personalized"?"bg-gradient-to-r from-indigo-700 via-indigo-600 to-blue-600 text-white shadow-sm ring-2 ring-indigo-300":"bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200"}">
          <span class="material-symbols-outlined text-[15px]">auto_awesome</span>
          <span>Matched for You</span>
          <span class="text-[9px] uppercase px-1.5 py-0.5 rounded-full ${e==="personalized"?"bg-white/20 text-white":"bg-indigo-200/80 text-indigo-900"} font-black">Personalized</span>
        </button>
        <button onclick="app.setJobsFilter('it')" class="px-4 py-2 rounded-lg text-xs font-bold transition-colors ${e==="it"?"bg-primary text-white shadow-xs":"bg-slate-100 text-slate-700 hover:bg-slate-200"}">IT</button>
        <button onclick="app.setJobsFilter('bfsi')" class="px-4 py-2 rounded-lg text-xs font-bold transition-colors ${e==="bfsi"?"bg-primary text-white shadow-xs":"bg-slate-100 text-slate-700 hover:bg-slate-200"}">BFSI</button>
        <button onclick="app.setJobsFilter('any')" class="px-4 py-2 rounded-lg text-xs font-bold transition-colors ${e==="any"?"bg-primary text-white shadow-xs":"bg-slate-100 text-slate-700 hover:bg-slate-200"}">Other Roles</button>
        <span class="ml-auto text-xs text-slate-400" id="job-count"></span>
      </div>
      <div class="relative mb-3">
        <span class="material-symbols-outlined text-slate-400 text-lg absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">search</span>
        <input type="search" id="job-search" value="${this.escapeHtml(i)}" oninput="app.setJobsQuery(this.value)" onkeydown="if(event.key==='Enter')app.commitJobsQueryNow()" placeholder="Search a role, skill, company or city \u2014 e.g. 'sales in Pune'" class="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all" />
      </div>
      <div class="flex flex-wrap items-center gap-1.5 mb-3 text-[11px]">
        <span class="font-semibold text-slate-400">Try:</span>
        ${["Sales","Pune","Bengaluru","Remote","Internship","Fresher","Data"].map(a=>`<button onclick="app.setJobsQuery('${a}')" class="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors">${a}</button>`).join("")}
      </div>
      <div class="flex flex-wrap items-center gap-2 mb-6">
        ${this._filterChip("Jobs","job",t,"app.setJobsType('job')")}
        ${this._filterChip("Internships","internship",t,"app.setJobsType('internship')")}
        ${t!=="all"?`<button onclick="app.setJobsType('all')" class="px-2 text-[11px] font-bold text-primary">Reset</button>`:""}
        <span class="mx-2 w-px h-4 bg-slate-200"></span>
        ${this._filterChip("Remote / WFH","remote",s,"app.setJobsMode('remote')")}
        ${this._filterChip("Hybrid","hybrid",s,"app.setJobsMode('hybrid')")}
        ${this._filterChip("Onsite","onsite",s,"app.setJobsMode('onsite')")}
        ${s!=="all"?`<button onclick="app.setJobsMode('all')" class="px-2 text-[11px] font-bold text-primary">Reset</button>`:""}
        <span class="mx-2 w-px h-4 bg-slate-200"></span>
        <button onclick="app.togglePersonalizedJobs()" id="btn-chip-personalized" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${o?"bg-indigo-700 text-white shadow-xs":"bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"}">
          <span class="material-symbols-outlined text-[14px]">auto_awesome</span>
          <span>${o?"Profile Fit Active":"Filter by My Profile"}</span>
        </button>
        ${o?`
        <button onclick="app.toggleJobsMinFit(75)" id="btn-chip-strong-fit" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${this.jobsMinFit===75?"bg-emerald-700 text-white shadow-xs":"bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"}">
          <span class="material-symbols-outlined text-[14px]">verified</span>
          <span>${this.jobsMinFit===75?"Strong Fits Only (75%+)":"75%+ Strong Fits"}</span>
        </button>`:""}
      </div>`}_loadJobsPoolStrip(){document.getElementById("jobs-pool-strip")&&fetch("/api/site-stats").then(t=>t&&t.ok?t.json():null).then(t=>{const s=t&&t.stats,i=s&&s.publishedThisWeek;if(typeof i!="number"||i<=0)return;const o=document.getElementById("jobs-pool-strip");o&&(o.innerHTML=`<div class="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 text-xs text-emerald-800">
          <span class="material-symbols-outlined text-[16px]">verified_user</span>
          <span><strong>${i}</strong> proof-backed candidate${i===1?"":"s"} published in the last 7 days.</span>
        </div>`)}).catch(()=>{})}_renderJobsResults(){const e=document.getElementById("jobs-results");if(!e)return;const t=this._jobsCache||[],s=this.jobsFilter||"all",i=this.jobsType||"all",o=this.jobsMode||"all",a=this.jobsQuery||"",n=s==="personalized"||!!this.jobsPersonalized,r=typeof swapikiStore!="undefined"&&swapikiStore&&typeof swapikiStore.getProfile=="function"?swapikiStore.getProfile():null,l=r&&(r.location&&String(r.location).trim().length>0||Array.isArray(r.expertise)&&r.expertise.length>0||Array.isArray(r.projects)&&r.projects.length>0);if(s==="personalized"&&!l){const g=typeof swapikiStore!="undefined"&&swapikiStore&&!!swapikiStore.currentUser;e.innerHTML=`
        <div class="text-center py-12 px-6 bg-white border border-indigo-200 rounded-3xl max-w-xl mx-auto shadow-sm">
          <div class="w-14 h-14 mx-auto mb-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
            <span class="material-symbols-outlined text-3xl">auto_awesome</span>
          </div>
          <h2 class="text-lg font-bold text-slate-800 mb-2">Personalize Jobs with Your Profile</h2>
          <p class="text-xs text-slate-500 max-w-md mx-auto leading-relaxed mb-6">
            Add your <strong>skills</strong>, <strong>proof projects</strong>, and <strong>city</strong> to unlock job recommendations tailored specifically to you.
          </p>
          <div class="flex flex-wrap items-center justify-center gap-3">
            ${g?`<button onclick="router.navigate('dashboard')" class="px-5 py-2.5 bg-primary text-white font-bold text-xs rounded-xl hover:bg-primary/90 transition-all shadow-sm">Complete Profile Details</button>`:'<button onclick="app.openLoginModal()" class="px-5 py-2.5 bg-primary text-white font-bold text-xs rounded-xl hover:bg-primary/90 transition-all shadow-sm">Sign In to Personalize</button>'}
            <button onclick="app.previewDemoPersonalization()" class="px-4 py-2.5 bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-100 transition-all">Preview with Demo Profile</button>
          </div>
        </div>`;const y=document.getElementById("job-count");y&&(y.textContent="0 jobs");return}if(r&&l&&typeof window!="undefined"&&window.profileMatch&&typeof window.profileMatch.computePersonalizedMatch=="function"){const g=r.id||r.username||"active_user";t.forEach(y=>{if(!y._pm||y._pmProfileId!==g)try{y._pm=window.profileMatch.computePersonalizedMatch(r,y),y._pmProfileId=g}catch(w){y._pm=null}})}const p=this._jobSearchTokens(a),d=t.filter(g=>!(s!=="all"&&s!=="personalized"&&(g.category||"it")!==s||i!=="all"&&this._jobType(g)!==i||o!=="all"&&this._jobMode(g)!==o||!this._jobMatchesTokens(g,p)||s==="personalized"&&g._pm&&typeof g._pm.overall=="number"&&g._pm.overall<30||n&&this.jobsMinFit&&this.jobsMinFit>0&&(g._pm&&typeof g._pm.overall=="number"?g._pm.overall:0)<this.jobsMinFit));n&&d.sort((g,y)=>{const w=g._pm&&typeof g._pm.overall=="number"?g._pm.overall:0;return(y._pm&&typeof y._pm.overall=="number"?y._pm.overall:0)-w});const h=document.getElementById("job-count");h&&(h.textContent=`${d.length} job${d.length===1?"":"s"}`);let b="";if(n&&l){const g=typeof window!="undefined"?window.profileMatch:null,y=g&&typeof g.parseProfileLocation=="function"?g.parseProfileLocation(r.location):null,w=y&&y.cityName?`${y.cityName}${y.isRemoteReady?" (+ Remote)":""}`:r.location||"India / Remote Ready",f=Array.isArray(r.expertise)?r.expertise:[],c=f.slice(0,3).join(", ")+(f.length>3?` +${f.length-3}`:""),k=Array.isArray(r.projects)?r.projects.length:0,S=k>0&&r.projects[0].title||"",C={};d.slice(0,15).forEach(A=>{A._pm&&A._pm.skills&&Array.isArray(A._pm.skills.missing)&&A._pm.skills.missing.forEach(T=>{T&&T.length>1&&(C[T]=(C[T]||0)+1)})});const I=Object.keys(C).sort((A,T)=>C[T]-C[A]).slice(0,3),j=I.length>0?`
        <div class="mt-3 pt-3 border-t border-indigo-800/40 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div class="flex items-center gap-1.5 text-indigo-200">
            <span class="material-symbols-outlined text-amber-300 text-sm">lightbulb</span>
            <span><strong>Boost your matches:</strong> Adding <span class="text-amber-200 font-semibold">${this.escapeHtml(I.join(", "))}</span> to your profile projects could unlock higher match scores.</span>
          </div>
          <button onclick="router.navigate('dashboard')" class="text-amber-300 hover:text-white font-bold text-[11px] underline">Add to profile &rarr;</button>
        </div>`:"";b=`
        <div class="bg-gradient-to-br from-slate-900 via-indigo-950 to-primary text-white rounded-2xl p-5 mb-5 shadow-lg border border-indigo-800/40">
          <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-amber-400 text-slate-900 flex items-center justify-center shadow-md shrink-0">
                <span class="material-symbols-outlined text-2xl font-bold">auto_awesome</span>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h2 class="text-base font-bold text-white tracking-tight">Personalized for Your Profile</h2>
                  <span class="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold px-2 py-0.5 rounded-full">Tailored Feed</span>
                </div>
                <p class="text-xs text-indigo-200/80 mt-0.5">Scored & ranked against your real skills, proof projects, and city</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="router.navigate('dashboard')" class="text-xs text-indigo-200 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg border border-white/20 transition-all font-medium inline-flex items-center gap-1">
                <span class="material-symbols-outlined text-[14px]">edit</span> Edit Profile
              </button>
              <button onclick="app.setJobsFilter('all')" class="text-xs text-indigo-300 hover:text-white px-2 py-1 transition-all">Reset to All</button>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3 border-t border-indigo-800/50 text-xs">
            <div class="bg-indigo-950/70 rounded-xl p-2.5 border border-indigo-800/40">
              <p class="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-0.5 flex items-center gap-1">
                <span class="material-symbols-outlined text-[13px] text-amber-400">location_on</span> City / Target
              </p>
              <p class="font-bold text-white truncate" title="${this.escapeHtml(w)}">${this.escapeHtml(w)}</p>
            </div>
            <div class="bg-indigo-950/70 rounded-xl p-2.5 border border-indigo-800/40">
              <p class="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-0.5 flex items-center gap-1">
                <span class="material-symbols-outlined text-[13px] text-sky-400">psychology</span> Skills
              </p>
              <p class="font-bold text-white truncate" title="${this.escapeHtml(c||"Profile skills")}">${this.escapeHtml(c||"Profile skills")}</p>
            </div>
            <div class="bg-indigo-950/70 rounded-xl p-2.5 border border-indigo-800/40">
              <p class="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-0.5 flex items-center gap-1">
                <span class="material-symbols-outlined text-[13px] text-emerald-400">rocket_launch</span> Proof Projects
              </p>
              <p class="font-bold text-white truncate" title="${this.escapeHtml(S||`${k} Projects`)}">${k} Project${k===1?"":"s"}${S?` (${this.escapeHtml(S)})`:""}</p>
            </div>
          </div>
          ${j}
        </div>`}const u=s==="any"?"Other Roles":s==="personalized"?"Your Profile Matches":s.toUpperCase(),m=i!=="all"||o!=="all"||!!a,v=`
      <div class="text-center py-16 bg-white border border-slate-200 rounded-3xl">
        <span class="material-symbols-outlined text-4xl text-slate-300 mb-2 block">work_off</span>
        <p class="text-sm font-semibold text-slate-500">${s==="personalized"?"No openings closely match your profile criteria yet.":m?`No openings match${a?` \u201C${this.escapeHtml(a)}\u201D`:""}.`:`No jobs yet${s==="all"?"":" in "+u}.`}</p>
        <p class="text-xs text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">${s==="personalized"?"Try widening your skills in your profile, or browse all jobs across India.":m?"Try fewer or simpler words \u2014 a role and a city works best, e.g. \u201Csales Pune\u201D.":"New openings appear as they're vetted and posted."}</p>
        <button onclick="app.clearJobsFilters()" class="mt-4 px-4 py-2 border-2 border-primary text-primary font-bold text-xs rounded-xl hover:bg-primary-fixed transition-all">Clear search & filters</button>
      </div>`,_=this.jobsShown||JOBS_PAGE_SIZE,x=d.slice(0,_),$=d.length-x.length,E=$>0?`
      <div class="flex flex-col items-center gap-2 mt-5">
        <button onclick="app.showMoreJobs()" class="inline-flex items-center gap-1 px-5 py-2.5 border-2 border-primary text-primary font-bold text-xs rounded-xl hover:bg-primary-fixed transition-all active:scale-95">
          Show ${Math.min(JOBS_PAGE_SIZE,$)} more <span class="material-symbols-outlined text-sm">expand_more</span>
        </button>
        <span class="text-[11px] text-slate-400">Showing ${x.length} of ${d.length} openings</span>
      </div>`:"";e.innerHTML=x.length?`${b}<div class="space-y-4">${x.map(g=>this.renderJobCard(g)).join("")}</div>${E}`:v}showMoreJobs(){this.jobsShown=(this.jobsShown||JOBS_PAGE_SIZE)+JOBS_PAGE_SIZE,this._renderJobsResults()}clearJobsFilters(){this.jobsQuery="",this.jobsType="all",this.jobsMode="all",this.jobsFilter="all",this.jobsPersonalized=!1,this.jobsShown=JOBS_PAGE_SIZE;const e=document.getElementById("jobs-controls");e&&(e.innerHTML=this._jobsBoardControls()),this._syncJobsQueryToUrl(),this._renderJobsResults()}jobMatchPill(e){if(e._pm&&typeof e._pm.overall=="number"){const a=e._pm;return`<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${a.overall>=80?"bg-emerald-50 text-emerald-700 border-emerald-200":a.overall>=60?"bg-blue-50 text-blue-700 border-blue-200":a.overall>=40?"bg-indigo-50 text-indigo-700 border-indigo-200":"bg-slate-100 text-slate-600 border-slate-200"}" title="${this.escapeHtml(a.summary||a.band)}"><span class="material-symbols-outlined text-[12px]">auto_awesome</span>${a.overall}% match</span>`}const t=typeof window!="undefined"&&window.profileMatch?window.profileMatch:null;if(!t||typeof t.computeProfileMatch!="function")return"";const s=typeof swapikiStore!="undefined"&&swapikiStore&&typeof swapikiStore.getProfile=="function"?swapikiStore.getProfile():null;if(!s)return"";let i=null;try{i=t.computeProfileMatch(s,e)}catch(a){return""}return!i||typeof i.overall!="number"?"":`<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${i.overall>=80?"bg-emerald-50 text-emerald-700 border-emerald-200":i.overall>=60?"bg-blue-50 text-blue-700 border-blue-200":i.overall>=40?"bg-amber-50 text-amber-700 border-amber-200":"bg-slate-100 text-slate-600 border-slate-200"}" title="${this.escapeHtml(i.band)}"><span class="material-symbols-outlined text-[12px]">target</span>${i.overall}% match</span>`}renderJobCard(e){const t=(Array.isArray(e.skills)?e.skills:[]).slice(0,5).map(l=>`<span class="bg-slate-100 text-slate-600 rounded-full px-2.5 py-1 text-[10px] font-bold">${this.escapeHtml(l)}</span>`).join(""),s="Posted by Swapiki",i=this._jobType(e),o=this._jobMode(e),a=`<span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${i==="internship"?"bg-rose-50 text-rose-600 border border-rose-200":"bg-emerald-50 text-emerald-700 border border-emerald-200"}">${i==="internship"?"Internship":"Job"}</span>`,n=`<span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${o==="remote"?"bg-sky-50 text-sky-700 border border-sky-200":o==="hybrid"?"bg-violet-50 text-violet-700 border border-violet-200":"bg-slate-100 text-slate-600 border border-slate-200"}">${o==="remote"?"Remote / WFH":o==="hybrid"?"Hybrid":"Onsite"}</span>`,r=(e.raw_text||"").match(/Apply\s*by\s*:\s*([0-9]{1,2}\s+[A-Za-z]{3,9}\s+20\d{2})/i);return`
      <div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all">
        <div class="flex flex-wrap items-start justify-between gap-3 mb-2">
          <div class="min-w-0">
            <h3 class="font-bold text-slate-900">${this.escapeHtml(e.title)}</h3>
            <p class="text-xs text-slate-500 mt-0.5">${this.escapeHtml(e.company)}${e.location?" \xB7 "+this.escapeHtml(e.location):""}</p>
          </div>
          <div class="flex flex-col items-end gap-1.5 shrink-0">
            <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200"><span class="material-symbols-outlined text-[12px]">share</span>${this.escapeHtml(s)}</span>
            ${this.jobMatchPill(e)}
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 mb-2">
          ${a}${n}${this.jobFeaturedLabel(e)}
          ${r?`<span class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"><span class="material-symbols-outlined text-[12px]">event</span>Apply by ${this.escapeHtml(r[1])}</span>`:""}
        </div>
        ${t?`<div class="flex flex-wrap gap-1.5 mt-1 mb-3">${t}</div>`:""}
        ${e.salary?`<p class="text-[11px] text-slate-400 flex items-center gap-1 mb-1"><span class="material-symbols-outlined text-[13px]">payments</span>${this.escapeHtml(e.salary)}</p>`:""}
        ${e.description?`<p class="text-xs text-slate-600 leading-relaxed mb-3">${this.escapeHtml(e.description)}</p>`:""}
        ${e._pm&&e._pm.reasons&&e._pm.reasons.length>0?`
        <div class="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2.5 mb-3 border-t border-slate-100 text-[11px]">
          <span class="font-bold text-[10px] uppercase tracking-wider text-indigo-700 flex items-center gap-0.5">
            <span class="material-symbols-outlined text-[13px]">auto_awesome</span> Profile Fit:
          </span>
          ${e._pm.reasons.map(l=>`<span class="bg-indigo-50/80 text-indigo-800 font-semibold px-2 py-0.5 rounded-md text-[10px] border border-indigo-100/80">${this.escapeHtml(l)}</span>`).join("")}
        </div>`:""}
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <button onclick="app.openJobApplyModal('${e.id}')" class="px-4 py-2 bg-primary text-white font-bold text-xs rounded-lg hover:bg-primary/90 transition-all">Apply with my profile</button>
          <button onclick="app.openJobShareModal('${e.id}')" title="Share this job" aria-label="Share this job" class="px-3 py-2 border border-slate-200 text-slate-600 font-bold text-xs rounded-lg hover:bg-slate-50 hover:text-primary transition-all inline-flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">share</span>Share</button>
        </div>
      </div>`}_injectJobsJsonLd(e){if(!Array.isArray(e)||e.length===0)return;let t=document.getElementById("jobs-jsonld");t||(t=document.createElement("script"),t.type="application/ld+json",t.id="jobs-jsonld",document.head.appendChild(t));let s=[];try{const o=JSON.parse(t.textContent);s=Array.isArray(o&&o["@graph"])?o["@graph"]:[]}catch(o){s=[]}const i=s.filter(o=>o&&o["@type"]!=="ItemList"&&o["@type"]!=="JobPosting");t.textContent=JSON.stringify({"@context":"https://schema.org","@graph":i})}safeHttpUrl(e){const t=String(e==null?"":e).trim();if(!t)return"";try{const s=new URL(t);return s.protocol==="http:"||s.protocol==="https:"?s.href:""}catch(s){return""}}numericSalary(e){if(e==null||e==="")return null;const t=Number(e);return Number.isFinite(t)&&t>0?t:null}openJobApplyModal(e){const t=Array.isArray(this._jobsCache)?this._jobsCache.find(b=>b.id===e):null;if(!t)return;if(!swapikiStore.currentUser){this.openLoginModal();return}const s=swapikiStore.getProfile();if(!s){this.openLoginModal();return}if((typeof s.completionScore=="number"?s.completionScore:0)<80){typeof router!="undefined"&&router&&typeof router.navigate=="function"&&router.navigate("dashboard");return}if(window.posthog&&typeof window.posthog.capture=="function")try{window.posthog.capture("job_apply_open",{job_id:e,title:t.title||"",company:t.company||""})}catch(b){}const i=s.username?`https://${s.username}.swapiki.com`:"https://swapiki.com";this._jobApplyLink=i;const o=typeof window.profileMatch=="object"&&window.profileMatch?window.profileMatch.renderProfileMatchHtml(window.profileMatch.computeProfileMatch(s,t)):"",a=this.safeHttpUrl(t.apply_url||t.contact),n=!!a,r=this._jobType(t),l=this._jobMode(t),p="bg-blue-50 text-blue-800 border-blue-200",d=[{t:t.location,label:this.escapeHtml(t.location),cls:p},{t:t.salary,label:this.escapeHtml(t.salary),cls:p},{t:"1",label:r==="internship"?"Internship":"Job",cls:p},{t:"1",label:l==="remote"?"Remote / WFH":l==="hybrid"?"Hybrid":"Onsite",cls:p}].filter(b=>!!b.t).map(b=>`<span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${b.cls}">${b.label}</span>`).join(""),h=document.createElement("div");h.id="modal-job-apply",h.className="fixed inset-0 z-[99999] bg-neutral-900/60 flex items-center justify-center p-4",h.innerHTML=`
      <div class="bg-white rounded-2xl max-w-5xl w-full shadow-2xl relative border border-blue-100 max-h-[92vh] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button onclick="app.closeJobApplyModal()" class="absolute top-6 right-6 z-10 text-blue-700 hover:text-blue-950 hover:bg-blue-50 rounded-full p-1.5 transition-colors">
          <span class="material-symbols-outlined text-2xl">close</span>
        </button>
        <div class="px-7 sm:px-10 pt-7 pb-6 border-b border-blue-100">
          <div class="pr-12 flex items-center gap-4">
            <div class="w-11 h-11 rounded-xl bg-blue-50 text-blue-900 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-xl">work</span></div>
            <div class="min-w-0 flex-1">
              <h3 class="text-xl font-bold text-blue-950 truncate">Apply \xB7 ${this.escapeHtml(t.title)}</h3>
              <p class="text-sm text-blue-700 truncate">${this.escapeHtml(t.company||"")}</p>
            </div>
          </div>
          ${d?`<div class="flex flex-wrap gap-1.5 mt-3 pl-[60px]">${d}</div>`:""}
        </div>
        <div class="p-7 sm:p-10 grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-10">
          <div class="min-w-0">${o}</div>
          <div class="min-w-0 flex flex-col gap-4">
            ${n?`
              <button onclick="app.applyToJob('${t.id}')" class="w-full py-3 bg-blue-900 text-white font-bold text-sm rounded-xl hover:bg-blue-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                <span class="material-symbols-outlined text-lg">open_in_new</span> Apply on the job site
              </button>`:""}
            <div class="grid grid-cols-2 gap-3">
              <button onclick="app.openResumeDraft('${t.id}')" class="py-3 border-2 border-blue-900 text-blue-900 font-bold text-[13px] rounded-xl hover:bg-blue-50 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5">
                <span class="material-symbols-outlined text-lg">edit_document</span> Draft resume
              </button>
              <button onclick="app.openInterviewPrep('${t.id}')" class="py-3 border-2 border-blue-900 text-blue-900 font-bold text-[13px] rounded-xl hover:bg-blue-50 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5">
                <span class="material-symbols-outlined text-lg">co_present</span> Interview prep
              </button>
            </div>
            <button onclick="app.closeJobApplyModal(); app.openJobShareModal('${t.id}')" class="w-full py-3 border-2 border-blue-900 text-blue-900 font-bold text-[13px] rounded-xl hover:bg-blue-50 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5">
              <span class="material-symbols-outlined text-lg">share</span> Share this job
            </button>
            <div class="-mt-1">${this._toolUsageHtml(null)}</div>
            <button onclick="app.openInterviewPrep('${t.id}'); setTimeout(function(){ const el = document.getElementById('gh-picker'); if (el) el.scrollIntoView({block:'center'}); }, 700);" class="text-left text-[13px] font-bold text-blue-900 hover:underline flex items-center gap-1.5">
              <span class="material-symbols-outlined text-lg">code</span> Which of my GitHub projects fit this job?
            </button>
            ${a?`
              <a href="${this.escapeHtml(a)}" target="_blank" rel="noopener noreferrer nofollow" class="flex items-start gap-1.5 text-[11px] font-medium text-blue-800 hover:text-blue-950 break-all px-0.5">
                <span class="material-symbols-outlined text-[14px] shrink-0">link</span>Opening: ${this.escapeHtml(a)}
              </a>`:""}
            <div class="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
              <p class="text-[10px] font-bold uppercase tracking-wide text-blue-800 mb-1.5">Stand out \u2014 send your proof profile</p>
              <div class="flex items-center justify-between gap-2">
                <span class="font-mono text-xs font-bold text-blue-950 truncate">${this.escapeHtml(i)}</span>
                <button onclick="app.copyMyJobProfileLink()" title="Copy my proof link" class="text-blue-800 hover:bg-white rounded-lg p-1.5 transition-colors shrink-0"><span class="material-symbols-outlined text-lg">content_copy</span></button>
              </div>
            </div>
          </div>
        </div>
      </div>`,document.body.appendChild(h)}copyMyJobProfileLink(){const e=this._jobApplyLink||"";if(e)if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(e).then(()=>this.showToast("Proof link copied \u2014 send it to the job contact."));else{const t=document.createElement("textarea");t.value=e,document.body.appendChild(t),t.select(),document.execCommand("copy"),document.body.removeChild(t),this.showToast("Proof link copied \u2014 send it to the job contact.")}}applyToJob(e){const t=Array.isArray(this._jobsCache)?this._jobsCache.find(i=>i.id===e):null;if(!t)return;const s=this.safeHttpUrl(t.apply_url||t.contact);if(!s){this.showToast("This listing has no application link yet.");return}if(window.posthog&&typeof window.posthog.capture=="function")try{window.posthog.capture("job_apply_click",{job_id:e})}catch(i){}window.open(s,"_blank","noopener"),swapikiStore.recordJobClick(e)}closeJobApplyModal(){const e=document.getElementById("modal-job-apply");e&&e.remove()}openPersonalizedFitModal(e){const t=Array.isArray(this._jobsCache)?this._jobsCache.find(n=>n.id===e):null;if(!t)return;const s=typeof swapikiStore!="undefined"&&swapikiStore&&typeof swapikiStore.getProfile=="function"?swapikiStore.getProfile():null;if(!s)return;const i=typeof window.profileMatch!="undefined"&&window.profileMatch&&typeof window.profileMatch.computePersonalizedMatch=="function"?window.profileMatch.computePersonalizedMatch(s,t):null,o=typeof window.profileMatch!="undefined"&&window.profileMatch&&typeof window.profileMatch.renderPersonalizedFitModalHtml=="function"?window.profileMatch.renderPersonalizedFitModalHtml(t,s,i):"",a=document.createElement("div");a.id="modal-profile-fit",a.className="fixed inset-0 z-[99999] bg-neutral-900/60 flex items-center justify-center p-4",a.innerHTML=`
      <div class="bg-white rounded-2xl max-w-5xl w-full shadow-2xl relative border border-blue-100 max-h-[92vh] overflow-y-auto [scrollbar-width:none] [::-webkit-scrollbar]:hidden">
        <button onclick="app.closePersonalizedFitModal()" class="absolute top-6 right-6 z-10 text-blue-700 hover:text-blue-950 hover:bg-blue-50 rounded-full p-1.5 transition-colors">
          <span class="material-symbols-outlined text-2xl">close</span>
        </button>
        ${o}
      </div>`,document.body.appendChild(a)}closePersonalizedFitModal(){const e=document.getElementById("modal-profile-fit");e&&e.remove()}renderJobCard(e){const t=(Array.isArray(e.skills)?e.skills:[]).slice(0,5).map(l=>`<span class="bg-slate-100 text-slate-600 rounded-full px-2.5 py-1 text-[10px] font-bold">${this.escapeHtml(l)}</span>`).join(""),s="Posted by Swapiki",i=this._jobType(e),o=this._jobMode(e),a=`<span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${i==="internship"?"bg-rose-50 text-rose-600 border border-rose-200":"bg-emerald-50 text-emerald-700 border border-emerald-200"}">${i==="internship"?"Internship":"Job"}</span>`,n=`<span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${o==="remote"?"bg-sky-50 text-sky-700 border border-sky-200":o==="hybrid"?"bg-violet-50 text-violet-700 border border-violet-200":"bg-slate-100 text-slate-600 border border-slate-200"}">${o==="remote"?"Remote / WFH":o==="hybrid"?"Hybrid":"Onsite"}</span>`,r=(e.raw_text||"").match(/Apply\\s*by\\s*:\\s*([0-9]{1,2}\\s+[A-Za-z]{3,9}\\s+20\\d{2})/i);return`
      <div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all">
        <div class="flex flex-wrap items-start justify-between gap-3 mb-2">
          <div class="min-w-0">
            <h3 class="font-bold text-slate-900">${this.escapeHtml(e.title)}</h3>
            <p class="text-xs text-slate-500 mt-0.5">${this.escapeHtml(e.company)}${e.location?" \xB7 "+this.escapeHtml(e.location):""}</p>
          </div>
          <div class="flex flex-col items-end gap-1.5 shrink-0">
            <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200"><span class="material-symbols-outlined text-[12px]">share</span>${this.escapeHtml(s)}</span>
            ${this.jobMatchPill(e)}
            <button onclick="app.openPersonalizedFitModal('${e.id}')" class="text-xs text-indigo-600 underline mt-1">Why this match?</button>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 mb-2">
          ${a}${n}${this.jobFeaturedLabel(e)}
          ${r?`<span class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"><span class="material-symbols-outlined text-[12px]">event</span>Apply by ${this.escapeHtml(r[1])}</span>`:""}
        </div>
        ${t?`<div class="flex flex-wrap gap-1.5 mt-1 mb-3">${t}</div>`:""}
        ${e.salary?`<p class="text-[11px] text-slate-400 flex items-center gap-1 mb-1"><span class="material-symbols-outlined text-[13px]">payments</span>${this.escapeHtml(e.salary)}</p>`:""}
        ${e.description?`<p class="text-xs text-slate-600 leading-relaxed mb-3">${this.escapeHtml(e.description)}</p>`:""}
        ${e._pm&&e._pm.reasons&&e._pm.reasons.length>0?`
        <div class="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2.5 mb-3 border-t border-slate-100 text-[11px]">
          <span class="font-bold text-[10px] uppercase tracking-wider text-indigo-700 flex items-center gap-0.5">
            <span class="material-symbols-outlined text-[13px]">auto_awesome</span> Profile Fit:
          </span>
          ${e._pm.reasons.map(l=>`<span class="bg-indigo-50/80 text-indigo-800 font-semibold px-2 py-0.5 rounded-md text-[10px] border border-indigo-100/80">${this.escapeHtml(l)}</span>`).join("")}
        </div>`:""}
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <button onclick="app.openJobApplyModal('${e.id}')" class="px-4 py-2 bg-primary text-white font-bold text-xs rounded-lg hover:bg-primary/90 transition-all">Apply with my profile</button>
          <button onclick="app.openJobShareModal('${e.id}')" title="Share this job" aria-label="Share this job" class="px-3 py-2 border border-slate-200 text-slate-600 font-bold text-xs rounded-lg hover:bg-slate-50 hover:text-primary transition-all inline-flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">share</span>Share</button>
        </div>
      </div>`}async _claimTool(e,t){if(!swapikiStore||!swapikiStore.currentUser||typeof swapikiStore.claimToolUsage!="function")return null;try{const s=await swapikiStore.claimToolUsage(t,e);return!s||s.unavailable?null:s.allowed===!1?Object.assign({blocked:!0},s):Object.assign({blocked:!1},s)}catch(s){return null}}_toolBlockedView(e){const t=e.limit||5,s=e.reset_at?new Date(e.reset_at):null,i=s&&!isNaN(s.getTime())?s.toLocaleString(void 0,{weekday:"long",hour:"numeric",minute:"2-digit"}):"tomorrow",o=!!e.error||e.reason==="error";return`
      <div class="max-w-xl mx-auto bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-sm">
        <div class="w-16 h-16 rounded-2xl ${o?"bg-slate-100 text-slate-500":"bg-amber-50 text-amber-600"} flex items-center justify-center mx-auto mb-4">
          <span class="material-symbols-outlined text-3xl">${o?"cloud_off":"hourglass_top"}</span>
        </div>
        <h1 class="text-2xl font-bold text-primary tracking-tight mb-2">${o?"Couldn't check your daily limit":"Daily limit reached"}</h1>
        <p class="text-sm text-slate-500 leading-relaxed mb-6">${o?"Something went wrong on our side, so we stopped rather than risk not counting a job you should get. Please try again in a moment.":`You've used all ${t} job posts for today across resume drafts and interview prep. Come back tomorrow \u2014 your allowance resets ${this.escapeHtml(i)}.`}</p>
        <button onclick="router.navigate('jobs')" class="px-6 py-3 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 transition-all shadow-md">Browse jobs</button>
      </div>`}_toolUsageHtml(e){const t=e&&e.limit||DAILY_TOOL_JOB_LIMIT;return`<div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[13px] text-slate-600 leading-relaxed">${e&&!e.blocked&&typeof e.remaining=="number"?`${e.remaining} of ${t} job posts left today.`:`Free while you are a member: ${t} job posts a day, shared between resume drafts and interview prep.`} Re-opening a job you have already used today is free.</div>`}openResumeDraft(e){this.closeJobApplyModal(),this._resumeJobId=e||null,window.location.hash="resume-draft/"+encodeURIComponent(e||"")}async renderResumeDraftView(){this.setPageMeta("Draft your resume | Swapiki","Draft a resume tailored to a specific job description using your Swapiki proof profile \u2014 then copy it or save it as a PDF.",{url:window.location.href});const e=document.getElementById("resume-draft-container");if(!e)return;if(!swapikiStore.currentUser){e.innerHTML=`
        <div class="max-w-xl mx-auto bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-sm">
          <div class="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <span class="material-symbols-outlined text-3xl">edit_document</span>
          </div>
          <h1 class="text-2xl font-bold text-primary tracking-tight mb-2">Resume drafts are for members</h1>
          <p class="text-sm text-slate-500 leading-relaxed mb-6">Sign in to generate a resume draft tuned to a job description, built from your proof profile.</p>
          <button onclick="app.openLoginModal()" class="px-6 py-3 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 transition-all shadow-md">Sign in</button>
        </div>`;return}const t=swapikiStore.getProfile(),s=t&&typeof t.completionScore=="number"?t.completionScore:30;if(s<80){e.innerHTML=`
        <div class="max-w-xl mx-auto bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-sm">
          <div class="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <span class="material-symbols-outlined text-3xl">lock</span>
          </div>
          <h1 class="text-2xl font-bold text-primary tracking-tight mb-2">Drafts unlock at 80%</h1>
          <p class="text-sm text-slate-500 leading-relaxed mb-4">Resume drafts are built from your proof profile. Reach an 80%-complete proof profile to unlock them. You're at <strong>${s}%</strong>.</p>
          <button onclick="router.navigate('dashboard')" class="px-6 py-3 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 transition-all shadow-md">Finish my profile</button>
        </div>`;return}const i=this._resumeJobId;let o=Array.isArray(this._jobsCache)&&this._jobsCache.find(d=>d.id===i)||null;if(!o)try{const d=await swapikiStore.getPublishedJobs();this._jobsCache=d,o=d.find(h=>h.id===i)||null}catch(d){window.SWAPIKI_POSTHOG&&window.SWAPIKI_POSTHOG.capture&&window.SWAPIKI_POSTHOG.capture("resume_draft_load_error",{error:String(d&&d.message)})}if(!o){e.innerHTML=`
        <div class="max-w-xl mx-auto bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-sm">
          <div class="w-16 h-16 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-4">
            <span class="material-symbols-outlined text-3xl">work_off</span>
          </div>
          <h1 class="text-2xl font-bold text-primary tracking-tight mb-2">Couldn't find that job</h1>
          <p class="text-sm text-slate-500 leading-relaxed mb-6">The opening may have been updated or removed. Head back to the board and pick another one.</p>
          <button onclick="router.navigate('jobs')" class="px-6 py-3 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 transition-all shadow-md">Browse jobs</button>
        </div>`;return}const a=await this._claimTool("resume",o.id);if(a&&a.blocked){e.innerHTML=this._toolBlockedView(a);return}const n=this._buildResumeDraft(o,t),r="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all",l=d=>`<label class="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">${d}</label>`,p=n.projects.map((d,h)=>`
      <div>
        ${l(`Project ${h+1}`)}
        <textarea data-rd-project oninput="app._resumeRefreshPreview()" rows="4" class="${r}" placeholder="Title \u2014 Role&#10;\u2022 Key achievement 1">${this.escapeHtml(d.text)}</textarea>
      </div>`).join("");e.innerHTML=`
      <div class="max-w-5xl mx-auto">
        <div class="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <button onclick="router.navigate('jobs')" class="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
              <span class="material-symbols-outlined text-sm">arrow_back</span> Back to jobs
            </button>
            <h1 class="text-2xl font-bold text-primary tracking-tight mt-2">Draft a resume for this job</h1>
            <p class="text-sm text-slate-500 mt-0.5">${this.escapeHtml(o.title)}${o.company?" \xB7 "+this.escapeHtml(o.company):""}${o.location?" \xB7 "+this.escapeHtml(o.location):""}</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="app.printDraftResume()" class="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 active:scale-[0.98] transition-all shadow-md">
              <span class="material-symbols-outlined text-lg">picture_as_pdf</span> Save as PDF
            </button>
            <button onclick="app.copyDraftResume()" class="flex items-center gap-1.5 px-4 py-2.5 border-2 border-primary text-primary text-sm font-bold rounded-xl hover:bg-primary/5 active:scale-[0.98] transition-all">
              <span class="material-symbols-outlined text-lg">content_copy</span> Copy resume
            </button>
          </div>
        </div>

        <div class="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 mb-6 text-sm text-blue-900 leading-relaxed">
          <strong>How this works \u2014</strong> your draft is pre-tuned to this job's description using your proof profile. Edit any section on the left; the preview updates live. When it's ready, copy it or save it as a PDF.
        </div>

        ${this._toolUsageHtml(a)}

        <div class="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-6">
          <div class="space-y-4">
            <div class="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 class="text-sm font-bold text-slate-900 mb-3">Contact & headline</h2>
              <div class="grid sm:grid-cols-2 gap-3">
                <div>${l("Full name")}<input id="rd-name" value="${this.escapeHtml(n.name)}" oninput="app._resumeRefreshPreview()" class="${r}" /></div>
                <div>${l("Headline / current title")}<input id="rd-headline" value="${this.escapeHtml(n.headline)}" oninput="app._resumeRefreshPreview()" class="${r}" /></div>
              </div>
              <div class="mt-3">${l("Contact line")}<input id="rd-contact" value="${this.escapeHtml(n.contact)}" oninput="app._resumeRefreshPreview()" class="${r}" /></div>
            </div>

            <div class="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 class="text-sm font-bold text-slate-900 mb-1">Professional summary</h2>
              <p class="text-[11px] text-slate-400 mb-3">Tailored to the job description \u2014 make it yours.</p>
              <textarea id="rd-summary" oninput="app._resumeRefreshPreview()" rows="4" class="${r}">${this.escapeHtml(n.summary)}</textarea>
            </div>

            <div class="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 class="text-sm font-bold text-slate-900 mb-3">Skills (comma separated)</h2>
              <textarea id="rd-skills" oninput="app._resumeRefreshPreview()" rows="2" class="${r}">${this.escapeHtml(n.skills.join(", "))}</textarea>
            </div>

            <div class="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 class="text-sm font-bold text-slate-900 mb-1">Experience</h2>
              <p class="text-[11px] text-slate-400 mb-3">What you've claimed on your profile, phrased for this role.</p>
              <input id="rd-exp-title" value="${this.escapeHtml(n.expTitle)}" oninput="app._resumeRefreshPreview()" class="${r}" />
              <textarea id="rd-exp-detail" oninput="app._resumeRefreshPreview()" rows="3" class="${r} mt-2">${this.escapeHtml(n.expDetail)}</textarea>
            </div>

            <div class="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 class="text-sm font-bold text-slate-900 mb-1">Projects from your proof profile</h2>
              <p class="text-[11px] text-slate-400 mb-3">First line: title \u2014 role. Following lines: impact bullet points.</p>
              <div class="space-y-3">${p}</div>
            </div>
          </div>

          <div class="lg:sticky lg:top-6">
            <div class="text-[11px] font-bold uppercase tracking-wide text-primary mb-2">Live preview</div>
            <div id="rd-preview" class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"></div>
            <div class="mt-4">
              ${l("Job description \u2014 keep your draft on target")}
              <details class="bg-white border border-slate-200 rounded-2xl p-4 text-[13px] text-slate-600 leading-relaxed">
                <summary class="text-xs font-bold text-primary cursor-pointer select-none">Show / hide job description</summary>
                <div class="mt-2 whitespace-pre-wrap">${this.escapeHtml(o.description||"No description provided for this listing.")}</div>
              </details>
            </div>
          </div>
        </div>
      </div>`,this._resumeRefreshPreview()}_buildResumeDraft(e,t){const s=t.name||"Your Name",i=t.title||e.title||"",o=t.experience||"relevant hands-on experience",a=t.username?`https://${t.username}.swapiki.com`:"https://swapiki.com",n=(t.email||swapikiStore.authUser&&swapikiStore.authUser.email||"").trim(),r=[t.location,n,a].filter(Boolean).join(" \xB7 "),l=Array.isArray(t.expertise)?t.expertise:[],p=(Array.isArray(t.projects)?t.projects:[]).flatMap(y=>Array.isArray(y.tags)?y.tags:[]),d=[...new Set([...l,...p])].filter(Boolean),h=Array.isArray(e.skills)?e.skills:[],b=y=>String(y||"").toLowerCase().trim(),u=h.filter(y=>d.some(w=>b(w)===b(y))),m=d.filter(y=>!u.includes(y)),v=u.concat(m).slice(0,14),_=(Array.isArray(t.projects)?t.projects:[]).length;let x=`${s.split(" ")[0]} is a ${i||"professional"} (${o}) looking to contribute to ${e.company||"your organization"} as a ${e.title||"this role"}.`;_&&(x+=` Backed by ${_} proof project${_===1?"":"s"} with measurable outcomes`),u.length&&(x+=` and a strong working knowledge of ${u.slice(0,3).join(", ")}`),x+=". Proof profile published and ready to share.";let $="";if(typeof window.profileMatch=="object"&&window.profileMatch&&typeof window.profileMatch.requiredYears=="function"){const y=window.profileMatch.requiredYears(e);y&&($=`, aligned with the ~${y} years this opening asks for`)}const E=`Hands-on ${(i||"professional").toLowerCase()} experience across real, verifiable projects${$}. Comfortable owning tasks end-to-end with a focus on outcomes.`,g=(Array.isArray(t.projects)?t.projects:[]).map((y,w)=>{const f=[y.title,y.role].filter(Boolean).join(" \u2014 ")||`Project ${w+1}`,c=Array.isArray(y.takeaways)?y.takeaways.filter(S=>String(S||"").trim()):[];return{text:[f,...c.map(S=>"\u2022 "+S)].join(`
`)}});return{name:s,headline:i,contact:r,summary:x,skills:v,expTitle:o,expDetail:E,projects:g}}_resumeCollect(){const e=a=>{const n=document.getElementById(a);return n?n.value:""},t=e("rd-skills").split(",").map(a=>a.trim()).filter(Boolean),s=e("rd-exp-title")||"",i=e("rd-exp-detail")||"";let o=[];return document.querySelectorAll("[data-rd-project]").forEach(a=>{const n=a.value.split(`
`);o.push({heading:(n[0]||"").trim(),bullets:n.slice(1).map(r=>r.replace(/^[\s•-]+/,"").trim()).filter(Boolean)})}),{name:e("rd-name")||"Your Name",headline:e("rd-headline")||"",contact:e("rd-contact")||"",summary:e("rd-summary")||"",skills:t,expTitle:s,expDetail:i,projects:o}}_resumeRefreshPreview(){const e=document.getElementById("rd-preview");if(!e)return;const t=this._resumeCollect(),s=a=>this.escapeHtml(a),i=t.skills.map(a=>`<span class="inline-block bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2.5 py-0.5 text-[11px] font-bold mr-1.5 mb-1.5">${s(a)}</span>`).join(""),o=t.projects.filter(a=>a.heading).map(a=>`
      <div class="mb-3 last:mb-0">
        <p class="text-[13px] font-bold text-slate-900">${s(a.heading)}</p>
        ${a.bullets.length?`<ul class="mt-1 space-y-0.5">${a.bullets.map(n=>`<li class="text-[12px] text-slate-600 leading-snug flex gap-1.5"><span class="text-primary shrink-0">\u2022</span><span>${s(n)}</span></li>`).join("")}</ul>`:""}
      </div>`).join("");e.innerHTML=`
      <div class="p-6">
        <h2 class="text-lg font-bold text-slate-900">${s(t.name)}</h2>
        <p class="text-sm font-semibold text-primary mt-0.5">${s(t.headline)}</p>
        <p class="text-[11px] text-slate-500 mt-1 break-words">${s(t.contact)}</p>
        <div class="h-px bg-slate-200 my-3"></div>
        <p class="text-[10px] font-bold uppercase tracking-wide text-primary mb-1">Professional summary</p>
        <p class="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">${s(t.summary)}</p>
        ${i?`<div class="mt-3">${i}</div>`:""}
        <div class="h-px bg-slate-200 my-3"></div>
        <p class="text-[10px] font-bold uppercase tracking-wide text-primary mb-1">Experience</p>
        <p class="text-[13px] font-semibold text-slate-800">${s(t.expTitle)}</p>
        <p class="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap mt-1">${s(t.expDetail)}</p>
        ${o?`<div class="h-px bg-slate-200 my-3"></div><p class="text-[10px] font-bold uppercase tracking-wide text-primary mb-2">Projects</p>${o}`:""}
      </div>`}copyDraftResume(){const e=this._resumeCollect(),t=[e.name,e.headline,e.contact,"","PROFESSIONAL SUMMARY",e.summary||"","","SKILLS",e.skills.join(", ")||"","","EXPERIENCE",e.expTitle,e.expDetail||"",""];e.projects.some(i=>i.heading)&&(t.push("PROJECTS"),e.projects.filter(i=>i.heading).forEach(i=>{t.push(i.heading),i.bullets.forEach(o=>t.push(o)),t.push("")}));const s=t.filter(i=>i!==null).join(`
`).replace(/\n{3,}/g,`

`).trim();if(s)if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(s).then(()=>this.showToast("Resume draft copied."));else{const i=document.createElement("textarea");i.value=s,document.body.appendChild(i),i.select(),document.execCommand("copy"),document.body.removeChild(i),this.showToast("Resume draft copied.")}}printDraftResume(){const e=this._resumeCollect(),t=e.projects.filter(r=>r.heading).map(r=>`
      <div class="project">
        <div class="project-title">${this._printEscape(r.heading)}</div>
        ${r.bullets.length?`<ul>${r.bullets.map(l=>`<li>${this._printEscape(l)}</li>`).join("")}</ul>`:""}
      </div>`).join(""),s=e.skills.length?`<div class="section"><div class="section-title">Skills</div><p>${e.skills.join(", ")}</p></div>`:"",i=e.projects.some(r=>r.heading)?`<div class="section"><div class="section-title">Projects</div>${t}</div>`:"",o="DRAFT PREPARED WITH SWAPIKI",a=window.open("","_blank");if(!a){this.showToast("Please allow popups to save your resume as PDF.");return}const n=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${this._printEscape(e.name)} - Resume</title><style>
      body { font-family: 'Trebuchet MS', 'Helvetica Neue', Arial, sans-serif; color: #0f172a; padding: 40px; max-width: 780px; margin: 0 auto; line-height: 1.5; font-size: 13px; }
      .header { border-bottom: 2px solid #1e3a8a; padding-bottom: 14px; margin-bottom: 18px; }
      .header h1 { font-size: 24px; color: #1e3a8a; margin: 0 0 2px 0; }
      .header p { margin: 0; color: #64748b; font-size: 12px; }
      .headline { color: #1e3a8a; font-weight: bold; }
      .section { margin-bottom: 16px; page-break-inside: avoid; }
      .section-title { font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1.2px; color: #1e3a8a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px; }
      .project { margin-bottom: 10px; }
      .project-title { font-weight: bold; color: #0f172a; }
      ul { margin: 4px 0 0 0; padding-left: 18px; }
      li { margin-bottom: 2px; }
      .badge { display: inline-block; background: #dbeafe; color: #1e3a8a; font-size: 10px; font-weight: bold; padding: 3px 10px; border-radius: 20px; margin-top: 4px; text-transform: uppercase; }
      @media print { body { padding: 0; } }
    </style></head><body>
      <div class="header">
        <h1>${this._printEscape(e.name)}</h1>
        <p class="headline">${this._printEscape(e.headline)}</p>
        <p>${this._printEscape(e.contact)}</p>
        <span class="badge">${o}</span>
      </div>
      <div class="section"><div class="section-title">Professional Summary</div><p>${this._printEscape(e.summary).replace(/\n/g,"<br/>")}</p></div>
      ${s}
      <div class="section"><div class="section-title">Experience</div><p style="font-weight:bold;margin:0;">${this._printEscape(e.expTitle)}</p><p style="margin:4px 0 0 0;">${this._printEscape(e.expDetail).replace(/\n/g,"<br/>")}</p></div>
      ${i}
    </body></html>`;a.document.write(n),a.document.close(),a.document.title=`${e.name} - Resume Draft`,this._printReady=!0,a.addEventListener("load",()=>{}),setTimeout(()=>{try{a.focus(),a.print()}catch(r){}},300),this.showToast('Resume opened for printing \u2014 choose "Save as PDF" as the destination.')}_printEscape(e){return String(e==null?"":e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}openInterviewPrep(e){this.closeJobApplyModal(),this._interviewJobId=e||null,window.location.hash="interview-prep/"+encodeURIComponent(e||"")}async renderInterviewPrepView(){this.setPageMeta("Interview prep | Swapiki","Practice the questions most likely to come up for a specific job \u2014 built from the listing and your proof profile.",{url:window.location.href});const e=document.getElementById("interview-prep-container");if(!e)return;if(!swapikiStore.currentUser){e.innerHTML=`
        <div class="max-w-xl mx-auto bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-sm">
          <div class="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <span class="material-symbols-outlined text-3xl">co_present</span>
          </div>
          <h1 class="text-2xl font-bold text-primary tracking-tight mb-2">Interview prep is for members</h1>
          <p class="text-sm text-slate-500 leading-relaxed mb-6">Sign in to practice the questions most likely to come up \u2014 built from the listing and your proof profile.</p>
          <button onclick="app.openLoginModal()" class="px-6 py-3 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 transition-all shadow-md">Sign in</button>
        </div>`;return}const t=swapikiStore.getProfile(),s=t&&typeof t.completionScore=="number"?t.completionScore:30;if(s<80){e.innerHTML=`
        <div class="max-w-xl mx-auto bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-sm">
          <div class="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <span class="material-symbols-outlined text-3xl">lock</span>
          </div>
          <h1 class="text-2xl font-bold text-primary tracking-tight mb-2">Interview prep unlocks at 80%</h1>
          <p class="text-sm text-slate-500 leading-relaxed mb-4">Practice questions are built from your proof profile, projects and experience. Reach an 80%-complete profile to unlock them. You're at <strong>${s}%</strong>.</p>
          <button onclick="router.navigate('dashboard')" class="px-6 py-3 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 transition-all shadow-md">Finish my profile</button>
        </div>`;return}const i=this._interviewJobId;let o=Array.isArray(this._jobsCache)&&this._jobsCache.find(b=>b.id===i)||null;if(!o)try{const b=await swapikiStore.getPublishedJobs();this._jobsCache=b,o=b.find(u=>u.id===i)||null}catch(b){}if(!o){e.innerHTML=`
        <div class="max-w-xl mx-auto bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-sm">
          <div class="w-16 h-16 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-4">
            <span class="material-symbols-outlined text-3xl">work_off</span>
          </div>
          <h1 class="text-2xl font-bold text-primary tracking-tight mb-2">Couldn't find that job</h1>
          <p class="text-sm text-slate-500 leading-relaxed mb-6">The opening may have been updated or removed. Head back to the board and pick another one.</p>
          <button onclick="router.navigate('jobs')" class="px-6 py-3 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 transition-all shadow-md">Browse jobs</button>
        </div>`;return}const a=await this._claimTool("interview",o.id);if(a&&a.blocked){e.innerHTML=this._toolBlockedView(a);return}this._interviewJob=o,this._interviewThemes=this._extractJobThemes(o),this._interviewQuestions=this._generateInterviewQuestions(o,t,this._interviewThemes);const n=this._interviewQuestions,r=this._interviewThemes;this._interviewJobKey="swapiki_interview_"+i;const l=(b,u)=>`
      <div class="mb-5 last:mb-0">
        <p class="text-[11px] font-bold uppercase tracking-wide text-primary mb-2">${b}</p>
        <ol class="space-y-1.5">
          ${u.map((m,v)=>`
            <li class="text-[13px] text-slate-700 leading-relaxed flex gap-2">
              <span class="text-slate-300 font-bold shrink-0">${v+1}.</span>
              <span>${this.escapeHtml(m.text)}${m.source?` <span class="text-[10px] font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 align-middle whitespace-nowrap">${this.escapeHtml(m.source)}</span>`:""}</span>
            </li>`).join("")}
        </ol>
      </div>`,p=Array.isArray(t.projects)?t.projects:[];let d=null;if(window.swapikiGitHub){const b=this._ghRanked(),u=this._ghHydrateStory(),m=b.find(v=>v.matched&&v.matched.length)||null;d=u?b.find(v=>v.name===u)||null:m}const h=p.map(b=>`
      <div class="rounded-xl border border-slate-200 bg-white p-3.5 mb-2.5">
        <p class="text-[13px] font-bold text-slate-900">${this.escapeHtml(b.title)}${b.role?' <span class="text-slate-400 font-normal">\u2014 '+this.escapeHtml(b.role)+"</span>":""}</p>
        <ul class="mt-1.5 space-y-1">
          ${(Array.isArray(b.takeaways)?b.takeaways:[]).filter(u=>u).map(u=>`<li class="text-[12px] text-slate-600 flex gap-1.5"><span class="text-primary shrink-0">\u2022</span><span>${this.escapeHtml(u)}</span></li>`).join("")}
        </ul>
      </div>`).join("");e.innerHTML=`
      <div class="max-w-5xl mx-auto">
        <div class="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <button onclick="router.navigate('jobs')" class="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
              <span class="material-symbols-outlined text-sm">arrow_back</span> Back to jobs
            </button>
            <h1 class="text-2xl font-bold text-primary tracking-tight mt-2">Interview prep for this job</h1>
            <p class="text-sm text-slate-500 mt-0.5">${this.escapeHtml(o.title)}${o.company?" \xB7 "+this.escapeHtml(o.company):""}${o.location?" \xB7 "+this.escapeHtml(o.location):""}</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="app._interviewNext()" class="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 active:scale-[0.98] transition-all shadow-md">
              <span class="material-symbols-outlined text-lg">casino</span> Practice a question
            </button>
            <button onclick="app.copyInterviewQuestions()" class="flex items-center gap-1.5 px-4 py-2.5 border-2 border-primary text-primary text-sm font-bold rounded-xl hover:bg-primary/5 active:scale-[0.98] transition-all">
              <span class="material-symbols-outlined text-lg">content_copy</span> Copy question bank
            </button>
          </div>
        </div>

        ${this._toolUsageHtml(a)}

        <div id="gh-picker" class="mb-4"></div>

        <div class="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-6">
          <div class="space-y-4">
            <div class="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 class="text-sm font-bold text-slate-900 mb-1">What this listing actually asks for</h2>
              <p class="text-[11px] text-slate-400 mb-3">Pulled from this job description, so you know exactly what they're screening for.</p>
              ${r.seniority?`<p class="text-[12px] text-slate-700 mb-2"><span class="font-bold">Level:</span> ${this.escapeHtml(r.seniority)}</p>`:""}
              ${r.must.length?`
                <p class="text-[11px] font-bold uppercase tracking-wide text-primary mb-1.5">Required</p>
                <ul class="space-y-1 mb-3">
                  ${r.must.slice(0,7).map(b=>`<li class="text-[12px] text-slate-700 flex gap-1.5"><span class="text-primary shrink-0">\u2022</span><span>${this.escapeHtml(b)}</span></li>`).join("")}
                </ul>`:""}
              ${r.nice.length?`
                <p class="text-[11px] font-bold uppercase tracking-wide text-primary mb-1.5">Nice to have</p>
                <ul class="space-y-1 mb-3">
                  ${r.nice.slice(0,5).map(b=>`<li class="text-[12px] text-slate-600 flex gap-1.5"><span class="text-slate-300 shrink-0">\u2022</span><span>${this.escapeHtml(b)}</span></li>`).join("")}
                </ul>`:""}
              ${r.keywords.length?`
                <p class="text-[11px] font-bold uppercase tracking-wide text-primary mb-1.5">Signals in the description</p>
                <div class="flex flex-wrap gap-1.5">
                  ${r.keywords.map(b=>`<span class="bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2.5 py-0.5 text-[11px] font-bold">${this.escapeHtml(b)}</span>`).join("")}
                </div>`:""}
            </div>

            <div class="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 class="text-sm font-bold text-slate-900 mb-3">What they'll likely ask you</h2>
              ${n.description.length?l("Straight from this job description",n.description):""}
              ${l("About this role",n.role)}
              ${n.skills.length?l("Built on the listed skills",n.skills):""}
              ${l("Behavioural & situational",n.behavioral)}
            </div>
            <div class="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 class="text-sm font-bold text-slate-900 mb-3">Questions to ask them</h2>
              <ol class="space-y-1.5">
                ${n.askThem.map((b,u)=>`<li class="text-[13px] text-slate-700 leading-relaxed flex gap-2"><span class="text-slate-300 font-bold shrink-0">${u+1}.</span><span>${this.escapeHtml(b.text)}</span></li>`).join("")}
              </ol>
            </div>
          </div>

          <div class="space-y-4 lg:sticky lg:top-6">
            <div class="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 class="text-sm font-bold text-slate-900 mb-1">Practice box</h2>
              <p class="text-[11px] text-slate-400 mb-3">Tap the mic and answer out loud. It writes down what you said, then checks it.</p>
              <div id="iv-practice">
                <p id="iv-source" class="text-[10px] font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 inline-block mb-1.5"></p>
                <p id="iv-question" class="text-[13px] font-bold text-slate-900 leading-relaxed mb-2"></p>

                <div class="flex items-center gap-2.5">
                  <button id="iv-mic" onclick="app.toggleInterviewMic()" aria-live="off"
                    class="shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-primary text-white shadow-md active:scale-95 transition-all hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2">
                    <span id="iv-mic-icon" class="material-symbols-outlined text-2xl leading-none">mic</span>
                  </button>
                  <div class="min-w-0">
                    <p id="iv-mic-label" class="text-[12px] font-bold text-slate-900 leading-snug">Tap to answer out loud</p>
                    <p id="iv-mic-status" class="text-[11px] text-slate-500 leading-snug">Uses your microphone only. The audio never leaves this page.</p>
                  </div>
                </div>

                <div id="iv-transcript-wrap" class="hidden mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p class="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">What we heard you say</p>
                  <p id="iv-transcript" class="text-[13px] text-slate-800 leading-relaxed whitespace-pre-line"></p>
                </div>

                <div id="iv-voice-unsupported" class="hidden mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p id="iv-voice-unsupported-title" class="text-[12px] font-bold text-amber-900 mb-1">This browser can't listen</p>
                  <p id="iv-voice-unsupported-detail" class="text-[11px] text-amber-800 leading-relaxed">Speech-to-text needs Chrome or Edge. You can still write the answer out and check it the same way.</p>
                  <button onclick="app.toggleInterviewType(true)" class="text-[11px] font-bold text-amber-900 border border-amber-300 rounded-lg px-2.5 py-1 hover:bg-amber-100 mt-2">Type instead</button>
                </div>

                <div id="iv-type-fallback" class="hidden mt-3">
                  <textarea id="iv-answer" oninput="app._interviewTyped()" rows="6" class="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all" placeholder="Type or paste a draft answer here..."></textarea>
                </div>

                <div class="flex flex-wrap items-center justify-between gap-2 mt-3">
                  <span id="iv-wordcount" class="text-[11px] font-bold text-slate-400"></span>
                  <div class="flex flex-wrap gap-2">
                    <button onclick="app.checkInterviewAnswer()" class="text-[11px] font-bold text-white bg-primary rounded-lg px-2.5 py-1.5 hover:bg-primary/90">Check my answer</button>
                    <button onclick="app.copyInterviewAnswer()" class="text-[11px] font-bold text-primary border border-primary/30 rounded-lg px-2.5 py-1 hover:bg-primary/5">Copy</button>
                    <button onclick="app.clearInterviewAnswer()" class="text-[11px] font-bold text-slate-400 hover:text-slate-700 rounded-lg px-2.5 py-1">Clear</button>
                    <button id="iv-type-toggle" onclick="app.toggleInterviewType()" class="text-[11px] font-bold text-slate-400 hover:text-slate-700 rounded-lg px-2.5 py-1">Type instead</button>
                  </div>
                </div>
                <div id="iv-feedback" class="mt-3"></div>
              </div>
            </div>

            <div class="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 class="text-sm font-bold text-slate-900 mb-1">Your talking points</h2>
              <p class="text-[11px] text-slate-400 mb-3">Real stories from your proof profile carry the interview.</p>
              ${d?`
                <div class="rounded-xl border border-primary/30 bg-primary/[0.04] p-3 mb-3">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="material-symbols-outlined text-sm text-primary">star</span>
                    <span class="text-[12px] font-bold text-slate-900">${this.escapeHtml(d.name)}</span>
                    <span class="text-[10px] font-bold text-primary">${d.score}% match</span>
                  </div>
                  <p class="text-[11px] text-slate-600 mt-1 leading-relaxed">Leading your answers. ${d.matchedSkills.length?"It shows "+d.matchedSkills.join(", ")+" - exactly what this listing asks for.":"Open with this one in your answer."}</p>
                  <button onclick="app.copyRepoPitch('${this.escapeHtml(d.name)}')" class="text-[11px] font-bold text-primary border border-primary/30 rounded-lg px-2.5 py-1 hover:bg-primary/5 mt-2">Copy 60-sec pitch</button>
                </div>`:""}
              <div class="flex flex-wrap gap-1.5 mb-3">
                ${(Array.isArray(t.expertise)?t.expertise:[]).map(b=>`<span class="bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2.5 py-0.5 text-[11px] font-bold">${this.escapeHtml(b)}</span>`).join("")}
              </div>
              ${h||'<p class="text-[12px] text-slate-500">Add projects to your profile to get talking points here.</p>'}
            </div>
          </div>
        </div>
      </div>`,this._interviewNext(),this.renderGitHubPicker()}_extractJobThemes(e){const t=[e.description,e.requirements,e.responsibilities,e.about].filter(Boolean).join(`
`).replace(/\r/g,""),s=t.split(/\n+/).map(f=>String(f).replace(/^[\s\-\*\u2022\)\u2013\u2014:]+/,"").replace(/^\d+[.)]\s+/,"").replace(/\s+/g," ").trim()).filter(f=>f.length>3),i=[],o=[];let a="must";s.forEach(f=>{if(/nice to have|good to have|preferred|bonus|desirable|advantage|plus:/i.test(f)){a="nice";return}if(/benefit|perk|what we offer|why (you should )?join|compensation|salary/i.test(f)){a="skip";return}if(f.length<80&&/requirement|qualification|what you('|’)ll need|must have|looking for|skills? (required|needed)|who you are|about the role|responsibilit|what you('|’)ll do|day to day|role involves/i.test(f)){a="must";return}a!=="skip"&&(f.length>140||/^https?:|@|write to|apply (at|by)|contact/i.test(f)||(a==="nice"?o:i).push(f))});const n=/^(build|develop|design|manage|lead|own|drive|collaborate|ensure|support|analy[sz]e|improve|ship|partner with|maintain|scale|deliver|create|implement|run|plan|review|report|handle|identify|mentor|coordinate|launch|migrate|automate|optimi[sz]e|troubleshoot|research|prepare)\b/i,r=f=>String(f).replace(/^you\s+(?:will|would|are|shall|need to|want to|should|must|'ll|can)?\s*/i,""),l=s.map(r).filter(f=>n.test(f)&&f.length>14&&f.length<170).slice(0,6),p=/\b(experience|exposure|familiar|proficient|strong|knowledge|ability|skills|worked with|you have|must have|ideally|required|comfortable)\b/i,d=f=>{const c=String(f).toLowerCase();return i.concat(o).some(k=>{const S=String(k).toLowerCase().slice(0,18);return S.length>6&&c.indexOf(S)!==-1})},h=t.replace(/\s+/g," ").split(/[.!?;]\s+|\s+\|\s+/).map(f=>f.replace(/^[-*\u2022\d.)\s]+/,"").trim()).filter(f=>f.length>24&&f.length<230);h.forEach(f=>{const c=r(f);l.length<6&&n.test(c)&&l.indexOf(f)===-1&&!d(f)&&l.push(f)}),h.filter(f=>p.test(f)&&!n.test(f)&&!d(f)).slice(0,4).forEach(f=>{i.length<10&&i.indexOf(f)===-1&&i.push(f)});const b=new Set(["the","and","for","with","you","your","our","are","will","have","has","this","that","from","they","their","them","but","not","all","any","can","who","what","when","how","why","into","about","work","working","role","job","team","teams","years","year","experience","ability","strong","good","great","must","should","may","well","more","than","then","also","such","other","using","use","used","help","helps","new","like","etc","via","per","one","two","get","got","need","needs","based","across","within","ensure","ensuring","including","include","day","days","etc.","ideal","candidate","candidates","please","apply","applicants","looking","join","joining","opportunity","requirements","requirement","skills","skill","knowledge","familiar","comfortable","exposure","excellent","ability","responsible","role","roles","please","email","contact","benefits","salary","location","remote","hybrid","full-time","fulltime","graduate","fresher","plus","bonus","someone","who","able","someone","willing","someone","own","ideally","worked","brief","report","reports","plan","run","deliver","ensure","engine","including","across","within","weekly","daily","monthly","quarter","every","end","week","weeks","month","months","year","need","needs","well","able","write","writes","writing","read","reads","look","looking","help","helping","want","wants"]),u=/^(comfortable|exposure|strong|excellent|good|great|familiar|knowledge|ability|experience|years|year|ideal|candidate|candidates|opportunity|requirements|requirement|responsibilit|qualification|plus|bonus|apply|please|email|contact|location|remote|hybrid|full-time|fulltime|graduate|fresher|someone|willing|joining|please|benefits|salary|compensation)$/i,m={},v={},_=(f,c)=>{if(!f)return;const k=String(f).replace(/^[^A-Za-z0-9+#]+/,"").replace(/[^A-Za-z0-9+#.]+$/,"").replace(/\.+$/,"");if(!k)return;const S=k.toLowerCase();S.length<3||b.has(S)||u.test(S)||/^\d+$/.test(S)||(m[S]||(m[S]={n:0,orig:f}),m[S].n+=1,c&&(v[S]=(v[S]||0)+1))};t.split(/\n+/).forEach(f=>{f.split(/[^A-Za-z0-9+#.]+/).filter(Boolean).forEach((k,S)=>_(k,S===0))}),i.concat(o,l).forEach(f=>{String(f).split(/\s+/).slice(1).forEach(k=>{k.length>3&&_(k,!1)})});const x=(Array.isArray(e.skills)?e.skills:[]).map(f=>String(f).toLowerCase()),$=Object.keys(m).filter(f=>u.test(f)?!1:m[f].n>=2?!0:!((v[f]||0)>=m[f].n)).sort((f,c)=>{const k=x.indexOf(f)!==-1?1:0;return(x.indexOf(c)!==-1?1:0)-k||m[c].n-m[f].n||m[c].orig.length-m[f].orig.length}).slice(0,12).map(f=>m[f].orig);let E="";const y=(String(e.title||"")+" "+t.slice(0,400)).match(/\b(intern|internship|trainee|junior|entry[- ]level|graduate|fresher|mid[- ]level|senior|staff|principal|lead|head|director|manager)\b/i);y&&(E=y[1].toLowerCase().replace(/[- ]/g," "));const w=t.match(/(\d+)\s*\+?\s*(?:-\s*\d+)?\s*years?/i);return{must:i.slice(0,10),nice:o.slice(0,6),responsibilities:l,keywords:$,seniority:E,years:w?w[1]:""}}_generateInterviewQuestions(e,t,s){const i=s||this._extractJobThemes(e),o=e.title||"this role",a=e.company||"your team",n=(Array.isArray(e.skills)?e.skills:[]).filter(x=>String(x||"").trim()).slice(0,4),r=(x,$)=>{const E=String(x||"").replace(/\s+/g," ").trim();return E.length>$?E.slice(0,$).replace(/\s+\S*$/,"")+"...":E},l=i.keywords.map(x=>String(x).toLowerCase()),p=x=>{const $={};return String(x||"").toLowerCase().split(/[^a-z0-9+#.]+/).forEach(E=>{E.length>3&&l.indexOf(E)!==-1&&!$[E]&&($[E]=!0)}),Object.keys($).slice(0,3)},d=x=>{const $=String(x||"").toLowerCase();return n.map(E=>String(E).toLowerCase()).filter(E=>E&&$.indexOf(E)!==-1&&l.indexOf(E)===-1).slice(0,2)},h=x=>{const $={};p(x).concat(d(x)).forEach(g=>{$[g]||($[g]=!0)});let E=Object.keys($).slice(0,3);if(!E.length){const g=/^(comfortable|exposure|strong|excellent|good|great|familiar|knowledge|ability|experience|years|year|including|use|used|using|well|also|across|within|ensure|working|ways|things|someone|role|work|plus|bonus|apply|please|with|and|the|for|that|this|their|there|from|have|will|about|other|such|than|when|where|which|while|would|could|should|must|into|your|they|them|then|than|more|only|also|other|each|both|some|most|such|very|many|will|can|out|off|over|under)$/i;E=String(x||"").split(/[^A-Za-z0-9+#./-]+/).filter(w=>w.length>3&&!g.test(w)).slice(0,2).map(w=>w.toLowerCase())}return E},b=i.must.filter(x=>x.length>10&&i.responsibilities.indexOf(x)===-1).slice(0,5).map(x=>({text:`The listing asks for "${r(x,110)}" - how have you done that?`,source:"This listing",focus:h(x)}));i.responsibilities.slice(0,4).forEach(x=>{b.push({text:`This role involves ${r(x,120)} - how would you approach it here?`,source:"This listing",focus:h(x)})}),i.nice.filter(x=>x.length>10).slice(0,2).forEach(x=>{b.push({text:`They list "${r(x,100)}" as a nice-to-have - what's your experience with it?`,source:"Nice to have",focus:p(x)})});const u=[{text:`Why do you want to work as ${o} at ${a}?`,source:"Motivation",focus:[o.split(/\s+/)[0].toLowerCase()]},{text:"Tell me about yourself in under two minutes.",source:"Opening",focus:[]},{text:`Why should we hire you for this ${o} role?`,source:"Fit",focus:[]},{text:`How would you approach your first 30 days in ${o}?`,source:"Fit",focus:[]},{text:i.years?`The listing asks for around ${i.years} years of experience - how does that compare with yours?`:"Where do you see yourself growing in the first year here?",source:"Fit",focus:[]}],m=n.flatMap(x=>{const $=String(x).toLowerCase();return[{text:`Walk me through a project where you used ${x}.`,source:"Skill",focus:[$]},{text:`What's the hardest problem you've solved with ${x}?`,source:"Skill",focus:[$]}]}),v=[{text:"Give me an example of a time things didn't go as planned - what did you do?",source:"Behavioural",focus:[]},{text:"Tell me about a time you had to convince someone with data or evidence.",source:"Behavioural",focus:[]},{text:"How do you stay organised when you have several tasks at once?",source:"Behavioural",focus:[]},{text:"Describe a mistake you made and what you learned from it.",source:"Behavioural",focus:[]},{text:"How do you handle feedback you don't agree with?",source:"Behavioural",focus:[]}],_=[{text:`What does a typical day look like in this ${o} role?`,focus:[]},{text:"What would success look like in the first 6 months?",focus:[]},{text:i.responsibilities.length?`How does the team handle ${r(i.responsibilities[0],80)} day to day?`:"How does the team make decisions and share feedback?",focus:[]},{text:i.keywords.length?`Which of these would I use most - ${i.keywords.slice(0,3).join(", ")}?`:"What tools does the team use most?",focus:i.keywords.slice(0,3)}];return{description:b,role:u,skills:m,behavioral:v,askThem:_}}_interviewNext(){const e=document.getElementById("iv-question");if(!e)return;this._interviewStopDictation(),this._interviewDelivery=null;const t=this._interviewQuestions||{description:[],role:[],skills:[],behavioral:[],askThem:[]},s=[];(t.description||[]).forEach(r=>s.push(r)),(t.skills||[]).forEach(r=>s.push(r)),(t.role||[]).forEach(r=>s.push(r)),(t.behavioral||[]).forEach(r=>s.push(r)),s.length||s.push({text:"Tell me about yourself.",source:"Opening",focus:[]});const i=s[Math.floor(Math.random()*s.length)];e.textContent=i.text;const o=document.getElementById("iv-source");o&&(o.textContent=i.source||"");const a=document.getElementById("iv-feedback");a&&(a.innerHTML="");const n=document.getElementById("iv-answer");this._interviewCurrentQuestion=i,this._interviewSetAnswerText(n?n.value:this._interviewLoad(i.text).answer,!1),this._interviewRenderMic()}_interviewTyped(){const e=document.getElementById("iv-answer");e&&this._interviewSetAnswerText(e.value)}_interviewAnswerKey(e){const t=e||this._interviewCurrentQuestion;return t?String(t.text||t).trim():""}_interviewSetAnswerText(e,t){const s=e==null?"":String(e),i=document.getElementById("iv-answer");if(i&&i.value!==s&&(i.value=s),this._interviewRenderTranscript(s),this._updateInterviewWordcount(s),t===!1)return;const o=this._interviewAnswerKey();if(this._interviewJobKey&&o)try{const a=this._interviewLoadAll();a[o]=s,localStorage.setItem(this._interviewJobKey,JSON.stringify(a))}catch(a){}}_interviewSpeechCtor(){const e=window.swapikiAudioEngine;return e&&typeof e.getSpeechRecognitionCtor=="function"?e.getSpeechRecognitionCtor():typeof window=="undefined"?null:window.SpeechRecognition||window.webkitSpeechRecognition||null}_interviewSpeechSupported(){return!!this._interviewSpeechCtor()}toggleInterviewMic(){const e=this._ivDictation;e&&e.active?this.stopInterviewMic():this.startInterviewMic()}startInterviewMic(){if(!this._interviewCurrentQuestion)return;if(!this._interviewSpeechSupported()){this._interviewRenderMic();const i=document.getElementById("iv-voice-unsupported");i&&i.classList.remove("hidden"),this.toggleInterviewType(!0);return}this._interviewStopDictation();const e=this._interviewCurrentQuestion,t=this._ivDictation={active:!0,question:e,base:(this._interviewLoad(e)||{}).answer||"",final:"",interim:"",startedAt:Date.now(),rec:null,error:null},s=document.getElementById("iv-feedback");s&&(s.innerHTML=""),this._interviewSpawnDictation(),this._interviewRenderMic()}_interviewSpawnDictation(){const e=this._ivDictation;if(!e||!e.active)return;const t=this._interviewSpeechCtor();if(!t){e.error="no-speech-api",e.active=!1,this._interviewFinishDictation();return}let s;try{s=new t}catch(i){e.error="construct-failed",e.active=!1,this._interviewFinishDictation();return}s.lang="en-IN",s.continuous=!0,s.interimResults=!0,s.maxAlternatives=1,s.onresult=i=>{if(this._ivDictation!==e)return;let o="";for(let a=i.resultIndex;a<i.results.length;a++){const n=i.results[a],r=n&&n[0],l=r&&r.transcript?r.transcript:"";n.isFinal?e.final+=(e.final&&!/\s$/.test(e.final)?" ":"")+l:o+=(o?" ":"")+l}e.interim=o,this._interviewRenderTranscript(e.final,e.interim),this._interviewRenderMic()},s.onerror=i=>{if(this._ivDictation===e){if(e.error=i&&i.error||"unknown",e.error==="no-speech"){this._interviewRenderMic();return}if(e.error==="not-allowed"||e.error==="service-not-allowed"||e.error==="audio-capture"){e.active=!1,e.rec===s&&(e.rec=null),this._interviewFinishDictation();return}this._interviewRenderMic()}},s.onend=()=>{if(this._ivDictation===e){if(e.rec=null,e.active){this._interviewSpawnDictation();return}this._interviewFinishDictation()}},e.rec=s;try{s.start()}catch(i){}}stopInterviewMic(){const e=this._ivDictation;if(e){if(e.active=!1,e.rec)try{e.rec.stop()}catch(t){this._interviewFinishDictation()}else this._interviewFinishDictation();this._interviewRenderMic()}}_interviewStopDictation(){const e=this._ivDictation;if(e&&(this._ivDictation=null,e.active=!1,e.rec))try{e.rec.abort()}catch(t){}}_interviewDictationText(e){return e?[e.final,e.interim].filter(Boolean).join(" ").replace(/\s+/g," ").trim():""}_interviewFinishDictation(){const e=this._ivDictation;if(!e)return;this._ivDictation===e&&(this._ivDictation=null);const t=this._interviewDictationText(e),s=[e.base,t].filter(Boolean).join(" ").replace(/\s+/g," ").trim(),i=(Date.now()-e.startedAt)/1e3;if(this._interviewSetAnswerText(s),this._interviewRenderMic(),!t){if(e.error){const o=document.getElementById("iv-voice-unsupported-title"),a=document.getElementById("iv-voice-unsupported-detail");o&&(o.textContent=this._interviewMicErrorTitle(e.error)),a&&(a.textContent=this._interviewMicErrorText(e.error));const n=document.getElementById("iv-voice-unsupported");n&&n.classList.remove("hidden"),this.toggleInterviewType(!0)}return}this._interviewDelivery={seconds:i,words:this._interviewWordCount(t)},this.checkInterviewAnswer()}_interviewMicErrorTitle(e){return e==="not-allowed"||e==="service-not-allowed"?"Microphone blocked":e==="audio-capture"?"No microphone found":e==="no-speech-api"||e==="construct-failed"?"This browser can't listen":"Listening stopped early"}_interviewMicErrorText(e){return e==="not-allowed"||e==="service-not-allowed"?"Allow the microphone in your browser and tap the mic again, or write the answer out below.":e==="audio-capture"?"Plug a microphone in and tap again, or write the answer out below.":e==="no-speech-api"||e==="construct-failed"?"Speech-to-text needs Chrome or Edge. You can still write the answer out below and check it the same way.":"Nothing was picked up. Tap the mic to try again, or write the answer out below."}_interviewWordCount(e){const t=String(e||"").trim();return t?t.split(/\s+/).length:0}_interviewRenderTranscript(e,t){const s=document.getElementById("iv-transcript-wrap"),i=document.getElementById("iv-transcript");if(!s||!i)return;const o=this._ivDictation;let a;if(e==null){const r=document.getElementById("iv-answer");a=r?r.value:""}else{a=[e,t].filter(Boolean).join(" ");const r=o?o.base:"";r&&(a=r+(a?" "+a:""))}const n=String(a||"").replace(/\s+/g," ").trim();i.textContent=n,n?s.classList.remove("hidden"):s.classList.add("hidden")}_interviewRenderMic(){const e=document.getElementById("iv-mic-label"),t=document.getElementById("iv-mic-status"),s=document.getElementById("iv-mic-icon"),i=document.getElementById("iv-mic"),o=this._ivDictation,a=!!(o&&o.active);if(i&&(i.classList.toggle("is-recording",a),i.classList.toggle("animate-pulse",a),i.classList.toggle("motion-reduce:animate-none",a),i.setAttribute("aria-label",a?"Stop recording":"Record your answer")),s&&(s.textContent=a?"stop_circle":"mic"),e&&(e.textContent=a?"Listening - tap to finish":"Tap to answer out loud"),t)if(a){const n=this._interviewWordCount(this._interviewDictationText(o)),r=Math.max(0,Math.round((Date.now()-o.startedAt)/1e3));t.textContent=n?"Listening - "+n+" words so far, "+r+"s":"Listening - start answering out loud",o.error&&o.error!=="no-speech"&&(t.textContent="Having trouble: "+this._interviewMicErrorText(o.error))}else t.textContent="Uses your microphone only. The audio never leaves this page.";return a}toggleInterviewType(e){const t=document.getElementById("iv-type-fallback"),s=document.getElementById("iv-type-toggle");if(!t)return;const i=e===!0?!0:t.classList.contains("hidden");if(i?t.classList.remove("hidden"):t.classList.add("hidden"),s&&(s.textContent=i?"Hide typing":"Type instead"),i){const o=document.getElementById("iv-answer");o&&typeof o.focus=="function"&&o.focus()}}_gradeSpokenDelivery(e,t){const s=[],i=this._interviewWordCount(e),o=Number(t)||0,n=String(e||"").toLowerCase().match(/\b(um+|uh+|erm|basically|actually|literally|like,|sort of|kind of|i guess|honestly speaking)\b/g)||[];let r=null;i>=45&&o>=20&&(r=Math.round(i/o*60),r>=195?s.push({ok:!1,label:"Rushed",hint:r+" words per minute. Interviewers read speed as nerves - aim for 130-160."}):r>=170?s.push({ok:!1,label:"A bit fast",hint:r+" words per minute. Try to land nearer 150."}):r<90?s.push({ok:!1,label:"Slow",hint:r+" words per minute. Long pauses read as uncertainty - keep the story moving."}):s.push({ok:!0,label:"Good pace",hint:r+" words per minute - about right for an interview answer."}));const l=n.filter(p=>!/^(like,|sort of|kind of)$/.test(p));return l.length?s.push({ok:!1,label:"Filler words out loud",hint:'Heard "'+l.slice(0,3).join('", "')+'" '+l.length+" time"+(l.length===1?"":"s")+". Pause silently instead."}):i>=45&&s.push({ok:!0,label:"Clean delivery",hint:"No filler words in what you said."}),s.length||s.push({ok:!0,label:"Spoken answer captured",hint:i+" words heard. Answer it again for longer to be graded on pace."}),{checks:s,wpm:r,words:i,seconds:Math.round(o)}}_interviewLoadAll(){try{return JSON.parse(localStorage.getItem(this._interviewJobKey)||"{}")}catch(e){return{}}}_interviewLoad(e){const t=this._interviewLoadAll(),s=this._interviewAnswerKey(e);return{answer:s&&t[s]||""}}_updateInterviewWordcount(e){const t=document.getElementById("iv-wordcount");if(!t)return;const s=this._interviewWordCount(e);t.textContent=s?`${s} words`:"Tap the mic to answer"}clearInterviewAnswer(){this._interviewStopDictation(),this._interviewDelivery=null;const e=document.getElementById("iv-answer");this._interviewSetAnswerText("");const t=this._interviewAnswerKey();if(this._interviewJobKey&&t)try{const i=this._interviewLoadAll();delete i[t],localStorage.setItem(this._interviewJobKey,JSON.stringify(i))}catch(i){}const s=document.getElementById("iv-feedback");s&&(s.innerHTML=""),this._interviewRenderMic()}copyInterviewAnswer(){const e=document.getElementById("iv-answer");if(!e||!e.value.trim()){this.showToast("Write a draft answer first.");return}if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(e.value).then(()=>this.showToast("Answer draft copied."));else{const t=document.createElement("textarea");t.value=e.value,document.body.appendChild(t),t.select(),document.execCommand("copy"),document.body.removeChild(t),this.showToast("Answer draft copied.")}}checkInterviewAnswer(){const e=document.getElementById("iv-answer"),t=document.getElementById("iv-feedback"),s=this._interviewCurrentQuestion;if(!e)return;if(!e.value.trim()){this.showToast("Answer out loud first, then check it.");return}if(!t)return;const i=e.value.trim(),o=this._gradeAnswer(i,s),a=this._modelAnswer(s),n=this._interviewDelivery?this._gradeSpokenDelivery(i,this._interviewDelivery.seconds):null,r=o.score>=75?"bg-emerald-500":o.score>=50?"bg-amber-500":"bg-rose-500",l=o.score>=75?"text-emerald-700":o.score>=50?"text-amber-700":"text-rose-700",p=o.score>=75?"bg-emerald-50":o.score>=50?"bg-amber-50":"bg-rose-50";t.innerHTML=`
      ${n?`
      <div class="rounded-xl border border-slate-200 overflow-hidden mb-3">
        <div class="px-3.5 py-3 bg-slate-900 border-b border-slate-800">
          <p class="text-[13px] font-bold text-white">How you said it</p>
          <p class="text-[11px] text-slate-300 mt-0.5">${n.words} words over ${n.seconds}s${n.wpm?" - "+n.wpm+" words per minute":""}. This part is only visible when you answer out loud.</p>
        </div>
        <ul class="p-3 space-y-1.5 bg-white">
          ${n.checks.map(d=>`
            <li class="text-[12px] leading-relaxed flex gap-2">
              <span class="material-symbols-outlined text-sm ${d.ok?"text-emerald-600":"text-rose-500"} shrink-0">${d.ok?"check_circle":"cancel"}</span>
              <span class="${d.ok?"text-slate-600":"text-slate-800"}"><strong class="font-bold">${this.escapeHtml(d.label)}</strong> - ${this.escapeHtml(d.hint)}</span>
            </li>`).join("")}
        </ul>
      </div>`:""}
      <div class="rounded-xl border border-slate-200 overflow-hidden">
        <div class="${p} px-3.5 py-3 border-b border-slate-200">
          <div class="flex items-center justify-between gap-3 mb-1.5">
            <span class="text-[13px] font-bold ${l}">${o.verdict}</span>
            <span class="text-[13px] font-bold ${l}">${o.score}/100</span>
          </div>
          <div class="h-1.5 rounded-full bg-white/70 overflow-hidden">
            <div class="h-full ${r} rounded-full" style="width:${o.score}%"></div>
          </div>
          <p class="text-[11px] text-slate-600 mt-1.5">${o.summary}</p>
        </div>
        <ul class="p-3 space-y-1.5 bg-white">
          ${o.checks.map(d=>`
            <li class="text-[12px] leading-relaxed flex gap-2">
              <span class="material-symbols-outlined text-sm ${d.ok?"text-emerald-600":"text-rose-500"} shrink-0">${d.ok?"check_circle":"cancel"}</span>
              <span class="${d.ok?"text-slate-600":"text-slate-800"}"><strong class="font-bold">${this.escapeHtml(d.label)}</strong> - ${this.escapeHtml(d.hint)}</span>
            </li>`).join("")}
        </ul>
        <div class="p-3.5 border-t border-slate-200 bg-slate-50">
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <p class="text-[11px] font-bold uppercase tracking-wide text-primary">${o.score>=75?"Tighten it like this":"A strong answer looks like this"}</p>
            <button onclick="app.copyModelAnswer()" class="text-[11px] font-bold text-primary border border-primary/30 rounded-lg px-2.5 py-1 hover:bg-primary/5 whitespace-nowrap">Copy model</button>
          </div>
          <p class="text-[10px] text-slate-400 mb-2">Built from your own proof profile - swap anything in [brackets] for your real detail.</p>
          <div class="text-[12px] text-slate-700 leading-relaxed bg-white border border-slate-200 rounded-lg p-3 whitespace-pre-line">${this.escapeHtml(a)}</div>
          <p class="text-[11px] font-bold text-slate-700 mt-2.5 mb-1">Structure to remember: STAR</p>
          <ul class="text-[11px] text-slate-600 space-y-0.5">
            <li><strong>S</strong>ituation - the one line of context</li>
            <li><strong>T</strong>ask - what you were responsible for</li>
            <li><strong>A</strong>ction - what you personally did, first person</li>
            <li><strong>R</strong>esult - the number or outcome that proves it</li>
          </ul>
        </div>
      </div>`,t.scrollIntoView({block:"nearest",behavior:"smooth"})}_gradeAnswer(e,t){const s=String(e||""),i=s.toLowerCase(),o=s.trim()?s.trim().split(/\s+/).length:0,a=[];let n=0,r=o>=45&&o<=180;r||(r=o>=30&&o<=220),r?(n+=20,a.push({ok:!0,label:"Right length",hint:o+" words - about a minute spoken."})):o<30?(n+=5,a.push({ok:!1,label:"Too short",hint:"Only "+o+" words. Give context, what you did and the outcome (45-180 words)."})):(n+=10,a.push({ok:!1,label:"Too long",hint:o+" words. Cut to the first 180 - the interviewer stops listening after two minutes."}));const l=/(at |when |while |during |the (context|situation|team|company|project) |i was |we were |our |my )/i.test(s),p=/(responsible for|my role|was asked|had to|needed to|my job was|assigned|owned|objective|goal was|expected)/i.test(s),d=/(i |we )?(built|developed|designed|led|managed|owned|drove|shipped|launched|migrated|automated|implemented|analysed|analyzed|improved|reduced|increased|scaled|set up|created|reviewed|coordinated|partnered|mentored|troubleshoot)/i.test(s),h=/(so that|result|resulting|which (led|meant|reduced|improved)|impact|outcome|therefore|after that|cut |saved |grew|reached)/i.test(s),b=[l,p,d,h].filter(Boolean).length;if(n+=Math.round(b*6),b===4)a.push({ok:!0,label:"Full STAR structure",hint:"Situation, task, action and result are all there."});else{const w=[];l||w.push("the situation"),p||w.push("what you were responsible for"),d||w.push("what you personally did"),h||w.push("the result"),a.push({ok:!1,label:"Structure",hint:"Missing "+w.join(", ")+". Run it as STAR."})}/\b(i|i'm|i've|my|me|we|our)\b/i.test(s)?(n+=15,a.push({ok:!0,label:"Takes ownership",hint:'Uses "I" - you are claiming the work, not describing a team.'})):a.push({ok:!1,label:"Takes ownership",hint:'No "I" in the answer. Say what YOU did, not just what the team did.'});const m=/\b\d+(\.\d+)?\s*(%|percent|x|hrs?|hours?|days?|weeks?|months?|users?|clients?|records|requests|qps|lakh|crore|k|m)?\b/i.test(s),v=/(reduced|increased|cut|saved|grew|improved|scaled|dropped|raised|accelerated|shortened|doubled|halved|onboarded|converted|closed|shipped|delivered)\b/i.test(s);m||v?(n+=20,a.push({ok:!0,label:"Shows proof",hint:"Contains a measurable outcome - this is the part interviewers remember."})):a.push({ok:!1,label:"No proof yet",hint:'No number or measurable outcome. Add one, e.g. "cut build time by 40%" or "onboarded 12 users".'});const _=(t&&Array.isArray(t.focus)?t.focus:[]).filter(Boolean).map(w=>String(w).toLowerCase()),x=_.filter(w=>i.indexOf(w)!==-1);_.length?x.length?(n+=20,a.push({ok:!0,label:"On topic",hint:"Mentions "+x.join(", ")+" - exactly what this question is about."})):a.push({ok:!1,label:"Off topic",hint:"This question is about "+_.join(", ")+" and your answer never says it. Name it explicitly."}):(n+=20,a.push({ok:!0,label:"On topic",hint:"Open question - no specific keyword to hit. Keep it about you and this role."}));const $=i.match(/\b(um+|uh+|erm|basically|actually|literally|like,|sort of|kind of|i guess|i think maybe|honestly speaking)\b/g);$&&$.length?(n-=Math.min(10,$.length*3),a.push({ok:!1,label:"Filler words",hint:'Found "'+$.slice(0,3).join('", "')+'" - pause silently instead.'})):(n+=5,a.push({ok:!0,label:"Clean delivery",hint:"No filler words."})),/(\b[A-Z][a-z]+\b|\bv?\d|\b(api|sql|dashboard|funnel|release|repo|stack|pipeline|dataset|client|customer|stakeholder|team)\b)/.test(s)?(n+=5,a.push({ok:!0,label:"Specific details",hint:"Names real things - that is what makes a story credible."})):a.push({ok:!1,label:"Too generic",hint:"Name the actual project, tool, client or team you are describing."}),n=Math.max(0,Math.min(100,n));const g=n>=75?"Strong answer - interview ready":n>=50?"Almost there - fix the gaps below":"Not interview ready yet",y=n>=75?"This has the shape of an answer a hiring manager will believe.":"Interviewers score structure, ownership and proof. Fix the red items and say it out loud.";return{score:n,verdict:g,summary:y,checks:a,words:o}}_modelAnswer(e){const t=swapikiStore.getProfile()||{},s=Array.isArray(t.projects)?t.projects:[],i=this._interviewJob||Array.isArray(this._jobsCache)&&this._jobsCache.find(c=>c.id===this._interviewJobId)||null,o=i&&i.title?i.title:"this role",a=i&&i.company?i.company:"the company",n=(e&&Array.isArray(e.focus)?e.focus:[]).map(c=>String(c).toLowerCase()),r=window.swapikiGitHub?window.swapikiGitHub.buildJobContext(i||{}):{terms:[]},l=this._ghRanked?this._ghRanked():[],p=this._ghHydrateStory?this._ghHydrateStory():this._interviewStory||"",d=l.find(c=>c.matched&&c.matched.length)||null,h=p?l.find(c=>c.name===p):d,b=c=>n.reduce((k,S)=>k+(c.indexOf(S)!==-1?2:0),0)+Math.min(c.length,400)/400;let u=null,m=0;if(s.forEach(c=>{const k=[c.title,c.role,c.description,(c.tags||[]).join(" "),(c.skills||[]).join(" ")].join(" ").toLowerCase(),S=b(k);S>m&&(m=S,u={kind:"project",data:c})}),h){const c=[h.name,h.repo.description,h.language,(h.repo.topics||[]).join(" ")].join(" ").toLowerCase(),k=b(c)+h.score/100+(p?1.5:0);k>m&&(m=k,u={kind:"repo",data:h})}const v=u&&u.kind==="project"?u.data:null,_=u&&u.kind==="repo"?u.data:null,x=_?this._ghNotes(_.name):{},$=String(x.problem||"").trim(),E=String(x.role||"").trim(),g=String(x.result||"").trim(),y=e&&e.text?e.text:"this question",w=[];if(w.push("SITUATION"),_){const c=_.repo||{},k=c.description?String(c.description).replace(/\s+/g," ").replace(/[.!?]+$/,""):"";w.push('"'+(a!=="the company"?"At "+a+" ":"")+"I built "+_.name+(_.language?" - a "+_.language+" project":"")+(k?": "+k:"")+". The problem it solved was "+($||"[the one-line problem - name it]")+".")}else v?w.push('"'+(a!=="the company"?"At "+a+" ":"")+"I worked on "+(v.title||"a project")+(v.role?" as a "+v.role:"")+". The problem we needed to solve was [the one-line problem - name it]."):w.push('"The context is [where and when]. Something needed to change: [the problem in one line].');w.push(""),w.push("TASK"),_?w.push(E?"My role: "+E+".":"I owned "+(n[0]?n[0]+" work":"the build")+" end to end in "+_.name+" - [the outcome you were responsible for, and any constraint you had]."):v?w.push("I was responsible for [the outcome you owned], working with [who], and I had to do it within [constraint]."):w.push("I owned [the outcome], which meant [the scope you personally carried]."),w.push(""),w.push("ACTION");const f=(v&&Array.isArray(v.takeaways)?v.takeaways:[]).filter(c=>c);if(_){const c=String(x.hard||"").trim(),k=String(x.stack||"").trim();w.push("- What it is: "+(_.repo&&_.repo.description||_.name)+"."),k?w.push("- Tech and why: "+k+"."):w.push("- Stack: "+(_.language||"the languages you used")+(_.matchedSkills&&_.matchedSkills.length?", chosen for "+_.matchedSkills.join(", "):"")+" - [why you chose it and what you gave up]."),w.push("- The hard part: "+(c||"[the one problem that took real effort - performance, scale, a nasty bug].")),w.push("- How you checked it worked: [tests, benchmarks, users, monitoring].")}else f.length?(f.slice(0,3).forEach(c=>w.push("- "+c)),(!n.length||n.some(c=>f.join(" ").toLowerCase().indexOf(c)===-1))&&w.push("- I also made sure "+(n[0]||"the key skill here")+" was part of how I did it, because that is what the job asks for.")):(w.push("- I "+(n[0]?"used "+n[0]+" to ":"")+"[what you personally did - step one]."),w.push("- [step two - the hard part, and how you decided]."),w.push("- [step three - how you checked it worked]."));return w.push(""),w.push("RESULT"),g?w.push("The outcome: "+g+". For "+o+" at "+a+" specifically, that is the same kind of problem you are hiring to solve."):w.push("The outcome was [the number - e.g. cut X by 40%, shipped Y to Z users, won the deal]. After that, [what changed because of you]. For "+o+" at "+a+" specifically, this is the same problem you are hiring to solve."),"Q: "+y+`

`+w.join(`
`)}copyModelAnswer(){const e=this._interviewCurrentQuestion,t=this._modelAnswer(e);if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(()=>this.showToast("Model answer copied."));else{const s=document.createElement("textarea");s.value=t,document.body.appendChild(s),s.select(),document.execCommand("copy"),document.body.removeChild(s),this.showToast("Model answer copied.")}}copyInterviewQuestions(){const e=this._interviewQuestions||{description:[],role:[],skills:[],behavioral:[],askThem:[]},t=o=>(o||[]).map((a,n)=>`${n+1}. ${typeof a=="string"?a:a.text}`),i=["STRAIGHT FROM THIS JOB DESCRIPTION",...t(e.description),"","ABOUT THIS ROLE",...t(e.role),"",e.skills&&e.skills.length?"BUILT ON THE LISTED SKILLS":null,...e.skills&&e.skills.length?t(e.skills):[],"","BEHAVIOURAL",...t(e.behavioral),"","QUESTIONS TO ASK THEM",...t(e.askThem)].filter(o=>o!==null).join(`
`).replace(/\n{3,}/g,`

`).trim();if(i)if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(i).then(()=>this.showToast("Question bank copied."));else{const o=document.createElement("textarea");o.value=i,document.body.appendChild(o),o.select(),document.execCommand("copy"),document.body.removeChild(o),this.showToast("Question bank copied.")}}_ghStateKey(){return"swapiki_github_state"}_ghLoad(){try{return JSON.parse(localStorage.getItem(this._ghStateKey())||"{}")}catch(e){return{}}}_ghSave(e){const t=Object.assign(this._ghLoad(),e||{});try{localStorage.setItem(this._ghStateKey(),JSON.stringify(t))}catch(s){}return this._gh=t,t}_ghClientId(){return(window.SWAPIKI_CONFIG||{}).GITHUB_CLIENT_ID||""}async ghConnect(){const e=this._ghClientId();if(!e){this.ghFocusLink();return}const t=document.getElementById("gh-connect-box");t&&(t.innerHTML='<p class="text-[12px] text-slate-500">Starting GitHub sign-in...</p>');try{const i=await(await fetch("https://github.com/login/device/code",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({client_id:e,scope:"read:user public_repo"})})).json();if(i.error||!i.device_code)throw new Error(i.error_description||i.error||"GitHub did not start the sign-in.");this._ghDevice=i,this._ghRenderDevice();try{window.open(i.verification_uri,"_blank","noopener")}catch(o){}}catch(s){this.ghError("Could not start GitHub sign-in ("+(s&&s.message||"network error")+"). You can still paste your GitHub link below."),this.ghFocusLink()}}_ghRenderDevice(){const e=document.getElementById("gh-connect-box");e&&(e.innerHTML=this._ghDeviceBoxHtml())}_ghDeviceBoxHtml(){const e=this._ghDevice;return e?`
      <div class="rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
        <p class="text-[12px] text-slate-600 mb-2">Enter this code on GitHub, then come back here.</p>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xl font-bold tracking-widest text-primary">${this.escapeHtml(e.user_code||"")}</span>
          <button onclick="app._ghCopyCode()" class="text-[11px] font-bold text-primary border border-primary/30 rounded-lg px-2.5 py-1 hover:bg-primary/5">Copy</button>
          <a href="${this.escapeHtml(e.verification_uri||"https://github.com/login/device")}" target="_blank" rel="noopener" class="text-[11px] font-bold text-primary underline">Open github.com/login/device</a>
        </div>
        <div class="flex items-center gap-2 mt-3">
          <button onclick="app._ghPollDevice()" class="px-3.5 py-2 bg-primary text-white text-[12px] font-bold rounded-lg hover:bg-primary/90">I have entered it</button>
          <button onclick="app._ghCancelDevice()" class="text-[12px] font-bold text-slate-400 hover:text-slate-700">Cancel</button>
        </div>
      </div>`:""}_ghCopyCode(){const e=this._ghDevice&&this._ghDevice.user_code;e&&navigator.clipboard&&navigator.clipboard.writeText&&navigator.clipboard.writeText(e).then(()=>this.showToast("Code copied."))}async _ghPollDevice(){const e=this._ghDevice;if(e)try{const s=await(await fetch("https://github.com/login/oauth/access_token",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({client_id:this._ghClientId(),device_code:e.device_code,grant_type:"urn:ietf:params:oauth:grant-type:device_code"})})).json();if(s.error==="authorization_pending"){this.showToast("Not yet - approve it on GitHub, then check again.");return}if(s.error==="slow_down"){this.showToast("Slow down a moment, then check again.");return}if(s.error||!s.access_token){this.ghError("GitHub sign-in "+(s.error||"failed")+(s.error_description?" - "+s.error_description:"")+".");return}this._ghSave({token:s.access_token}),this._ghDevice=null,this.showToast("GitHub connected. Reading your repos..."),await this.ghFetchRepos(!0)}catch(t){this.ghError("Could not finish GitHub sign-in. Paste your GitHub link below instead."),this.ghFocusLink()}}_ghCancelDevice(){this._ghDevice=null,this.renderGitHubPicker()}_ghParseUsername(e){let t=String(e==null?"":e).trim();if(!t)return"";if(t=t.replace(/^[a-z][a-z0-9+.-]*:\/\//i,"").replace(/^www\./i,""),/^github\.com(\/|$)/i.test(t))t=t.replace(/^github\.com/i,"");else if(/[/:]/.test(t))return"";return t=t.split(/[?#]/)[0].replace(/^\/+/,"").split("/")[0].split("@").pop(),t=t.replace(/[\s.]+$/,""),/^[A-Za-z0-9-]{1,39}$/.test(t)?t:""}async ghConnectFromLink(){const e=document.getElementById("gh-link"),t=this._ghParseUsername(e&&e.value);if(!t){this.ghError("That does not look like a GitHub link. It should look like github.com/yourname.");return}this._ghSave({username:t,token:""}),await this.ghFetchRepos(!0)}async ghFetchRepos(e){const t=this._ghLoad(),s=20*60*1e3;if(!e&&t.repos&&t.fetchedAt&&Date.now()-t.fetchedAt<s){this._gh=t,this.renderGitHubPicker();return}this.ghBusy("Reading your GitHub repos...");try{let i;if(t.token)i="https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner";else if(t.username)i="https://api.github.com/users/"+encodeURIComponent(t.username)+"/repos?per_page=100&sort=updated&type=owner";else{this.renderGitHubPicker();return}const o={Accept:"application/vnd.github+json"};t.token&&(o.Authorization="Bearer "+t.token);const a=await fetch(i,{headers:o});if(a.status===401){this.ghError("GitHub rejected the sign-in. Disconnect and connect again.");return}if(a.status===403){this.ghError("GitHub rate limit hit. Wait a few minutes and press Refresh.");return}if(!a.ok){this.ghError("GitHub returned "+a.status+". Try again in a moment.");return}const n=await a.json();let r=t.username||"";if(t.token)try{const p=await fetch("https://api.github.com/user",{headers:o});p.ok&&(r=(await p.json()).login||r)}catch(p){}const l=(Array.isArray(n)?n:[]).map(p=>({name:p.name,description:p.description||"",language:p.language||"",topics:Array.isArray(p.topics)?p.topics:[],stargazers_count:p.stargazers_count||0,fork:!!p.fork,archived:!!p.archived,size:p.size||0,pushed_at:p.pushed_at,html_url:p.html_url}));this._ghSave({repos:l,fetchedAt:Date.now(),login:r,error:""}),this.showToast(l.length+" repos matched against this job.")}catch(i){this.ghError("Could not reach GitHub. Check your connection and try again.")}}ghDisconnect(){this._ghSave({token:"",username:"",repos:[],fetchedAt:0,login:"",error:""}),this._gh={},this.showToast("GitHub disconnected."),this.renderGitHubPicker()}ghBusy(e){const t=document.getElementById("gh-connect-status");t&&(t.textContent=e||"",t.classList.toggle("hidden",!e))}ghError(e){this._ghSave({error:e}),this.renderGitHubPicker(),this.ghFocusLink()}ghFocusLink(){const e=document.getElementById("gh-link");if(e)try{e.focus()}catch(t){}}_ghReason(e){return e?e.matchedSkills&&e.matchedSkills.length?"Ranks here because it uses "+e.matchedSkills.slice(0,3).join(", ")+", which this listing asks for. "+(e.score>=75?"Strong match - lead with it.":"Worth mentioning."):e.matched&&e.matched.length?"No required skill overlap, but it touches "+e.matched.slice(0,3).join(", ")+" from the description.":"Nothing in the listing matches this one - only pick it if you have a strong story for it.":""}_ghNotesKey(e){return"swapiki_repo_notes_"+String(e||"x")}_ghNoteFields(){return window.swapikiGitHub&&window.swapikiGitHub.NOTE_FIELDS||[]}_ghNoteEnvelope(e){let t={};try{t=JSON.parse(localStorage.getItem(this._ghNotesKey(e))||"{}")||{}}catch(s){}return!t||typeof t!="object"?{n:{},u:0,s:!1}:t.n&&typeof t.n=="object"?{n:t.n,u:Number(t.u)||0,s:!!t.s}:{n:t,u:0,s:!1}}_ghNotes(e){const t=this._ghNoteEnvelope(e).n,s={};return this._ghNoteFields().forEach(i=>{const o=String(t[i.key]||"").trim();o&&(s[i.key]=o)}),s}_ghWriteNotes(e,t,s,i){const o={n:t||{},u:typeof i=="number"?i:Date.now(),s:!!s};try{localStorage.setItem(this._ghNotesKey(e),JSON.stringify(o))}catch(n){}let a=[];try{a=JSON.parse(localStorage.getItem("swapiki_repo_notes_index")||"[]")||[]}catch(n){}if(a.indexOf(e)===-1){a.push(e);try{localStorage.setItem("swapiki_repo_notes_index",JSON.stringify(a))}catch(n){}}return o}_ghNotesCloudState(){return!this.isAuthenticated()||swapikiStore._repoNotesUnavailable?"device":"account"}_ghNoteWhereText(e){return e===!0?"Saved to your account. Here on every device you sign in on.":this.isAuthenticated()?"Saved on this device only - the account copy is not reachable right now.":"Saved on this device. Sign in to keep it on all your devices."}async _ghSyncNotes(e){if(this._ghNotesCloudState()!=="account"||typeof swapikiStore.saveRepoNote!="function")return!1;const t=this._ghNoteEnvelope(e).u,s=this._ghNotes(e),i=await swapikiStore.saveRepoNote(e,s);return this._ghWriteNotes(e,s,i,i?Date.now():t),i}_ghNoteSyncLabel(e){const t=document.getElementById("gh-note-where");t&&(t.textContent=this._ghNoteWhereText(e))}async _ghFlushNotes(){if(this._ghNotesCloudState()!=="account")return 0;let e=[];try{e=JSON.parse(localStorage.getItem("swapiki_repo_notes_index")||"[]")||[]}catch(s){}let t=0;for(const s of e){const i=this._ghNoteEnvelope(s);i.s||!Object.keys(i.n).length||await this._ghSyncNotes(s)&&t++}return t}async _ghHydrateNotes(){if(this._ghNotesCloudState()!=="account"||typeof swapikiStore.fetchRepoNotes!="function")return 0;const e=await swapikiStore.fetchRepoNotes();let t=0;return Object.keys(e||{}).forEach(s=>{const i=e[s]||{},o=this._ghNoteEnvelope(s),a=Date.parse(i.updatedAt||"")||0,n=Object.keys(o.n).length;if(n&&o.u>a){this._ghWriteNotes(s,o.n,!1,o.u);return}n&&o.u===a&&o.s||(this._ghWriteNotes(s,i.notes||{},!0,a||Date.now()),Object.keys(i.notes||{}).length&&t++)}),t+await this._ghFlushNotes()}_ghNoteCount(){const e=document.getElementById("gh-note-count");if(!e)return;const t=window.swapikiGitHub&&window.swapikiGitHub.NOTE_FIELDS||[];let s=0;t.forEach(i=>{const o=document.getElementById("gh-note-"+i.key);o&&String(o.value||"").trim()&&s++}),e.textContent=s+" of "+t.length+" filled in",e.className="text-[10px] font-bold shrink-0 "+(s===t.length?"text-emerald-700":"text-primary")}async _ghSaveNotes(e,t){const s=t||{},i=document.activeElement&&document.activeElement.id||"",o=this._ghNoteFields(),a={};o.forEach(d=>{const h=document.getElementById("gh-note-"+d.key),b=h?String(h.value||"").replace(/\s+/g," ").trim().slice(0,400):"";b&&(a[d.key]=b)}),this._ghWriteNotes(e,a,!1);const n=window.swapikiGitHub.blankFields(a);this._ghNoteOpen=s.close?"":e,this.renderGitHubPicker();const r=document.getElementById("iv-feedback");r&&(r.innerHTML="");const l=document.getElementById("gh-note-saved");if(l&&(l.textContent=n.length?"Saved. Still worth adding: "+n.map(d=>d.label.toLowerCase()).join(", ")+".":"Saved - your 60-second answer is complete.",l.classList.remove("hidden")),s.close){const d=await this._ghSyncNotes(e);this.showToast(d?n.length?"Saved to your account.":"Saved to your account - your 60-second answer is complete.":n.length?"Saved on this device. Still worth adding: "+n.map(h=>h.label.toLowerCase()).join(", ")+".":"Saved on this device - your 60-second answer is complete.");return}const p=(i?document.getElementById(i):null)||(n.length?document.getElementById("gh-note-"+n[0].key):null);if(p)try{p.focus()}catch(d){}this.showToast(n.length?"Saved.":"Saved - your 60-second answer is complete."),this._ghSyncNotes(e).then(d=>this._ghNoteSyncLabel(d)).catch(()=>{})}_ghNoteFormHtml(e){const t=this._ghNotes(e.name),s=(window.swapikiGitHub&&window.swapikiGitHub.NOTE_FIELDS||[]).map(r=>{const l=r.key==="result"?"e.g. cut checkout time from 2.8s to 1.6s":r.key==="role"?"e.g. I owned the front end end to end":r.key==="problem"?"e.g. checkout drop-off was costing us sales":r.key==="hard"?"e.g. keeping cart state consistent across tabs":"e.g. why that stack, and what you gave up for it";return`
        <label class="block">
          <span class="text-[10px] font-bold uppercase tracking-wide text-slate-500">${this.escapeHtml(r.label)}</span>
          <input id="gh-note-${r.key}" type="text" value="${this.escapeHtml(t[r.key]||"")}" placeholder="${this.escapeHtml(l)}"
            oninput="app._ghNoteCount()"
            class="mt-1 w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-[12px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all" />
        </label>`}).join(""),i=(window.swapikiGitHub.NOTE_FIELDS||[]).length-window.swapikiGitHub.blankFields(t).length,o=(window.swapikiGitHub.NOTE_FIELDS||[]).length,a=this.escapeHtml(e.name).replace(/[^A-Za-z0-9._-]/g,""),n=this._ghNoteJustOpened===e.name;return this._ghNoteJustOpened="",`
      <div class="mt-3 rounded-xl border border-primary/25 bg-primary/[0.03] p-4"
        onkeydown="if (event.key === 'Enter') { event.preventDefault(); app._ghSaveNotes('${a}') }">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[13px] font-bold text-slate-900">What did you actually do in ${this.escapeHtml(e.name)}?</p>
            <p class="text-[11px] text-slate-500 mt-0.5">GitHub cannot know this, and it is exactly what interviewers ask about. Fill it in once and every answer and pitch uses it.</p>
            ${n?'<p class="text-[11px] font-bold text-primary mt-1.5">This project now leads your interview answers.</p>':""}
          </div>
          <span class="text-[10px] font-bold text-primary shrink-0" id="gh-note-count">${i} of ${o} filled in</span>
        </div>
        <div class="grid sm:grid-cols-2 gap-3 mt-3">${s}</div>
        <div class="flex items-center gap-2 mt-3.5">
          <button onclick="app._ghSaveNotes('${a}')" class="px-4 py-2.5 bg-primary text-white text-[12px] font-bold rounded-lg hover:bg-primary/90">Save my details</button>
          <button onclick="app._ghNoteDone('${a}')" class="px-3.5 py-2.5 border border-slate-200 bg-white text-[12px] font-bold text-slate-600 rounded-lg hover:border-slate-300">Done</button>
          <span id="gh-note-where" class="text-[11px] text-slate-400 ml-auto text-right">${this._ghNoteWhereText(this._ghNoteEnvelope(e.name).s)}</span>
        </div>
        <p class="text-[11px] text-slate-500 mt-2.5 hidden" id="gh-note-saved"></p>
        <p class="text-[10px] text-slate-400 mt-1.5">Enter saves from any box. Save keeps the form open so you can carry on; Done saves and closes it.</p>
        <p class="text-[10px] text-slate-400 mt-2.5">
          <button onclick="app._ghClearNotes('${a}')" class="underline hover:text-slate-600">Forget these details</button>
          <span class="ml-1">Deletes them from your account and this device.</span>
        </p>
      </div>`}async _ghClearNotes(e){const t=String(e||"").trim();if(t){try{localStorage.removeItem(this._ghNotesKey(t))}catch(s){}try{const i=(JSON.parse(localStorage.getItem("swapiki_repo_notes_index")||"[]")||[]).filter(o=>o!==t);localStorage.setItem("swapiki_repo_notes_index",JSON.stringify(i))}catch(s){}if(this._ghNoteOpen="",this._ghNoteJustOpened="",this.renderGitHubPicker(),this.showToast("Details for "+t+" deleted."),this._ghNotesCloudState()==="account"&&typeof swapikiStore.deleteRepoNote=="function")try{await swapikiStore.deleteRepoNote(t)}catch(s){}}}_ghNoteDone(e){if(this._ghNoteOpen===e){this._ghSaveNotes(e,{close:!0});return}this._ghNoteOpen="",this.renderGitHubPicker()}toggleRepoNotes(e){if(!this._ghRanked().find(o=>o.name===e)){this.showToast("Could not find that project.");return}if(this._ghNoteOpen===e){this._ghNoteDone(e);return}const s=this._ghHydrateStory()!==e;if(s){this._interviewStory=e;try{localStorage.setItem("swapiki_interview_story_"+(this._interviewJobId||"x"),e)}catch(o){}}this._ghNoteOpen=e,this._ghNoteJustOpened=s?e:"",this.renderGitHubPicker();const i=document.getElementById("gh-note-problem");if(i)try{i.focus()}catch(o){}}copyRepoPitch(e){const t=this._interviewGhContext(),s=this._ghRanked().find(o=>o.name===e);if(!s){this.showToast("Could not find that project.");return}const i=window.swapikiGitHub.buildRepoPitch(s,t,this._ghNotes(s.name));if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(i).then(()=>this.showToast("Pitch copied for "+s.name+"."));else{const o=document.createElement("textarea");o.value=i,document.body.appendChild(o),o.select(),document.execCommand("copy"),document.body.removeChild(o),this.showToast("Pitch copied for "+s.name+".")}}useRepoStory(e){const t=this._ghRanked().find(o=>o.name===e);if(!t){this.showToast("Could not find that project.");return}const s=this._ghHydrateStory()!==e;this._interviewStory=t.name;try{localStorage.setItem("swapiki_interview_story_"+(this._interviewJobId||"x"),t.name)}catch(o){}this._ghNoteOpen="",s&&this.showToast("Your answers will now lead with "+t.name+"."),this.renderGitHubPicker();const i=document.getElementById("iv-feedback");i&&(i.innerHTML="")}_ghRanked(){const e=this._ghLoad();if(!e.repos||!e.repos.length||!window.swapikiGitHub)return[];const t=this._interviewJob||{},s=window.swapikiGitHub.rankRepos(e.repos,window.swapikiGitHub.buildJobContext(t));return this._ghRankResult=s,s.ranked}_interviewGhContext(){return(!this._interviewGhCtx||this._interviewGhCtxJob!==(this._interviewJob&&this._interviewJob.id))&&(this._interviewGhCtx=window.swapikiGitHub.buildJobContext(this._interviewJob||{}),this._interviewGhCtxJob=this._interviewJob&&this._interviewJob.id),this._interviewGhCtx}_ghHydrateStory(){const e="swapiki_interview_story_"+(this._interviewJobId||"x");if(this._ghStoryKey!==e&&(this._ghStoryKey=e,this._interviewStory=""),!this._interviewStory)try{this._interviewStory=localStorage.getItem(e)||""}catch(t){}if(this._interviewStory&&this._ghRanked){const t=this._ghRanked();if(t.length&&!t.some(s=>s.name===this._interviewStory)){this._interviewStory="";try{localStorage.removeItem(e)}catch(s){}}}return this._interviewStory}_ghOrdered(){const e=this._ghRanked().slice(),t=["match","recent","stars"].indexOf(this._ghSort)!==-1?this._ghSort:"match";return t==="recent"?e.sort((s,i)=>String((i.repo||{}).pushed_at||"").localeCompare(String((s.repo||{}).pushed_at||""))):t==="stars"&&e.sort((s,i)=>(i.stars||0)-(s.stars||0)),e.forEach((s,i)=>{s.rank=i+1}),{sort:t,ordered:e}}renderGitHubPicker(){const e=document.getElementById("gh-picker");if(!e)return;if(!window.swapikiGitHub){e.innerHTML='<p class="text-[12px] text-slate-500">Loading GitHub project matching...</p>';return}const t=this._ghLoad(),s=!!this._ghClientId(),i=t.repos?this._ghRanked():[],o=this._ghRankResult||{hidden:0,total:0},a=this._ghShowAll===!0,n=this._ghOrdered(),r=n.sort,l=a?n.ordered:n.ordered.slice(0,5),p=this._ghHydrateStory(),d=`
      <div class="flex flex-col sm:flex-row sm:items-center gap-2 mt-3">
        ${s?`<button onclick="app.ghConnect()" class="px-4 py-2.5 bg-[#24292f] text-white text-[13px] font-bold rounded-xl hover:bg-black active:scale-[0.98] transition-all flex items-center justify-center gap-2">
          <span class="material-symbols-outlined text-lg">code</span> Connect GitHub
        </button>`:""}
        <div class="flex items-center gap-2 flex-1">
          <input id="gh-link" type="text" inputmode="url" spellcheck="false" autocomplete="off"
            placeholder="https://github.com/yourname" value="${this.escapeHtml(t.username?"https://github.com/"+t.username:"")}"
            onkeydown="if (event.key === 'Enter') app.ghConnectFromLink()"
            class="flex-1 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all" />
          <button onclick="app.ghConnectFromLink()" class="px-4 py-2.5 border-2 border-primary text-primary text-[13px] font-bold rounded-xl hover:bg-primary/5 active:scale-[0.98] transition-all whitespace-nowrap">Rank my projects</button>
        </div>
      </div>
      <p class="text-[11px] text-slate-400 mt-2.5">Paste the link from your own GitHub profile - the address you see at the top of the page. We only read your public repositories to rank them for this job; nothing is posted, changed or shared. No sign-in needed${s?"":"; sign-in also shows private repos"}.</p>
      <p id="gh-connect-status" class="text-[12px] font-bold text-primary mt-2 hidden"></p>`;if(!t.repos||!t.repos.length){e.innerHTML=`
        <div class="bg-white border border-slate-200 rounded-2xl p-5">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-xl bg-[#24292f] text-white flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-xl">code</span></div>
            <div class="min-w-0 flex-1">
              <h2 class="text-sm font-bold text-slate-900">Paste your GitHub link - we pick the project to talk about</h2>
              <p class="text-[12px] text-slate-500 leading-relaxed mt-1">We match your repositories against this job description and rank them, so you walk in knowing exactly which project answers their questions first.</p>
            </div>
          </div>
          ${t.error?`<p class="text-[12px] text-rose-600 font-bold mt-3">${this.escapeHtml(t.error)}</p>`:""}
          <div id="gh-connect-box">${this._ghDeviceBoxHtml()||d}</div>
        </div>`;return}const h=(window.swapikiGitHub.NOTE_FIELDS||[]).length,b=l.map(u=>{const m=u.name===p,v=u.score>=70?"bg-emerald-500":u.score>=45?"bg-amber-500":"bg-slate-300",_=this._ghNoteOpen===u.name,x=h-window.swapikiGitHub.blankFields(this._ghNotes(u.name)).length;return`
        <div class="rounded-xl border ${m?"border-primary bg-primary/[0.04]":"border-slate-200"} p-3.5">
          <div class="flex items-start gap-3">
            <span class="w-6 h-6 rounded-lg ${u.rank===1?"bg-primary text-white":"bg-slate-100 text-slate-500"} text-[11px] font-bold flex items-center justify-center shrink-0">${u.rank}</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <a href="${this.escapeHtml(u.url)}" target="_blank" rel="noopener" class="text-[13px] font-bold text-slate-900 hover:underline truncate">${this.escapeHtml(u.name)}</a>
                ${u.rank===1?'<span class="text-[10px] font-bold text-white bg-primary rounded px-1.5 py-0.5">Talk about this one first</span>':""}
                ${m?'<span class="text-[10px] font-bold text-primary border border-primary/30 rounded px-1.5 py-0.5">Leading your answers</span>':""}
                <span class="text-[11px] font-bold text-slate-500 ml-auto">${u.score}% match</span>
              </div>
              <div class="h-1 rounded-full bg-slate-100 overflow-hidden mt-1.5">
                <div class="h-full ${v} rounded-full" style="width:${u.score}%"></div>
              </div>
              ${u.repo.description?`<p class="text-[12px] text-slate-600 leading-relaxed mt-2 line-clamp-2">${this.escapeHtml(u.repo.description)}</p>`:""}
              <div class="flex flex-wrap items-center gap-1.5 mt-2">
                ${u.matchedSkills.map($=>`<span class="bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2 py-0.5 text-[10px] font-bold">${this.escapeHtml($)}</span>`).join("")}
                ${u.language?`<span class="text-[10px] font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">${this.escapeHtml(u.language)}</span>`:""}
                ${u.stars?`<span class="text-[10px] font-bold text-slate-500 inline-flex items-center gap-0.5"><span class="material-symbols-outlined text-[12px]">star</span>${u.stars}</span>`:""}
                <span class="text-[10px] font-bold text-slate-400">updated ${this.escapeHtml(u.updated)}</span>
                ${u.flags.map($=>`<span class="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">${this.escapeHtml($)}</span>`).join("")}
              </div>
              <p class="text-[11px] text-slate-500 mt-2 leading-relaxed">${this.escapeHtml(this._ghReason(u))}</p>
              <div class="flex items-center gap-2 mt-2.5 flex-wrap">
                <button onclick="app.copyRepoPitch('${this.escapeHtml(u.name)}')" class="text-[11px] font-bold text-primary border border-primary/30 rounded-lg px-2.5 py-1 hover:bg-primary/5">Copy 60-sec pitch</button>
                <button onclick="app.useRepoStory('${this.escapeHtml(u.name)}')" class="text-[11px] font-bold ${m?"text-white bg-primary":"text-slate-600 border border-slate-200"} rounded-lg px-2.5 py-1 hover:border-primary">${m?"Leading my answers":"Lead my answers with this"}</button>
                <button onclick="app.toggleRepoNotes('${this.escapeHtml(u.name)}')" class="text-[11px] font-bold ${_?"text-slate-900 bg-slate-100 border border-slate-200":"text-slate-500 hover:text-slate-800"} rounded-lg px-2.5 py-1 inline-flex items-center gap-1"><span class="material-symbols-outlined text-[13px]">${_?"expand_less":"add"}</span>${_?"Hide my details":"Add what you did"}</button>
                ${x?`<span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">${x}/${h} details added</span>`:""}
              </div>
              ${_?this._ghNoteFormHtml(u):""}
            </div>
          </div>
        </div>`}).join("");e.innerHTML=`
      <div class="bg-white border border-slate-200 rounded-2xl p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="flex items-start gap-3 min-w-0">
            <div class="w-10 h-10 rounded-xl bg-[#24292f] text-white flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-xl">code</span></div>
            <div class="min-w-0">
              <h2 class="text-sm font-bold text-slate-900">Your GitHub projects, ranked for this job</h2>
              <p class="text-[12px] text-slate-500 mt-0.5" id="gh-status">${this.escapeHtml(t.login?"@"+t.login:"")}${t.login&&o.total?" \xB7 "+o.total+" repos":""}${o.hidden?" \xB7 "+o.hidden+" forks/archived hidden":""}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            ${i.length>5?`<button onclick="app._ghShowAll = ${!a}; app.renderGitHubPicker()" class="text-[11px] font-bold text-slate-500 hover:text-slate-800">${a?"Show top 5":"Show all "+i.length}</button>`:""}
            <button onclick="app.ghFetchRepos(true)" class="text-[11px] font-bold text-primary border border-primary/30 rounded-lg px-2.5 py-1 hover:bg-primary/5">Refresh</button>
            <button onclick="app.ghDisconnect()" class="text-[11px] font-bold text-slate-400 hover:text-slate-700">Disconnect</button>
          </div>
        </div>
        ${i.length>1?`
        <div class="flex items-center gap-1.5 mt-3">
          <span class="text-[10px] font-bold uppercase tracking-wide text-slate-400 mr-1">Sort</span>
          ${[["match","Best match"],["recent","Most recent"],["stars","Most stars"]].map(([u,m])=>`
            <button onclick="app._ghSort = '${u}'; app.renderGitHubPicker()" class="text-[11px] font-bold rounded-lg px-2.5 py-1 ${r===u?"bg-primary text-white":"text-slate-500 border border-slate-200 hover:border-primary"}">${m}</button>`).join("")}
        </div>`:""}
        </div>
        ${t.error?`<p class="text-[12px] text-rose-600 font-bold mt-3">${this.escapeHtml(t.error)}</p>`:""}
        <div class="space-y-2.5 mt-3.5">
          ${i.length?b:'<p class="text-[12px] text-slate-500">No public repositories found for this username.</p>'}
        </div>
        ${i.length?`<p class="text-[11px] text-slate-400 mt-3">Score = how much of this job's skill list your repo actually shows, plus how alive it is. Forks and archived repos are hidden because they are never the story you tell.</p>`:""}
      </div>`}renderDashboard(){var g,y;const e=swapikiStore.getProfile();this.setPageMeta("Dashboard | Swapiki","Your Swapiki candidate dashboard \u2014 edit your profile, record statements, and publish your proof profile.");const t=document.getElementById("dash-welcome-title");if(t){const w=e.name?e.name.split(" ")[0]:"there",f=swapikiStore.currentUser;let c=!1;if(f&&f.created_at&&f.last_sign_in_at){const k=new Date(f.created_at).getTime(),S=new Date(f.last_sign_in_at).getTime();c=Math.abs(S-k)<1e4}t.textContent=c?`Welcome, ${w}!`:`Welcome back, ${w}.`}const s=e.profileStatus==="suspended",i=document.getElementById("dash-status-subtitle");i&&(i.textContent=s?"Your profile is paused while our team reviews a report, so it is not visible to hiring managers right now.":e.profileStatus==="published"?"Your proof profile is published and visible to hiring managers across India.":"Your proof profile is still in draft. Your link already works \u2014 publishing just marks it as ready for review.");const o=document.getElementById("dash-profile-status"),a=document.getElementById("btn-publish-profile"),n=document.getElementById("dash-status-dot");o&&(o.textContent=s?"Paused \u2014 under review":e.profileStatus==="published"?"Published and visible to hiring managers":"Draft \u2014 link is live, not yet marked ready",o.className=s?"font-label-sm text-label-sm text-rose-300 font-bold uppercase tracking-wider":"font-label-sm text-label-sm text-emerald-300 font-bold uppercase tracking-wider"),n&&(n.className=s?"w-2.5 h-2.5 rounded-full bg-rose-400":"w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"),a&&(a.textContent=s?"Profile under review":e.profileStatus==="published"?"Unpublish Profile":"Publish Profile",a.disabled=s,a.onclick=()=>this.publishProfile());const r=document.getElementById("dash-stat-views"),l=document.getElementById("dash-stat-shares");r&&(r.textContent=(g=e.views)!=null?g:0),l&&(l.textContent=(y=e.shares)!=null?y:0),this.renderProfileChecklist(),this.loadReferralStats();const p=swapikiStore&&typeof swapikiStore.getMaxProjects=="function"?swapikiStore.getMaxProjects():this.maxProjects||4,d=e.projects.length,h=document.getElementById("dash-projects-slot-label"),b=document.getElementById("dash-projects-slot-bar");h&&(h.textContent=`${d} / ${p} Slots Active`),b&&(b.style.width=`${p>0?d/p*100:0}%`);const u=e.projects.filter(w=>!!w.audioUrl).length,m=d>0?Math.round(u/d*100):0,v=document.getElementById("dash-audio-verified-label"),_=document.getElementById("dash-audio-verified-bar");v&&(v.textContent=`${m}% with audio`),_&&(_.style.width=`${m}%`),this.renderVoiceVerificationStatus(e);const x=document.getElementById("dash-proof-nudge");x&&(d===0?(x.textContent="Your profile has no proof projects yet \u2014 add at least one so hiring managers have something real to look at.",x.classList.remove("hidden")):u===0?(x.textContent="Add a voice walkthrough to at least one project \u2014 profiles with voice proof stand out far more than text alone.",x.classList.remove("hidden")):(x.textContent="",x.classList.add("hidden")));const $=document.getElementById("stitch-dash-projects-grid");if(!$)return;$.innerHTML="",e.projects.length===0&&($.innerHTML=`
        <div class="md:col-span-2 bg-white border-2 border-dashed border-slate-300 rounded-2xl p-12 flex flex-col items-center text-center">
          <span class="material-symbols-outlined text-5xl text-slate-300 mb-3">folder_open</span>
          <h3 class="font-bold text-slate-800 text-lg mb-1">No proof projects yet</h3>
          <p class="text-sm text-slate-500 max-w-sm mb-5">Add your first project and record a 2-minute voice walkthrough \u2014 this is the proof anyone opening your link actually sees.</p>
          <button onclick="router.navigate('add-project')" class="px-5 py-2.5 bg-primary text-white rounded-lg font-bold text-sm shadow-md hover:bg-primary/90 transition-colors flex items-center gap-1.5">
            <span class="material-symbols-outlined text-lg">add_circle</span> Add Your First Project
          </button>
        </div>
      `),e.projects.forEach((w,f)=>{const c=!!w.imageUrl,k=e.profileStatus==="suspended"?"Paused":e.profileStatus==="published"?"Published":"Draft",C=`
        <div class="absolute top-4 right-4" style="z-index:2;pointer-events:none">
          <span class="${e.profileStatus==="published"?"bg-on-tertiary-container text-tertiary-container":e.profileStatus==="suspended"?"bg-rose-100 text-rose-700":"bg-slate-200 text-slate-700"} font-label-sm text-label-sm py-1 px-3 rounded-full flex items-center gap-1 shadow-sm font-bold">
            <span class="w-2 h-2 rounded-full bg-current opacity-70"></span> ${k}
          </span>
        </div>`,I=document.createElement("div");I.className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col bento-card group",I.innerHTML=`
        ${c?this._coverFrameHtml(w,"card",C):`<div class="relative h-48 w-full bg-slate-100 overflow-hidden flex items-center justify-center">
               <div class="flex flex-col items-center justify-center text-slate-300">
                 <span class="material-symbols-outlined text-5xl">image</span>
                 <span class="text-[11px] font-bold text-slate-400 mt-1">No image added</span>
               </div>
               ${C}
             </div>`}
        <div class="p-6 flex-1 flex flex-col">
          <h3 class="font-headline-sm text-headline-sm font-bold text-slate-900 mb-2">${w.title}</h3>
          <p class="font-body-md text-body-md text-on-surface-variant line-clamp-2 mb-4">${w.impact}</p>
          <div class="mt-auto pt-6 border-t border-slate-100 flex justify-between items-center flex-wrap gap-2">
            <button onclick="app.openEditProjectModal('${w.id}')" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg flex items-center gap-1 transition-colors">
              <span class="material-symbols-outlined text-sm">edit</span> Edit Details
            </button>
            <button onclick="app.openAudioModal('${w.id}')" class="text-primary font-bold font-label-md text-label-md flex items-center gap-1 hover:underline">
              ${w.audioUrl?"Re-record Audio":"Record Audio"} <span class="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        </div>
      `,$.appendChild(I)});const E=document.getElementById("dash-projects-slot-count");if(E&&(E.textContent=`${e.projects.length} / ${p} slots used (Min 1, Max ${p})`),e.projects.length>0&&e.projects.length<p){const w=document.createElement("div");w.className="bg-surface-container-lowest border-2 border-dashed border-outline-variant rounded-xl flex flex-col items-center justify-center p-12 text-center group cursor-pointer hover:border-primary hover:bg-white transition-all bento-card h-[420px]",w.onclick=()=>router.navigate("add-project"),w.innerHTML=`
        <div class="w-16 h-16 bg-surface-container-high rounded-full flex items-center justify-center mb-6 group-hover:bg-primary-fixed group-hover:text-primary transition-colors">
          <span class="material-symbols-outlined text-3xl">add_circle</span>
        </div>
        <h3 class="font-headline-sm text-headline-sm font-bold mb-2 text-slate-900">Add Proof Project</h3>
        <p class="font-body-md text-on-surface-variant max-w-xs mb-6">Document another technical initiative with proof and audio.</p>
        <button class="bg-primary text-on-primary px-6 py-2.5 rounded-lg font-label-md font-bold transition-all shadow-sm">Add Project ${e.projects.length+1}</button>
      `,$.appendChild(w)}this.maybeShowOnboardingGuide(e)}renderProfileChecklist(){const e=swapikiStore.getProfile();let t;try{t=window.profileChecklist.buildProfileChecklist(e)}catch(p){console.error("Checklist module unavailable \u2014 skipping checklist render:",p);return}const s=t.percent,i=document.getElementById("dash-checklist-percent"),o=document.getElementById("dash-checklist-bar");i&&(i.textContent=`${s}% Complete`),o&&(o.style.width=`${s}%`);const a=document.getElementById("dash-completion-percent"),n=document.getElementById("dash-completion-bar");a&&(a.textContent=`${s}% Complete`),n&&(n.style.width=`${s}%`);const r=document.getElementById("dash-checklist-items");if(!r)return;const l=`
      <div data-referral="1"
        class="flex items-center justify-between gap-3 py-2.5 cursor-pointer select-none hover:bg-slate-50">
        <div class="flex items-center gap-3 min-w-0">
          <span class="material-symbols-outlined text-primary shrink-0">group_add</span>
          <div class="min-w-0">
            <span class="text-sm text-slate-700 font-medium block">Refer a friend</span>
            <span id="dash-referral-sub" class="text-xs text-slate-400 block">Invite someone \u2014 unlock an extra project slot when their profile publishes.</span>
          </div>
        </div>
        <span class="text-xs font-bold text-primary shrink-0 flex items-center gap-0.5">Copy link <span class="material-symbols-outlined text-sm">content_copy</span></span>
      </div>`;r.innerHTML=t.items.map(p=>`
      <div data-key="${p.key}" data-done="${p.done}"
        class="flex items-center justify-between gap-3 py-2.5 cursor-pointer select-none
               hover:bg-slate-50 ${p.done?"opacity-70":""}">
        <div class="flex items-center gap-3 min-w-0">
          <span class="material-symbols-outlined ${p.done?"text-emerald-500":"text-slate-300"} shrink-0">${p.done?"check_circle":"radio_button_unchecked"}</span>
          <span class="text-sm ${p.done?"text-slate-400 line-through":"text-slate-700 font-medium"}">${p.label}</span>
        </div>
        ${p.done?'<span class="text-xs font-bold text-emerald-600 shrink-0">Done</span>':p.action==="add-project"?'<a href="#add-project" class="text-xs font-bold text-primary shrink-0 flex items-center gap-0.5">Fix it <span class="material-symbols-outlined text-sm">chevron_right</span></a>':'<span class="text-xs font-bold text-primary shrink-0 flex items-center gap-0.5">Fix it <span class="material-symbols-outlined text-sm">chevron_right</span></span>'}
      </div>`).join("")+l,this._referralStats&&this.updateReferralRow(this._referralStats),r.removeEventListener("click",this._checklistClick),this._checklistClick=p=>{if(p.target.closest('a[href^="#"]'))return;if(p.target.closest("[data-referral]")){this.copyReferralLink();return}const d=p.target.closest("[data-key]");if(d)try{this.checklistAction(d.dataset.key)}catch(h){console.error("Checklist action failed:",h),this.showToast(`Couldn't open that step (${h.message}). Try the menu instead.`)}},r.addEventListener("click",this._checklistClick)}async loadReferralStats(){if(!swapikiStore||typeof swapikiStore.getReferralStats!="function")return;let e;try{e=await swapikiStore.getReferralStats()}catch(r){return}this._referralStats=e||{total:0,credited:0},this.updateReferralRow(this._referralStats);const t=typeof swapikiStore.getProfile=="function"?swapikiStore.getProfile():null,s=t&&Array.isArray(t.projects)?t.projects.length:0,i=typeof swapikiStore.getMaxProjects=="function"?swapikiStore.getMaxProjects():4,o=document.getElementById("dash-projects-slot-label"),a=document.getElementById("dash-projects-slot-bar");o&&(o.textContent=`${s} / ${i} Slots Active`),a&&(a.style.width=`${i>0?s/i*100:0}%`);const n=document.getElementById("dash-projects-slot-count");n&&(n.textContent=`${s} / ${i} slots used (Min 1, Max ${i})`)}updateReferralRow(e){const t=document.getElementById("dash-referral-sub");if(!t)return;const s=e&&e.credited||0,i=e&&e.total||0;if(i<=0){t.textContent="Invite someone \u2014 unlock an extra project slot when their profile publishes.";return}const o=swapikiStore&&typeof swapikiStore.getReferralBonus=="function"?swapikiStore.getReferralBonus():0,a=`${i} ${i===1?"person":"people"}`;s>0?t.textContent=`You've referred ${a} \u2014 ${s} published, +${o} project slot${o===1?"":"s"} unlocked.`:t.textContent=`You've referred ${a} \u2014 a slot unlocks once they publish their profile.`}maybeShowInviteBanner(){const e=document.getElementById("invite-banner");if(!e)return null;let t=null;try{t=localStorage.getItem("swapiki_ref")}catch(i){t=null}if(this.isAuthenticated()||!t)return e.classList.add("hidden"),null;const s=this.escapeHtml(t);e.innerHTML=`<span class="lp-invite-tag">Invited</span><span class="lp-invite-text">You were invited by <b>@${s}</b> &mdash; build your proof profile and get heard by hiring managers.</span><button type="button" class="lp-invite-cta" onclick="app.openSignupModal()">Create my profile <span aria-hidden="true">&rarr;</span></button>`,e.classList.remove("hidden");try{typeof window!="undefined"&&window.posthog&&typeof window.posthog.capture=="function"&&window.posthog.capture("referral_invite_shown",{referrer:t})}catch(i){}return t}copyReferralLink(){const e=swapikiStore&&typeof swapikiStore.getProfile=="function"?swapikiStore.getProfile():{},t=e&&(e.username||e.id)||this.publicUsername;if(!t){this.showToast("Finish your profile first \u2014 then you get a referral link.");return}const s=`https://swapiki.com/?ref=${encodeURIComponent(t)}`;try{Promise.resolve(this._copyToClipboard(s)).catch(()=>{})}catch(i){}this.showToast("Referral link copied \u2014 share it with a friend.");try{typeof window!="undefined"&&window.posthog&&typeof window.posthog.capture=="function"&&window.posthog.capture("referral_link_copied")}catch(i){}}checklistAction(e){const t=typeof performance!="undefined"?performance.now():0,s=swapikiStore.getProfile();if(e==="edit-profile"){this.openEditProfileModal(),this._reportChecklistPerf(e,t);return}if(e==="add-project"){window.router.navigate("add-project"),this._reportChecklistPerf(e,t);return}if(e==="publish"){this.publishProfile(),this._reportChecklistPerf(e,t);return}if(e==="voice"){const i=Array.isArray(s.projects)&&s.projects.length?s.projects[0]:null;i?this.openAudioModal(i.id):window.router.navigate("add-project"),this._reportChecklistPerf(e,t);return}}_reportChecklistPerf(e,t){try{const s=typeof performance!="undefined"?performance.now()-t:0;s>800?(console.warn(`[perf] checklistAction '${e}' took ${s.toFixed(0)}ms`,new Date().toISOString()),this.showToast(`Opened in ${Math.round(s)}ms \u2014 slower than it should be. Share this number.`)):s>200&&this.showToast(`Opened in ${Math.round(s)}ms.`)}catch(s){}}maybeShowOnboardingGuide(e){const t=swapikiStore.currentUser&&swapikiStore.currentUser.id;if(!t)return;const s=`swapiki_onboarding_seen_${t}`;try{if(localStorage.getItem(s))return}catch(i){}this.openOnboardingGuide(e);try{localStorage.setItem(s,"1")}catch(i){}}openOnboardingGuide(e){e=e||swapikiStore.getProfile();const t=e.username||e.id||"ananya-sharma",s=document.getElementById("onboarding-share-link");s&&(s.textContent=`${t}.swapiki.com`);const i=document.getElementById("modal-onboarding-guide");i&&i.classList.remove("hidden")}closeOnboardingGuide(){const e=document.getElementById("modal-onboarding-guide");e&&e.classList.add("hidden")}openTrustSecurityModal(){const e=document.getElementById("modal-trust-security");e&&e.classList.remove("hidden")}closeTrustSecurityModal(){const e=document.getElementById("modal-trust-security");e&&e.classList.add("hidden")}finishOnboardingGuide(){this.closeOnboardingGuide(),this.copyShareLink()}adminViewCandidateProfile(e){if(!e){this.showToast("This candidate has no handle set yet, so there's no profile page to view.");return}this.publicUsername=e,this._adminPreviewMode=!0,window.location.hash="admin-preview/"+encodeURIComponent(e),router.navigate("candidate",!1)}_recordPublicProfileView(e,t){try{if(!this.publicUsername||t||!e||!e.id)return;const s=swapikiStore&&swapikiStore.currentUser&&swapikiStore.currentUser.id;if(s&&e.userId&&e.userId===s)return;const i=`sw:profile-viewed:${e.id}`;if(typeof sessionStorage!="undefined"){if(sessionStorage.getItem(i))return;sessionStorage.setItem(i,"1")}swapikiStore.recordProfileView(e.id)}catch(s){console.warn("Profile view not logged:",s&&s.message)}}async renderCandidateProfile(){const e=!!this._adminPreviewMode;let t;if(this.publicUsername){this._showCandidatePanel("loading");try{t=await swapikiStore.getProfileByUsername(this.publicUsername,{includeUnpublished:!0,strict:!0})}catch(y){this._showCandidateLoadError(y);return}if(!t){const y=document.getElementById("candidate-not-found-handle");y&&(y.textContent=`${this.publicUsername}.swapiki.com`),this._showCandidatePanel("notfound"),this.showNotFoundToast(this.publicUsername),this.setPageMeta("Profile not found","This Swapiki profile could not be found or is not published yet.");return}this.clearNotFoundPanel(),this._recordPublicProfileView(t,e)}else t=swapikiStore.getProfile();this._viewedProfile=t;const s=this.publicUsername||t.username||t.id||"ananya-sharma",i=t.title||"Software Professional",o=`https://${s}.swapiki.com/`;this.setPageMeta(`${t.name} \u2014 ${i} | Swapiki`,`${t.name} (${i}${t.status?", "+t.status:""}) \xB7 statement on Swapiki. Open the link on a computer or the Swapiki app for the full profile video.`,{url:o});const a=document.getElementById("preview-subdomain-url");a&&(a.textContent=`${s}.swapiki.com`),document.getElementById("rec-name-text").textContent=t.name,document.getElementById("rec-title-text").textContent=`${t.title} \u2022 ${t.experience}`,this.applyVoiceVerifiedBadge(t),this.applyReviewedBadge(t),this.applyProfileAttestation(t),this._reportTarget={id:t&&t.id?t.id:null,name:t&&t.name?t.name:"",username:s};const n=document.getElementById("rec-report-btn");if(n){const y=!!this.publicUsername&&!e&&!!(t&&t.id);n.classList.toggle("hidden",!y),n.classList.toggle("flex",y)}const r=document.getElementById("sample-profile-banner");r&&(!this.publicUsername&&t&&t.id==="ananya_sharma"?r.classList.remove("hidden"):r.classList.add("hidden")),document.getElementById("rec-expertise-text").textContent=Array.isArray(t.expertise)&&t.expertise.length>0?t.expertise.slice(0,2).join(" & "):t.expertise||"No skills listed yet",document.getElementById("rec-status-text").textContent=t.status,document.getElementById("rec-education-text").textContent=t.education;const l=document.getElementById("rec-avatar-img"),p="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%2364748B' viewBox='0 0 24 24'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";l&&(l.onerror=()=>{l.src=p},l.src=t.avatar||p);const d=document.getElementById("rec-linkedin-link");if(d){const y=this._safeHttpUrl(t.linkedin);y?(d.href=y,d.classList.remove("hidden")):d.classList.add("hidden")}const h=document.getElementById("rec-twitter-link");if(h){const y=this._safeHttpUrl(t.twitter);y?(h.href=y,h.classList.remove("hidden")):h.classList.add("hidden")}const b=document.getElementById("rec-portfolio-link");if(b){const y=this._safeHttpUrl(t.portfolio);y?(b.href=y,b.classList.remove("hidden")):b.classList.add("hidden")}const u=document.getElementById("rec-resume-link");if(u){const y=this._safeHttpUrl(t.resumeLink);y?(u.href=y,u.classList.remove("hidden")):u.classList.add("hidden")}const m=t.name?t.name.split(" ")[0]:"Candidate",v=document.getElementById("rec-about-heading"),_=document.getElementById("rec-about-bio"),x=document.getElementById("rec-about-location");v&&(v.textContent=`About ${m}`),_&&(_.textContent=t.bio||`${m} hasn't added a bio yet.`),x&&(x.textContent=t.location||"Not specified");const $=Array.isArray(t.projects)?t.projects:[],E=document.getElementById("rec-projects-count");E&&(E.textContent=String($.length));const g=document.getElementById("stitch-candidate-projects-container");if(g)if(g.innerHTML="",$.length===0)g.innerHTML=`
        <div class="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center">
          <span class="material-symbols-outlined text-4xl text-slate-300 mb-2">folder_open</span>
          <p class="font-bold text-slate-700">No proof projects added yet.</p>
          <p class="text-sm text-slate-400 mt-1">Once this candidate adds a project with a voice walkthrough, it'll show up here.</p>
        </div>
      `;else{const y=f=>this.escapeHtml(f),w=f=>swapikiStore&&typeof swapikiStore.toList=="function"?swapikiStore.toList(f):Array.isArray(f)?f:[];$.forEach((f,c)=>{try{const k=w(f.tags),S=w(f.takeaways),C=String(f.id==null?"":f.id).replace(/[^A-Za-z0-9_-]/g,""),I=this._safeHttpUrl(f.githubUrl),j=!!f.imageUrl,A=c===$.length-1,T=document.createElement("div");T.className="relative flex gap-4 md:gap-5 proof-entry",T.style.animationDelay=`${Math.min(c*.08,.32)}s`,T.innerHTML=`
        <!-- Proof ledger rail: numbered node + connecting line -->
        <div class="flex flex-col items-center shrink-0 pt-1">
          <div class="proof-rail-node w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs shrink-0 z-10">
            ${String(c+1).padStart(2,"0")}
          </div>
          ${A?"":'<div class="w-px flex-1 bg-slate-200 mt-1 mb-1"></div>'}
        </div>

        <article class="flex-1 min-w-0 bg-surface-container-lowest border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow ${A?"":"mb-6"}">
        <div class="p-6 md:p-8">
          <div class="flex flex-col lg:flex-row gap-8">
            <div class="lg:w-1/3">
              ${j?`<div class="mb-4">${this._coverFrameHtml(f,"profile")}</div>`:`<div class="aspect-square rounded-lg bg-surface-container-high overflow-hidden mb-4 flex items-center justify-center">
                     <div class="flex flex-col items-center justify-center text-slate-300">
                       <span class="material-symbols-outlined text-5xl">image</span>
                       <span class="text-[11px] font-bold text-slate-400 mt-1">No image added</span>
                     </div>
                   </div>`}
              <h3 class="font-headline-sm text-primary font-bold mb-2">${y(f.title)}</h3>
              <p class="text-on-surface-variant font-body-md mb-4">${y(f.role)}</p>
              
              <!-- Module 4: GitHub Repository Proof Component -->
              ${!I?`
                    <div class="mb-4 p-3 bg-slate-100 text-slate-700 rounded-xl text-xs space-y-1 border border-slate-200">
                      <div class="flex items-center justify-between font-bold">
                        <span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-sm">code</span> Repository Link</span>
                        <span class="bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded">Repo not linked</span>
                      </div>
                      <p class="text-[11px] text-slate-500 italic">No working public repository link provided for this project.</p>
                    </div>
                  `:`
                  <div class="mb-4 p-3 bg-slate-900 text-white rounded-xl text-xs space-y-2 shadow-sm">
                    <div class="flex items-center justify-between">
                      <span class="flex items-center gap-1.5 font-bold">
                        <span class="material-symbols-outlined text-sm">code</span> Repository Link
                      </span>
                      <span class="bg-slate-700 text-slate-200 text-[10px] font-bold px-2 py-0.5 rounded">Candidate-submitted</span>
                    </div>
                    <p class="text-[11px] text-slate-400 leading-relaxed">Link added by the candidate. Swapiki has not reviewed the code or confirmed the project is theirs.</p>
                    <a href="${y(I)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 font-bold text-emerald-300 hover:text-emerald-200">
                      Inspect Public Code Base &rarr;
                    </a>
                  </div>
                `}

              <div class="flex flex-wrap gap-2">
                ${k.map(L=>`<span class="px-2 py-1 bg-surface-container text-on-surface-variant rounded font-label-sm font-semibold">${y(L)}</span>`).join("")}
              </div>
            </div>
            <div class="lg:w-2/3 space-y-6">
              <div class="bg-gradient-to-r from-primary-container via-primary to-slate-900 p-5 md:p-6 rounded-2xl mb-6 text-white shadow-xl relative overflow-hidden">
                <div class="flex items-center justify-between mb-4">
                  <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-tertiary-fixed animate-ping"></span>
                    <span class="text-xs font-extrabold tracking-wider uppercase text-tertiary-fixed">${f.audioUrl?"CANDIDATE VOICE WALKTHROUGH":"AI-GENERATED PRODUCT DEMO VOICE"}</span>
                  </div>
                  <span class="bg-white/10 text-white/90 text-xs px-2.5 py-1 rounded-full font-mono font-bold">${y(f.audioDuration||"01:45")}</span>
                </div>
                <div class="flex items-center gap-5">
                  <button onclick="app.playProjectAudio('${C}')" class="w-14 h-14 rounded-full bg-white text-primary flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all shrink-0">
                    <span id="play-icon-${C}" class="material-symbols-outlined text-3xl font-extrabold">play_arrow</span>
                  </button>
                  <div class="flex-1">
                    <p class="text-xs font-bold text-blue-100 mb-2">${f.audioUrl?"Candidate recording: impact & technical logic":"Product demo narration, not a candidate recording"}</p>
                    <div class="audio-wave-anim flex-1 justify-between px-1 cursor-pointer" onclick="app.playProjectAudio('${C}')">
                      <div class="wave-bar bg-white" style="animation-delay: 0.1s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.3s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.5s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.2s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.4s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.1s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.6s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.2s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.4s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.5s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.3s"></div>
                      <div class="wave-bar bg-white" style="animation-delay: 0.1s"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <h4 class="font-label-sm text-outline uppercase mb-2 tracking-widest font-bold">THE PROBLEM</h4>
                  <p class="font-body-md text-on-surface">${y(S[0]||"Overcoming fragmented workflows and high cognitive load.")}</p>
                </div>
                <div>
                  <h4 class="font-label-sm text-outline uppercase mb-2 tracking-widest font-bold">MY IMPACT</h4>
                  <p class="font-body-md text-primary font-bold">${y(f.impact)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        </article>
      `,g.appendChild(T)}catch(k){console.warn("Skipped a project that could not be rendered:",k&&k.message)}})}}playProjectAudio(e){var r;const t=document.getElementById(`play-icon-${e}`),s=t?(r=t.closest(".bg-gradient-to-r"))==null?void 0:r.querySelector(".audio-wave-anim"):null,i=this._viewedProfile;let o=i,a=i&&Array.isArray(i.projects)?i.projects.find(l=>l.id===e):null;a||(o=swapikiStore.getProfile(),a=(o.projects||[]).find(l=>l.id===e));const n=l=>{s&&(l?s.classList.add("audio-playing"):s.classList.remove("audio-playing"))};if(a&&a.audioUrl){if(this.activeAudioElement&&this.activeAudioElement.src===a.audioUrl&&!this.activeAudioElement.paused){this.activeAudioElement.pause(),t&&(t.textContent="play_arrow"),n(!1);return}this.activeAudioElement&&this.activeAudioElement.pause(),this.activeAudioElement=new Audio(a.audioUrl),this.activeAudioElement.onended=()=>{t&&(t.textContent="play_arrow"),n(!1),this.activeAudioElement=null},this.activeAudioElement.play().then(()=>{t&&(t.textContent="pause"),n(!0)}).catch(()=>this.showToast("Unable to play this recording."));return}if(t)if(t.textContent==="play_arrow"){if(t.textContent="pause",n(!0),this.showToast("Playing demo voice preview. This is not a real candidate recording."),"speechSynthesis"in window){window.speechSynthesis.cancel();const l=o&&o.name?o.name.split(" ")[0]:"the candidate";let p="";e==="p1"||!a?p="Hi, I am Ananya Sharma. In this project at Razorpay, I architected the Vernacular UPI Payment Flow across six Indian languages. Our team reduced payment drop-offs by 34% across 12 million monthly transactions by designing a simplified one-tap intent interaction model.":e==="p2"?p="Hello! I am Ananya Sharma. For Swiggy Instamart, I led UX research and product design for dark store logistics. We cut order dispatch preparation time by 3.5 minutes per delivery partner by implementing audio-assisted inventory picking workflows across 120 hubs.":p=`Hi, I am ${l}. In this project ${a.title}, my primary impact was ${a.impact}. Here is how we executed: ${a.takeaways.join(". ")}.`;const d=new SpeechSynthesisUtterance(p);d.rate=.92,d.pitch=1.25;const h=window.speechSynthesis.getVoices(),b=h.find(u=>(u.name.includes("Female")||u.name.includes("Heera")||u.name.includes("Kalpana")||u.name.includes("Veena")||u.name.includes("Neerja")||u.name.includes("Google UK English Female")||u.name.includes("Samantha")||u.name.includes("Zira")||u.name.includes("Victoria")||u.name.includes("Karen"))&&(u.lang.includes("en")||u.lang.includes("hi")))||h.find(u=>u.lang.includes("en-IN")||u.name.includes("India"));b&&(d.voice=b),d.onend=()=>{t.textContent="play_arrow",n(!1)},window.speechSynthesis.speak(d)}}else t.textContent="play_arrow",n(!1),"speechSynthesis"in window&&window.speechSynthesis.cancel()}_coverFrameHtml(e,t="card",s=""){const i=this.escapeHtml(e.imageUrl),o=this.escapeHtml(e.title);return`
      <div class="cover-frame cover-frame--${t}">
        <img class="cover-bg" src="${i}" alt="" aria-hidden="true" decoding="async"/>
        <img class="cover-img" src="${i}" alt="${o}" decoding="async"/>
        <button type="button" class="cover-hit" data-src="${i}" data-alt="${o}"
          onclick="app.openImageViewer(this)" aria-label="View ${o} full screen" title="View full screen">
          <span class="cover-zoom-badge"><span class="material-symbols-outlined" aria-hidden="true">open_in_full</span></span>
        </button>
        ${s}
      </div>`}openImageViewer(e){const t=e&&e.dataset?e.dataset.src:"";if(!t)return;const s=(e.dataset.alt||"").trim()||"Project image";this.closeImageViewer();const i=document.createElement("div");i.id="image-viewer",i.className="img-viewer",i.setAttribute("role","dialog"),i.setAttribute("aria-modal","true"),i.setAttribute("aria-label","Image viewer");const o=!!(document.fullscreenEnabled&&i.requestFullscreen);i.innerHTML=`
      <div class="img-viewer__bar">
        <span class="img-viewer__title"></span>
        <div class="img-viewer__actions">
          <button type="button" class="img-viewer__btn" data-act="zoom" aria-label="Zoom to actual size" title="Zoom">
            <span class="material-symbols-outlined" aria-hidden="true">zoom_in</span></button>
          ${o?`<button type="button" class="img-viewer__btn" data-act="fs" aria-label="Toggle full screen" title="Full screen">
            <span class="material-symbols-outlined" aria-hidden="true">fullscreen</span></button>`:""}
          <button type="button" class="img-viewer__btn" data-act="close" aria-label="Close" title="Close (Esc)">
            <span class="material-symbols-outlined" aria-hidden="true">close</span></button>
        </div>
      </div>
      <div class="img-viewer__stage"><img class="img-viewer__img" alt=""/></div>`,i.querySelector(".img-viewer__title").textContent=s;const a=i.querySelector(".img-viewer__img");a.src=t,a.alt=s;const n=i.querySelector('[data-act="zoom"]'),r=()=>{const d=i.classList.toggle("is-zoomed");n.setAttribute("aria-label",d?"Fit to screen":"Zoom to actual size"),n.querySelector(".material-symbols-outlined").textContent=d?"zoom_out":"zoom_in"},l=()=>{try{document.fullscreenElement?document.exitFullscreen():i.requestFullscreen()}catch(d){}};i.addEventListener("click",d=>{const h=d.target.closest("[data-act]");if(h){const b=h.getAttribute("data-act");b==="close"?this.closeImageViewer():b==="zoom"?r():b==="fs"&&l();return}if(d.target===a){r();return}d.target.closest(".img-viewer__bar")||this.closeImageViewer()}),this._imageViewerKeydown=d=>{d.key==="Escape"&&this.closeImageViewer()},document.addEventListener("keydown",this._imageViewerKeydown),this._imageViewerReturnFocus=e,this._imageViewerPrevOverflow=document.body.style.overflow,document.body.style.overflow="hidden",document.body.appendChild(i);const p=i.querySelector('[data-act="close"]');p&&p.focus()}closeImageViewer(){const e=document.getElementById("image-viewer");if(!e)return;if(document.fullscreenElement)try{document.exitFullscreen()}catch(s){}e.remove(),document.body.style.overflow=this._imageViewerPrevOverflow||"",this._imageViewerKeydown&&(document.removeEventListener("keydown",this._imageViewerKeydown),this._imageViewerKeydown=null);const t=this._imageViewerReturnFocus;this._imageViewerReturnFocus=null,t&&typeof t.focus=="function"&&document.contains(t)&&t.focus()}handleProjectImageSelect(e){const t=e.target.files[0];if(!t)return;if(t.size>2*1024*1024){this.showToast("Image file size must be less than 2MB.");return}const s=new FileReader;s.onload=i=>{this.selectedProjectImageUrl=i.target.result;const o=document.getElementById("proj-image-name"),a=document.getElementById("proj-image-preview-box"),n=document.getElementById("proj-image-preview");o&&(o.textContent=t.name),n&&(n.src=i.target.result),a&&a.classList.remove("hidden"),this.showToast("Project cover image attached!")},s.readAsDataURL(t)}openEditProjectModal(e){const s=swapikiStore.getProfile().projects.find(a=>a.id===e);if(!s){this.showToast("Project not found.");return}if(document.getElementById("proj-edit-id").value=s.id,document.getElementById("proj-input-title").value=s.title||"",document.getElementById("proj-input-role").value=s.role||"",document.getElementById("proj-input-problem").value=s.problem||"",document.getElementById("proj-input-ownership").value=s.ownership||"",document.getElementById("proj-input-impact").value=s.impact||"",document.getElementById("proj-input-github").value=s.githubUrl||"",document.getElementById("proj-input-live").value=s.liveUrl||"",document.getElementById("proj-input-takeaways").value=Array.isArray(s.takeaways)?s.takeaways.join(`
`):s.takeaways||"",s.imageUrl){this.selectedProjectImageUrl=s.imageUrl;const a=document.getElementById("proj-image-preview-box"),n=document.getElementById("proj-image-preview"),r=document.getElementById("proj-image-name");n&&(n.src=s.imageUrl),r&&(r.textContent="Existing image attached"),a&&a.classList.remove("hidden")}const i=document.getElementById("proj-form-heading"),o=document.getElementById("proj-form-subheading");i&&(i.textContent="Edit Project Details"),o&&(o.textContent="Fine-tune your project impact, repository proof, and takeaways."),router.navigate("add-project")}handleProjectSubmit(e){e.preventDefault();const t=swapikiStore.getProfile(),s=document.getElementById("proj-edit-id").value;if(!s&&t.projects.length>=4){this.showToast("A profile can contain no more than 4 proof projects.");return}const i=document.getElementById("proj-input-title").value,o=document.getElementById("proj-input-role").value,a=document.getElementById("proj-input-problem").value,n=document.getElementById("proj-input-ownership").value,r=document.getElementById("proj-input-impact").value,l=document.getElementById("proj-input-github").value,p=document.getElementById("proj-input-live").value,d=document.getElementById("proj-input-takeaways").value,h=this.selectedProjectImageUrl||null,u=[["Project title",i,200],["Role",o,100],["Problem",a,500],["Ownership",n,500],["Impact",r,500]].find(([,_,x])=>_.length>x);if(u){this.showToast(`${u[0]} must be ${u[2]} characters or fewer.`);return}const m=d?d.split(`
`).filter(_=>_.trim().length>0):["Designed solution focused on system scalability","Delivered measurable impact within schedule"];let v;try{s?(v=swapikiStore.updateProject(s,{title:i,role:o,problem:a,ownership:n,impact:r,githubUrl:l,liveUrl:p,imageUrl:h,takeaways:m}).id,this.showToast("Project details updated successfully!")):(v=swapikiStore.addProject({title:i,role:o,problem:a,ownership:n,impact:r,githubUrl:l,liveUrl:p,imageUrl:h,tags:["Figma","React","B2B SaaS"],takeaways:[a,n,...m]}).id,this.showToast("Project details saved! Record your audio walkthrough.")),document.getElementById("add-project-form").reset(),document.getElementById("proj-edit-id").value="",this.selectedProjectImageUrl=null;const _=document.getElementById("proj-image-preview-box");_&&_.classList.add("hidden");const x=document.getElementById("proj-form-heading"),$=document.getElementById("proj-form-subheading");x&&(x.textContent="Add New Project"),$&&($.textContent="Document your impact with high-velocity trust. Be concise, be data-driven.")}catch(_){this.showToast(_.message);return}this.openAudioModal(v)}setVoiceFilter(e){window.swapikiAudioEngine.setAudioFilterPreset(e),document.querySelectorAll(".voice-filter-btn").forEach(i=>{i.className="voice-filter-btn px-2.5 py-1 bg-slate-800 text-slate-200 text-[10px] font-bold rounded-full border border-slate-700 hover:bg-slate-700"});const t=document.getElementById(`vfilter-${e}`);t&&(t.className="voice-filter-btn px-2.5 py-1 bg-primary text-white text-[10px] font-bold rounded-full border border-blue-400 shadow-xs");const s=e==="studio"?"\u2728 Studio Clarity":e==="warm"?"\u{1F399}\uFE0F Warm Vocal Tone":"\u{1F3A7} Noise Suppression Filter";this.showToast(`Voice Filter set to ${s}!`)}downloadPdfPortfolio(){const e=swapikiStore.getProfile();this.showToast(`Generating your PDF portfolio for ${e.name}...`);const t=window.open("","_blank");if(!t){this.showToast("Please allow popups to download your PDF portfolio!");return}const s=`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${e.name} - Swapiki Portfolio</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a; padding: 40px; max-width: 800px; margin: 0 auto; line-height: 1.5; }
          .header { border-bottom: 2px solid #00236f; padding-bottom: 20px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; }
          .badge { background: #dce1ff; color: #00236f; font-weight: bold; font-size: 11px; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; }
          .title { font-size: 24px; font-weight: bold; color: #00236f; margin: 0 0 4px 0; }
          .subtitle { font-size: 14px; color: #475569; margin: 0; }
          .section { margin-bottom: 24px; }
          .section-title { font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #00236f; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 12px; }
          .project-card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid; }
          .project-title { font-size: 16px; font-weight: bold; color: #0f172a; margin: 0 0 4px 0; }
          .project-role { font-size: 12px; color: #0284c7; font-weight: bold; margin-bottom: 8px; }
          .impact-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px; margin-top: 10px; }
          .impact-title { font-size: 10px; font-weight: bold; color: #166534; text-transform: uppercase; margin-bottom: 2px; }
          .impact-text { font-size: 12px; font-weight: bold; color: #15803d; margin: 0; }
          .footer { margin-top: 40px; pt: 20px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">${e.name}</h1>
            <p class="subtitle">${e.title} \u2022 ${e.experience} \u2022 ${e.location}</p>
          </div>
          <span class="badge">CANDIDATE-SUBMITTED PROOF \xB7 VOICE WALKTHROUGH ATTACHED</span>
        </div>

        <div class="section">
          <div class="section-title">ABOUT CANDIDATE</div>
          <p style="font-size: 13px; color: #334155;">${e.bio||"Experienced product and engineering lead with a focus on scalable systems and candidate-submitted project proof."}</p>
        </div>

        <div class="section">
          <div class="section-title">PROOF OF WORK (CANDIDATE-SUBMITTED)</div>
          ${e.projects.map(i=>`
            <div class="project-card">
              <h3 class="project-title">${i.title}</h3>
              <div class="project-role">${i.role}</div>
              <p style="font-size: 12px; color: #475569; margin: 4px 0;"><strong>Problem Statement:</strong> ${i.takeaways[0]||"High cognitive friction and operational drop-offs."}</p>
              <div class="impact-box">
                <div class="impact-title">MEASURABLE IMPACT ACHIEVED</div>
                <div class="impact-text">${i.impact}</div>
              </div>
              <p style="font-size: 11px; color: #64748b; margin-top: 8px;"><strong>Voice Walkthrough Attached:</strong> ${i.audioDuration||"01:45"} \u2014 candidate-recorded and liveness-checked. This is not an identity check, and Swapiki does not verify that the work is the candidate's own.</p>
            </div>
          `).join("")}
        </div>

        <div class="footer">
          Made with Swapiki \u2014 candidate-submitted proof and a live-recording-checked voice walkthrough. Swapiki does not verify identity, and nothing here is an identity, credential or background check.
        </div>
        <script>
          window.onload = function() { window.print(); }
        <\/script>
      </body>
      </html>
    `;t.document.write(s),t.document.close()}renderVoiceVerificationStatus(e){const t=document.getElementById("dash-voice-verify-status");if(!t)return;const s=e.voiceVerificationCount||0;if(e.voiceVerified&&s>0){const i=e.voiceVerifiedAt?new Date(e.voiceVerifiedAt):null,o=i&&!isNaN(i.getTime())?i.toLocaleDateString(void 0,{day:"numeric",month:"short",year:"numeric"}):"recently";t.innerHTML=`
        <span class="material-symbols-outlined text-[14px] text-emerald-600 shrink-0">verified</span>
        <span><strong class="text-emerald-700">Live recording confirmed</strong> - read a random code into your mic on ${o} (${s} attempt${s===1?"":"s"}). It proves the recording is not a replay, not who you are.</span>`}else s>0?t.innerHTML=`
        <span class="material-symbols-outlined text-[14px] text-amber-600 shrink-0">gpp_bad</span>
        <span><strong class="text-amber-700">Recording not confirmed</strong> - ${s} attempt${s===1?"":"s"} so far. Re-record and read the code at the end of the phrase, clearly.</span>`:t.innerHTML=`
        <span class="material-symbols-outlined text-[14px] text-slate-400 shrink-0">record_voice_over</span>
        <span>Record your first walkthrough and read the random code aloud. Confirmed live recordings carry a badge on your profile.</span>`;t.classList.remove("hidden")}applyVoiceVerifiedBadge(e){const t=document.getElementById("voice-verified-badge");t&&(e.voiceVerified?t.classList.remove("hidden"):t.classList.add("hidden"))}applyReviewedBadge(e){const t=document.getElementById("reviewed-badge");if(!t)return;let s=!1;try{s=!!(window.profileChecklist&&window.profileChecklist.isProfileReviewed(e))}catch(i){s=!1}s?t.classList.remove("hidden"):t.classList.add("hidden")}applyProfileAttestation(e){const t=document.getElementById("rec-attested-line"),s=document.getElementById("rec-attested-date");if(!t)return;const i=e&&e.profileAttestedAt?new Date(e.profileAttestedAt):null;if(!i||isNaN(i.getTime())){t.classList.add("hidden"),s&&(s.textContent="");return}s&&(s.textContent=i.toLocaleDateString(void 0,{day:"numeric",month:"short",year:"numeric"})),t.title=e.profileAttestedName?`Signed as "${e.profileAttestedName}" at the time of saving. This is the candidate's own statement, not a Swapiki review of their work.`:"This is the candidate's own statement, not a Swapiki review of their work.",t.classList.remove("hidden")}openAudioModal(e){this.currentRecordingProjectId=e;const t=document.getElementById("modal-audio-studio");t&&t.classList.remove("hidden");const s=window.swapikiAudioEngine,i=swapikiStore.getProfile(),o=s.beginVerificationChallenge(i&&i.name?i.name:""),a=document.getElementById("challenge-banner"),n=document.getElementById("challenge-phrase-text"),r=document.getElementById("challenge-verify-hint");a&&a.classList.remove("hidden"),n&&(n.textContent=o),r&&(r.textContent=s.isSpeechSupported()?"The random code is new every time, so it can't be pre-recorded. Read the three code words out loud at the end of the sentence, clearly, so the browser can hear them.":"This browser can't check the spoken code (Chrome or Edge can). Your recording will still be saved to your profile, but it won't earn the live-recording badge here.")}closeAudioModal(){window.swapikiAudioEngine.isRecording&&window.swapikiAudioEngine.stopRecording();const e=document.getElementById("challenge-banner");e&&e.classList.add("hidden");const t=document.getElementById("modal-audio-studio");t&&t.classList.add("hidden"),router.navigate("dashboard")}async toggleRecording(){const e=document.getElementById("icon-record"),t=document.getElementById("audio-recording-status"),s=document.getElementById("audio-timer-display"),i=document.getElementById("waveform-canvas"),o=document.getElementById("teleprompter-step-text"),a=document.getElementById("teleprompter-badge");if(window.swapikiAudioEngine.isRecording){window.swapikiAudioEngine.stopRecording(),e&&(e.textContent="mic"),t&&(t.textContent="Recording stopped. Preview & AI transcript generated below.");const n=document.getElementById("btn-pause-record");n&&(n.style.display="none")}else{if(this.recordingValid=!1,!await window.swapikiAudioEngine.startRecording(i,(l,p)=>{s&&(s.textContent=p);const d=document.getElementById("audio-live-dot");d&&(d.className="w-3 h-3 rounded-full bg-red-500 animate-ping");const h=document.getElementById("audio-progress-bar");h&&(h.style.width=`${Math.min(100,l/120*100)}%`),l<30?(o&&(o.textContent="Now say what the project is, who it is for and the problem it solves, then what you personally built."),a&&(a.textContent="Step 1 \xB7 Problem & your role")):l<75?(o&&(o.textContent="Explain how you built it: the tools you chose, one hard problem and the trade-off you made."),a&&(a.textContent="Step 2 \xB7 How you built it")):(o&&(o.textContent="Finish with the result: numbers, users or what changed, and what you would improve next."),a&&(a.textContent="Step 3 \xB7 The result")),t&&(t.textContent=l<30?`Keep going \u2014 ${30-l}s until the 30-second minimum.`:"Minimum reached. Stop whenever you are done, or keep going up to 2:00.")},(l,p,d)=>{this.recordedAudioUrl=l,this.recordedDurationStr=p,this.recordingValid=d;const h=document.getElementById("audio-preview-container"),b=document.getElementById("audio-preview-element"),u=document.getElementById("ai-transcript-preview-text");if(h&&b&&(h.classList.remove("hidden"),l&&(b.src=l)),u){const m=swapikiStore.getProfile();u.textContent=`"Hi, I am ${m.name}. In this project, I architected the core product solution, overcoming high operational friction and reducing transaction failure rates significantly across 12M users."`}this.showToast(d?"Audio recording complete & ready to save.":"Recording must be at least 30 seconds long.")})){e&&(e.textContent="mic"),t&&(t.textContent=window.swapikiAudioEngine.lastError||"Microphone access is required to record."),this.showToast(window.swapikiAudioEngine.lastError||"Microphone access is required to record.");return}e&&(e.textContent="stop"),t&&(t.textContent="Recording live... Read the anti-fraud phrase first, then follow the prompts above.");const r=document.getElementById("btn-pause-record");r&&(r.style.display="flex"),this.showToast("Recording started! Microphone & AI teleprompter active.")}}togglePauseRecording(){const e=window.swapikiAudioEngine,t=document.getElementById("btn-pause-record"),s=document.getElementById("icon-pause-record"),i=document.getElementById("audio-recording-status");e.isRecording&&(e.isPaused?(e.resumeRecording(),s&&(s.textContent="pause"),t&&(t.title="Pause recording"),i&&(i.textContent="Recording resumed...")):(e.pauseRecording(),s&&(s.textContent="play_arrow"),t&&(t.title="Resume recording"),i&&(i.textContent="Recording paused.")))}async saveRecordedAudio(){const e=window.swapikiAudioEngine;if(e.isRecording){this.showToast("Stop your recording first, then save.");return}if(!this.recordedAudioUrl&&!this.recordingValid){this.showToast("No recording found. Click the mic button to record your walkthrough.");return}if(!this.recordingValid){const t=e.secondsRecorded,s=`${Math.floor(t/60).toString().padStart(2,"0")}:${(t%60).toString().padStart(2,"0")}`;this.showToast(`Recording is only ${s} \u2014 minimum is 30 seconds. Please re-record.`);return}if(this.currentRecordingProjectId){if(swapikiStore.updateProjectAudio(this.currentRecordingProjectId,this.recordedAudioUrl,this.recordedDurationStr||"01:45"),e.getRecordedBlob()){const t=new File([e.getRecordedBlob()],"walkthrough.webm",{type:"audio/webm"}),s=document.getElementById("audio-recording-status");s&&(s.textContent="Saving your recording\u2026 (one moment)");try{console.log("Persisting recording to storage\u2026"),await swapikiStore.uploadProjectAudio(this.currentRecordingProjectId,t,this.recordedDurationStr||"01:45")}catch(i){console.warn("Audio upload to storage failed (profile keeps the local recording):",i)}}await this.runVoiceVerificationPipeline()}this.closeAudioModal()}async runVoiceVerificationPipeline(){const e=window.swapikiAudioEngine,t=this.currentRecordingProjectId,s=e.getChallengeInfo(),i=e.getRecordedBlob(),o=e.wasLiveMic(),a=e.secondsRecorded,n=l=>swapikiStore.markProjectVoiceCheck(t,{status:l.status,reason:l.reason||null,sessionId:s?s.sessionId:null,code:s?s.code:null,phrase:s?s.phrase:null,durationSeconds:a,liveMic:o,...l});if(!o||!s){n({status:"failed",reason:"not_live"}),this.showToast("This recording did not come from a live microphone, so it cannot be confirmed. Please re-record.");return}if(!i){n({status:"failed",reason:"no_audio"}),this.showToast("No audio data could be read. Please re-record.");return}this.showToast("Checking your recording... (one moment)");const r=await e.verifySpokenChallenge();if(r.reason==="unsupported"){n({status:"skipped",reason:"speech_unsupported",speechSupported:!1}),this.showToast("Recorded and saved. This browser cannot check the spoken code, so no badge was added - try Chrome or Edge.");return}if(!r.verified){const l=r.reason==="no_transcript";n({status:"failed",reason:l?"no_speech_detected":"code_mismatch",speechSupported:!0,transcript:r.transcript,missingWords:r.missing}),swapikiStore.recordVoiceVerification({verified:!1});const p=l?"No speech was detected in that recording.":`The code didn't come through (missing: ${r.missing.join(", ")}).`;this.showToast(`${p} It's saved but not confirmed - try again and read the code clearly at the end of the phrase.`),this.renderDashboard();return}n({status:"verified",reason:"code_confirmed",speechSupported:!0,transcript:r.transcript}),swapikiStore.recordVoiceVerification({verified:!0}),this.showToast('Recording confirmed live. Your profile now shows "Live recording confirmed".'),this.renderDashboard()}checkNicknameAvailability(e){const t=document.getElementById("edit-nickname-status"),s=document.getElementById("edit-subdomain-preview"),i=swapikiStore.formatNickname(e);if(s&&(s.textContent=i?`${i}.swapiki.com`:"your-handle.swapiki.com"),!i)return t&&(t.textContent="\u26A0\uFE0F Handle required",t.className="normal-case text-[11px] font-bold text-amber-600"),s&&(s.className="font-bold text-amber-600 transition-colors"),this.isCurrentNicknameValid=!1,!1;if(i.length<5)return t&&(t.textContent="\u26A0\uFE0F Min 5 characters required",t.className="normal-case text-[11px] font-bold text-amber-600"),s&&(s.className="font-bold text-amber-600 transition-colors"),this.isCurrentNicknameValid=!1,!1;if(!swapikiStore.handleHasNameAndNumber(i))return t&&(t.textContent="\u26A0\uFE0F Add both a name and a number (e.g. rahul92)",t.className="normal-case text-[11px] font-bold text-amber-600"),s&&(s.className="font-bold text-amber-600 transition-colors"),this.isCurrentNicknameValid=!1,!1;const o=swapikiStore.getProfile();return swapikiStore.isNicknameTakenSync(i,o.id)?(t&&(t.textContent=`\u274C "${i}" is already taken!`,t.className="normal-case text-[11px] font-bold text-rose-600 animate-pulse"),s&&(s.className="font-bold text-rose-600 transition-colors"),this.isCurrentNicknameValid=!1,!1):(t&&(t.textContent=`\u2705 "${i}" is available!`,t.className="normal-case text-[11px] font-bold text-emerald-600"),s&&(s.className="font-bold text-emerald-600 transition-colors"),this.isCurrentNicknameValid=!0,!0)}updateHandleLockNotice(e){const t=document.getElementById("handle-lock-notice"),s=document.getElementById("handle-lock-icon"),i=document.getElementById("handle-lock-title"),o=document.getElementById("handle-lock-subtext");!t||!s||!i||!o||(t.className="bg-rose-50/80 border border-rose-200 rounded-xl p-3.5 space-y-1.5 text-xs text-rose-900",e?(s.textContent="\u{1F512}",i.textContent="Handle & email are permanent",o.textContent="This handle is locked and cannot be changed."):(s.textContent="\u{1F513}",i.textContent="Handle & email are permanent",o.textContent="Add both a name and a number (e.g. rahul92) in handle to register \u2014 once the handle is locked, it cannot be changed."))}openEditProfileModal(){if(!this.isAuthenticated()){this.showToast("Please log in to edit a profile."),this.openLoginModal();return}const e=swapikiStore.getProfile();document.getElementById("edit-name").value=e.name;const t=!!e.locked&&!!e.username,s=document.getElementById("edit-nickname"),i=document.getElementById("edit-nickname-status");if(s){const d=e.username||e.id||"";if(s.value=d,s.disabled=t,s.placeholder=t?"":"try your nick here",s.classList.toggle("bg-slate-100",t),s.classList.toggle("cursor-not-allowed",t),s.classList.toggle("text-slate-500",t),t){i&&(i.textContent="\u{1F512} Locked",i.className="normal-case text-[11px] font-bold text-rose-600");const h=document.getElementById("edit-subdomain-preview");h&&(h.className="font-bold text-slate-500 transition-colors"),this.isCurrentNicknameValid=!0}else typeof window.checkHandleDirect=="function"&&window.checkHandleDirect(d)}this.updateHandleLockNotice(t),document.getElementById("edit-title").value=e.title||"",document.getElementById("edit-experience").value=e.experience||"",document.getElementById("edit-expertise").value=Array.isArray(e.expertise)?e.expertise.join(", "):e.expertise||"",document.getElementById("edit-location").value=e.location||"",document.getElementById("edit-status").value=e.status||"",document.getElementById("edit-education").value=e.education||"",document.getElementById("edit-bio").value=e.bio||"",document.getElementById("edit-linkedin").value=e.linkedin||"";const o=document.getElementById("edit-twitter");o&&(o.value=e.twitter||"");const a=document.getElementById("edit-resume-link");a&&(a.value=e.resumeLink||"");const n=document.getElementById("edit-portfolio");n&&(n.value=e.portfolio||"");const r=document.getElementById("edit-resume-status");r&&(r.textContent=e.resumeUrl?"\u2705 Custom resume PDF attached.":"No custom resume attached yet. Uploading replaces default PDF download.");const l=document.getElementById("edit-avatar-preview");l&&e.avatar&&(l.src=e.avatar),this.uploadedAvatarUrl=e.avatar||null,this.uploadedResumeUrl=e.resumeUrl||null;const p=document.getElementById("modal-edit-profile");p&&p.classList.remove("hidden"),this.resetTruthAttestation()}onTruthAttestationChange(){const e=document.getElementById("edit-truth-attestation"),t=document.getElementById("edit-profile-save-btn");t&&e&&(t.disabled=!e.checked)}resetTruthAttestation(){const e=document.getElementById("edit-truth-attestation");e&&(e.checked=!1);const t=document.getElementById("edit-profile-save-btn");t&&(t.disabled=!0)}maybeShowProfileReminder(){const e=swapikiStore.getProfile();if(!!e.locked&&!!e.username)return;const s=swapikiStore.incrementLoginReminderCount();this.openProfileReminderModal(s>2)}_guidedTourSteps(){const e=[{key:"welcome",icon:"waving_hand",title:"Welcome to Swapiki",body:"Let\u2019s take a quick tour of your dashboard. We\u2019ll point to each key area so you know exactly where to go to build a proof profile that stands out."},{key:"nav-dashboard",icon:"dashboard",title:"Dashboard",body:"Your home base. Here you\u2019ll see your profile status, readiness checklist, proof projects, and quick actions to get started."},{key:"nav-edit-profile",icon:"edit",title:"Edit Profile",body:"Add your name, title, location, bio, and links. Your handle locks once saved, so pick a clean one like rahul92."},{key:"nav-profile",icon:"badge",title:"Preview your public profile",body:"Tap this anytime to see exactly what a hiring manager sees when they open your public link."},{key:"nav-jobs",icon:"work",title:"Browse jobs",body:"Browse real jobs and internships across India. No AI scoring, no auto-rejection. Apply when there\u2019s a real fit."},{key:"dash-status",icon:"verified_user",title:"Profile status",body:"Shows if your profile is Draft or Published. Until you publish, only you can see it \u2014 share with others only after publishing."},{key:"add-project",icon:"add_circle",title:"Add a proof project",body:"Start here. Add at least one real project with your role, impact, tools, and a link if you have one. This is what builds trust."},{key:"dash-checklist",icon:"checklist",title:"Profile readiness checklist",body:"Follow these steps in order. Each item tells you exactly what\u2019s missing and takes you straight to the right place."},{key:"dash-voice",icon:"mic",title:"Record a voice walkthrough",body:"Explain one project in your own voice (30s minimum). Read the on-screen random code aloud to earn the \u201CLive recording confirmed\u201D badge."},{key:"dash-share",icon:"share",title:"Share your profile link",body:"Copy and share your public link (your-handle.swapiki.com). That\u2019s the link to send on resumes, DMs, or emails."},{key:"dash-publish",icon:"rocket_launch",title:"Publish your profile",body:"Once you have at least one proof project, hit Publish. After that, your profile becomes visible to hiring managers."},{key:"dash-public",icon:"link",title:"Your public proof profile",body:"Keep this link handy. It shows your projects + voice walkthrough \u2014 real proof, no resume PDF required."}],t=["welcome","nav-edit-profile","add-project","dash-checklist","dash-voice","dash-share"];return e.filter(s=>t.indexOf(s.key)!==-1)}_guidedTourKey(){try{const e=swapikiStore.currentUser,t=e&&(e.id||e.email);return t?`swapiki:guided-tour:v1:${t}`:"swapiki:guided-tour:v1:anon"}catch(e){return"swapiki:guided-tour:v1:anon"}}_shouldShowGuidedTour(){try{if(!swapikiStore||!swapikiStore.currentUser)return!1;const e=this._guidedTourKey();if(localStorage.getItem(e))return!1;const t=window.location.hostname;return!(t&&t.endsWith(".swapiki.com")&&t!=="www.swapiki.com"&&t!=="swapiki.com")}catch(e){return!1}}maybeStartGuidedTour(){try{if(!this._shouldShowGuidedTour())return;const t=swapikiStore.currentUser||{};let s=!1;if(t.created_at&&t.last_sign_in_at){const a=new Date(t.created_at).getTime(),n=new Date(t.last_sign_in_at).getTime();s=Math.abs(n-a)<6e4}if(!s){const a=swapikiStore.getProfile?swapikiStore.getProfile():{};if(a&&a.completionScore>=70)return}const i=document.getElementById("tour-root");if(i&&!i.classList.contains("hidden")||this._tourTimer)return;const o=a=>{const n=document.getElementById("modal-profile-reminder");if(n&&!n.classList.contains("hidden")&&a<40){this._tourTimer=setTimeout(()=>o(a+1),1e3);return}this._tourTimer=null;try{this.startGuidedTour()}catch(l){}};this._tourTimer=setTimeout(()=>o(0),400)}catch(e){}}startGuidedTour(){try{this._tourSteps=this._guidedTourSteps(),this._tourIndex=0;const e=document.getElementById("tour-root");if(!e)return;e.classList.remove("hidden");try{typeof router!="undefined"&&router&&router.currentView!=="dashboard"&&swapikiStore&&swapikiStore.currentUser&&router.navigate("dashboard",!0)}catch(t){}setTimeout(()=>this._renderGuidedTourStep(!0),120),window.removeEventListener("resize",this._tourResizeHandler||(()=>{})),this._tourResizeHandler=()=>this._renderGuidedTourStep(!1),window.addEventListener("resize",this._tourResizeHandler)}catch(e){}}_renderGuidedTourStep(e){try{const t=this._tourSteps||[],s=this._tourIndex||0,i=t[s];if(!i)return this.finishGuidedTour();const o=document.getElementById("tour-root"),a=document.getElementById("tour-spotlight"),n=document.getElementById("tour-popover"),r=document.getElementById("tour-title"),l=document.getElementById("tour-body"),p=document.getElementById("tour-icon"),d=document.getElementById("tour-step-count"),h=document.getElementById("tour-next"),b=document.getElementById("tour-back");if(r&&(r.textContent=i.title||""),l&&(l.textContent=i.body||""),p&&(p.textContent=i.icon||"info"),d&&(d.textContent=`Step ${s+1} of ${t.length}`),b&&(b.disabled=s===0),h&&(h.textContent=s===t.length-1?"Got it":"Next"),i.key==="welcome"){a&&a.classList.add("hidden"),n&&(n.style.left="50%",n.style.top="50%",n.style.transform="translate(-50%, -50%)",n.style.opacity="1");return}try{i.key==="nav-jobs"?typeof router!="undefined"&&router&&router.navigate("jobs",!0):["nav-dashboard","nav-edit-profile","nav-profile","dash-status","add-project","dash-checklist","dash-voice","dash-share","dash-publish","dash-public"].includes(i.key)&&typeof router!="undefined"&&router&&router.currentView!=="dashboard"&&router.navigate("dashboard",!0)}catch(m){}const u=document.querySelector(`[data-tour="${i.key}"]`);if(!u){a&&a.classList.add("hidden"),n&&(n.style.left="50%",n.style.top="50%",n.style.transform="translate(-50%, -50%)");return}if(e)try{u.scrollIntoView({behavior:"smooth",block:"center",inline:"nearest"})}catch(m){}setTimeout(()=>{try{const m=u.getBoundingClientRect();if(a&&(a.style.left=m.left-6+"px",a.style.top=m.top-6+"px",a.style.width=m.width+12+"px",a.style.height=m.height+12+"px",a.classList.remove("hidden")),n){let x=m.left,$=m.bottom+14+6;$+260>window.innerHeight&&($=m.top-260-14-6),x+340>window.innerWidth-14&&(x=window.innerWidth-340-14),x<14&&(x=14),$<14&&($=14),n.style.left=x+"px",n.style.top=$+"px",n.style.transform="none",n.style.maxWidth="calc(100vw - 28px)"}}catch(m){}},e?280:0)}catch(t){}}nextGuidedTourStep(){try{const e=this._tourSteps||[],t=this._tourIndex||0;if(t<e.length-1){this._tourIndex=t+1,this._renderGuidedTourStep(!0);return}this.finishGuidedTour()}catch(e){this.finishGuidedTour()}}prevGuidedTourStep(){try{const e=this._tourIndex||0;if(e<=0)return;this._tourIndex=e-1,this._renderGuidedTourStep(!0)}catch(e){}}skipGuidedTour(){this._closeGuidedTour("skipped")}finishGuidedTour(){this._closeGuidedTour("done")}_closeGuidedTour(e){try{localStorage.setItem(this._guidedTourKey(),e||"done")}catch(t){}try{const t=document.getElementById("tour-root");t&&t.classList.add("hidden"),this._tourResizeHandler&&(window.removeEventListener("resize",this._tourResizeHandler),this._tourResizeHandler=null)}catch(t){}}openProfileReminderModal(e){const t=document.getElementById("modal-profile-reminder");if(!t)return;const s=document.getElementById("profile-reminder-close-btn"),i=document.getElementById("profile-reminder-later-btn"),o=document.getElementById("profile-reminder-title"),a=document.getElementById("profile-reminder-text");e?(o&&(o.textContent="Complete your profile to continue"),a&&(a.textContent="You'll need to finish setting up your profile \u2014 including locking in your handle \u2014 before you can move forward on Swapiki."),s&&s.classList.add("hidden"),i&&i.classList.add("hidden")):(o&&(o.textContent="Set your handle & complete your profile"),a&&(a.textContent="You haven't set your handle yet. Head to Edit Profile to lock it in and finish filling out your profile."),s&&s.classList.remove("hidden"),i&&i.classList.remove("hidden")),t.classList.remove("hidden")}closeProfileReminderModal(){const e=document.getElementById("modal-profile-reminder");e&&e.classList.add("hidden")}openEditProfileFromReminder(){this.closeProfileReminderModal(),this.openEditProfileModal()}async handleAvatarFileSelect(e){const t=e.target.files[0];if(!t)return;const s=URL.createObjectURL(t),i=document.getElementById("edit-avatar-preview");i&&(i.src=s),this.showToast("Uploading photo\u2026");try{const o=await swapikiStore.uploadFile(t,"avatar");this.uploadedAvatarUrl=o,i&&(i.src=o),this.showToast("Profile photo uploaded!")}catch(o){this.showToast(`\u274C ${o&&o.message||"Photo upload failed."}`),e.target.value=""}}async handleResumeFileSelect(e){const t=e.target.files[0];if(!t)return;if(t.size>2*1024*1024){this.showToast("\u26A0\uFE0F Resume file size must be under 2MB!"),e.target.value="";return}const s=document.getElementById("edit-resume-status");s&&(s.textContent=`Uploading "${t.name}"\u2026`);try{const i=await swapikiStore.uploadFile(t,"resume");this.uploadedResumeUrl=i,s&&(s.textContent=`\u2705 Attached: ${t.name}`),this.showToast(`Resume "${t.name}" uploaded!`)}catch(i){this.showToast(`\u274C ${i&&i.message||"Resume upload failed."}`),s&&(s.textContent="Upload failed. Please try again."),e.target.value=""}}closeEditProfileModal(){const e=document.getElementById("modal-edit-profile");e&&e.classList.add("hidden")}async handleProfileSave(e){e.preventDefault();const t=document.getElementById("edit-truth-attestation");if(t&&!t.checked){this.showToast("Please confirm your profile information is true before saving.");return}const s=swapikiStore.getProfile(),i=!!s.locked&&!!s.username;let o;if(i)o=s.username;else{const l=document.getElementById("edit-nickname").value;if(o=swapikiStore.formatNickname(l),!await this.checkNicknameAvailability(o)){this.showToast(`\u26A0\uFE0F Cannot save: "${o}" is unavailable or invalid.`);return}if(!confirm(`Once you save, your handle "${o}" will be locked and cannot be changed again. All other profile fields can still be edited any time. Continue?`))return}const a=document.getElementById("edit-expertise").value,n=a?a.split(",").map(l=>l.trim()).filter(l=>l.length>0):[],r={name:document.getElementById("edit-name").value,username:o,title:document.getElementById("edit-title").value,experience:document.getElementById("edit-experience").value,expertise:n,location:document.getElementById("edit-location").value,status:document.getElementById("edit-status").value,education:document.getElementById("edit-education").value,bio:document.getElementById("edit-bio").value,linkedin:document.getElementById("edit-linkedin").value,twitter:document.getElementById("edit-twitter")?document.getElementById("edit-twitter").value.trim():"",resumeLink:document.getElementById("edit-resume-link")?document.getElementById("edit-resume-link").value.trim():"",portfolio:document.getElementById("edit-portfolio")?document.getElementById("edit-portfolio").value.trim():"",locked:!0};this.uploadedAvatarUrl&&(r.avatar=this.uploadedAvatarUrl),this.uploadedResumeUrl&&(r.resumeUrl=this.uploadedResumeUrl),i||swapikiStore.registerNickname(o,r.id),swapikiStore.updateProfile(r),swapikiStore.recordProfileAttestation({name:r.name,attestedAt:new Date().toISOString()}),this.updateHandleLockNotice(!0),this.closeEditProfileModal(),this.showToast(i?"Profile updated!":`Profile updated & handle "${o}.swapiki.com" locked.`),router.navigate(router.currentView,!1)}handleResumeUpload(e){const t=e.target.files[0];t&&(this.showToast(`Parsing resume "${t.name}"...`),setTimeout(()=>{document.getElementById("proj-input-title").value="Payment Intent Retry & Webhook Engine",document.getElementById("proj-input-role").value="Senior Backend Architect",document.getElementById("proj-input-problem").value="Payment webhooks were delayed or duplicated during high-volume checkout events.",document.getElementById("proj-input-ownership").value="Owned the retry architecture, idempotency model, and Redis-backed event recovery flow.",document.getElementById("proj-input-impact").value="Achieved 99.98% payment webhook delivery SLA across 15M daily checkout transactions",document.getElementById("proj-input-github").value="https://github.com/example/webhook-retry-engine",document.getElementById("proj-input-live").value="https://example.com/payment-engine",document.getElementById("proj-input-takeaways").value=`Architected idempotent webhook event retry log with Redis cache
Reduced payment reconciliation latency from 45 mins to 1.2 seconds`,this.showToast("Resume parsed! Form auto-filled with project details & GitHub link.")},1e3))}openNotificationsModal(){const e=document.getElementById("modal-notifications");e&&e.classList.remove("hidden")}closeNotificationsModal(){const e=document.getElementById("modal-notifications");e&&e.classList.add("hidden")}openTermsModal(){const e=document.getElementById("modal-terms");e&&e.classList.remove("hidden")}closeTermsModal(){const e=document.getElementById("modal-terms");e&&e.classList.add("hidden")}openContactModal(){const e=document.getElementById("modal-contact");e&&e.classList.remove("hidden")}closeContactModal(){const e=document.getElementById("modal-contact");e&&e.classList.add("hidden")}openSupportModal(){const e=document.getElementById("modal-support");e&&e.classList.remove("hidden")}closeSupportModal(){const e=document.getElementById("modal-support");e&&e.classList.add("hidden")}openFeedbackModal(){const e=document.getElementById("modal-feedback");e&&e.classList.remove("hidden");const t=document.getElementById("feedback-message");t&&!t.value&&setTimeout(()=>t.focus(),50)}closeFeedbackModal(){const e=document.getElementById("modal-feedback");e&&e.classList.add("hidden")}async submitFeedback(e){e&&e.preventDefault();const t=document.getElementById("feedback-message"),s=document.getElementById("feedback-category"),i=document.getElementById("feedback-email"),o=t?t.value.trim():"";if(!o){this.showToast("Please write a sentence or two first.");return}const a=swapikiStore.submitFeedback({category:s?s.value:"general",message:o,email:i?i.value.trim():""});a&&a.ok?(t&&(t.value=""),i&&(i.value=""),this.closeFeedbackModal(),this.showToast("Thanks \u2014 feedback received and read.")):this.showToast(`\u274C ${a&&a.error||"Could not send feedback."}`)}openReportProfileModal(){const e=document.getElementById("modal-report-profile");if(!e)return;const t=this._reportTarget||{},s=document.getElementById("report-profile-target");s&&(s.textContent=t.name||t.username||"this profile");const i=document.getElementById("report-details");i&&(i.value="");const o=document.getElementById("report-email");o&&(o.value=""),e.classList.remove("hidden")}closeReportProfileModal(){const e=document.getElementById("modal-report-profile");e&&e.classList.add("hidden")}async submitProfileReport(e){e&&e.preventDefault();const t=this._reportTarget||{};if(!t.id){this.showToast("Could not tell which profile to report.");return}const s=document.getElementById("report-reason"),i=document.getElementById("report-details"),o=document.getElementById("report-email"),a=e&&e.target?e.target.querySelector('button[type="submit"]'):null,n=a?a.textContent:"";a&&(a.disabled=!0,a.textContent="Sending\u2026");let r;try{r=await swapikiStore.reportProfile({candidateId:t.id,reason:s?s.value:"other",details:i?i.value.trim():"",email:o?o.value.trim():"",pageUrl:t.username?`https://${t.username}.swapiki.com/`:""})}finally{a&&(a.disabled=!1,a.textContent=n)}r&&r.ok?(this.closeReportProfileModal(),this.showToast("Thanks \u2014 the report reached the Swapiki team.")):this.showToast(`\u274C ${r&&r.error||"Could not send the report."}`)}openSignupModal(){const e=document.getElementById("modal-signup");e&&e.classList.remove("hidden"),this.initGoogleButtons()}closeSignupModal(){const e=document.getElementById("modal-signup");e&&e.classList.add("hidden")}async handleSignup(e){e.preventDefault();const t=document.getElementById("terms-agree-checkbox");if(t&&!t.checked){this.showToast("You must agree to the Terms of Service & Privacy Policy.");return}const s=document.getElementById("signup-name-input"),i=document.getElementById("signup-email-input"),o=document.getElementById("signup-handle-input"),a=document.getElementById("signup-password-input"),n=s&&s.value.trim()?s.value.trim():"New Candidate",r=i?i.value.trim():"",l=a?a.value:"",p=o?o.value.trim():"",d=swapikiStore.formatNickname(p);if(!d||d.length<5){this.showToast("\u26A0\uFE0F Handle must be at least 5 characters long.");return}if(/^\d+$/.test(d)){this.showToast("\u26A0\uFE0F Numbers-only handles are not allowed.");return}if(!swapikiStore.handleHasNameAndNumber(d)){this.showToast("\u26A0\uFE0F Handle needs both a name and a number to register (e.g. rahul92).");return}if(!r){this.showToast("\u26A0\uFE0F Work email is required.");return}if(!l||l.length<8){this.showToast("\u26A0\uFE0F Password must be at least 8 characters long.");return}if(swapikiStore.isNicknameTakenSync(d)){this.showToast(`\u274C "${d}" is already taken or restricted.`);return}const b=document.getElementById("signup-honey-email");if(b&&b.value.trim()){this.showToast("Something went wrong. Please try again.");return}if(isDisposableEmail(r)){this.showToast("\u26A0\uFE0F Please use a permanent (non-temporary) email address.");return}try{const v=await fetch("/api/signup-guard",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:r,honeypot:b?b.value.trim():""})}).then(_=>_.json()).catch(()=>null);if(v&&v.allowed===!1){v.reason==="rate_limit"?this.showToast("Too many signup attempts from this device. Wait a few minutes and try again."):v.reason==="disposable"?this.showToast("\u26A0\uFE0F Please use a permanent (non-temporary) email address."):this.showToast("Something went wrong. Please try again.");return}}catch(v){}const u=e.target.querySelector('button[type="submit"]'),m=u?u.textContent:"";u&&(u.disabled=!0,u.textContent="Creating account\u2026");try{const{user:v,session:_}=await swapikiStore.signUpWithPassword(r,l,n);v&&swapikiStore.registerNickname(d,v.id),_&&v?(await swapikiStore.loadProfileForUser(v,d),this.refreshAuthUI(),this.closeSignupModal(),this.showToast(`Welcome to Swapiki, ${n.split(" ")[0]}! Build your proof profile.`),router.navigate("dashboard"),this.maybeStartGuidedTour()):(this._pendingSignup={email:r,cleanHandle:d,name:n},this.closeSignupModal(),this.openOtpModal(r))}catch(v){this.showToast(`\u274C ${v&&v.message||"Could not create your account. Please try again."}`)}finally{u&&(u.disabled=!1,u.textContent=m)}}openOtpModal(e){const t=document.getElementById("modal-otp");if(!t)return this.showToast(`Almost there \u2014 check ${e} for the 6-digit confirmation code.`);t.classList.remove("hidden");const s=document.getElementById("otp-email-address");s&&(s.textContent=e||"");const i=document.getElementById("otp-code-input");i&&(i.value="",i.focus());const o=document.getElementById("otp-submit-btn");o&&(o.disabled=!1)}closeOtpModal(){const e=document.getElementById("modal-otp");e&&e.classList.add("hidden")}async handleOtpSubmit(e){e.preventDefault();const t=this._pendingSignup,s=document.getElementById("otp-code-input"),i=s?s.value.replace(/\s+/g,"").trim():"";if(!t||!t.email){this.showToast("Please start signing up first.");return}if(!/^\d{6}$/.test(i)){this.showToast("Enter the 6-digit code from the email.");return}const o=document.getElementById("otp-submit-btn"),a=o?o.textContent:"";o&&(o.disabled=!0,o.textContent="Verifying\u2026");try{const{user:n,session:r}=await swapikiStore.verifyEmailOtp(t.email,i);r&&n?(await swapikiStore.loadProfileForUser(n,t.cleanHandle),this.refreshAuthUI(),this.closeOtpModal(),this.showToast(`Welcome to Swapiki, ${t.name.split(" ")[0]}! Build your proof profile.`),router.navigate("dashboard"),this.maybeStartGuidedTour()):n&&(this.closeOtpModal(),this.showToast("Email verified! Now log in with your password."),this.openLoginModal())}catch(n){const r=n&&n.message||"Could not verify the code.";this.showToast(`\u274C ${r}`)}finally{o&&(o.disabled=!1,o.textContent=a)}}async resendOtp(){const e=this._pendingSignup;if(!e||!e.email)return this.showToast("Please start signing up first.");try{await swapikiStore.resendEmailOtp(e.email);const t=document.getElementById("otp-resend-btn");if(t){const s=t.textContent;t.textContent="Sent! Check your inbox.",t.disabled=!0,setTimeout(()=>{t.textContent=s,t.disabled=!1},4e3)}this.showToast(`A fresh code is on its way to ${e.email}`)}catch(t){this.showToast(`\u274C ${t&&t.message||"Could not resend the code."}`)}}publishProfile(){const e=swapikiStore.getProfile();if(e.profileStatus==="suspended"){this.showToast("Your profile is paused while our team reviews a report.");return}if(e.profileStatus==="published")swapikiStore.unpublishProfile(),this.showToast("Profile unpublished and hidden from public view.");else if(e.projects.length<1){this.showToast("Add at least one proof project before publishing.");return}else swapikiStore.publishProfile(),this.showToast("Profile published and ready to share.");this.renderDashboard()}}window.app=new SwapikiApp,document.addEventListener("DOMContentLoaded",()=>window.app.init());
