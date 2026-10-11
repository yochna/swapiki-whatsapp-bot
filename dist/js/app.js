var L=Object.defineProperty;var H=(I,e,t)=>e in I?L(I,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):I[e]=t;var A=(I,e,t)=>H(I,typeof e!="symbol"?e+"":e,t);const DISPOSABLE_EMAIL_DOMAINS=new Set(["mailinator.com","mailinator.net","mailinator.org","mailinator2.com","guerrillamail.com","guerrillamail.org","guerrillamail.net","guerrillamail.info","guerrillamail.biz","guerrilla-mail.com","grr.la","sharklasers.com","10minutemail.com","10minutemail.net","temp-mail.org","temp-mail.io","tempmail.top","throwawaymail.com","trashmail.com","trash-mail.com","trashymail.com","yopmail.com","yopmail.fr","yopmail.net","yopmail.org","maildrop.cc","mailnesia.com","dispostable.com","mailcatch.com","getnada.com","nada.email","dropmail.me","mailsac.com","tempail.com","temporary-mail.net","tempsky.net","emailnator.com","moakt.com","moakt.co","fakemail.net","femail.com","quickinbox.com","harakirimail.com","discard.email","discardmail.com","discardmail.de","spambox.us","spambox.me","burner.email","jetable.com","33mail.com","spamgourmet.com","mytrashmail.com","mailmetrash.com","wuzupmail.com","freeml.net","zemail.eu","inboxbear.com"]);function isDisposableEmail(I){const e=(I||"").lastIndexOf("@");if(e<0)return!1;const t=(I||"").slice(e+1).toLowerCase();return DISPOSABLE_EMAIL_DOMAINS.has(t)}const ADMIN_PAGE_SIZE=15,DAILY_TOOL_JOB_LIMIT=5;class Router{constructor(){this.currentView="landing",window.addEventListener("popstate",()=>this.handleHash())}init(){document.querySelectorAll(".view-section").forEach(e=>{e.classList.remove("active-view")}),this.handleHash(),window.addEventListener("hashchange",()=>this.handleHash())}handleHash(){const e=window.location.hostname,t=window.location.pathname,s=window.location.hash.replace("#","")||"",i="swapiki.com";if(e===i||e.endsWith("."+i)){const r=e===i?"":e.slice(0,-(i.length+1));if(r&&r!=="www"){app.publicUsername=r,app._adminPreviewMode=!1,this.navigate("candidate",!1);return}}if(t.startsWith("/sites/")){app.publicUsername=t.split("/sites/")[1].split("/")[0],app._adminPreviewMode=!1,this.navigate("candidate",!1);return}else if(s.startsWith("sites/")){app.publicUsername=s.slice(6),app._adminPreviewMode=!1,this.navigate("candidate",!1);return}else if(s.startsWith("profile/")){app.publicUsername=decodeURIComponent(s.slice(8)),app._adminPreviewMode=!1,this.navigate("candidate",!1);return}else if(s.startsWith("admin-preview/")){app.publicUsername=decodeURIComponent(s.slice(14)),app._adminPreviewMode=!0,this.navigate("candidate",!1);return}if(s==="continue-with-google"){app.publicUsername=null,app._adminPreviewMode=!1,this.navigate("landing",!1),app.openLoginModal();return}if(s.startsWith("resume-draft/")){app._resumeJobId=decodeURIComponent(s.slice(13).split("?")[0])||null,app._adminPreviewMode=!1,this.navigate("resume-draft",!1);return}if(s.startsWith("interview-prep/")){app._interviewJobId=decodeURIComponent(s.slice(15).split("?")[0])||null,app._adminPreviewMode=!1,this.navigate("interview-prep",!1);return}if(app.publicUsername=null,app._adminPreviewMode=!1,(t==="/jobs"||t==="/jobs/")&&!(!!s&&s!=="jobs")){this.navigate("jobs",!1);return}if(s&&this.currentView===s)return;const n=s||(window.app&&app.isAuthenticated()?"dashboard":"landing");this.navigate(n,!1)}goHome(){this.navigate(window.app&&app.isAuthenticated()?"dashboard":"landing")}navigate(e,t=!0){["landing","dashboard","candidate","jobs","add-project","admin","admin-jobs","resume-draft","interview-prep"].includes(e)||(e="landing"),["dashboard","add-project"].includes(e)&&!app.isAuthenticated()&&(e="landing",app.showToast("Please log in to access your dashboard."),app.openLoginModal()),e==="admin"&&!(window.swapikiStore&&swapikiStore.isAdminUser)&&(e="landing",app.showToast("Admin access required.")),e==="admin-jobs"&&!(window.swapikiStore&&swapikiStore.isAdminUser)&&(e="landing",app.showToast("Admin access required.")),this.currentView=e,t&&(window.location.hash=e),document.querySelectorAll(".view-section").forEach(n=>{n.classList.remove("active-view")});const a=e,o=document.getElementById(`view-${a}`);if(o&&(o.classList.add("active-view"),window.scrollTo({top:0,left:0,behavior:"instant"})),e==="dashboard")app.renderDashboard();else if(e==="candidate")window.app&&app._adminPreviewMode||swapikiStore.incrementViews(),app.renderCandidateProfile();else if(e==="landing"){if(window.posthog&&typeof window.posthog.capture=="function")try{window.posthog.capture("view_landing")}catch(n){}app.renderLandingView()}else if(e==="jobs"){if(window.posthog&&typeof window.posthog.capture=="function")try{window.posthog.capture("view_jobs")}catch(n){}app.renderJobsView()}else e==="resume-draft"?app.renderResumeDraftView():e==="interview-prep"?app.renderInterviewPrepView():e==="admin"?app.renderAdminDashboard():e==="admin-jobs"&&app.renderAdminJobsView()}}class SwapikiApp{constructor(){A(this,"_closeMobileMenuOnClickOutside",e=>{const t=e&&e.target&&e.target.closest&&e.target.closest('[onclick="app.toggleMobileMenu()"]'),s=document.getElementById("mobile-nav-menu");if(!t&&s&&!s.contains(e.target)){s.classList.add("hidden");const i=document.getElementById("mobile-menu-icon");i&&(i.textContent="menu"),document.removeEventListener("click",this._closeMobileMenuOnClickOutside)}});A(this,"_closeAdminMenuOnClickOutside",e=>{const t=e&&e.target&&e.target.closest&&e.target.closest('[onclick*="toggleAdminMenu"]'),s=document.getElementById("admin-menu");!t&&s&&!s.contains(e.target)&&(s.classList.add("hidden"),document.removeEventListener("click",this._closeAdminMenuOnClickOutside))});this.heroPlaying=!1,this.currentRecordingProjectId=null,this.recordedAudioUrl=null,this.recordedDurationStr=null,this.recordingValid=!1,this.activeAudioElement=null,this._adminJobs=[],this._adminJobBusy={},this._adminRenderInFlight=null,this._adminRenderQueued=!1}async init(){var e;try{await swapikiStore.applyConfig();const t=window.location.hostname==="swapiki.com"||window.location.hostname.endsWith(".swapiki.com");(swapikiStore.siteEnv==="prod"||t)&&(this.ensureGoogleScript(),this.initGoogleButtons(),typeof window.SWAPIKI_initPosthog=="function"&&("requestIdleCallback"in window?window.requestIdleCallback(window.SWAPIKI_initPosthog,{timeout:2500}):window.setTimeout(window.SWAPIKI_initPosthog,2500))),await swapikiStore.getSession(),this.refreshAuthUI(),document.addEventListener("click",s=>{const i=s.target&&s.target.closest?s.target.closest("[data-tg-link]"):null;i&&(s.preventDefault(),this._openTelegramDeepLink(i))}),this._ghHydrateNotes().catch(()=>{}),window.router=new Router,window.router.init()}finally{(e=document.getElementById("initial-loader"))==null||e.remove()}}formatBytes(e){if(e==null||isNaN(e))return"\u2014";if(e===0)return"0 B";const t=["B","KB","MB","GB","TB"],s=Math.min(Math.floor(Math.log(e)/Math.log(1024)),t.length-1),i=e/Math.pow(1024,s);return`${i>=100?Math.round(i):i.toFixed(1)} ${t[s]}`}formatDuration(e){if(e==null||isNaN(e))return"\u2014";if(e=Math.round(e),e<60)return`${e}s`;const t=Math.floor(e/60),s=e%60;return`${t}m ${s}s`}renderAdminStatCards(e,t,s){const i=e?e.published_count:s.filter(p=>p.profile_status==="published").length,a=e?e.unpublished_count:s.length-i,o=e?e.total_users:s.length,n=window.SWAPIKI_CONFIG&&window.SWAPIKI_CONFIG.STORAGE_QUOTA_BYTES||1024*1024*1024;let r="\u2014",l=e?"":"Run admin_stats_migration.sql";if(e&&e.space_utilized_bytes!=null){const p=e.space_utilized_bytes,b=n>0?p/n*100:0;r=`${b<10?b.toFixed(1):Math.round(b)}%`,l=`${e.file_count!=null?`${e.file_count} files \xB7 `:""}${this.formatBytes(p)} of ${this.formatBytes(n)}`}const m=t&&t.configured&&t.avg_session_seconds!=null?this.formatDuration(t.avg_session_seconds):"\u2014",c=t&&t.configured?`avg. / session, last ${t.window_days||30}d`:"Connect PostHog to enable",h=[{label:"Published",value:String(i),sub:"candidate profiles",icon:"visibility",color:"emerald"},{label:"Unpublished",value:String(a),sub:"candidate profiles",icon:"visibility_off",color:"slate"},{label:"Total Users",value:String(o),sub:"all accounts",icon:"group",color:"primary"},{label:"Space Utilized",value:r,sub:l,icon:"cloud",color:"amber"},{label:"Avg. Time Spent",value:m,sub:c,icon:"schedule",color:"indigo"}],u={emerald:{bg:"bg-emerald-50",icon:"text-emerald-600",bar:"bg-emerald-500"},slate:{bg:"bg-slate-100",icon:"text-slate-500",bar:"bg-slate-400"},primary:{bg:"bg-primary-fixed",icon:"text-primary",bar:"bg-primary"},amber:{bg:"bg-amber-50",icon:"text-amber-600",bar:"bg-amber-500"},indigo:{bg:"bg-indigo-50",icon:"text-indigo-600",bar:"bg-indigo-500"}};return`
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        ${h.map(p=>{const b=u[p.color]||u.slate,y=/^\d+$/.test(p.value);return`
          <div class="admin-stat-card group relative overflow-hidden border border-slate-200 rounded-xl p-4 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <div class="absolute top-0 left-0 right-0 h-0.5 ${b.bar}"></div>
            <div class="flex items-center justify-between mb-3">
              <span class="text-[11px] font-bold uppercase tracking-wide text-slate-500">${p.label}</span>
              <span class="w-8 h-8 rounded-lg ${b.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200">
                <span class="material-symbols-outlined text-lg ${b.icon}">${p.icon}</span>
              </span>
            </div>
            <div class="admin-stat-value text-2xl font-bold text-slate-900 tracking-tight" ${y?`data-target="${p.value}"`:""}>${y?"0":p.value}</div>
            <div class="text-xs text-slate-400 mt-0.5 truncate">${p.sub}</div>
          </div>
        `}).join("")}
      </div>
    `}animateAdminStatCards(){document.querySelectorAll(".admin-stat-value[data-target]").forEach(t=>{const s=parseInt(t.getAttribute("data-target"),10)||0,i=700,a=performance.now(),o=n=>{const r=Math.min((n-a)/i,1),l=1-Math.pow(1-r,3);t.textContent=String(Math.round(l*s)),r<1?requestAnimationFrame(o):t.textContent=String(s)};requestAnimationFrame(o)})}renderAdminCharts(e,t,s){const i=s?s.published_count:e.filter(b=>b.profile_status==="published").length,a=e.length||1,o=Math.max(a-i,0),n=Math.round(i/a*100),r=42,l=2*Math.PI*r,m=i/a*l,c=`
      <div class="border border-slate-200 rounded-xl bg-white shadow-sm p-4 flex items-center gap-5">
        <svg width="104" height="104" viewBox="0 0 104 104" class="shrink-0 -rotate-90">
          <circle cx="52" cy="52" r="${r}" fill="none" stroke="#E2E8F0" stroke-width="12"></circle>
          <circle cx="52" cy="52" r="${r}" fill="none" stroke="#10B981" stroke-width="12"
            stroke-linecap="round"
            class="admin-donut-ring"
            stroke-dasharray="${m} ${l-m}"></circle>
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
            <span class="ml-auto font-bold text-slate-800">${o}</span>
          </div>
        </div>
      </div>
    `,h=[{label:"Candidates",value:e.length,color:"bg-primary"},{label:"Admins",value:t.length,color:"bg-indigo-500"}],u=Math.max(...h.map(b=>b.value),1),p=`
      <div class="border border-slate-200 rounded-xl bg-white shadow-sm p-4">
        <div class="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Accounts by role</div>
        <div class="space-y-3">
          ${h.map(b=>`
            <div>
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="font-medium text-slate-600">${b.label}</span>
                <span class="font-bold text-slate-800">${b.value}</span>
              </div>
              <div class="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div class="admin-bar-fill h-full ${b.color} rounded-full" style="width: 0%" data-bar-target="${b.value/u*100}"></div>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;return`
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        ${c}
        ${p}
      </div>
    `}renderAdminEngagementStats(e,t){const s=!!(e&&e.profile_not_started_count!=null),i=(c,h)=>t.filter(u=>{var b;const p=(b=u.completion_score)!=null?b:30;return p>=c&&p<=h}).length,a=s?e.login_only_count:null,o=s?e.profile_partial_count+e.profile_near_complete_count:i(31,99),n=s?e.voice_missing_count:null,r=s?e.profile_complete_count:i(100,100),l="Run updated admin_stats_migration.sql";return`
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        ${[{label:"Login Only",value:a!=null?String(a):"\u2014",sub:a!=null?"signed up, no profile":l,icon:"login",bg:"bg-slate-100",iconColor:"text-slate-500",bar:"bg-slate-400"},{label:"Half-Filled",value:String(o),sub:"candidates, profile in progress",icon:"hourglass_top",bg:"bg-amber-50",iconColor:"text-amber-600",bar:"bg-amber-500"},{label:"No Voice Recorded",value:n!=null?String(n):"\u2014",sub:n!=null?"candidates, no audio yet":l,icon:"mic_off",bg:"bg-rose-50",iconColor:"text-rose-600",bar:"bg-rose-500"},{label:"Fully Complete",value:String(r),sub:"profile + voice recorded",icon:"task_alt",bg:"bg-emerald-50",iconColor:"text-emerald-600",bar:"bg-emerald-500"}].map(c=>{const h=/^\d+$/.test(c.value);return`
          <div class="admin-stat-card group relative overflow-hidden border border-slate-200 rounded-xl p-4 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <div class="absolute top-0 left-0 right-0 h-0.5 ${c.bar}"></div>
            <div class="flex items-center justify-between mb-3">
              <span class="text-[11px] font-bold uppercase tracking-wide text-slate-500">${c.label}</span>
              <span class="w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200">
                <span class="material-symbols-outlined text-lg ${c.iconColor}">${c.icon}</span>
              </span>
            </div>
            <div class="admin-stat-value text-2xl font-bold text-slate-900 tracking-tight" ${h?`data-target="${c.value}"`:""}>${h?"0":c.value}</div>
            <div class="text-xs text-slate-400 mt-0.5 truncate">${c.sub}</div>
          </div>
        `}).join("")}
      </div>
    `}renderAdminEngagementCharts(e,t){const s=!!(e&&e.profile_not_started_count!=null),i=t.length||1,a=(h,u)=>t.filter(p=>{var y;const b=(y=p.completion_score)!=null?y:30;return b>=h&&b<=u}).length,o=s?e.voice_recorded_count:null,n=s?e.voice_missing_count:i-(o||0);let r;if(o==null)r=`
        <div class="border border-slate-200 rounded-xl bg-white shadow-sm p-4 flex items-center justify-center text-center">
          <div>
            <span class="material-symbols-outlined text-2xl text-slate-300 block mb-1">mic</span>
            <p class="text-xs text-slate-400">Run updated admin_stats_migration.sql to enable voice-recording stats.</p>
          </div>
        </div>
      `;else{const u=2*Math.PI*42,p=Math.max(o+n,1),b=o/p*u,y=Math.round(o/p*100);r=`
        <div class="border border-slate-200 rounded-xl bg-white shadow-sm p-4 flex items-center gap-5">
          <svg width="104" height="104" viewBox="0 0 104 104" class="shrink-0 -rotate-90">
            <circle cx="52" cy="52" r="42" fill="none" stroke="#E2E8F0" stroke-width="12"></circle>
            <circle cx="52" cy="52" r="42" fill="none" stroke="#6366F1" stroke-width="12"
              stroke-linecap="round"
              class="admin-donut-ring"
              stroke-dasharray="${b} ${u-b}"></circle>
          </svg>
          <div class="flex-1 min-w-0">
            <div class="text-2xl font-bold text-slate-900 leading-none mb-1">${y}%</div>
            <div class="text-xs text-slate-400 mb-3">of candidates recorded a voice clip</div>
            <div class="flex items-center gap-2 text-xs mb-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0"></span>
              <span class="text-slate-600 font-medium">Recorded</span>
              <span class="ml-auto font-bold text-slate-800">${o}</span>
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0"></span>
              <span class="text-slate-600 font-medium">Not recorded</span>
              <span class="ml-auto font-bold text-slate-800">${n}</span>
            </div>
          </div>
        </div>
      `}const l=s?[{label:"Not started",value:e.profile_not_started_count,color:"bg-slate-400"},{label:"Basic info added",value:e.profile_partial_count,color:"bg-amber-500"},{label:"Missing voice only",value:e.profile_near_complete_count,color:"bg-orange-500"},{label:"Fully complete",value:e.profile_complete_count,color:"bg-emerald-500"}]:[{label:"Not started",value:a(0,30),color:"bg-slate-400"},{label:"Basic info added",value:a(31,69),color:"bg-amber-500"},{label:"Missing voice only",value:a(70,99),color:"bg-orange-500"},{label:"Fully complete",value:a(100,100),color:"bg-emerald-500"}],m=Math.max(...l.map(h=>h.value),1),c=`
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
                <div class="admin-bar-fill h-full ${h.color} rounded-full" style="width: 0%" data-bar-target="${h.value/m*100}"></div>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;return`
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        ${r}
        ${c}
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
        ${Array.from({length:i}).map((a,o)=>`
          <div class="h-12 flex items-center gap-4 px-4 ${o!==i-1?"border-b border-slate-100":""}">
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
    `}adminInitials(e){const t=(e||"").trim();if(!t)return"?";const s=t.split(/\s+/).filter(Boolean);return(s.length>1?s[0][0]+s[1][0]:t.slice(0,2)).toUpperCase()}adminAvatarColor(e){const t=["bg-primary-fixed text-primary","bg-emerald-100 text-emerald-700","bg-amber-100 text-amber-700","bg-indigo-100 text-indigo-700","bg-rose-100 text-rose-700","bg-slate-200 text-slate-600"],s=String(e||"");let i=0;for(let a=0;a<s.length;a++)i=i*31+s.charCodeAt(a)|0;return t[Math.abs(i)%t.length]}adminSectionHeader(e,t,s,i="",a=""){return`
      <div class="flex items-center gap-2 mb-3">
        <span class="material-symbols-outlined text-lg text-slate-400">${s}</span>
        <h3 class="text-lg font-bold text-slate-900">${e}</h3>
        <span class="text-xs font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5"${a?` data-admin-total="${a}"`:""}>${t}</span>
        ${i?`<span class="ml-auto">${i}</span>`:""}
      </div>
    `}feedbackCategoryColor(e){return{broken:"bg-rose-50 text-rose-600",confusing:"bg-amber-50 text-amber-700",missing:"bg-indigo-50 text-indigo-700",idea:"bg-emerald-50 text-emerald-700"}[e]||"bg-slate-100 text-slate-600"}escapeHtml(e){return String(e==null?"":e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}csvEscape(e){const t=e==null?"":String(e);return/[",\n\r]/.test(t)?`"${t.replace(/"/g,'""')}"`:t}async exportCandidatesCSV(){const e=document.getElementById("admin-export-csv-btn"),t=e?e.innerHTML:null;e&&(e.disabled=!0,e.innerHTML='<span class="material-symbols-outlined text-lg animate-spin">progress_activity</span> Exporting\u2026');try{const s=this._adminCandidatesCache||await swapikiStore.adminListCandidates();if(!s||s.length===0){this.showToast("No candidates to export yet.");return}const i=[{key:"name",label:"Name"},{key:"username",label:"Handle"},{key:"email",label:"Email"},{key:"phone",label:"Phone"},{key:"profile_status",label:"Status"},{key:"title",label:"Headline"},{key:"experience",label:"Experience"},{key:"expertise",label:"Skills & Expertise"},{key:"location",label:"Location"},{key:"education",label:"Education"},{key:"linkedin",label:"LinkedIn"},{key:"twitter",label:"Twitter / X"},{key:"resumeLink",label:"Resume Link"},{key:"portfolio",label:"Portfolio"},{key:"created_at",label:"Joined"}],a=i.map(h=>this.csvEscape(h.label)).join(","),o=s.map(h=>i.map(u=>{let p=h[u.key];return Array.isArray(p)&&(p=p.join("; ")),this.csvEscape(p)}).join(",")),n="\uFEFF"+[a,...o].join(`\r
`),r=new Blob([n],{type:"text/csv;charset=utf-8;"}),l=URL.createObjectURL(r),m=document.createElement("a"),c=new Date().toISOString().slice(0,10);m.href=l,m.download=`swapiki-candidates-${c}.csv`,document.body.appendChild(m),m.click(),document.body.removeChild(m),URL.revokeObjectURL(l),this.showToast(`\u2705 Exported ${s.length} candidate${s.length===1?"":"s"} to CSV.`)}catch(s){this.showToast(`\u274C ${s&&s.message||"Could not export CSV."}`)}finally{e&&(e.disabled=!1,e.innerHTML=t)}}adminEmptyState(e,t,s){return`
      <tr>
        <td colspan="${e}" class="py-10 text-center">
          <div class="flex flex-col items-center gap-2">
            <span class="material-symbols-outlined text-3xl text-slate-300">${this.escapeHtml(t)}</span>
            <span class="text-sm text-slate-400">${this.escapeHtml(s)}</span>
          </div>
        </td>
      </tr>
    `}async renderAdminDashboard(){return this._adminRenderInFlight?(this._adminRenderQueued=!0,this._adminRenderInFlight):(this._adminRenderInFlight=(async()=>{try{for(let e=0;e<2&&(this._adminRenderQueued=!1,await this.renderAdminDashboardPass(),!!this._adminRenderQueued);e++);}finally{this._adminRenderInFlight=null,this._adminRenderQueued=!1}})(),this._adminRenderInFlight)}async renderAdminDashboardPass(){const e=document.getElementById("admin-dashboard-container");if(!e)return;const t=document.getElementById("admin-refresh-btn");t&&(t.disabled=!0,t.innerHTML='<span class="material-symbols-outlined text-lg animate-spin">progress_activity</span> Refreshing\u2026'),e.innerHTML=this.renderAdminDashboardSkeleton();try{const[s,i,a,o,n,r]=await Promise.all([swapikiStore.adminListCandidates(),swapikiStore.adminListAdmins(),swapikiStore.adminGetStats().catch(()=>null),swapikiStore.adminGetTimeStats().catch(()=>({configured:!1})),swapikiStore.adminListFeedback().catch(()=>[]),swapikiStore.adminListJobs().catch(()=>[])]);this._adminJobs=r||[],this.watchAdminBreakpoint(),this._adminCandidatesCache=s;const l=this.renderAdminStatCards(a,o,s),m=this.renderAdminCharts(s,i,a),c=this.renderAdminEngagementStats(a,s),h=this.renderAdminEngagementCharts(a,s),u=f=>`animation-delay: ${Math.min(f*.03,.3)}s`,p=this.adminCandidatePage(s),{rows:b,cards:y}=this.adminCandidatesMarkup(p.page),v=i.map((f,E)=>`
        <tr class="admin-row-fade border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors" style="${u(E)}">
          <td class="py-3 px-3">
            <div class="flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-full ${this.adminAvatarColor(f.email)} flex items-center justify-center text-[11px] font-bold shrink-0">${this.adminInitials(f.email)}</span>
              <span class="text-sm font-bold text-slate-800 whitespace-nowrap">${f.email||"(no email on file)"}</span>
            </div>
          </td>
          <td class="py-3 px-3 text-sm text-slate-400 whitespace-nowrap">${f.created_at?new Date(f.created_at).toLocaleDateString():"\u2014"}</td>
          <td class="py-3 px-3 text-right whitespace-nowrap">
            <button onclick="app.adminRemoveAdmin(this.dataset.uid, this.dataset.email)" data-uid="${this.escapeHtml(f.user_id||"")}" data-email="${this.escapeHtml(f.email||"")}" title="Remove admin access"
              class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:scale-90 transition-all">
              <span class="material-symbols-outlined text-lg">person_remove</span>
            </button>
          </td>
        </tr>
      `).join(""),x=i.map((f,E)=>`
        <div class="admin-row-fade admin-mobile-card border border-slate-200 rounded-xl bg-white shadow-sm p-3.5 flex items-center gap-2.5" style="${u(E)}">
          <span class="w-9 h-9 rounded-full ${this.adminAvatarColor(f.email)} flex items-center justify-center text-xs font-bold shrink-0">${this.adminInitials(f.email)}</span>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-bold text-slate-800 truncate">${f.email||"(no email on file)"}</div>
            <div class="text-xs text-slate-400">${f.created_at?new Date(f.created_at).toLocaleDateString():"\u2014"}</div>
          </div>
          <button onclick="app.adminRemoveAdmin(this.dataset.uid, this.dataset.email)" data-uid="${this.escapeHtml(f.user_id||"")}" data-email="${this.escapeHtml(f.email||"")}"
            class="inline-flex items-center justify-center w-9 h-9 rounded-lg text-rose-600 bg-rose-50 active:scale-90 transition-all shrink-0">
            <span class="material-symbols-outlined text-lg">person_remove</span>
          </button>
        </div>
      `).join("");e.innerHTML=`
        ${l}
        ${m}

        <div class="admin-fade-in">
          ${this.adminSectionHeader("Profile Completion & Engagement",s.length,"insights")}
          ${c}
          ${h}
        </div>

        <div class="admin-fade-in mb-8">
          ${this.adminSectionHeader("Candidates",s.length,"badge","","candidates")}
          ${this.adminSearchToolbar("candidates",{view:p,placeholder:"Search candidates \u2014 name, handle, email, phone",label:"Search candidates",extra:`<button type="button" onclick="app.adminSortCandidates()" data-admin-sort="candidates" title="Sort by name" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all whitespace-nowrap"><span class="material-symbols-outlined text-sm">sort_by_alpha</span> <span data-admin-sort-label="candidates">${this.adminSortLabel()}</span></button>`})}
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
              <tbody id="admin-candidates-tbody">${b||this.adminEmptyState(6,"badge",this.adminCandidateEmptyText(p))}</tbody>
            </table>
          </div>
          <div class="md:hidden space-y-2.5" id="admin-candidates-cards">
            ${y||this.adminCandidateCardsEmpty(p)}
          </div>
          <div id="admin-candidates-pager">${this.adminPager("candidates",p)}</div>
        </div>

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
              <tbody>${n.map(f=>`
                <tr class="border-b border-slate-100 last:border-0 align-top">
                  <td class="py-3 px-3 text-xs text-slate-400 whitespace-nowrap">${swapikiStore.timeAgo(f.created_at)}</td>
                  <td class="py-3 px-3 whitespace-nowrap">
                    <span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${this.feedbackCategoryColor(f.category)}">${f.category}</span>
                  </td>
                  <td class="py-3 px-3 text-sm text-slate-700 max-w-md whitespace-pre-line">${this.escapeHtml(f.message)}</td>
                  <td class="py-3 px-3 text-sm text-slate-500 whitespace-nowrap">${this.escapeHtml(f.name||"")}${f.email?'<span class="block text-xs text-slate-400">'+this.escapeHtml(f.email)+"</span>":""}</td>
                  <td class="py-3 px-3 text-xs text-slate-400 break-all max-w-[12rem]">${this.escapeHtml(f.url||"")}</td>
                </tr>
              `).join("")||this.adminEmptyState(5,"edit_note","No feedback yet \u2014 the widget on every page feeds this list.")}</tbody>
            </table>
          </div>
          <div class="md:hidden space-y-2.5">
            ${n.map(f=>`
              <div class="border border-slate-200 rounded-xl bg-white shadow-sm p-3.5">
                <div class="flex items-center gap-2 mb-1.5">
                  <span class="inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${this.feedbackCategoryColor(f.category)}">${f.category}</span>
                  <span class="text-xs text-slate-400">${swapikiStore.timeAgo(f.created_at)}</span>
                </div>
                <p class="text-sm text-slate-700 whitespace-pre-line">${this.escapeHtml(f.message)}</p>
                <p class="text-xs text-slate-400 mt-1.5">${this.escapeHtml(f.name||"Anonymous")}${f.email?" \xB7 "+this.escapeHtml(f.email):""}</p>
                <p class="text-[11px] text-slate-400 break-all">${this.escapeHtml(f.url||"")}</p>
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
              <tbody>${v||this.adminEmptyState(3,"shield_person","No admins yet.")}</tbody>
            </table>
          </div>
          <div class="md:hidden space-y-2.5">
            ${x||'<div class="border border-slate-200 rounded-xl bg-white p-8 text-center"><span class="material-symbols-outlined text-3xl text-slate-300 block mb-2">shield_person</span><span class="text-sm text-slate-400">No admins yet.</span></div>'}
          </div>
        </div>
      `,this.bindAdminSelection(e),["draft","published"].forEach(f=>this.adminSyncBulkBar(f));const w=document.getElementById("admin-last-refreshed");w&&(w.textContent=`Updated ${new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`),this.animateAdminStatCards(),this.animateAdminBars()}catch(s){e.innerHTML=`
        <div class="border border-rose-200 bg-rose-50 rounded-xl p-6 flex items-start gap-3">
          <span class="material-symbols-outlined text-rose-500 text-2xl">error</span>
          <div>
            <p class="text-sm font-bold text-rose-700">Could not load admin data</p>
            <p class="text-sm text-rose-600 mt-0.5">${s&&s.message||"Please try refreshing."}</p>
          </div>
        </div>
      `}finally{t&&(t.disabled=!1,t.innerHTML='<span class="material-symbols-outlined text-lg">refresh</span> Refresh')}}async adminTogglePublish(e,t){const s=t==="published"?"draft":"published";try{await swapikiStore.adminSetProfileStatus(e,s),this.showToast(`Profile ${s==="published"?"published":"unpublished"}.`),this.renderAdminDashboard()}catch(i){this.showToast(`\u274C ${i&&i.message||"Could not update profile status."}`)}}async adminToggleStaffReview(e,t){try{await swapikiStore.adminSetStaffReview(e,t),this.showToast(t?"Marked as reviewed by the Swapiki team \u2014 trust badge now shows on their public profile.":"Review mark removed."),this.renderAdminDashboard()}catch(s){this.showToast(`\u274C ${s&&s.message||"Could not update review status."}`)}}async adminDeleteCandidate(e,t){if(confirm(`Permanently delete "${t||"this candidate"}"? This cannot be undone.`))try{await swapikiStore.adminDeleteCandidate(e),this.showToast("Candidate deleted."),this.renderAdminDashboard()}catch(s){this.showToast(`\u274C ${s&&s.message||"Could not delete candidate."}`)}}adminPrefersCards(){try{if(typeof window!="undefined"&&window.matchMedia)return window.matchMedia("(max-width: 767px)").matches}catch(e){}return!0}watchAdminBreakpoint(){if(!this._adminBreakpointWatched)try{if(typeof window=="undefined"||!window.matchMedia)return;const e=window.matchMedia("(max-width: 767px)");if(typeof e.addEventListener!="function")return;e.addEventListener("change",()=>{this.repaintAdminJobs()}),this._adminBreakpointWatched=e}catch(e){}}adminListState(e){return this._adminLists||(this._adminLists={}),this._adminLists[e]||(this._adminLists[e]={q:"",page:1,dir:1}),this._adminLists[e]}adminMatchesQuery(e,t){const s=String(e==null?"":e).toLowerCase().split(/\s+/).filter(Boolean);if(!s.length)return!0;const i=(t||[]).filter(Boolean).join(" ").toLowerCase();return s.every(a=>i.includes(a))}adminPaged(e,t,s){const i=this.adminListState(t),a=e||[],o=a.filter(h=>this.adminMatchesQuery(i.q,s(h))),n=Math.max(1,Math.ceil(o.length/ADMIN_PAGE_SIZE)),r=Math.floor(Number(i.page)||1),l=Math.min(Math.max(r,1),n);i.page!==l&&(i.page=l);const m=(l-1)*ADMIN_PAGE_SIZE,c=o.slice(m,m+ADMIN_PAGE_SIZE);return{page:c,total:a.length,matched:o.length,shown:c.length,pageNo:l,pageCount:n,hasPrev:l>1,hasNext:l<n}}adminPager(e,t){if(!t||t.pageCount<=1)return"";const s="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95",i="text-primary bg-primary-fixed hover:opacity-80",a="text-slate-400 bg-slate-100 cursor-not-allowed active:scale-100";return`
      <div class="flex items-center justify-center gap-2 mt-3" data-admin-pager="${e}">
        <button type="button" onclick="app.adminPrevPage('${e}')" data-admin-prev="${e}" ${t.hasPrev?"":"disabled"}
          title="Previous page" class="${s} ${t.hasPrev?i:a}">
          <span class="material-symbols-outlined text-sm">chevron_left</span> Back
        </button>
        <span class="text-[11px] font-bold text-slate-500 tabular-nums whitespace-nowrap px-1" data-admin-pageinfo="${e}">Page ${t.pageNo} of ${t.pageCount}</span>
        <button type="button" onclick="app.adminShowMore('${e}')" data-admin-more="${e}" ${t.hasNext?"":"disabled"}
          title="Next page" class="${s} ${t.hasNext?i:a}">
          Show more <span class="material-symbols-outlined text-sm">expand_more</span>
        </button>
      </div>`}adminViewFor(e){return e==="candidates"?this.adminCandidatePage(this._adminCandidatesCache||[]):this.adminJobPage(this._adminJobs||[],e)}adminSearchToolbar(e,t){const s=this.adminListState(e),i=t||{},a=i.view||{matched:0,total:0,pageCount:1,pageNo:1};return`
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
        <span class="text-[11px] text-slate-400 whitespace-nowrap tabular-nums" data-admin-count="${e}">${this.adminViewCountText(a,s.q)}</span>
        <button type="button" onclick="app.adminClearSearch('${e}')" data-admin-clear="${e}"
          class="text-[11px] font-bold text-slate-500 hover:text-primary whitespace-nowrap ${s.q?"":"hidden"}">Clear</button>
      </div>`}adminViewCountText(e,t){const s=e&&e.matched||0;return t&&!s?"nothing matches":t?`${s} matching`:`${s} ${s===1?"row":"rows"}`}adminSyncViewControls(e,t){const s=this.adminListState(e),i=t||this.adminViewFor(e),a=document.querySelector(`[data-admin-count="${e}"]`);a&&(a.textContent=this.adminViewCountText(i,s.q));const o=document.querySelector(`[data-admin-total="${e}"]`);o&&(o.textContent=String(i.total));const n=document.querySelector(`[data-admin-clear="${e}"]`);n&&n.classList.toggle("hidden",!s.q);const r=document.querySelector('[data-admin-sort-label="candidates"]');r&&(r.textContent=this.adminSortLabel())}adminRepaintList(e){const t=e==="candidates"?this.repaintAdminCandidates():this.repaintAdminJobs();return t||this.renderAdminDashboard(),t}adminOnSearch(e,t){const s=this.adminListState(e),i=String(t==null?"":t);i!==s.q&&(s.q=i,s.page=1,this.adminRepaintList(e))}adminClearSearch(e){const t=this.adminListState(e);if(!t.q&&t.page===1)return;t.q="",t.page=1;const s=document.querySelector(`[data-admin-search="${e}"]`);s&&(s.value=""),this.adminRepaintList(e)}adminShowMore(e){const t=this.adminListState(e);t.page=this.adminViewFor(e).pageNo+1,this.adminRepaintList(e)}adminPrevPage(e){const t=this.adminListState(e);t.page=Math.max(1,this.adminViewFor(e).pageNo-1),this.adminRepaintList(e)}adminSortCandidates(){const e=this.adminListState("candidates");e.dir=e.dir===1?-1:1,this.repaintAdminCandidates()||this.renderAdminDashboard()}adminSortLabel(){return this.adminListState("candidates").dir===-1?"Z\u2013A":"A\u2013Z"}adminJobFields(e){return[e.title,e.company,e.location,e.category,e.source,e.contact_email,e.contact_phone,e.raw_text]}adminJobPage(e,t){const s=(e||[]).filter(a=>a&&a.status===t),i=this.adminFeaturedFirst(s);return this.adminPaged(i,t,a=>this.adminJobFields(a))}adminIsFeatured(e){return!!(e&&(e.featured===!0||e.featured==="true"||e.featured==="t"))}adminFeaturedFirst(e){const t=[],s=[];for(const i of e)(this.adminIsFeatured(i)?t:s).push(i);return t.concat(s)}adminCandidatePage(e){const s=this.adminListState("candidates").dir===-1?-1:1,i=(e||[]).slice().sort((a,o)=>{const n=String(a&&a.name||"").trim(),r=String(o&&o.name||"").trim();return!n&&r?1:n&&!r?-1:!n&&!r?0:n.localeCompare(r,void 0,{sensitivity:"base"})*s});return this.adminPaged(i,"candidates",a=>[a.name,a.username,a.email,a.phone,a.title,a.location,a.status,Array.isArray(a.expertise)?a.expertise.join(" "):a.expertise])}adminCandidatesMarkup(e){const t=e||[],s=o=>`animation-delay:${Math.min(o*.03,.3)}s`,i=t.map((o,n)=>`
      <tr class="admin-row-fade border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors" style="${s(n)}">
        <td class="py-3 px-3">
          <button onclick="app.adminViewCandidateProfile(this.dataset.username)" data-username="${this.escapeHtml(o.username||"")}"
            class="flex items-center gap-2.5 text-left group" ${o.username?"":"disabled"}>
            <span class="w-8 h-8 rounded-full ${this.adminAvatarColor(o.email||o.name)} flex items-center justify-center text-[11px] font-bold shrink-0">${this.adminInitials(o.name)}</span>
            <span class="text-sm font-bold text-slate-800 whitespace-nowrap ${o.username?"group-hover:text-primary group-hover:underline":""}">${this.escapeHtml(o.name||"(no name)")}</span>
          </button>
        </td>
        <td class="py-3 px-3 text-sm text-slate-500 whitespace-nowrap">${this.escapeHtml(o.username||"\u2014")}</td>
        <td class="py-3 px-3 text-sm text-slate-500 whitespace-nowrap">${this.escapeHtml(o.email||"\u2014")}</td>
        <td class="py-3 px-3 text-sm text-slate-500 whitespace-nowrap">${this.escapeHtml(o.phone||"\u2014")}</td>
        <td class="py-3 px-3">
          <span class="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${o.profile_status==="published"?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-600"}">
            <span class="w-1.5 h-1.5 rounded-full ${o.profile_status==="published"?"bg-emerald-500":"bg-slate-400"}"></span>
            ${this.escapeHtml(o.profile_status||"draft")}
          </span>
          <span title="${o.voice_verified?"Recording confirmed live: the candidate read a random code into a microphone. This is not an identity check.":"No confirmed live recording yet - useful spam triage signal"}"
            class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full mt-1 ${o.voice_verified?"bg-emerald-50 text-emerald-700":o.voice_verification_count>=3&&!o.voice_verified?"bg-rose-50 text-rose-600":"bg-slate-50 text-slate-400"}">
            <span class="material-symbols-outlined text-[12px]">${o.voice_verified?"verified":"record_voice_over"}</span>
            ${o.voice_verified?"Live recording confirmed":o.voice_verification_count>=3&&!o.voice_verified?"Flagged (3+ fails)":o.voice_verification_count?`${o.voice_verification_count} attempt${o.voice_verification_count===1?"":"s"}, not confirmed`:"No recording check"}
          </span>
          <span title="Set ONLY by a human on the Swapiki team (admin \u2192 Mark reviewed). Lights up the 'Reviewed by Swapiki team' badge on the public profile. Never set automatically."
            class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full mt-1 ${o.staff_reviewed_at?"bg-sky-50 text-sky-700":"bg-slate-50 text-slate-400"}">
            <span class="material-symbols-outlined text-[12px]">${o.staff_reviewed_at?"verified_user":"fact_check"}</span>
            ${o.staff_reviewed_at?"Reviewed by Swapiki team":"Unreviewed"}
          </span>
        </td>
        <td class="py-3 px-3 text-right whitespace-nowrap">
          <button onclick="app.adminToggleStaffReview('${o.id}', ${o.staff_reviewed_at?"false":"true"})" title="${o.staff_reviewed_at?"Remove the Swapiki team review mark":"Mark as reviewed by Swapiki team \u2014 shows the public trust badge"}"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg ${o.staff_reviewed_at?"text-sky-600 hover:bg-sky-50":"text-slate-400 hover:text-sky-700 hover:bg-sky-50"} active:scale-90 transition-all">
            <span class="material-symbols-outlined text-lg">${o.staff_reviewed_at?"verified_user":"fact_check"}</span>
          </button>
          <button onclick="app.adminTogglePublish('${o.id}', '${o.profile_status}')" title="${o.profile_status==="published"?"Unpublish":"Publish"}"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-primary hover:bg-primary-fixed active:scale-90 transition-all">
            <span class="material-symbols-outlined text-lg">${o.profile_status==="published"?"visibility_off":"visibility"}</span>
          </button>
          <button onclick="app.adminDeleteCandidate(this.dataset.id, this.dataset.name)" data-id="${this.escapeHtml(o.id||"")}" data-name="${this.escapeHtml(o.name||"")}" title="Delete"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:scale-90 transition-all">
            <span class="material-symbols-outlined text-lg">delete</span>
          </button>
        </td>
      </tr>`),a=t.map((o,n)=>`
      <div class="admin-row-fade admin-mobile-card border border-slate-200 rounded-xl bg-white shadow-sm p-3.5" style="${s(n)}">
        <div class="flex items-start justify-between gap-2">
          <button onclick="app.adminViewCandidateProfile(this.dataset.username)" data-username="${this.escapeHtml(o.username||"")}"
            class="flex items-center gap-2.5 min-w-0 text-left" ${o.username?"":"disabled"}>
            <span class="w-9 h-9 rounded-full ${this.adminAvatarColor(o.email||o.name)} flex items-center justify-center text-xs font-bold shrink-0">${this.adminInitials(o.name)}</span>
            <div class="min-w-0">
              <div class="text-sm font-bold text-slate-800 truncate ${o.username?"hover:text-primary hover:underline":""}">${this.escapeHtml(o.name||"(no name)")}</div>
              <div class="text-xs text-slate-400 truncate">${o.username?"@"+this.escapeHtml(o.username):"\u2014"}</div>
            </div>
          </button>
          <span class="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${o.profile_status==="published"?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-600"}">
            <span class="w-1.5 h-1.5 rounded-full ${o.profile_status==="published"?"bg-emerald-500":"bg-slate-400"}"></span>
            ${this.escapeHtml(o.profile_status||"draft")}
          </span>
        </div>
        <div class="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-y-1.5 text-xs">
          <span class="text-slate-400">Email</span>
          <span class="text-slate-600 text-right truncate">${this.escapeHtml(o.email||"\u2014")}</span>
          <span class="text-slate-400">Phone</span>
          <span class="text-slate-600 text-right truncate">${this.escapeHtml(o.phone||"\u2014")}</span>
        </div>
        <div class="mt-3 flex gap-2">
          <button onclick="app.adminToggleStaffReview('${o.id}', ${o.staff_reviewed_at?"false":"true"})"
            class="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold ${o.staff_reviewed_at?"text-sky-700 bg-sky-50":"text-slate-600 bg-slate-100"} active:scale-[0.97] transition-all">
            <span class="material-symbols-outlined text-base">${o.staff_reviewed_at?"verified_user":"fact_check"}</span>
            ${o.staff_reviewed_at?"Reviewed \u2713":"Mark reviewed"}
          </button>
          <button onclick="app.adminTogglePublish('${o.id}', '${o.profile_status}')"
            class="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold text-primary bg-primary-fixed active:scale-[0.97] transition-all">
            <span class="material-symbols-outlined text-base">${o.profile_status==="published"?"visibility_off":"visibility"}</span>
            ${o.profile_status==="published"?"Unpublish":"Publish"}
          </button>
          <button onclick="app.adminDeleteCandidate(this.dataset.id, this.dataset.name)" data-id="${this.escapeHtml(o.id||"")}" data-name="${this.escapeHtml(o.name||"")}"
            class="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold text-rose-600 bg-rose-50 active:scale-[0.97] transition-all">
            <span class="material-symbols-outlined text-base">delete</span> Delete
          </button>
        </div>
      </div>`);return{rows:i.join(""),cards:a.join("")}}repaintAdminCandidates(){const e=document.getElementById("admin-candidates-tbody"),t=document.getElementById("admin-candidates-cards"),s=document.getElementById("admin-candidates-pager");if(!e&&!t)return!1;const i=this.adminCandidatePage(this._adminCandidatesCache||[]),{rows:a,cards:o}=this.adminCandidatesMarkup(i.page);return e&&(e.innerHTML=a||this.adminEmptyState(6,"badge",this.adminCandidateEmptyText(i))),t&&(t.innerHTML=o||this.adminCandidateCardsEmpty(i)),s&&(s.innerHTML=this.adminPager("candidates",i)),this.adminSyncViewControls("candidates",i),!0}adminCandidateEmptyText(e){const t=this.adminListState("candidates").q;return t&&!e.matched?`No candidate matches \u201C${t}\u201D.`:e.total?"No candidates match the search.":"No candidates yet."}adminCandidateCardsEmpty(e){const t=this.adminCandidateEmptyText(e);return`<div class="border border-slate-200 rounded-xl bg-white p-8 text-center"><span class="material-symbols-outlined text-3xl text-slate-300 block mb-2">badge</span><span class="text-sm text-slate-400">${this.escapeHtml(t)}</span></div>`}repaintAdminJobs(){const e=document.getElementById("admin-draft-inner"),t=document.getElementById("admin-published-inner");if(!e||!t)return!1;const s=this._adminJobs||[],i={draft:this.adminJobPage(s,"draft"),published:this.adminJobPage(s,"published")},a=this.adminJobsMarkup(s,i);return e.innerHTML=a.draft,t.innerHTML=a.published,["draft","published"].forEach(o=>{this.adminSyncBulkBar(o),this.adminSyncViewControls(o,i[o])}),!0}renderAdminJobsSection(e){const t=e||[],s={draft:this.adminJobPage(t,"draft"),published:this.adminJobPage(t,"published")},i=this.adminJobsMarkup(t,s);return`<div id="admin-jobs-section" class="admin-fade-in mb-8">
      ${this.adminSectionHeader("Job Review",s.draft.total,"work","","draft")}
      ${this.adminSearchToolbar("draft",{view:s.draft,placeholder:"Search drafts \u2014 title, company, place, or the original post",label:"Search drafts waiting for review"})}
      <div id="admin-draft-inner">${i.draft}</div>
      <h4 class="text-sm font-bold text-slate-700 mb-2 mt-6">Published (<span data-admin-total="published">${s.published.total}</span>)</h4>
      ${this.adminSearchToolbar("published",{view:s.published,placeholder:"Search published jobs \u2014 title, company, or place",label:"Search published jobs"})}
      <div id="admin-published-inner">${i.published}</div>
    </div>`}adminJobsMarkup(e,t){const s=e||[],i=t||{draft:this.adminJobPage(s,"draft"),published:this.adminJobPage(s,"published")},a=i.draft.page,o=i.published.page,n=this.adminListState("draft").q,r=this.adminListState("published").q,l=s.filter(d=>d.status==="rejected"),m=a.map(d=>`
      <tr class="admin-row-fade border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors">
        <td class="py-3 px-3 w-8">
          <input type="checkbox" class="admin-job-check w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" value="${d.id}" data-group="draft" aria-label="Select ${this.escapeHtml(d.title||"this job")}"/>
        </td>
        <td class="py-3 px-3">
          <div class="flex items-start gap-1.5">
            <div class="min-w-0 flex-1">
              <div class="text-sm font-bold text-slate-800">${this.escapeHtml(d.title||"(untitled)")}</div>
              <div class="text-xs text-slate-400">${this.escapeHtml(d.company||"-")}${d.location?" \xB7 "+this.escapeHtml(d.location):""}</div>
              ${this.adminJobProvenance(d)}
              ${d.raw_text?`<details class="mt-1"><summary class="text-[10px] font-bold text-slate-400 cursor-pointer hover:text-primary">Original post</summary><p class="text-[11px] text-slate-500 mt-1 whitespace-pre-wrap leading-relaxed">${this.escapeHtml(d.raw_text)}</p></details>`:""}
            </div>
            ${this.adminFeaturedBadge(d)}
          </div>
        </td>

        <td class="py-3 px-3 text-xs text-slate-500">${this.escapeHtml(d.category||"\u2014")}</td>
        <td class="py-3 px-3">
          <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Draft</span>
        </td>
        <td class="py-3 px-3 text-right whitespace-nowrap">
          ${this.adminFeatureButton(d)}
          <button onclick="app.adminApproveJob('${d.id}')" title="Publish to the board"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-emerald-600 hover:bg-emerald-50 active:scale-90 transition-all"><span class="material-symbols-outlined text-lg">check_circle</span></button>
          <button onclick="app.adminRejectJob('${d.id}')" title="Reject \u2014 the row is kept and can be reopened"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-amber-600 hover:bg-amber-50 active:scale-90 transition-all"><span class="material-symbols-outlined text-lg">block</span></button>
          <button onclick="app.adminDeleteJob('${d.id}')" title="Delete permanently \u2014 this cannot be undone"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-rose-500 hover:bg-rose-50 active:scale-90 transition-all"><span class="material-symbols-outlined text-lg">delete</span></button>
        </td>
      </tr>`),c=o.map(d=>`
      <tr class="admin-row-fade border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors">
        <td class="py-3 px-3 w-8">
          <input type="checkbox" class="admin-job-check w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" value="${d.id}" data-group="published" aria-label="Select ${this.escapeHtml(d.title||"this job")}"/>
        </td>
        <td class="py-3 px-3">
          <div class="flex items-start gap-1.5">
            <div class="min-w-0 flex-1">
              <div class="text-sm font-bold text-slate-800">${this.escapeHtml(d.title||"(untitled)")}</div>
              <div class="text-xs text-slate-400">${this.escapeHtml(d.company||"-")}${d.location?" \xB7 "+this.escapeHtml(d.location):""}</div>
            </div>
            ${this.adminFeaturedBadge(d)}
          </div>
        </td>
        <td class="py-3 px-3 text-xs text-slate-500">${this.escapeHtml(d.category||"-")}</td>
        <td class="py-3 px-3">
          <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Published</span>
        </td>
        <td class="py-3 px-3 text-right whitespace-nowrap">
          ${this.adminFeatureButton(d)}
          <button onclick="app.adminUnpublishJob('${d.id}')" title="Move back to draft"

            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-primary hover:bg-primary-fixed active:scale-90 transition-all"><span class="material-symbols-outlined text-lg">visibility_off</span></button>
          <button onclick="app.adminRejectJob('${d.id}')" title="Reject \u2014 the row is kept and can be reopened"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-amber-600 hover:bg-amber-50 active:scale-90 transition-all"><span class="material-symbols-outlined text-lg">block</span></button>
          <button onclick="app.adminDeleteJob('${d.id}')" title="Delete permanently \u2014 this cannot be undone"
            class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-rose-500 hover:bg-rose-50 active:scale-90 transition-all"><span class="material-symbols-outlined text-lg">delete</span></button>
        </td>
      </tr>`),h={emerald:"text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-50",rose:"text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-rose-50",slate:"text-slate-500 bg-slate-50 border border-slate-200 hover:bg-slate-100 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-50"},u={draft:[{status:"published",label:"Publish selected",icon:"check_circle",tone:"emerald"},{status:"rejected",label:"Reject selected",icon:"block",tone:"rose"}],published:[{status:"draft",label:"Move to draft",icon:"visibility_off",tone:"slate"},{status:"rejected",label:"Reject selected",icon:"block",tone:"rose"}]},p=(d,$)=>`
      <div class="hidden md:flex flex-wrap items-center gap-2 mb-3">
        <label class="inline-flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none">
          <input type="checkbox" class="admin-job-check-all w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" data-group="${d}" aria-label="Select all ${$}"/>
          Select all
        </label>
        <span class="text-xs text-slate-400" data-selected-count="${d}">0 selected</span>
        <span class="flex-1"></span>
        ${u[d].map(S=>`
        <button type="button" onclick="app.adminBulkSetStatus('${d}', '${S.status}')" data-bulk-action="${S.status}" data-group="${d}"
          class="admin-bulk-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold ${h[S.tone]}">
          <span class="material-symbols-outlined text-base">${S.icon}</span> ${S.label}
        </button>`).join("")}
      </div>`,b=(d,$,S,C)=>`
      <button onclick="app.${C.action}('${d}')" title="${this.escapeHtml(C.title)}"
        class="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold ${C.cls} active:scale-[0.97] transition-all">
        <span class="material-symbols-outlined text-base">${S}</span> ${$}
      </button>`,y={publish:{cls:"text-emerald-700 bg-emerald-50",title:"Publish to the board",action:"adminApproveJob"},reject:{cls:"text-amber-700 bg-amber-50",title:"Reject \u2014 the row is kept and can be reopened",action:"adminRejectJob"},unpublish:{cls:"text-slate-600 bg-slate-100",title:"Move back to draft",action:"adminUnpublishJob"},destroy:{cls:"text-rose-600 bg-rose-50",title:"Delete permanently \u2014 this cannot be undone",action:"adminDeleteJob"}},v=(d,$)=>$==="draft"?b(d.id,"Publish","check_circle",y.publish)+b(d.id,"Reject","block",y.reject)+b(d.id,"Delete","delete",y.destroy):b(d.id,"To draft","visibility_off",y.unpublish)+b(d.id,"Reject","block",y.reject)+b(d.id,"Delete","delete",y.destroy),x=(d,$,S)=>d.length?d.map((C,T)=>{const j=$[T]||{},B=[j.company,j.location].filter(Boolean).map(P=>this.escapeHtml(P)).join(" \xB7 ");return`
          <div class="admin-mobile-card border border-slate-200 rounded-xl bg-white shadow-sm p-3.5 admin-row-fade" style="animation-delay:${Math.min(T*.03,.3)}s">
            <div class="text-sm font-bold text-slate-800 truncate">${this.escapeHtml(j.title||"(untitled)")}</div>
            ${B?`<div class="text-xs text-slate-400 truncate">${B}</div>`:""}
            ${this.adminJobProvenance(j)}
            ${j.raw_text?`<details class="mt-1"><summary class="text-[10px] font-bold text-slate-400 cursor-pointer hover:text-primary">Original post</summary><p class="text-[11px] text-slate-500 mt-1 whitespace-pre-wrap leading-relaxed">${this.escapeHtml(j.raw_text)}</p></details>`:""}
            <div class="mt-3 flex gap-2">${j.id?v(j,S):""}</div>
          </div>`}).join(""):"",w=this.adminPrefersCards(),f=(d,$,S,C)=>w?`<div class="md:hidden space-y-2 mt-3">${d.length?x(d,$,C):this.escapeHtml(S)}</div>`:"",E=(d,$,S,C,T)=>`
      <div class="${$?"hidden md:block":""} overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
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
          <tbody>${d.length?d.join(""):this.adminEmptyState(5,"work_off",S)}</tbody>
        </table>
      </div>
      ${f(d,C,S,T)}`,_=(d,$)=>`No ${d} match \u201C${$}\u201D. Clear the search to see the rest.`,k=n?_("drafts",n):"Nothing to review. New openings arrive here from the jobs page.",g=r?_("published jobs",r):"No published jobs yet. Review an opening above to fill the board.";return{draft:`
        ${a.length?p("draft","drafts"):""}
        ${E(m,!0,k,a,"draft")}
        ${this.adminPager("draft",i.draft)}
        ${l.length?this.rejectedNote(l):""}`,published:`
        ${o.length?p("published","published jobs"):""}
        ${E(c,!1,g,o,"published")}
        ${this.adminPager("published",i.published)}`}}rejectedNote(e){const t=e.length,s=e.slice(0,25).map(o=>`
      <li class="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
        <span class="text-xs text-slate-600 truncate">${this.escapeHtml(o.title||"(untitled)")}<span class="text-slate-400"> \xB7 ${this.escapeHtml(o.company||"\u2014")}</span></span>
        <button onclick="app.adminReopenJob('${o.id}')" title="Put this back in the review queue"
          class="shrink-0 text-[10px] font-bold text-primary hover:underline whitespace-nowrap">Reopen</button>
      </li>`).join(""),i=t>25?`<li class="pt-1.5 text-[10px] text-slate-400">and ${t-25} more</li>`:"",a=e.filter(o=>o.source==="user-submission").length;return`
      <details class="mt-3 border border-slate-200 rounded-xl bg-white">
        <summary class="cursor-pointer select-none px-3.5 py-2.5 text-xs font-bold text-slate-600 hover:text-primary">
          Rejected (${t}) \u2014 kept, and can be reopened
        </summary>
        <div class="px-3.5 pb-3">
          <p class="text-[11px] text-slate-400 mb-1">${a} of these ${a===1?"was":"were"} posted by an employer. Nothing here is deleted.</p>
          <ul class="mt-1">${s}${i}</ul>
        </div>
      </details>`}adminJobProvenance(e){const t=String(e&&e.source||"").trim();if(t==="user-submission"){const n=String(e&&(e.contact||e.apply_url)||"").trim();let r="";if(n)try{const m=new URL(n);(m.protocol==="http:"||m.protocol==="https:")&&(r=m.href)}catch(m){}return`<div class="mt-1 flex items-center gap-2 flex-wrap">
        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Posted by employer</span>
        ${n?r?`<a href="${this.escapeHtml(r)}" target="_blank" rel="noopener noreferrer nofollow" class="text-[10px] font-bold text-primary hover:underline break-all">${this.escapeHtml(n)}</a>`:`<span class="text-[10px] text-slate-500 break-all">${this.escapeHtml(n)}</span>`:'<span class="text-[10px] text-rose-500">no contact given</span>'}
      </div>`}if(t!=="adzuna")return"";const s="From Adzuna",i=String(e&&(e.apply_url||e.contact)||"").trim();let a="";if(i)try{const n=new URL(i);(n.protocol==="http:"||n.protocol==="https:")&&(a=n.href)}catch(n){}const o=a?`<a href="${this.escapeHtml(a)}" target="_blank" rel="noopener noreferrer nofollow"
           class="text-[10px] font-bold text-primary hover:underline">view on Adzuna</a>`:"";return`<div class="mt-1 flex items-center gap-2">
      <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">${s}</span>
      ${o}
    </div>`}adminFeaturedBadge(e){return this.adminIsFeatured(e)?`<button type="button" onclick="app.adminSetFeatured(this.dataset.id, false)" data-id="${this.escapeHtml(e.id||"")}"
      title="Pinned above every other listing on the board and in the emails. Click to unpin."
      class="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 active:scale-95 transition-all shrink-0 align-middle">
      <span class="material-symbols-outlined" style="font-size:12px">push_pin</span> Pinned
    </button>`:""}adminFeatureButton(e){return this.adminIsFeatured(e)?"":`<button type="button" onclick="app.adminSetFeatured(this.dataset.id, true)" data-id="${this.escapeHtml(e.id||"")}"
      title="Pin to the top of the jobs board, the weekly digest and the nudge emails"
      class="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 active:scale-90 transition-all shrink-0"
      aria-label="Pin this listing to the top"><span class="material-symbols-outlined text-base">push_pin</span></button>`}jobFeaturedLabel(e){return this.adminIsFeatured(e)?`<span class="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 align-middle" title="Featured listing">
      <span class="material-symbols-outlined" style="font-size:12px">push_pin</span> Pinned
    </span>`:""}async adminSetFeatured(e,t){const s=String(e||"");if(!s)return!1;const i=!!t;try{await swapikiStore.adminSetJobFeatured(s,i);const a=(this._adminJobs||[]).map(o=>o.id===s?{...o,featured:i}:o);return this._adminJobs=a,this.repaintAdminJobs(),this.showToast(i?"Pinned to the top of the board and the emails.":"Unpinned."),!0}catch(a){return this.showToast(`Could not change the pin: ${a&&a.message||"try again."}`),!1}}renderJobSubmitForm(){const e="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all";return`
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
      </details>`}renderChannelJoinCard(){const e=typeof window!="undefined"&&window.SWAPIKI_CONFIG||{},t=String(e.TELEGRAM_CHANNEL_URL||"").trim(),s=String(e.WHATSAPP_CHANNEL_URL||"").trim(),i=String(e.TELEGRAM_BOT_USERNAME||"").trim(),a=this.isAuthenticated&&this.isAuthenticated();if(!t&&!s&&!i)return"";const o=c=>"https://api.qrserver.com/v1/create-qr-code/?size=176x176&margin=0&data="+encodeURIComponent(c),n=(c,h,u,p,b)=>`
      <a href="${this.escapeHtml(b)}" target="_blank" rel="noopener noreferrer"
         class="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 hover:border-primary/40 hover:shadow-sm transition-all">
        <img src="${o(b)}" alt="QR code to join the ${this.escapeHtml(c)} channel" width="88" height="88"
             loading="lazy" referrerpolicy="no-referrer" class="w-[88px] h-[88px] rounded-lg border border-slate-100 shrink-0"/>
        <span class="min-w-0">
          <span class="flex items-center gap-2 text-sm font-bold text-slate-800">
            <span class="material-symbols-outlined text-[18px] ${p}">${u}</span>
            ${this.escapeHtml(c)}
          </span>
          <span class="block text-xs text-slate-500 mt-1">${this.escapeHtml(h)}</span>
        </span>
      </a>`,r=i?`https://t.me/${encodeURIComponent(i)}?start=channel`:t,l=[];if(r&&l.push(n("Telegram","Job alerts the moment they are approved, plus profile tips.","send","text-sky-500",r)),s&&l.push(n("WhatsApp","Job alerts on WhatsApp. Tap the link or scan to join.","chat","text-emerald-500",s)),!l.length)return"";const m=a&&i?'<button type="button" class="mt-3 text-xs font-bold text-primary hover:underline" data-tg-link>Get your personal Telegram link</button>':"";return`
      <section class="mb-6" aria-label="Join our channels">
        <div class="flex items-center gap-2 mb-3">
          <span class="material-symbols-outlined text-primary text-[18px]">notifications_active</span>
          <h2 class="text-sm font-bold text-slate-800">Get new jobs the moment they go live</h2>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${l.join("")}</div>
        ${m}
      </section>`}async _openTelegramDeepLink(e){if(e.dataset.busy==="1")return;e.dataset.busy="1";const t=e.textContent;e.textContent="Creating your link\u2026",e.disabled=!0;try{const{deepLink:s,token:i}=await swapikiStore.getTelegramLink();if(s){window.open(s,"_blank","noopener"),i&&this._showTelegramCode(e,i);return}window.open(String((window.SWAPIKI_CONFIG||{}).TELEGRAM_CHANNEL_URL||"https://t.me/"),"_blank","noopener")}catch(s){typeof console!="undefined"&&console.warn("telegram link failed:",s&&s.message),window.open(String((window.SWAPIKI_CONFIG||{}).TELEGRAM_CHANNEL_URL||"https://t.me/"),"_blank","noopener")}finally{e.textContent=t,e.disabled=!1,delete e.dataset.busy}}_showTelegramCode(e,t){const s=e&&e.closest?e.closest("section"):null;if(!s)return;let i=s.querySelector("[data-tg-code]");i||(i=document.createElement("div"),i.setAttribute("data-tg-code",""),i.className="mt-2 text-xs text-slate-500",s.appendChild(i)),i.innerHTML=`On the phone? Send this code to the bot chat instead: <button type="button" class="font-mono font-bold text-primary underline-offset-2 hover:underline" data-tg-copy>${this.escapeHtml(String(t))}</button>`;const a=i.querySelector("[data-tg-copy]");a&&navigator&&navigator.clipboard&&a.addEventListener("click",()=>{navigator.clipboard.writeText(String(t)).catch(()=>{}),a.textContent="Copied!"})}async submitJobForm(e){e.preventDefault();const t=l=>document.getElementById(l),s=l=>((t(l)||{}).value||"").trim(),i=t("job-form-result"),a=t("job-form-submit"),o=(l,m)=>{i&&(i.innerHTML=`<div class="text-xs rounded-lg px-3 py-2 border ${m}">${l}</div>`)},n={title:s("job-form-title"),company:s("job-form-company"),location:s("job-form-location"),salary:s("job-form-salary"),category:s("job-form-category")||"any",contact:s("job-form-contact"),description:s("job-form-description"),rawText:s("job-form-raw"),skills:s("job-form-skills").split(",").map(l=>l.trim()).filter(Boolean),honeypot:s("job-form-hp")},r=[];if(n.title||r.push("a job title"),n.company||r.push("the company name"),n.contact||r.push("an apply link, email or phone number"),r.length){o(`Add ${r.join(", ")}.`,"bg-amber-50 border-amber-200 text-amber-700");return}a&&(a.disabled=!0,a.textContent="Submitting\u2026");try{await swapikiStore.submitJob(n),o("\u2705 Received. An admin reviews every submission before it appears on the board.","bg-emerald-50 border-emerald-200 text-emerald-700");const l=document.querySelector("#post-a-job form");l&&typeof l.reset=="function"&&l.reset()}catch(l){const m=l&&l.message||"Could not submit that job. Please try again.";o(`\u274C ${this.escapeHtml(m)}`,"bg-rose-50 border-rose-200 text-rose-700")}finally{a&&(a.disabled=!1,a.textContent="Submit for review")}}adminSelectedJobIds(e){return Array.from(document.querySelectorAll(`.admin-job-check[data-group="${e}"]:checked`)).map(t=>t.value)}adminSyncBulkBar(e){const t=document.querySelectorAll(`.admin-job-check[data-group="${e}"]`).length,s=this.adminSelectedJobIds(e).length,i=document.querySelector(`[data-selected-count="${e}"]`);i&&(i.textContent=`${s} of ${t} selected`),document.querySelectorAll(`.admin-bulk-btn[data-group="${e}"]`).forEach(o=>{o.disabled=s===0});const a=document.querySelector(`.admin-job-check-all[data-group="${e}"]`);a&&(a.checked=t>0&&s===t,a.indeterminate=s>0&&s<t)}bindAdminSelection(e){!e||e._adminSelectionBound||typeof e.addEventListener=="function"&&(e._adminSelectionBound=!0,e.addEventListener("change",t=>{const s=t.target;!s||typeof s.matches!="function"||(s.matches(".admin-job-check[data-group]")?this.adminSyncBulkBar(s.dataset.group):s.matches(".admin-job-check-all[data-group]")&&this.adminToggleAllJobs(s.dataset.group,s.checked))}))}adminToggleAllJobs(e,t){document.querySelectorAll(`.admin-job-check[data-group="${e}"]`).forEach(s=>{s.checked=!!t}),this.adminSyncBulkBar(e)}async adminBulkSetStatus(e,t){const s=this.adminSelectedJobIds(e);if(!s.length)return;const i={published:{verb:"published",detail:"published to the board"},rejected:{verb:"rejected",detail:"rejected (kept, not deleted, and reversible)"},draft:{verb:"moved back to draft",detail:"moved back to draft and taken off the board"}}[t]||{verb:t,detail:`set to ${t}`},a=`${s.length} ${s.length===1?"job":"jobs"}`;if(!confirm(`${a} will be ${i.detail}. Continue?`))return;document.querySelectorAll(`.admin-bulk-btn[data-group="${e}"]`).forEach(r=>{r.disabled=!0});const n=new Map;(this._adminJobs||[]).forEach(r=>{r&&s.indexOf(r.id)!==-1&&n.set(r.id,r.status)}),this.applyAdminJobStatuses(Array.from(s),t);try{const r=await swapikiStore.adminSetJobStatusBulk(s,t);this.showToast(`\u2705 ${r} ${r===1?"job":"jobs"} ${i.verb}.`)}catch(r){this.applyAdminJobStatuses(Array.from(n.keys()),null,n),this.showToast(`\u274C ${r&&r.message||"Could not update the selected jobs."}`),this.adminSyncBulkBar(e)}}applyAdminJobStatuses(e,t,s){const i=new Set(e||[]);let a=!1;return(this._adminJobs||[]).forEach(o=>{!o||!i.has(o.id)||(o.status=t===null?s?s.get(o.id):o.status:t,a=!0)}),a&&!this.repaintAdminJobs()&&this.renderAdminDashboard(),a}async adminDecideJob(e,t,s){if(!e||this._adminJobBusy[e])return;this._adminJobBusy[e]=!0;const i=(this._adminJobs||[]).find(n=>n&&n.id===e),a=i?i.status:null,o=s||{published:"Job published to the board.",draft:"Job moved back to draft.",rejected:"Job rejected. The row is kept \u2014 reopen it from the Rejected list below."}[t]||`Job set to ${t}.`;this.applyAdminJobStatuses([e],t);try{await swapikiStore.adminSetJobStatus(e,t),this.showToast(o)}catch(n){this.applyAdminJobStatuses([e],null,new Map([[e,a]])),this.showToast(`\u274C ${n&&n.message||"Could not update the job."}`)}finally{delete this._adminJobBusy[e]}}adminApproveJob(e){return this.adminDecideJob(e,"published")}adminUnpublishJob(e){return this.adminDecideJob(e,"draft")}async adminRejectJob(e){if(!e||this._adminJobBusy[e])return;const t=this.adminJobTitle(e);if(confirm(`Reject "${t}"? The row is kept, not deleted, and can be reopened later.`))return this.adminDecideJob(e,"rejected")}adminReopenJob(e){return this.adminDecideJob(e,"draft","Reopened. The job is back in the review queue.")}async adminDeleteJob(e){const t=this.adminJobTitle(e);if(!confirm(`Delete "${t}" permanently?

This cannot be undone. If you only want it off the board, use Reject instead \u2014 that keeps the row.`)||this._adminJobBusy[e])return;this._adminJobBusy[e]=!0;const s=(this._adminJobs||[]).findIndex(i=>i&&i.id===e);try{await swapikiStore.adminDeleteJob(e),s!==-1&&this._adminJobs.splice(s,1),this.repaintAdminJobs()||this.renderAdminDashboard(),this.showToast("Job deleted.")}catch(i){this.showToast(`\u274C ${i&&i.message||"Could not delete the job."}`)}finally{delete this._adminJobBusy[e]}}adminJobTitle(e){const t=(this._adminJobs||[]).find(s=>s&&s.id===e);return t&&t.title||"this job"}async adminPromoteSubmit(e){e.preventDefault();const t=document.getElementById("admin-promote-email-input"),s=t?t.value.trim():"";if(!s)return;const i=e.target.querySelector('button[type="submit"]'),a=i?i.textContent:"";i&&(i.disabled=!0,i.textContent="Granting\u2026");try{const o=await swapikiStore.adminPromoteByEmail(s);this.showToast(`\u2705 ${o.email} is now an admin.`),t&&(t.value=""),this.renderAdminDashboard()}catch(o){this.showToast(`\u274C ${o&&o.message||"Could not grant admin access."}`)}finally{i&&(i.disabled=!1,i.textContent=a)}}async adminRemoveAdmin(e,t){const s=swapikiStore.currentUser;if(s&&e&&s.id===e){this.showToast("That is you. You cannot remove your own admin access \u2014 ask another admin to do it.");return}if(confirm(`Remove admin access for ${t||"this user"}?`))try{await swapikiStore.adminRemoveAdmin(e),this.showToast("Admin access removed."),this.renderAdminDashboard()}catch(i){this.showToast(`\u274C ${i&&i.message||"Could not remove admin access."}`)}}async renderAdminJobsView(){const e=document.getElementById("admin-jobs-container");if(!e)return;const t=document.getElementById("admin-jobs-refresh-btn");t&&(t.disabled=!0,t.innerHTML='<span class="material-symbols-outlined text-lg animate-spin">progress_activity</span> Refreshing\u2026'),e.innerHTML=`
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
        </div>`).join("")}`;const[s,i]=await Promise.all([swapikiStore.adminListJobs().catch(()=>[]),swapikiStore.adminGetJobsStats().catch(()=>({configured:!1}))]);try{this._adminJobs=s||[],this.watchAdminBreakpoint(),e.innerHTML=this.renderAdminJobsStats(i)+this.renderAdminJobsSection(s),["draft","published"].forEach(o=>this.adminSyncBulkBar(o)),this.bindAdminSelection(e),this.animateAdminStatCards();const a=document.getElementById("admin-jobs-last-refreshed");a&&(a.textContent=`Updated ${new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`)}catch(a){e.innerHTML=`<div class="border border-rose-200 bg-rose-50 rounded-xl p-6 flex items-start gap-3">
        <span class="material-symbols-outlined text-rose-500 text-2xl">error</span>
        <div>
          <p class="text-sm font-bold text-rose-700">Could not load the jobs admin</p>
          <p class="text-sm text-rose-600 mt-0.5">${this.escapeHtml(a&&a.message||"Please try refreshing.")}</p>
        </div>
      </div>`}finally{t&&(t.disabled=!1,t.innerHTML='<span class="material-symbols-outlined text-lg">refresh</span> Refresh')}}renderAdminJobsStats(e){if(!e||!e.configured)return`<div class="mb-6">
        ${this.adminSectionHeader("Usage","","insights")}
        <div class="border border-slate-200 rounded-xl bg-white p-6 text-center">
          <span class="material-symbols-outlined text-3xl text-slate-300 block mb-2">insights</span>
          <p class="text-sm text-slate-400">Usage statistics aren't set up on this deployment yet.</p>
        </div>
      </div>`;const t=e.window_days||30,s=e.tools||{},i=e.clicks||{},a=e.traffic||{},o=e.searches||{},n=(d,$,S)=>`${d} ${d===1?$:S}`,r=(d,$)=>`${n(d||0,"person","people")} \xB7 ${n($||0,"job","jobs")}`,l=(d,$,S,C)=>{if(!s.available)return{label:d,value:"\u2014",sub:"Run tool_usage_migration.sql",icon:S,color:C};const T=$||{uses:0,users:0,jobs:0};return{label:d,value:String(T.uses||0),sub:r(T.users,T.jobs),icon:S,color:C}},m=[l("Resume Drafts",s.resume,"description","primary"),l("Interview Prep",s.interview,"record_voice_over","indigo"),i.available?{label:"Apply Clicks",value:String(i.total||0),sub:r(i.users,i.jobs),icon:"ads_click",color:"emerald"}:{label:"Apply Clicks",value:"\u2014",sub:"Run job_clicks migration",icon:"ads_click",color:"emerald"},a.available?{label:"Profile Opens",value:String(a.total||0),sub:a.profiles?`across ${n(a.profiles,"profile","profiles")}`:"opens recorded so far",icon:"visibility",color:"amber"}:{label:"Profile Opens",value:"\u2014",sub:"Tracking not set up",icon:"visibility",color:"amber"}],c={primary:{bg:"bg-primary-fixed",icon:"text-primary",bar:"bg-primary"},indigo:{bg:"bg-indigo-50",icon:"text-indigo-600",bar:"bg-indigo-500"},emerald:{bg:"bg-emerald-50",icon:"text-emerald-600",bar:"bg-emerald-500"},amber:{bg:"bg-amber-50",icon:"text-amber-600",bar:"bg-amber-400"}},h=m.map(d=>{const $=c[d.color]||c.primary,S=/^\d+$/.test(d.value);return`
        <div class="admin-stat-card group relative overflow-hidden border border-slate-200 rounded-xl p-4 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div class="absolute top-0 left-0 right-0 h-0.5 ${$.bar}"></div>
          <div class="flex items-center justify-between mb-3">
            <span class="text-[11px] font-bold uppercase tracking-wide text-slate-500">${d.label}</span>
            <span class="w-8 h-8 rounded-lg ${$.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200">
              <span class="material-symbols-outlined text-lg ${$.icon}">${d.icon}</span>
            </span>
          </div>
          <div class="admin-stat-value text-2xl font-bold text-slate-900 tracking-tight"${S?` data-target="${d.value}"`:""}>${S?"0":d.value}</div>
          <div class="text-xs text-slate-400 mt-0.5 truncate">${d.sub}</div>
        </div>`}).join(""),u=Array.isArray(i.top_jobs)?i.top_jobs:[],p=u.length?u.map((d,$)=>`
        <tr class="border-b border-slate-100 last:border-0">
          <td class="py-2.5 px-3 text-xs font-bold text-slate-400 w-8">${$+1}</td>
          <td class="py-2.5 px-3">
            <div class="text-sm font-bold text-slate-800">${this.escapeHtml(d.title||"(untitled)")}</div>
            <div class="text-xs text-slate-400">${this.escapeHtml(d.company||"-")}</div>
          </td>
          <td class="py-2.5 px-3 text-right text-sm font-bold text-slate-700 whitespace-nowrap">${d.clicks||0}</td>
        </tr>`).join(""):'<tr><td colspan="3" class="py-6 text-center text-sm text-slate-400">No outbound clicks recorded in this window yet.</td></tr>',b=Array.isArray(a.referrers)?a.referrers:[],y=b.reduce((d,$)=>Math.max(d,$.views||0),0),v=b.length?b.map(d=>`
        <div class="py-2.5 px-3 border-b border-slate-100 last:border-0">
          <div class="flex items-center justify-between gap-3 mb-1.5">
            <span class="text-sm font-bold text-slate-700 truncate">${this.escapeHtml(d.source||"-")}</span>
            <span class="text-xs font-bold text-slate-500 tabular-nums shrink-0">${d.views||0}</span>
          </div>
          <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div class="h-full rounded-full bg-amber-400" style="width:${y?Math.max(3,Math.round((d.views||0)/y*100)):0}%"></div>
          </div>
        </div>`).join(""):'<p class="py-6 text-center text-sm text-slate-400">No profile opens recorded in this window yet.</p>',x=Array.isArray(a.top_profiles)?a.top_profiles:[],w=x.length?x.map((d,$)=>{const S=d.username?swapikiStore.formatNickname(d.username):"",C=d.name||(S?`@${S}`:"(profile not found)"),T=S?`<a class="text-xs text-primary hover:underline" href="https://${S}.swapiki.com/" target="_blank" rel="noopener">${this.escapeHtml(S)}.swapiki.com</a>`:"";return`
          <tr class="border-b border-slate-100 last:border-0">
            <td class="py-2.5 px-3 text-xs font-bold text-slate-400 w-8">${$+1}</td>
            <td class="py-2.5 px-3">
              <div class="text-sm font-bold text-slate-800">${this.escapeHtml(C)}</div>
              <div class="text-xs text-slate-400">${T||this.escapeHtml(d.title||"")}</div>
            </td>
            <td class="py-2.5 px-3 text-right text-sm font-bold text-slate-700 whitespace-nowrap">${d.views||0}</td>
          </tr>`}).join(""):'<tr><td colspan="3" class="py-6 text-center text-sm text-slate-400">No profile opens recorded in this window yet.</td></tr>',f=Array.isArray(o.top)?o.top:[],E=f.length?f.map((d,$)=>`
        <tr class="border-b border-slate-100 last:border-0">
          <td class="py-2.5 px-3 text-xs font-bold text-slate-400 w-8">${$+1}</td>
          <td class="py-2.5 px-3">
            <div class="text-sm font-bold text-slate-800 truncate">${this.escapeHtml(d.query||"-")}</div>
            <div class="text-xs text-slate-400">${n(d.occurrences||0,"search","searches")} logged</div>
          </td>
          <td class="py-2.5 px-3 text-right text-sm font-bold text-slate-700 whitespace-nowrap">${d.days||0}${d.days===1?" day":" days"}</td>
        </tr>`).join(""):'<tr><td colspan="3" class="py-6 text-center text-sm text-slate-400">No searches recorded in this window yet.</td></tr>',_=a.available?`
      <div class="admin-fade-in mb-8">
        ${this.adminSectionHeader("Profile Traffic","","visibility")}
        <p class="text-xs text-slate-400 -mt-1 mb-3">Last ${t} days. Counts profile opens, not unique visitors.</p>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
            <div class="bg-slate-50 border-b border-slate-200 px-3 py-2.5">
              <p class="text-[11px] font-bold uppercase tracking-wide text-slate-500">Where they came from</p>
            </div>
            <div class="max-h-80 overflow-y-auto">${v}</div>
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
              <tbody>${w}</tbody>
            </table>
          </div>
        </div>
      </div>`:"",k=o.available?`
      <div class="admin-fade-in mb-8">
        ${this.adminSectionHeader("Top Searches","","search")}
        <p class="text-xs text-slate-400 -mt-1 mb-3">Last ${t} days. ${n(o.terms||0,"distinct term","distinct terms")}.</p>
        <div class="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
          <table class="w-full">
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr>
                <th class="py-2.5 px-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">#</th>
                <th class="py-2.5 px-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Searched For</th>
                <th class="py-2.5 px-3 text-right text-[11px] font-bold uppercase tracking-wide text-slate-500">Days</th>
              </tr>
            </thead>
            <tbody>${E}</tbody>
          </table>
        </div>
      </div>`:"",g=e.capped?`<p class="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
           These counts came from a capped scan and are a lower bound.
         </p>`:"";return`
      <div class="admin-fade-in mb-6">
        ${this.adminSectionHeader("Usage","","insights")}
        <p class="text-xs text-slate-400 -mt-1 mb-3">Last ${t} days.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">${h}</div>
        ${g}
      </div>
      ${_}
      ${k}
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
            <tbody>${p}</tbody>
          </table>
        </div>
      </div>`}isAuthenticated(){return!!(window.swapikiStore&&swapikiStore.currentUser)}refreshAuthUI(){const e=swapikiStore.currentUser;document.querySelectorAll(".auth-guest-only").forEach(t=>t.classList.toggle("hidden",!!e)),document.querySelectorAll(".auth-user-only").forEach(t=>t.classList.toggle("hidden",!e)),document.querySelectorAll(".admin-only").forEach(t=>t.classList.toggle("hidden",!(e&&swapikiStore.isAdminUser))),document.querySelectorAll(".nav-user-label").forEach(t=>{if(!e){t.textContent="";return}const s=e.user_metadata&&e.user_metadata.full_name;t.textContent=s?s.split(" ")[0]:(e.email||"").split("@")[0]})}ensureGoogleScript(){if(document.querySelector("script[data-swapiki-gsi]"))return;const e=document.createElement("script");e.src="https://accounts.google.com/gsi/client",e.async=!0,e.defer=!0,e.setAttribute("data-swapiki-gsi","1"),document.head.appendChild(e)}initGoogleButtons(){window.googleAuth&&(window.googleAuth.initGoogleSignIn("google-signin-button-signup",e=>this.handleGoogleCredentialResponse(e)),window.googleAuth.initGoogleSignIn("google-signin-button-login",e=>this.handleGoogleCredentialResponse(e)))}openLoginModal(){const e=document.getElementById("modal-login");e&&e.classList.remove("hidden"),this.initGoogleButtons()}closeLoginModal(){const e=document.getElementById("modal-login");e&&e.classList.add("hidden")}switchToLogin(){this.closeSignupModal(),this.openLoginModal()}switchToSignup(){this.closeLoginModal(),this.openSignupModal()}async handleLogin(e){e.preventDefault();const t=document.getElementById("login-email-input"),s=document.getElementById("login-password-input"),i=t?t.value.trim():"",a=s?s.value:"";if(!i||!a){this.showToast("\u26A0\uFE0F Enter your email and password.");return}const o=e.target.querySelector('button[type="submit"]'),n=o?o.textContent:"";o&&(o.disabled=!0,o.textContent="Logging in\u2026");try{const{user:r}=await swapikiStore.signInWithPassword(i,a);await swapikiStore.loadProfileForUser(r),this.refreshAuthUI(),this._ghHydrateNotes().catch(()=>{}),this.closeLoginModal(),s&&(s.value=""),this.showToast(`Welcome back, ${swapikiStore.getProfile().name.split(" ")[0]||"there"}!`),router.navigate("dashboard"),this.maybeShowProfileReminder()}catch(r){this.showToast(`\u274C ${r&&r.message||"Could not log in. Check your email and password."}`)}finally{o&&(o.disabled=!1,o.textContent=n)}}timeoutAfter(e,t){return new Promise((s,i)=>setTimeout(()=>i(new Error(t)),e))}showGoogleSignInProgress(){const e=`<div class="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-slate-400">
      <span class="material-symbols-outlined text-lg animate-spin">progress_activity</span> Signing in with Google\u2026
    </div>`;["google-signin-button-signup","google-signin-button-login"].forEach(t=>{const s=document.getElementById(t);s&&(s.innerHTML=e)})}async handleGoogleCredentialResponse(e){this.showGoogleSignInProgress();const t=(async()=>{if(!e||!e.credential)throw new Error("Google sign-in did not return a credential.");const{user:s}=await swapikiStore.signInWithGoogleIdToken(e.credential),i=window.googleAuth?window.googleAuth.parseGoogleJwtPayload(e.credential):null,a=swapikiStore.formatNickname(i&&i.name||(s.email||"").split("@")[0]);return await swapikiStore.loadProfileForUser(s,a),swapikiStore.data.username&&swapikiStore.registerNickname(swapikiStore.data.username,s.id),{user:s,payload:i}})();try{const{payload:s}=await Promise.race([t,this.timeoutAfter(2e4,"That's taking longer than it should \u2014 check your connection and try again.")]);t.catch(()=>{}),this.refreshAuthUI(),this.closeLoginModal(),this.closeSignupModal(),this.showToast(`Welcome, ${s&&s.name?s.name.split(" ")[0]:"there"}!`),router.navigate("dashboard"),this.maybeShowProfileReminder()}catch(s){t.catch(()=>{}),this.showToast(`\u274C ${s&&s.message||"Google sign-in failed. Please try again."}`),this.initGoogleButtons()}}async logout(){await swapikiStore.signOut(),this.refreshAuthUI(),this.showToast("Logged out."),router.navigate("landing")}toggleMobileMenu(){const e=document.getElementById("mobile-nav-menu"),t=document.getElementById("mobile-menu-icon");e&&(e.classList.contains("hidden")?(e.classList.remove("hidden"),t&&(t.textContent="close"),document.addEventListener("click",this._closeMobileMenuOnClickOutside)):(e.classList.add("hidden"),t&&(t.textContent="menu"),document.removeEventListener("click",this._closeMobileMenuOnClickOutside)))}toggleAdminMenu(e){const t=document.getElementById("admin-menu");t&&(t.classList.toggle("hidden"),t.classList.contains("hidden")?document.removeEventListener("click",this._closeAdminMenuOnClickOutside):document.addEventListener("click",this._closeAdminMenuOnClickOutside),e&&e.stopPropagation&&e.stopPropagation())}closeMobileMenu(){const e=document.getElementById("mobile-nav-menu"),t=document.getElementById("mobile-menu-icon");e&&e.classList.add("hidden"),t&&(t.textContent="menu")}showToast(e){const t=document.getElementById("toast"),s=document.getElementById("toast-message");t&&(s?s.textContent=e:t.textContent=e,t.classList.remove("opacity-0","translate-y-4","pointer-events-none"),t.classList.add("opacity-100","translate-y-0"),setTimeout(()=>{t.classList.add("opacity-0","translate-y-4","pointer-events-none"),t.classList.remove("opacity-100","translate-y-0")},3e3))}showNotFoundToast(e){if(!e)return this.showToast("This profile could not be found.");this.showToast(`No Swapiki profile at "${e}" yet.`)}clearNotFoundPanel(){const e=document.getElementById("candidate-not-found"),t=document.querySelector("#view-candidate > main");e&&e.classList.add("hidden"),t&&[...t.children].forEach(s=>{s!==e&&s.classList.remove("hidden")})}setPageMeta(e,t,s={}){const i=e||"Swapiki | 2 Minutes to a Confident Interview Decision";if(document.title=i,t){const a=(o,n,r)=>{let l=document.head.querySelector(`meta[${o}="${n}"]`);l||(l=document.createElement("meta"),l.setAttribute(o,n),document.head.appendChild(l)),l.setAttribute("content",r)};a("name","description",t),a("property","og:description",t),a("property","og:title",i),s.url&&a("property","og:url",s.url)}}getShareUrl(){if(this.publicUsername)return{username:this.publicUsername,shareUrl:`https://${this.publicUsername}.swapiki.com`};const e=swapikiStore.getProfile(),t=e.username||e.id||"ananya-sharma";return{username:t,shareUrl:`https://${t}.swapiki.com`}}copyShareLink(){const{username:e,shareUrl:t}=this.getShareUrl(),s=`Profile URL copied: ${e}.swapiki.com`;if(navigator.clipboard)navigator.clipboard.writeText(t).then(()=>{swapikiStore.recordShareEvent("copied"),this.showToast(s)}).catch(()=>{swapikiStore.recordShareEvent("share_attempted"),this.showToast(s)});else{const i=document.createElement("textarea");i.value=t,i.style.position="fixed",i.style.opacity="0",document.body.appendChild(i),i.select();try{document.execCommand("copy")}catch(a){}document.body.removeChild(i),this.showToast(s)}this.closeShareModal()}openShareModal(){const{shareUrl:e}=this.getShareUrl(),t=document.getElementById("share-modal-url");t&&(t.textContent=e);const s=document.getElementById("share-card-preview");s&&(s.innerHTML=this.buildShareCardHtml());const i=document.getElementById("modal-share-profile");i&&i.classList.remove("hidden")}closeShareModal(){const e=document.getElementById("modal-share-profile");e&&e.classList.add("hidden")}shareSubject(){return this.publicUsername?null:swapikiStore.getProfile()}buildShareCardHtml(){const e=this.shareSubject(),{shareUrl:t}=this.getShareUrl(),s=e&&e.name||this.publicUsername||"My Swapiki profile",i=e&&e.title||"Developer & problem-solver",a=!!(e&&e.voiceVerified),o=s.split(/\s+/).filter(Boolean).slice(0,2).map(n=>n[0]).join("").toUpperCase()||"?";return`
      <div class="border border-slate-200 rounded-2xl bg-gradient-to-br from-slate-50 to-white p-4 text-center shadow-sm">
        <span class="w-12 h-12 rounded-full ${a?"bg-emerald-100 text-emerald-700":"bg-primary-fixed text-primary"} flex items-center justify-center text-base font-bold mx-auto mb-2">${this.escapeHtml(o)}</span>
        <div class="text-sm font-bold text-slate-900 line-clamp-1">${this.escapeHtml(s)}</div>
        <div class="text-xs text-slate-500 mb-2">${this.escapeHtml(i)}</div>
        ${a?'<span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700"><span class="material-symbols-outlined text-[12px]">verified</span> Live recording confirmed</span>':'<span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-50 text-amber-700"><span class="material-symbols-outlined text-[12px]">record_voice_over</span> Record a pitch to get a live-recording badge</span>'}
        <div class="text-[11px] text-slate-400 mt-3">Listen to my 2-minute project walkthrough</div>
        <div class="text-[11px] font-mono text-primary break-all">${this.escapeHtml(t)}</div>
      </div>
    `}buildShareText(){const e=this.shareSubject(),{shareUrl:t}=this.getShareUrl();return`Hi,

Here's my verified proof-of-work profile on Swapiki \u2014 it has my project evidence and a 2-minute voice walkthrough.

${e&&e.voiceVerified?"The recording was captured live in one session, reading a random code that could not have been pre-recorded.":"Recording a live walkthrough so I can add a live-recording badge."}
${t}

Thanks!`}shareViaWhatsApp(){const e=this.shareSubject(),{shareUrl:t}=this.getShareUrl(),i=`Check out my Swapiki profile \u2014 projects with a 2-minute voice walkthrough. ${e&&e.voiceVerified?"The recording was made live in one session, reading a random code that could not have been pre-recorded.":"Recording a live walkthrough so I can add a live-recording badge."} ${t}`;window.open(`https://wa.me/?text=${encodeURIComponent(i)}`,"_blank","noopener"),swapikiStore.recordShareEvent("whatsapp"),this.closeShareModal()}shareViaEmail(){const{shareUrl:e}=this.getShareUrl(),t="My Swapiki proof-of-work profile",s=this.buildShareText();window.location.href=`mailto:?subject=${encodeURIComponent(t)}&body=${encodeURIComponent(s)}`,swapikiStore.recordShareEvent("email"),this.closeShareModal()}toggleHeroAudio(){const e=document.getElementById("hero-play-icon"),t=document.querySelector(".audio-wave-anim");if(this.heroPlaying=!this.heroPlaying,e&&(e.textContent=this.heroPlaying?"pause":"play_arrow"),t&&(this.heroPlaying?t.classList.add("audio-playing"):t.classList.remove("audio-playing")),this.heroPlaying){if(this.showToast("Playing demo voice preview. This is not a real candidate recording."),"speechSynthesis"in window){window.speechSynthesis.cancel();const s="Hi there! I'm Ananya Sharma. At Razorpay, I architected the Vernacular UPI payment flow across six Indian languages. Our goal was simple \u2014 make digital payments effortless for Bharat users. We reduced checkout drop-offs by 34% across 12 million monthly transactions. I designed the one-tap intent interaction model that cut payment failures dramatically.",i=new SpeechSynthesisUtterance(s);i.rate=.93,i.pitch=1.05;const o=window.speechSynthesis.getVoices().find(n=>n.lang.includes("en-IN")||n.name.includes("India")||n.name.includes("Google UK English Female")||n.name.includes("Natural")||n.name.includes("Samantha")||n.name.includes("Zira"));o&&(i.voice=o),i.onend=()=>{this.heroPlaying=!1,e&&(e.textContent="play_arrow"),t&&t.classList.remove("audio-playing")},window.speechSynthesis.speak(i)}}else"speechSynthesis"in window&&window.speechSynthesis.cancel()}renderLandingView(){const e=swapikiStore.getProfile();this.setPageMeta("Swapiki | 2 Minutes to a Confident Interview Decision","Swapiki turns resumes into 2-minute verified video statements hiring managers actually watch. Skip r\xE9sum\xE9 rejections \u2014 hire for evidence, not formatting."),this._loadLandingStats()}_loadLandingStats(){const e=document.getElementById("lp-live-stats");e&&fetch("/api/site-stats").then(t=>t&&t.ok?t.json():null).then(t=>{const s=t&&t.stats;if(!s)return;const i=(o,n)=>{const r=document.getElementById(o);return!r||typeof n!="number"?!1:(r.textContent=n.toLocaleString("en-IN"),!0)};i("lp-live-profiles",s.published)|i("lp-live-week",s.publishedThisWeek)|i("lp-live-jobs",s.jobs)&&(e.hidden=!1)}).catch(()=>{})}setJobsFilter(e){this.jobsFilter=e,this.renderJobsView()}setJobsType(e){this.jobsType=e,this.renderJobsView()}setJobsMode(e){this.jobsMode=e,this.renderJobsView()}setJobsQuery(e){this.jobsQuery=(e||"").toLowerCase().trim(),this._syncJobsQueryToUrl(),this._scheduleSearchLog(),this._renderJobsResults()}_jobsQueryFromUrl(){try{if(typeof window=="undefined"||!window.location)return"";const e=typeof window.location.search=="string"?window.location.search:"";return e?(new URLSearchParams(e).get("q")||"").toLowerCase().trim():""}catch(e){return""}}_syncJobsQueryToUrl(){try{if(typeof window=="undefined"||!window.location||!window.history||typeof window.history.replaceState!="function")return;const e=window.location.href;if(typeof e!="string"||!e)return;const t=new URL(e),s=(this.jobsQuery||"").trim();s?t.searchParams.set("q",s):t.searchParams.delete("q");const i=a=>a.pathname+(a.search||"")+(a.hash||"");window.history.replaceState(null,"",i(t))}catch(e){}}_scheduleSearchLog(){this._searchLogTimer&&clearTimeout(this._searchLogTimer),this._searchLogTimer=setTimeout(()=>this._logJobsQuery(),1200)}commitJobsQueryNow(){this._searchLogTimer&&clearTimeout(this._searchLogTimer),this._logJobsQuery()}_logJobsQuery(){this._searchLogTimer=null;const e=(this.jobsQuery||"").trim();e.length<2||(this._loggedSearches=this._loggedSearches||new Set,!this._loggedSearches.has(e)&&(this._loggedSearches.add(e),swapikiStore.recordSearchEvent(e)))}_jobType(e){const t=[e.salary,e.title,e.description||""].join(" ");return/\(internship\)|\bInternship\b|\bIntern\b/i.test(t)?"internship":"job"}_jobMode(e){const t=[e.location||"",e.description||""].join(" ");return/hybrid/i.test(t)?"hybrid":/remote|work from home|\bwfh\b/i.test(t)?"remote":"onsite"}_filterChip(e,t,s,i){return`<button onclick="${i}" class="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${s===t?"bg-slate-900 text-white":"bg-slate-100 text-slate-600 hover:bg-slate-200"}">${e}</button>`}async renderJobsView(){this.setPageMeta("Swapiki Jobs \u2014 IT, BFSI & Internships in India","Hand-sourced IT, BFSI and other openings across India on Swapiki Jobs. Apply with a proof-backed profile \u2014 real projects and a 2-minute voice walkthrough, no AI screening.",{url:"https://swapiki.com/jobs"});const e=document.getElementById("jobs-container");if(!e)return;const t=this.renderJobSubmitForm(),s=this.renderChannelJoinCard(),i=swapikiStore.currentUser?swapikiStore.getProfile():null,a=i&&typeof i.completionScore=="number"?i.completionScore:0,o=!!swapikiStore.currentUser&&a>=80,n=o?"":`
      <div class="bg-white border border-slate-200 rounded-2xl p-5 mb-4 flex items-start gap-3">
        <span class="material-symbols-outlined text-amber-500">lock</span>
        <div>
          <p class="text-sm font-semibold text-slate-800">Search, filters and match are for proof-backed profiles</p>
          <p class="text-xs text-slate-500 mt-1 leading-relaxed">${swapikiStore.currentUser?`You're at ${a}% \u2014 reach 80% to search, filter and match these openings. Every listing is shown below.`:"Sign in and complete your profile to 80% to search, filter and match these openings. Every listing is shown below."}</p>
          <button onclick="${swapikiStore.currentUser?"router.navigate('dashboard')":"app.openLoginModal()"}" class="mt-3 px-4 py-2 bg-primary text-white font-bold text-xs rounded-lg hover:bg-primary/90 transition-all">${swapikiStore.currentUser?"Finish my profile":"Sign in"}</button>
        </div>
      </div>`;e.innerHTML=`
      <div class="max-w-4xl mx-auto">
        <div class="mb-6">
          <h1 class="text-2xl font-bold text-primary tracking-tight">Jobs for proof-backed profiles</h1>
          <p class="text-sm text-slate-500 mt-1">${o?"Hand-sourced openings, vetted and posted by Swapiki. Apply with your proof profile.":"Hand-sourced openings, vetted and posted by Swapiki."}</p>
        </div>
        <div id="jobs-pool-strip" class="mb-4"></div>
        ${s}
        ${t}
        ${n}
        ${o?this._jobsBoardControls():""}
        <div id="jobs-results"></div>
      </div>`;const r=o?await swapikiStore.getPublishedJobs():await swapikiStore.getPublicJobs();if(this._jobsCache=r,o&&this._injectJobsJsonLd(r),o&&!this.jobsQuery){const l=this._jobsQueryFromUrl();l&&(this.jobsQuery=l)}this._renderJobsResults(),this._loadJobsPoolStrip()}_jobsBoardControls(){const e=this.jobsFilter||"all",t=this.jobsType||"all",s=this.jobsMode||"all",i=this.jobsQuery||"";return`
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <button onclick="app.setJobsFilter('all')" class="px-4 py-2 rounded-lg text-xs font-bold transition-colors ${e==="all"?"bg-primary text-white shadow-xs":"bg-slate-100 text-slate-700 hover:bg-slate-200"}">All</button>
        <button onclick="app.setJobsFilter('it')" class="px-4 py-2 rounded-lg text-xs font-bold transition-colors ${e==="it"?"bg-primary text-white shadow-xs":"bg-slate-100 text-slate-700 hover:bg-slate-200"}">IT</button>
        <button onclick="app.setJobsFilter('bfsi')" class="px-4 py-2 rounded-lg text-xs font-bold transition-colors ${e==="bfsi"?"bg-primary text-white shadow-xs":"bg-slate-100 text-slate-700 hover:bg-slate-200"}">BFSI</button>
        <button onclick="app.setJobsFilter('any')" class="px-4 py-2 rounded-lg text-xs font-bold transition-colors ${e==="any"?"bg-primary text-white shadow-xs":"bg-slate-100 text-slate-700 hover:bg-slate-200"}">Other Roles</button>
        <span class="ml-auto text-xs text-slate-400" id="job-count"></span>
      </div>
      <div class="relative mb-3">
        <span class="material-symbols-outlined text-slate-400 text-lg absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">search</span>
        <input type="search" id="job-search" value="${this.escapeHtml(i)}" oninput="app.setJobsQuery(this.value)" onkeydown="if(event.key==='Enter')app.commitJobsQueryNow()" placeholder="Search roles, companies, skills, cities\u2026" class="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all" />
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
      </div>`}_loadJobsPoolStrip(){document.getElementById("jobs-pool-strip")&&fetch("/api/site-stats").then(t=>t&&t.ok?t.json():null).then(t=>{const s=t&&t.stats,i=s&&s.publishedThisWeek;if(typeof i!="number"||i<=0)return;const a=document.getElementById("jobs-pool-strip");a&&(a.innerHTML=`<div class="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 text-xs text-emerald-800">
          <span class="material-symbols-outlined text-[16px]">verified_user</span>
          <span><strong>${i}</strong> proof-backed candidate${i===1?"":"s"} published in the last 7 days.</span>
        </div>`)}).catch(()=>{})}_renderJobsResults(){const e=document.getElementById("jobs-results");if(!e)return;const t=this._jobsCache||[],s=this.jobsFilter||"all",i=this.jobsType||"all",a=this.jobsMode||"all",o=this.jobsQuery||"",n=t.filter(h=>!(s!=="all"&&(h.category||"it")!==s||i!=="all"&&this._jobType(h)!==i||a!=="all"&&this._jobMode(h)!==a||o&&![h.title,h.company,(h.skills||[]).join(" "),h.location||"",h.description||""].join(" ").toLowerCase().includes(o))),r=document.getElementById("job-count");r&&(r.textContent=`${n.length} job${n.length===1?"":"s"}`);const l=s==="any"?"Other Roles":s.toUpperCase(),c=`
      <div class="text-center py-16 bg-white border border-slate-200 rounded-3xl">
        <span class="material-symbols-outlined text-4xl text-slate-300 mb-2 block">work_off</span>
        <p class="text-sm text-slate-400">${i!=="all"||a!=="all"||!!o?"No jobs match those filters. Try resetting the chips or the search.":`No jobs yet${s==="all"?"":" in "+l}. New openings appear as they're vetted and posted.`}</p>
      </div>`;e.innerHTML=n.length?`<div class="space-y-4">${n.map(h=>this.renderJobCard(h)).join("")}</div>`:c}jobMatchPill(e){const t=typeof window!="undefined"&&window.profileMatch?window.profileMatch:null;if(!t||typeof t.computeProfileMatch!="function")return"";const s=typeof swapikiStore!="undefined"&&swapikiStore&&typeof swapikiStore.getProfile=="function"?swapikiStore.getProfile():null;if(!s)return"";let i=null;try{i=t.computeProfileMatch(s,e)}catch(o){return""}return!i||typeof i.overall!="number"?"":`<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${i.overall>=80?"bg-emerald-50 text-emerald-700 border-emerald-200":i.overall>=60?"bg-blue-50 text-blue-700 border-blue-200":i.overall>=40?"bg-amber-50 text-amber-700 border-amber-200":"bg-slate-100 text-slate-600 border-slate-200"}" title="${this.escapeHtml(i.band)}"><span class="material-symbols-outlined text-[12px]">target</span>${i.overall}% match</span>`}renderJobCard(e){const t=(Array.isArray(e.skills)?e.skills:[]).slice(0,5).map(l=>`<span class="bg-slate-100 text-slate-600 rounded-full px-2.5 py-1 text-[10px] font-bold">${this.escapeHtml(l)}</span>`).join(""),s="Posted by Swapiki",i=this._jobType(e),a=this._jobMode(e),o=`<span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${i==="internship"?"bg-rose-50 text-rose-600 border border-rose-200":"bg-emerald-50 text-emerald-700 border border-emerald-200"}">${i==="internship"?"Internship":"Job"}</span>`,n=`<span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${a==="remote"?"bg-sky-50 text-sky-700 border border-sky-200":a==="hybrid"?"bg-violet-50 text-violet-700 border border-violet-200":"bg-slate-100 text-slate-600 border border-slate-200"}">${a==="remote"?"Remote / WFH":a==="hybrid"?"Hybrid":"Onsite"}</span>`,r=(e.raw_text||"").match(/Apply\s*by\s*:\s*([0-9]{1,2}\s+[A-Za-z]{3,9}\s+20\d{2})/i);return`
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
          ${o}${n}${this.jobFeaturedLabel(e)}
          ${r?`<span class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"><span class="material-symbols-outlined text-[12px]">event</span>Apply by ${this.escapeHtml(r[1])}</span>`:""}
        </div>
        ${t?`<div class="flex flex-wrap gap-1.5 mt-1 mb-3">${t}</div>`:""}
        ${e.salary?`<p class="text-[11px] text-slate-400 flex items-center gap-1 mb-1"><span class="material-symbols-outlined text-[13px]">payments</span>${this.escapeHtml(e.salary)}</p>`:""}
        ${e.description?`<p class="text-xs text-slate-600 leading-relaxed mb-3">${this.escapeHtml(e.description)}</p>`:""}
        <button onclick="app.openJobApplyModal('${e.id}')" class="mt-1 px-4 py-2 bg-primary text-white font-bold text-xs rounded-lg hover:bg-primary/90 transition-all">Apply with my profile</button>
      </div>`}_injectJobsJsonLd(e){if(!Array.isArray(e)||e.length===0)return;const t=e.map(i=>{const a={"@type":"JobPosting",title:i.title||"",hiringOrganization:{"@type":"Organization",name:i.company||""}},o=this.safeHttpUrl(i.apply_url||i.contact);a.url=o||"https://swapiki.com/jobs",a.directApply=!1,i.first_seen_at&&(a.datePosted=String(i.first_seen_at).slice(0,10)),i.location&&(a.jobLocation={"@type":"Place",address:{"@type":"PostalAddress",addressLocality:i.location}});const n=this.numericSalary(i.salary_min),r=this.numericSalary(i.salary_max);if(n!==null||r!==null){const l={"@type":"QuantitativeValue",unitText:"YEAR"};n!==null&&(l.minValue=n),r!==null&&(l.maxValue=r),a.baseSalary={"@type":"MonetaryAmount",currency:"INR",value:l}}return a});let s=document.getElementById("jobs-jsonld");s||(s=document.createElement("script"),s.type="application/ld+json",s.id="jobs-jsonld",document.head.appendChild(s)),s.textContent=JSON.stringify({"@context":"https://schema.org","@graph":t})}safeHttpUrl(e){const t=String(e==null?"":e).trim();if(!t)return"";try{const s=new URL(t);return s.protocol==="http:"||s.protocol==="https:"?s.href:""}catch(s){return""}}numericSalary(e){if(e==null||e==="")return null;const t=Number(e);return Number.isFinite(t)&&t>0?t:null}openJobApplyModal(e){const t=Array.isArray(this._jobsCache)?this._jobsCache.find(u=>u.id===e):null;if(!t)return;if(!swapikiStore.currentUser){this.openLoginModal();return}const s=swapikiStore.getProfile();if(!s){this.openLoginModal();return}if((typeof s.completionScore=="number"?s.completionScore:0)<80){typeof router!="undefined"&&router&&typeof router.navigate=="function"&&router.navigate("dashboard");return}if(window.posthog&&typeof window.posthog.capture=="function")try{window.posthog.capture("job_apply_open",{job_id:e,title:t.title||"",company:t.company||""})}catch(u){}const i=s.username?`https://${s.username}.swapiki.com`:"https://swapiki.com";this._jobApplyLink=i;const a=typeof window.profileMatch=="object"&&window.profileMatch?window.profileMatch.renderProfileMatchHtml(window.profileMatch.computeProfileMatch(s,t)):"",o=this.safeHttpUrl(t.apply_url||t.contact),n=!!o,r=this._jobType(t),l=this._jobMode(t),m="bg-blue-50 text-blue-800 border-blue-200",c=[{t:t.location,label:this.escapeHtml(t.location),cls:m},{t:t.salary,label:this.escapeHtml(t.salary),cls:m},{t:"1",label:r==="internship"?"Internship":"Job",cls:m},{t:"1",label:l==="remote"?"Remote / WFH":l==="hybrid"?"Hybrid":"Onsite",cls:m}].filter(u=>!!u.t).map(u=>`<span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${u.cls}">${u.label}</span>`).join(""),h=document.createElement("div");h.id="modal-job-apply",h.className="fixed inset-0 z-[99999] bg-neutral-900/60 flex items-center justify-center p-4",h.innerHTML=`
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
          ${c?`<div class="flex flex-wrap gap-1.5 mt-3 pl-[60px]">${c}</div>`:""}
        </div>
        <div class="p-7 sm:p-10 grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-10">
          <div class="min-w-0">${a}</div>
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
            <div class="-mt-1">${this._toolUsageHtml(null)}</div>
            <button onclick="app.openInterviewPrep('${t.id}'); setTimeout(function(){ const el = document.getElementById('gh-picker'); if (el) el.scrollIntoView({block:'center'}); }, 700);" class="text-left text-[13px] font-bold text-blue-900 hover:underline flex items-center gap-1.5">
              <span class="material-symbols-outlined text-lg">code</span> Which of my GitHub projects fit this job?
            </button>
            ${o?`
              <a href="${this.escapeHtml(o)}" target="_blank" rel="noopener noreferrer nofollow" class="flex items-start gap-1.5 text-[11px] font-medium text-blue-800 hover:text-blue-950 break-all px-0.5">
                <span class="material-symbols-outlined text-[14px] shrink-0">link</span>Opening: ${this.escapeHtml(o)}
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
      </div>`,document.body.appendChild(h)}applyToJob(e){const t=Array.isArray(this._jobsCache)?this._jobsCache.find(i=>i.id===e):null;if(!t)return;const s=this.safeHttpUrl(t.apply_url||t.contact);if(!s){this.showToast("This listing has no application link yet.");return}if(window.posthog&&typeof window.posthog.capture=="function")try{window.posthog.capture("job_apply_click",{job_id:e})}catch(i){}window.open(s,"_blank","noopener"),swapikiStore.recordJobClick(e)}closeJobApplyModal(){const e=document.getElementById("modal-job-apply");e&&e.remove()}copyMyJobProfileLink(){const e=this._jobApplyLink||"";if(e)if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(e).then(()=>this.showToast("Proof link copied \u2014 send it to the job contact."));else{const t=document.createElement("textarea");t.value=e,document.body.appendChild(t),t.select(),document.execCommand("copy"),document.body.removeChild(t),this.showToast("Proof link copied \u2014 send it to the job contact.")}}async _claimTool(e,t){if(!swapikiStore||!swapikiStore.currentUser||typeof swapikiStore.claimToolUsage!="function")return null;try{const s=await swapikiStore.claimToolUsage(t,e);return!s||s.unavailable?null:s.allowed===!1?Object.assign({blocked:!0},s):Object.assign({blocked:!1},s)}catch(s){return null}}_toolBlockedView(e){const t=e.limit||5,s=e.reset_at?new Date(e.reset_at):null,i=s&&!isNaN(s.getTime())?s.toLocaleString(void 0,{weekday:"long",hour:"numeric",minute:"2-digit"}):"tomorrow",a=!!e.error||e.reason==="error";return`
      <div class="max-w-xl mx-auto bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-sm">
        <div class="w-16 h-16 rounded-2xl ${a?"bg-slate-100 text-slate-500":"bg-amber-50 text-amber-600"} flex items-center justify-center mx-auto mb-4">
          <span class="material-symbols-outlined text-3xl">${a?"cloud_off":"hourglass_top"}</span>
        </div>
        <h1 class="text-2xl font-bold text-primary tracking-tight mb-2">${a?"Couldn't check your daily limit":"Daily limit reached"}</h1>
        <p class="text-sm text-slate-500 leading-relaxed mb-6">${a?"Something went wrong on our side, so we stopped rather than risk not counting a job you should get. Please try again in a moment.":`You've used all ${t} job posts for today across resume drafts and interview prep. Come back tomorrow \u2014 your allowance resets ${this.escapeHtml(i)}.`}</p>
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
          <p class="text-sm text-slate-500 leading-relaxed mb-4">Resume drafts are built from your verified profile. Reach an 80%-complete proof profile to unlock them. You're at <strong>${s}%</strong>.</p>
          <button onclick="router.navigate('dashboard')" class="px-6 py-3 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 transition-all shadow-md">Finish my profile</button>
        </div>`;return}const i=this._resumeJobId;let a=Array.isArray(this._jobsCache)&&this._jobsCache.find(c=>c.id===i)||null;if(!a)try{const c=await swapikiStore.getPublishedJobs();this._jobsCache=c,a=c.find(h=>h.id===i)||null}catch(c){window.SWAPIKI_POSTHOG&&window.SWAPIKI_POSTHOG.capture&&window.SWAPIKI_POSTHOG.capture("resume_draft_load_error",{error:String(c&&c.message)})}if(!a){e.innerHTML=`
        <div class="max-w-xl mx-auto bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-sm">
          <div class="w-16 h-16 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-4">
            <span class="material-symbols-outlined text-3xl">work_off</span>
          </div>
          <h1 class="text-2xl font-bold text-primary tracking-tight mb-2">Couldn't find that job</h1>
          <p class="text-sm text-slate-500 leading-relaxed mb-6">The opening may have been updated or removed. Head back to the board and pick another one.</p>
          <button onclick="router.navigate('jobs')" class="px-6 py-3 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 transition-all shadow-md">Browse jobs</button>
        </div>`;return}const o=await this._claimTool("resume",a.id);if(o&&o.blocked){e.innerHTML=this._toolBlockedView(o);return}const n=this._buildResumeDraft(a,t),r="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all",l=c=>`<label class="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">${c}</label>`,m=n.projects.map((c,h)=>`
      <div>
        ${l(`Project ${h+1}`)}
        <textarea data-rd-project oninput="app._resumeRefreshPreview()" rows="4" class="${r}" placeholder="Title \u2014 Role&#10;\u2022 Key achievement 1">${this.escapeHtml(c.text)}</textarea>
      </div>`).join("");e.innerHTML=`
      <div class="max-w-5xl mx-auto">
        <div class="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <button onclick="router.navigate('jobs')" class="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
              <span class="material-symbols-outlined text-sm">arrow_back</span> Back to jobs
            </button>
            <h1 class="text-2xl font-bold text-primary tracking-tight mt-2">Draft a resume for this job</h1>
            <p class="text-sm text-slate-500 mt-0.5">${this.escapeHtml(a.title)}${a.company?" \xB7 "+this.escapeHtml(a.company):""}${a.location?" \xB7 "+this.escapeHtml(a.location):""}</p>
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

        ${this._toolUsageHtml(o)}

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
              <div class="space-y-3">${m}</div>
            </div>
          </div>

          <div class="lg:sticky lg:top-6">
            <div class="text-[11px] font-bold uppercase tracking-wide text-primary mb-2">Live preview</div>
            <div id="rd-preview" class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"></div>
            <div class="mt-4">
              ${l("Job description \u2014 keep your draft on target")}
              <details class="bg-white border border-slate-200 rounded-2xl p-4 text-[13px] text-slate-600 leading-relaxed">
                <summary class="text-xs font-bold text-primary cursor-pointer select-none">Show / hide job description</summary>
                <div class="mt-2 whitespace-pre-wrap">${this.escapeHtml(a.description||"No description provided for this listing.")}</div>
              </details>
            </div>
          </div>
        </div>
      </div>`,this._resumeRefreshPreview()}_buildResumeDraft(e,t){const s=t.name||"Your Name",i=t.title||e.title||"",a=t.experience||"relevant hands-on experience",o=t.username?`https://${t.username}.swapiki.com`:"https://swapiki.com",n=(t.email||swapikiStore.authUser&&swapikiStore.authUser.email||"").trim(),r=[t.location,n,o].filter(Boolean).join(" \xB7 "),l=Array.isArray(t.expertise)?t.expertise:[],m=(Array.isArray(t.projects)?t.projects:[]).flatMap(_=>Array.isArray(_.tags)?_.tags:[]),c=[...new Set([...l,...m])].filter(Boolean),h=Array.isArray(e.skills)?e.skills:[],u=_=>String(_||"").toLowerCase().trim(),p=h.filter(_=>c.some(k=>u(k)===u(_))),b=c.filter(_=>!p.includes(_)),y=p.concat(b).slice(0,14),v=(Array.isArray(t.projects)?t.projects:[]).length;let x=`${s.split(" ")[0]} is a ${i||"professional"} (${a}) looking to contribute to ${e.company||"your organization"} as a ${e.title||"this role"}.`;v&&(x+=` Backed by ${v} proof project${v===1?"":"s"} with measurable outcomes`),p.length&&(x+=` and a strong working knowledge of ${p.slice(0,3).join(", ")}`),x+=". Proof profile published and ready to share.";let w="";if(typeof window.profileMatch=="object"&&window.profileMatch&&typeof window.profileMatch.requiredYears=="function"){const _=window.profileMatch.requiredYears(e);_&&(w=`, aligned with the ~${_} years this opening asks for`)}const f=`Hands-on ${(i||"professional").toLowerCase()} experience across real, verifiable projects${w}. Comfortable owning tasks end-to-end with a focus on outcomes.`,E=(Array.isArray(t.projects)?t.projects:[]).map((_,k)=>{const g=[_.title,_.role].filter(Boolean).join(" \u2014 ")||`Project ${k+1}`,d=Array.isArray(_.takeaways)?_.takeaways.filter(S=>String(S||"").trim()):[];return{text:[g,...d.map(S=>"\u2022 "+S)].join(`
`)}});return{name:s,headline:i,contact:r,summary:x,skills:y,expTitle:a,expDetail:f,projects:E}}_resumeCollect(){const e=o=>{const n=document.getElementById(o);return n?n.value:""},t=e("rd-skills").split(",").map(o=>o.trim()).filter(Boolean),s=e("rd-exp-title")||"",i=e("rd-exp-detail")||"";let a=[];return document.querySelectorAll("[data-rd-project]").forEach(o=>{const n=o.value.split(`
`);a.push({heading:(n[0]||"").trim(),bullets:n.slice(1).map(r=>r.replace(/^[\s•-]+/,"").trim()).filter(Boolean)})}),{name:e("rd-name")||"Your Name",headline:e("rd-headline")||"",contact:e("rd-contact")||"",summary:e("rd-summary")||"",skills:t,expTitle:s,expDetail:i,projects:a}}_resumeRefreshPreview(){const e=document.getElementById("rd-preview");if(!e)return;const t=this._resumeCollect(),s=o=>this.escapeHtml(o),i=t.skills.map(o=>`<span class="inline-block bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2.5 py-0.5 text-[11px] font-bold mr-1.5 mb-1.5">${s(o)}</span>`).join(""),a=t.projects.filter(o=>o.heading).map(o=>`
      <div class="mb-3 last:mb-0">
        <p class="text-[13px] font-bold text-slate-900">${s(o.heading)}</p>
        ${o.bullets.length?`<ul class="mt-1 space-y-0.5">${o.bullets.map(n=>`<li class="text-[12px] text-slate-600 leading-snug flex gap-1.5"><span class="text-primary shrink-0">\u2022</span><span>${s(n)}</span></li>`).join("")}</ul>`:""}
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
        ${a?`<div class="h-px bg-slate-200 my-3"></div><p class="text-[10px] font-bold uppercase tracking-wide text-primary mb-2">Projects</p>${a}`:""}
      </div>`}copyDraftResume(){const e=this._resumeCollect(),t=[e.name,e.headline,e.contact,"","PROFESSIONAL SUMMARY",e.summary||"","","SKILLS",e.skills.join(", ")||"","","EXPERIENCE",e.expTitle,e.expDetail||"",""];e.projects.some(i=>i.heading)&&(t.push("PROJECTS"),e.projects.filter(i=>i.heading).forEach(i=>{t.push(i.heading),i.bullets.forEach(a=>t.push(a)),t.push("")}));const s=t.filter(i=>i!==null).join(`
`).replace(/\n{3,}/g,`

`).trim();if(s)if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(s).then(()=>this.showToast("Resume draft copied."));else{const i=document.createElement("textarea");i.value=s,document.body.appendChild(i),i.select(),document.execCommand("copy"),document.body.removeChild(i),this.showToast("Resume draft copied.")}}printDraftResume(){const e=this._resumeCollect(),t=e.projects.filter(r=>r.heading).map(r=>`
      <div class="project">
        <div class="project-title">${this._printEscape(r.heading)}</div>
        ${r.bullets.length?`<ul>${r.bullets.map(l=>`<li>${this._printEscape(l)}</li>`).join("")}</ul>`:""}
      </div>`).join(""),s=e.skills.length?`<div class="section"><div class="section-title">Skills</div><p>${e.skills.join(", ")}</p></div>`:"",i=e.projects.some(r=>r.heading)?`<div class="section"><div class="section-title">Projects</div>${t}</div>`:"",a="DRAFT PREPARED WITH SWAPIKI",o=window.open("","_blank");if(!o){this.showToast("Please allow popups to save your resume as PDF.");return}const n=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${this._printEscape(e.name)} - Resume</title><style>
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
        <span class="badge">${a}</span>
      </div>
      <div class="section"><div class="section-title">Professional Summary</div><p>${this._printEscape(e.summary).replace(/\n/g,"<br/>")}</p></div>
      ${s}
      <div class="section"><div class="section-title">Experience</div><p style="font-weight:bold;margin:0;">${this._printEscape(e.expTitle)}</p><p style="margin:4px 0 0 0;">${this._printEscape(e.expDetail).replace(/\n/g,"<br/>")}</p></div>
      ${i}
    </body></html>`;o.document.write(n),o.document.close(),o.document.title=`${e.name} - Resume Draft`,this._printReady=!0,o.addEventListener("load",()=>{}),setTimeout(()=>{try{o.focus(),o.print()}catch(r){}},300),this.showToast('Resume opened for printing \u2014 choose "Save as PDF" as the destination.')}_printEscape(e){return String(e==null?"":e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}openInterviewPrep(e){this.closeJobApplyModal(),this._interviewJobId=e||null,window.location.hash="interview-prep/"+encodeURIComponent(e||"")}async renderInterviewPrepView(){this.setPageMeta("Interview prep | Swapiki","Practice the questions most likely to come up for a specific job \u2014 built from the listing and your proof profile.",{url:window.location.href});const e=document.getElementById("interview-prep-container");if(!e)return;if(!swapikiStore.currentUser){e.innerHTML=`
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
          <p class="text-sm text-slate-500 leading-relaxed mb-4">Practice questions are built from your verified profile, projects and experience. Reach an 80%-complete profile to unlock them. You're at <strong>${s}%</strong>.</p>
          <button onclick="router.navigate('dashboard')" class="px-6 py-3 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 transition-all shadow-md">Finish my profile</button>
        </div>`;return}const i=this._interviewJobId;let a=Array.isArray(this._jobsCache)&&this._jobsCache.find(u=>u.id===i)||null;if(!a)try{const u=await swapikiStore.getPublishedJobs();this._jobsCache=u,a=u.find(p=>p.id===i)||null}catch(u){}if(!a){e.innerHTML=`
        <div class="max-w-xl mx-auto bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-sm">
          <div class="w-16 h-16 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-4">
            <span class="material-symbols-outlined text-3xl">work_off</span>
          </div>
          <h1 class="text-2xl font-bold text-primary tracking-tight mb-2">Couldn't find that job</h1>
          <p class="text-sm text-slate-500 leading-relaxed mb-6">The opening may have been updated or removed. Head back to the board and pick another one.</p>
          <button onclick="router.navigate('jobs')" class="px-6 py-3 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 transition-all shadow-md">Browse jobs</button>
        </div>`;return}const o=await this._claimTool("interview",a.id);if(o&&o.blocked){e.innerHTML=this._toolBlockedView(o);return}this._interviewJob=a,this._interviewThemes=this._extractJobThemes(a),this._interviewQuestions=this._generateInterviewQuestions(a,t,this._interviewThemes);const n=this._interviewQuestions,r=this._interviewThemes;this._interviewJobKey="swapiki_interview_"+i;const l=(u,p)=>`
      <div class="mb-5 last:mb-0">
        <p class="text-[11px] font-bold uppercase tracking-wide text-primary mb-2">${u}</p>
        <ol class="space-y-1.5">
          ${p.map((b,y)=>`
            <li class="text-[13px] text-slate-700 leading-relaxed flex gap-2">
              <span class="text-slate-300 font-bold shrink-0">${y+1}.</span>
              <span>${this.escapeHtml(b.text)}${b.source?` <span class="text-[10px] font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 align-middle whitespace-nowrap">${this.escapeHtml(b.source)}</span>`:""}</span>
            </li>`).join("")}
        </ol>
      </div>`,m=Array.isArray(t.projects)?t.projects:[];let c=null;if(window.swapikiGitHub){const u=this._ghRanked(),p=this._ghHydrateStory(),b=u.find(y=>y.matched&&y.matched.length)||null;c=p?u.find(y=>y.name===p)||null:b}const h=m.map(u=>`
      <div class="rounded-xl border border-slate-200 bg-white p-3.5 mb-2.5">
        <p class="text-[13px] font-bold text-slate-900">${this.escapeHtml(u.title)}${u.role?' <span class="text-slate-400 font-normal">\u2014 '+this.escapeHtml(u.role)+"</span>":""}</p>
        <ul class="mt-1.5 space-y-1">
          ${(Array.isArray(u.takeaways)?u.takeaways:[]).filter(p=>p).map(p=>`<li class="text-[12px] text-slate-600 flex gap-1.5"><span class="text-primary shrink-0">\u2022</span><span>${this.escapeHtml(p)}</span></li>`).join("")}
        </ul>
      </div>`).join("");e.innerHTML=`
      <div class="max-w-5xl mx-auto">
        <div class="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <button onclick="router.navigate('jobs')" class="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
              <span class="material-symbols-outlined text-sm">arrow_back</span> Back to jobs
            </button>
            <h1 class="text-2xl font-bold text-primary tracking-tight mt-2">Interview prep for this job</h1>
            <p class="text-sm text-slate-500 mt-0.5">${this.escapeHtml(a.title)}${a.company?" \xB7 "+this.escapeHtml(a.company):""}${a.location?" \xB7 "+this.escapeHtml(a.location):""}</p>
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

        ${this._toolUsageHtml(o)}

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
                  ${r.must.slice(0,7).map(u=>`<li class="text-[12px] text-slate-700 flex gap-1.5"><span class="text-primary shrink-0">\u2022</span><span>${this.escapeHtml(u)}</span></li>`).join("")}
                </ul>`:""}
              ${r.nice.length?`
                <p class="text-[11px] font-bold uppercase tracking-wide text-primary mb-1.5">Nice to have</p>
                <ul class="space-y-1 mb-3">
                  ${r.nice.slice(0,5).map(u=>`<li class="text-[12px] text-slate-600 flex gap-1.5"><span class="text-slate-300 shrink-0">\u2022</span><span>${this.escapeHtml(u)}</span></li>`).join("")}
                </ul>`:""}
              ${r.keywords.length?`
                <p class="text-[11px] font-bold uppercase tracking-wide text-primary mb-1.5">Signals in the description</p>
                <div class="flex flex-wrap gap-1.5">
                  ${r.keywords.map(u=>`<span class="bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2.5 py-0.5 text-[11px] font-bold">${this.escapeHtml(u)}</span>`).join("")}
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
                ${n.askThem.map((u,p)=>`<li class="text-[13px] text-slate-700 leading-relaxed flex gap-2"><span class="text-slate-300 font-bold shrink-0">${p+1}.</span><span>${this.escapeHtml(u.text)}</span></li>`).join("")}
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
              ${c?`
                <div class="rounded-xl border border-primary/30 bg-primary/[0.04] p-3 mb-3">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="material-symbols-outlined text-sm text-primary">star</span>
                    <span class="text-[12px] font-bold text-slate-900">${this.escapeHtml(c.name)}</span>
                    <span class="text-[10px] font-bold text-primary">${c.score}% match</span>
                  </div>
                  <p class="text-[11px] text-slate-600 mt-1 leading-relaxed">Leading your answers. ${c.matchedSkills.length?"It shows "+c.matchedSkills.join(", ")+" - exactly what this listing asks for.":"Open with this one in your answer."}</p>
                  <button onclick="app.copyRepoPitch('${this.escapeHtml(c.name)}')" class="text-[11px] font-bold text-primary border border-primary/30 rounded-lg px-2.5 py-1 hover:bg-primary/5 mt-2">Copy 60-sec pitch</button>
                </div>`:""}
              <div class="flex flex-wrap gap-1.5 mb-3">
                ${(Array.isArray(t.expertise)?t.expertise:[]).map(u=>`<span class="bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2.5 py-0.5 text-[11px] font-bold">${this.escapeHtml(u)}</span>`).join("")}
              </div>
              ${h||'<p class="text-[12px] text-slate-500">Add projects to your profile to get talking points here.</p>'}
            </div>
          </div>
        </div>
      </div>`,this._interviewNext(),this.renderGitHubPicker()}_extractJobThemes(e){const t=[e.description,e.requirements,e.responsibilities,e.about].filter(Boolean).join(`
`).replace(/\r/g,""),s=t.split(/\n+/).map(g=>String(g).replace(/^[\s\-\*\u2022\)\u2013\u2014:]+/,"").replace(/^\d+[.)]\s+/,"").replace(/\s+/g," ").trim()).filter(g=>g.length>3),i=[],a=[];let o="must";s.forEach(g=>{if(/nice to have|good to have|preferred|bonus|desirable|advantage|plus:/i.test(g)){o="nice";return}if(/benefit|perk|what we offer|why (you should )?join|compensation|salary/i.test(g)){o="skip";return}if(g.length<80&&/requirement|qualification|what you('|’)ll need|must have|looking for|skills? (required|needed)|who you are|about the role|responsibilit|what you('|’)ll do|day to day|role involves/i.test(g)){o="must";return}o!=="skip"&&(g.length>140||/^https?:|@|write to|apply (at|by)|contact/i.test(g)||(o==="nice"?a:i).push(g))});const n=/^(build|develop|design|manage|lead|own|drive|collaborate|ensure|support|analy[sz]e|improve|ship|partner with|maintain|scale|deliver|create|implement|run|plan|review|report|handle|identify|mentor|coordinate|launch|migrate|automate|optimi[sz]e|troubleshoot|research|prepare)\b/i,r=g=>String(g).replace(/^you\s+(?:will|would|are|shall|need to|want to|should|must|'ll|can)?\s*/i,""),l=s.map(r).filter(g=>n.test(g)&&g.length>14&&g.length<170).slice(0,6),m=/\b(experience|exposure|familiar|proficient|strong|knowledge|ability|skills|worked with|you have|must have|ideally|required|comfortable)\b/i,c=g=>{const d=String(g).toLowerCase();return i.concat(a).some($=>{const S=String($).toLowerCase().slice(0,18);return S.length>6&&d.indexOf(S)!==-1})},h=t.replace(/\s+/g," ").split(/[.!?;]\s+|\s+\|\s+/).map(g=>g.replace(/^[-*\u2022\d.)\s]+/,"").trim()).filter(g=>g.length>24&&g.length<230);h.forEach(g=>{const d=r(g);l.length<6&&n.test(d)&&l.indexOf(g)===-1&&!c(g)&&l.push(g)}),h.filter(g=>m.test(g)&&!n.test(g)&&!c(g)).slice(0,4).forEach(g=>{i.length<10&&i.indexOf(g)===-1&&i.push(g)});const u=new Set(["the","and","for","with","you","your","our","are","will","have","has","this","that","from","they","their","them","but","not","all","any","can","who","what","when","how","why","into","about","work","working","role","job","team","teams","years","year","experience","ability","strong","good","great","must","should","may","well","more","than","then","also","such","other","using","use","used","help","helps","new","like","etc","via","per","one","two","get","got","need","needs","based","across","within","ensure","ensuring","including","include","day","days","etc.","ideal","candidate","candidates","please","apply","applicants","looking","join","joining","opportunity","requirements","requirement","skills","skill","knowledge","familiar","comfortable","exposure","excellent","ability","responsible","role","roles","please","email","contact","benefits","salary","location","remote","hybrid","full-time","fulltime","graduate","fresher","plus","bonus","someone","who","able","someone","willing","someone","own","ideally","worked","brief","report","reports","plan","run","deliver","ensure","engine","including","across","within","weekly","daily","monthly","quarter","every","end","week","weeks","month","months","year","need","needs","well","able","write","writes","writing","read","reads","look","looking","help","helping","want","wants"]),p=/^(comfortable|exposure|strong|excellent|good|great|familiar|knowledge|ability|experience|years|year|ideal|candidate|candidates|opportunity|requirements|requirement|responsibilit|qualification|plus|bonus|apply|please|email|contact|location|remote|hybrid|full-time|fulltime|graduate|fresher|someone|willing|joining|please|benefits|salary|compensation)$/i,b={},y={},v=(g,d)=>{if(!g)return;const $=String(g).replace(/^[^A-Za-z0-9+#]+/,"").replace(/[^A-Za-z0-9+#.]+$/,"").replace(/\.+$/,"");if(!$)return;const S=$.toLowerCase();S.length<3||u.has(S)||p.test(S)||/^\d+$/.test(S)||(b[S]||(b[S]={n:0,orig:g}),b[S].n+=1,d&&(y[S]=(y[S]||0)+1))};t.split(/\n+/).forEach(g=>{g.split(/[^A-Za-z0-9+#.]+/).filter(Boolean).forEach(($,S)=>v($,S===0))}),i.concat(a,l).forEach(g=>{String(g).split(/\s+/).slice(1).forEach($=>{$.length>3&&v($,!1)})});const x=(Array.isArray(e.skills)?e.skills:[]).map(g=>String(g).toLowerCase()),w=Object.keys(b).filter(g=>p.test(g)?!1:b[g].n>=2?!0:!((y[g]||0)>=b[g].n)).sort((g,d)=>{const $=x.indexOf(g)!==-1?1:0;return(x.indexOf(d)!==-1?1:0)-$||b[d].n-b[g].n||b[d].orig.length-b[g].orig.length}).slice(0,12).map(g=>b[g].orig);let f="";const _=(String(e.title||"")+" "+t.slice(0,400)).match(/\b(intern|internship|trainee|junior|entry[- ]level|graduate|fresher|mid[- ]level|senior|staff|principal|lead|head|director|manager)\b/i);_&&(f=_[1].toLowerCase().replace(/[- ]/g," "));const k=t.match(/(\d+)\s*\+?\s*(?:-\s*\d+)?\s*years?/i);return{must:i.slice(0,10),nice:a.slice(0,6),responsibilities:l,keywords:w,seniority:f,years:k?k[1]:""}}_generateInterviewQuestions(e,t,s){const i=s||this._extractJobThemes(e),a=e.title||"this role",o=e.company||"your team",n=(Array.isArray(e.skills)?e.skills:[]).filter(x=>String(x||"").trim()).slice(0,4),r=(x,w)=>{const f=String(x||"").replace(/\s+/g," ").trim();return f.length>w?f.slice(0,w).replace(/\s+\S*$/,"")+"...":f},l=i.keywords.map(x=>String(x).toLowerCase()),m=x=>{const w={};return String(x||"").toLowerCase().split(/[^a-z0-9+#.]+/).forEach(f=>{f.length>3&&l.indexOf(f)!==-1&&!w[f]&&(w[f]=!0)}),Object.keys(w).slice(0,3)},c=x=>{const w=String(x||"").toLowerCase();return n.map(f=>String(f).toLowerCase()).filter(f=>f&&w.indexOf(f)!==-1&&l.indexOf(f)===-1).slice(0,2)},h=x=>{const w={};m(x).concat(c(x)).forEach(E=>{w[E]||(w[E]=!0)});let f=Object.keys(w).slice(0,3);if(!f.length){const E=/^(comfortable|exposure|strong|excellent|good|great|familiar|knowledge|ability|experience|years|year|including|use|used|using|well|also|across|within|ensure|working|ways|things|someone|role|work|plus|bonus|apply|please|with|and|the|for|that|this|their|there|from|have|will|about|other|such|than|when|where|which|while|would|could|should|must|into|your|they|them|then|than|more|only|also|other|each|both|some|most|such|very|many|will|can|out|off|over|under)$/i;f=String(x||"").split(/[^A-Za-z0-9+#./-]+/).filter(k=>k.length>3&&!E.test(k)).slice(0,2).map(k=>k.toLowerCase())}return f},u=i.must.filter(x=>x.length>10&&i.responsibilities.indexOf(x)===-1).slice(0,5).map(x=>({text:`The listing asks for "${r(x,110)}" - how have you done that?`,source:"This listing",focus:h(x)}));i.responsibilities.slice(0,4).forEach(x=>{u.push({text:`This role involves ${r(x,120)} - how would you approach it here?`,source:"This listing",focus:h(x)})}),i.nice.filter(x=>x.length>10).slice(0,2).forEach(x=>{u.push({text:`They list "${r(x,100)}" as a nice-to-have - what's your experience with it?`,source:"Nice to have",focus:m(x)})});const p=[{text:`Why do you want to work as ${a} at ${o}?`,source:"Motivation",focus:[a.split(/\s+/)[0].toLowerCase()]},{text:"Tell me about yourself in under two minutes.",source:"Opening",focus:[]},{text:`Why should we hire you for this ${a} role?`,source:"Fit",focus:[]},{text:`How would you approach your first 30 days in ${a}?`,source:"Fit",focus:[]},{text:i.years?`The listing asks for around ${i.years} years of experience - how does that compare with yours?`:"Where do you see yourself growing in the first year here?",source:"Fit",focus:[]}],b=n.flatMap(x=>{const w=String(x).toLowerCase();return[{text:`Walk me through a project where you used ${x}.`,source:"Skill",focus:[w]},{text:`What's the hardest problem you've solved with ${x}?`,source:"Skill",focus:[w]}]}),y=[{text:"Give me an example of a time things didn't go as planned - what did you do?",source:"Behavioural",focus:[]},{text:"Tell me about a time you had to convince someone with data or evidence.",source:"Behavioural",focus:[]},{text:"How do you stay organised when you have several tasks at once?",source:"Behavioural",focus:[]},{text:"Describe a mistake you made and what you learned from it.",source:"Behavioural",focus:[]},{text:"How do you handle feedback you don't agree with?",source:"Behavioural",focus:[]}],v=[{text:`What does a typical day look like in this ${a} role?`,focus:[]},{text:"What would success look like in the first 6 months?",focus:[]},{text:i.responsibilities.length?`How does the team handle ${r(i.responsibilities[0],80)} day to day?`:"How does the team make decisions and share feedback?",focus:[]},{text:i.keywords.length?`Which of these would I use most - ${i.keywords.slice(0,3).join(", ")}?`:"What tools does the team use most?",focus:i.keywords.slice(0,3)}];return{description:u,role:p,skills:b,behavioral:y,askThem:v}}_interviewNext(){const e=document.getElementById("iv-question");if(!e)return;this._interviewStopDictation(),this._interviewDelivery=null;const t=this._interviewQuestions||{description:[],role:[],skills:[],behavioral:[],askThem:[]},s=[];(t.description||[]).forEach(r=>s.push(r)),(t.skills||[]).forEach(r=>s.push(r)),(t.role||[]).forEach(r=>s.push(r)),(t.behavioral||[]).forEach(r=>s.push(r)),s.length||s.push({text:"Tell me about yourself.",source:"Opening",focus:[]});const i=s[Math.floor(Math.random()*s.length)];e.textContent=i.text;const a=document.getElementById("iv-source");a&&(a.textContent=i.source||"");const o=document.getElementById("iv-feedback");o&&(o.innerHTML="");const n=document.getElementById("iv-answer");this._interviewCurrentQuestion=i,this._interviewSetAnswerText(n?n.value:this._interviewLoad(i.text).answer,!1),this._interviewRenderMic()}_interviewTyped(){const e=document.getElementById("iv-answer");e&&this._interviewSetAnswerText(e.value)}_interviewAnswerKey(e){const t=e||this._interviewCurrentQuestion;return t?String(t.text||t).trim():""}_interviewSetAnswerText(e,t){const s=e==null?"":String(e),i=document.getElementById("iv-answer");if(i&&i.value!==s&&(i.value=s),this._interviewRenderTranscript(s),this._updateInterviewWordcount(s),t===!1)return;const a=this._interviewAnswerKey();if(this._interviewJobKey&&a)try{const o=this._interviewLoadAll();o[a]=s,localStorage.setItem(this._interviewJobKey,JSON.stringify(o))}catch(o){}}_interviewSpeechCtor(){const e=window.swapikiAudioEngine;return e&&typeof e.getSpeechRecognitionCtor=="function"?e.getSpeechRecognitionCtor():typeof window=="undefined"?null:window.SpeechRecognition||window.webkitSpeechRecognition||null}_interviewSpeechSupported(){return!!this._interviewSpeechCtor()}toggleInterviewMic(){const e=this._ivDictation;e&&e.active?this.stopInterviewMic():this.startInterviewMic()}startInterviewMic(){if(!this._interviewCurrentQuestion)return;if(!this._interviewSpeechSupported()){this._interviewRenderMic();const i=document.getElementById("iv-voice-unsupported");i&&i.classList.remove("hidden"),this.toggleInterviewType(!0);return}this._interviewStopDictation();const e=this._interviewCurrentQuestion,t=this._ivDictation={active:!0,question:e,base:(this._interviewLoad(e)||{}).answer||"",final:"",interim:"",startedAt:Date.now(),rec:null,error:null},s=document.getElementById("iv-feedback");s&&(s.innerHTML=""),this._interviewSpawnDictation(),this._interviewRenderMic()}_interviewSpawnDictation(){const e=this._ivDictation;if(!e||!e.active)return;const t=this._interviewSpeechCtor();if(!t){e.error="no-speech-api",e.active=!1,this._interviewFinishDictation();return}let s;try{s=new t}catch(i){e.error="construct-failed",e.active=!1,this._interviewFinishDictation();return}s.lang="en-IN",s.continuous=!0,s.interimResults=!0,s.maxAlternatives=1,s.onresult=i=>{if(this._ivDictation!==e)return;let a="";for(let o=i.resultIndex;o<i.results.length;o++){const n=i.results[o],r=n&&n[0],l=r&&r.transcript?r.transcript:"";n.isFinal?e.final+=(e.final&&!/\s$/.test(e.final)?" ":"")+l:a+=(a?" ":"")+l}e.interim=a,this._interviewRenderTranscript(e.final,e.interim),this._interviewRenderMic()},s.onerror=i=>{if(this._ivDictation===e){if(e.error=i&&i.error||"unknown",e.error==="no-speech"){this._interviewRenderMic();return}if(e.error==="not-allowed"||e.error==="service-not-allowed"||e.error==="audio-capture"){e.active=!1,e.rec===s&&(e.rec=null),this._interviewFinishDictation();return}this._interviewRenderMic()}},s.onend=()=>{if(this._ivDictation===e){if(e.rec=null,e.active){this._interviewSpawnDictation();return}this._interviewFinishDictation()}},e.rec=s;try{s.start()}catch(i){}}stopInterviewMic(){const e=this._ivDictation;if(e){if(e.active=!1,e.rec)try{e.rec.stop()}catch(t){this._interviewFinishDictation()}else this._interviewFinishDictation();this._interviewRenderMic()}}_interviewStopDictation(){const e=this._ivDictation;if(e&&(this._ivDictation=null,e.active=!1,e.rec))try{e.rec.abort()}catch(t){}}_interviewDictationText(e){return e?[e.final,e.interim].filter(Boolean).join(" ").replace(/\s+/g," ").trim():""}_interviewFinishDictation(){const e=this._ivDictation;if(!e)return;this._ivDictation===e&&(this._ivDictation=null);const t=this._interviewDictationText(e),s=[e.base,t].filter(Boolean).join(" ").replace(/\s+/g," ").trim(),i=(Date.now()-e.startedAt)/1e3;if(this._interviewSetAnswerText(s),this._interviewRenderMic(),!t){if(e.error){const a=document.getElementById("iv-voice-unsupported-title"),o=document.getElementById("iv-voice-unsupported-detail");a&&(a.textContent=this._interviewMicErrorTitle(e.error)),o&&(o.textContent=this._interviewMicErrorText(e.error));const n=document.getElementById("iv-voice-unsupported");n&&n.classList.remove("hidden"),this.toggleInterviewType(!0)}return}this._interviewDelivery={seconds:i,words:this._interviewWordCount(t)},this.checkInterviewAnswer()}_interviewMicErrorTitle(e){return e==="not-allowed"||e==="service-not-allowed"?"Microphone blocked":e==="audio-capture"?"No microphone found":e==="no-speech-api"||e==="construct-failed"?"This browser can't listen":"Listening stopped early"}_interviewMicErrorText(e){return e==="not-allowed"||e==="service-not-allowed"?"Allow the microphone in your browser and tap the mic again, or write the answer out below.":e==="audio-capture"?"Plug a microphone in and tap again, or write the answer out below.":e==="no-speech-api"||e==="construct-failed"?"Speech-to-text needs Chrome or Edge. You can still write the answer out below and check it the same way.":"Nothing was picked up. Tap the mic to try again, or write the answer out below."}_interviewWordCount(e){const t=String(e||"").trim();return t?t.split(/\s+/).length:0}_interviewRenderTranscript(e,t){const s=document.getElementById("iv-transcript-wrap"),i=document.getElementById("iv-transcript");if(!s||!i)return;const a=this._ivDictation;let o;if(e==null){const r=document.getElementById("iv-answer");o=r?r.value:""}else{o=[e,t].filter(Boolean).join(" ");const r=a?a.base:"";r&&(o=r+(o?" "+o:""))}const n=String(o||"").replace(/\s+/g," ").trim();i.textContent=n,n?s.classList.remove("hidden"):s.classList.add("hidden")}_interviewRenderMic(){const e=document.getElementById("iv-mic-label"),t=document.getElementById("iv-mic-status"),s=document.getElementById("iv-mic-icon"),i=document.getElementById("iv-mic"),a=this._ivDictation,o=!!(a&&a.active);if(i&&(i.classList.toggle("is-recording",o),i.classList.toggle("animate-pulse",o),i.classList.toggle("motion-reduce:animate-none",o),i.setAttribute("aria-label",o?"Stop recording":"Record your answer")),s&&(s.textContent=o?"stop_circle":"mic"),e&&(e.textContent=o?"Listening - tap to finish":"Tap to answer out loud"),t)if(o){const n=this._interviewWordCount(this._interviewDictationText(a)),r=Math.max(0,Math.round((Date.now()-a.startedAt)/1e3));t.textContent=n?"Listening - "+n+" words so far, "+r+"s":"Listening - start answering out loud",a.error&&a.error!=="no-speech"&&(t.textContent="Having trouble: "+this._interviewMicErrorText(a.error))}else t.textContent="Uses your microphone only. The audio never leaves this page.";return o}toggleInterviewType(e){const t=document.getElementById("iv-type-fallback"),s=document.getElementById("iv-type-toggle");if(!t)return;const i=e===!0?!0:t.classList.contains("hidden");if(i?t.classList.remove("hidden"):t.classList.add("hidden"),s&&(s.textContent=i?"Hide typing":"Type instead"),i){const a=document.getElementById("iv-answer");a&&typeof a.focus=="function"&&a.focus()}}_gradeSpokenDelivery(e,t){const s=[],i=this._interviewWordCount(e),a=Number(t)||0,n=String(e||"").toLowerCase().match(/\b(um+|uh+|erm|basically|actually|literally|like,|sort of|kind of|i guess|honestly speaking)\b/g)||[];let r=null;i>=45&&a>=20&&(r=Math.round(i/a*60),r>=195?s.push({ok:!1,label:"Rushed",hint:r+" words per minute. Interviewers read speed as nerves - aim for 130-160."}):r>=170?s.push({ok:!1,label:"A bit fast",hint:r+" words per minute. Try to land nearer 150."}):r<90?s.push({ok:!1,label:"Slow",hint:r+" words per minute. Long pauses read as uncertainty - keep the story moving."}):s.push({ok:!0,label:"Good pace",hint:r+" words per minute - about right for an interview answer."}));const l=n.filter(m=>!/^(like,|sort of|kind of)$/.test(m));return l.length?s.push({ok:!1,label:"Filler words out loud",hint:'Heard "'+l.slice(0,3).join('", "')+'" '+l.length+" time"+(l.length===1?"":"s")+". Pause silently instead."}):i>=45&&s.push({ok:!0,label:"Clean delivery",hint:"No filler words in what you said."}),s.length||s.push({ok:!0,label:"Spoken answer captured",hint:i+" words heard. Answer it again for longer to be graded on pace."}),{checks:s,wpm:r,words:i,seconds:Math.round(a)}}_interviewLoadAll(){try{return JSON.parse(localStorage.getItem(this._interviewJobKey)||"{}")}catch(e){return{}}}_interviewLoad(e){const t=this._interviewLoadAll(),s=this._interviewAnswerKey(e);return{answer:s&&t[s]||""}}_updateInterviewWordcount(e){const t=document.getElementById("iv-wordcount");if(!t)return;const s=this._interviewWordCount(e);t.textContent=s?`${s} words`:"Tap the mic to answer"}clearInterviewAnswer(){this._interviewStopDictation(),this._interviewDelivery=null;const e=document.getElementById("iv-answer");this._interviewSetAnswerText("");const t=this._interviewAnswerKey();if(this._interviewJobKey&&t)try{const i=this._interviewLoadAll();delete i[t],localStorage.setItem(this._interviewJobKey,JSON.stringify(i))}catch(i){}const s=document.getElementById("iv-feedback");s&&(s.innerHTML=""),this._interviewRenderMic()}copyInterviewAnswer(){const e=document.getElementById("iv-answer");if(!e||!e.value.trim()){this.showToast("Write a draft answer first.");return}if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(e.value).then(()=>this.showToast("Answer draft copied."));else{const t=document.createElement("textarea");t.value=e.value,document.body.appendChild(t),t.select(),document.execCommand("copy"),document.body.removeChild(t),this.showToast("Answer draft copied.")}}checkInterviewAnswer(){const e=document.getElementById("iv-answer"),t=document.getElementById("iv-feedback"),s=this._interviewCurrentQuestion;if(!e)return;if(!e.value.trim()){this.showToast("Answer out loud first, then check it.");return}if(!t)return;const i=e.value.trim(),a=this._gradeAnswer(i,s),o=this._modelAnswer(s),n=this._interviewDelivery?this._gradeSpokenDelivery(i,this._interviewDelivery.seconds):null,r=a.score>=75?"bg-emerald-500":a.score>=50?"bg-amber-500":"bg-rose-500",l=a.score>=75?"text-emerald-700":a.score>=50?"text-amber-700":"text-rose-700",m=a.score>=75?"bg-emerald-50":a.score>=50?"bg-amber-50":"bg-rose-50";t.innerHTML=`
      ${n?`
      <div class="rounded-xl border border-slate-200 overflow-hidden mb-3">
        <div class="px-3.5 py-3 bg-slate-900 border-b border-slate-800">
          <p class="text-[13px] font-bold text-white">How you said it</p>
          <p class="text-[11px] text-slate-300 mt-0.5">${n.words} words over ${n.seconds}s${n.wpm?" - "+n.wpm+" words per minute":""}. This part is only visible when you answer out loud.</p>
        </div>
        <ul class="p-3 space-y-1.5 bg-white">
          ${n.checks.map(c=>`
            <li class="text-[12px] leading-relaxed flex gap-2">
              <span class="material-symbols-outlined text-sm ${c.ok?"text-emerald-600":"text-rose-500"} shrink-0">${c.ok?"check_circle":"cancel"}</span>
              <span class="${c.ok?"text-slate-600":"text-slate-800"}"><strong class="font-bold">${this.escapeHtml(c.label)}</strong> - ${this.escapeHtml(c.hint)}</span>
            </li>`).join("")}
        </ul>
      </div>`:""}
      <div class="rounded-xl border border-slate-200 overflow-hidden">
        <div class="${m} px-3.5 py-3 border-b border-slate-200">
          <div class="flex items-center justify-between gap-3 mb-1.5">
            <span class="text-[13px] font-bold ${l}">${a.verdict}</span>
            <span class="text-[13px] font-bold ${l}">${a.score}/100</span>
          </div>
          <div class="h-1.5 rounded-full bg-white/70 overflow-hidden">
            <div class="h-full ${r} rounded-full" style="width:${a.score}%"></div>
          </div>
          <p class="text-[11px] text-slate-600 mt-1.5">${a.summary}</p>
        </div>
        <ul class="p-3 space-y-1.5 bg-white">
          ${a.checks.map(c=>`
            <li class="text-[12px] leading-relaxed flex gap-2">
              <span class="material-symbols-outlined text-sm ${c.ok?"text-emerald-600":"text-rose-500"} shrink-0">${c.ok?"check_circle":"cancel"}</span>
              <span class="${c.ok?"text-slate-600":"text-slate-800"}"><strong class="font-bold">${this.escapeHtml(c.label)}</strong> - ${this.escapeHtml(c.hint)}</span>
            </li>`).join("")}
        </ul>
        <div class="p-3.5 border-t border-slate-200 bg-slate-50">
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <p class="text-[11px] font-bold uppercase tracking-wide text-primary">${a.score>=75?"Tighten it like this":"A strong answer looks like this"}</p>
            <button onclick="app.copyModelAnswer()" class="text-[11px] font-bold text-primary border border-primary/30 rounded-lg px-2.5 py-1 hover:bg-primary/5 whitespace-nowrap">Copy model</button>
          </div>
          <p class="text-[10px] text-slate-400 mb-2">Built from your own proof profile - swap anything in [brackets] for your real detail.</p>
          <div class="text-[12px] text-slate-700 leading-relaxed bg-white border border-slate-200 rounded-lg p-3 whitespace-pre-line">${this.escapeHtml(o)}</div>
          <p class="text-[11px] font-bold text-slate-700 mt-2.5 mb-1">Structure to remember: STAR</p>
          <ul class="text-[11px] text-slate-600 space-y-0.5">
            <li><strong>S</strong>ituation - the one line of context</li>
            <li><strong>T</strong>ask - what you were responsible for</li>
            <li><strong>A</strong>ction - what you personally did, first person</li>
            <li><strong>R</strong>esult - the number or outcome that proves it</li>
          </ul>
        </div>
      </div>`,t.scrollIntoView({block:"nearest",behavior:"smooth"})}_gradeAnswer(e,t){const s=String(e||""),i=s.toLowerCase(),a=s.trim()?s.trim().split(/\s+/).length:0,o=[];let n=0,r=a>=45&&a<=180;r||(r=a>=30&&a<=220),r?(n+=20,o.push({ok:!0,label:"Right length",hint:a+" words - about a minute spoken."})):a<30?(n+=5,o.push({ok:!1,label:"Too short",hint:"Only "+a+" words. Give context, what you did and the outcome (45-180 words)."})):(n+=10,o.push({ok:!1,label:"Too long",hint:a+" words. Cut to the first 180 - the interviewer stops listening after two minutes."}));const l=/(at |when |while |during |the (context|situation|team|company|project) |i was |we were |our |my )/i.test(s),m=/(responsible for|my role|was asked|had to|needed to|my job was|assigned|owned|objective|goal was|expected)/i.test(s),c=/(i |we )?(built|developed|designed|led|managed|owned|drove|shipped|launched|migrated|automated|implemented|analysed|analyzed|improved|reduced|increased|scaled|set up|created|reviewed|coordinated|partnered|mentored|troubleshoot)/i.test(s),h=/(so that|result|resulting|which (led|meant|reduced|improved)|impact|outcome|therefore|after that|cut |saved |grew|reached)/i.test(s),u=[l,m,c,h].filter(Boolean).length;if(n+=Math.round(u*6),u===4)o.push({ok:!0,label:"Full STAR structure",hint:"Situation, task, action and result are all there."});else{const k=[];l||k.push("the situation"),m||k.push("what you were responsible for"),c||k.push("what you personally did"),h||k.push("the result"),o.push({ok:!1,label:"Structure",hint:"Missing "+k.join(", ")+". Run it as STAR."})}/\b(i|i'm|i've|my|me|we|our)\b/i.test(s)?(n+=15,o.push({ok:!0,label:"Takes ownership",hint:'Uses "I" - you are claiming the work, not describing a team.'})):o.push({ok:!1,label:"Takes ownership",hint:'No "I" in the answer. Say what YOU did, not just what the team did.'});const b=/\b\d+(\.\d+)?\s*(%|percent|x|hrs?|hours?|days?|weeks?|months?|users?|clients?|records|requests|qps|lakh|crore|k|m)?\b/i.test(s),y=/(reduced|increased|cut|saved|grew|improved|scaled|dropped|raised|accelerated|shortened|doubled|halved|onboarded|converted|closed|shipped|delivered)\b/i.test(s);b||y?(n+=20,o.push({ok:!0,label:"Shows proof",hint:"Contains a measurable outcome - this is the part interviewers remember."})):o.push({ok:!1,label:"No proof yet",hint:'No number or measurable outcome. Add one, e.g. "cut build time by 40%" or "onboarded 12 users".'});const v=(t&&Array.isArray(t.focus)?t.focus:[]).filter(Boolean).map(k=>String(k).toLowerCase()),x=v.filter(k=>i.indexOf(k)!==-1);v.length?x.length?(n+=20,o.push({ok:!0,label:"On topic",hint:"Mentions "+x.join(", ")+" - exactly what this question is about."})):o.push({ok:!1,label:"Off topic",hint:"This question is about "+v.join(", ")+" and your answer never says it. Name it explicitly."}):(n+=20,o.push({ok:!0,label:"On topic",hint:"Open question - no specific keyword to hit. Keep it about you and this role."}));const w=i.match(/\b(um+|uh+|erm|basically|actually|literally|like,|sort of|kind of|i guess|i think maybe|honestly speaking)\b/g);w&&w.length?(n-=Math.min(10,w.length*3),o.push({ok:!1,label:"Filler words",hint:'Found "'+w.slice(0,3).join('", "')+'" - pause silently instead.'})):(n+=5,o.push({ok:!0,label:"Clean delivery",hint:"No filler words."})),/(\b[A-Z][a-z]+\b|\bv?\d|\b(api|sql|dashboard|funnel|release|repo|stack|pipeline|dataset|client|customer|stakeholder|team)\b)/.test(s)?(n+=5,o.push({ok:!0,label:"Specific details",hint:"Names real things - that is what makes a story credible."})):o.push({ok:!1,label:"Too generic",hint:"Name the actual project, tool, client or team you are describing."}),n=Math.max(0,Math.min(100,n));const E=n>=75?"Strong answer - interview ready":n>=50?"Almost there - fix the gaps below":"Not interview ready yet",_=n>=75?"This has the shape of an answer a hiring manager will believe.":"Interviewers score structure, ownership and proof. Fix the red items and say it out loud.";return{score:n,verdict:E,summary:_,checks:o,words:a}}_modelAnswer(e){const t=swapikiStore.getProfile()||{},s=Array.isArray(t.projects)?t.projects:[],i=this._interviewJob||Array.isArray(this._jobsCache)&&this._jobsCache.find(d=>d.id===this._interviewJobId)||null,a=i&&i.title?i.title:"this role",o=i&&i.company?i.company:"the company",n=(e&&Array.isArray(e.focus)?e.focus:[]).map(d=>String(d).toLowerCase()),r=window.swapikiGitHub?window.swapikiGitHub.buildJobContext(i||{}):{terms:[]},l=this._ghRanked?this._ghRanked():[],m=this._ghHydrateStory?this._ghHydrateStory():this._interviewStory||"",c=l.find(d=>d.matched&&d.matched.length)||null,h=m?l.find(d=>d.name===m):c,u=d=>n.reduce(($,S)=>$+(d.indexOf(S)!==-1?2:0),0)+Math.min(d.length,400)/400;let p=null,b=0;if(s.forEach(d=>{const $=[d.title,d.role,d.description,(d.tags||[]).join(" "),(d.skills||[]).join(" ")].join(" ").toLowerCase(),S=u($);S>b&&(b=S,p={kind:"project",data:d})}),h){const d=[h.name,h.repo.description,h.language,(h.repo.topics||[]).join(" ")].join(" ").toLowerCase(),$=u(d)+h.score/100+(m?1.5:0);$>b&&(b=$,p={kind:"repo",data:h})}const y=p&&p.kind==="project"?p.data:null,v=p&&p.kind==="repo"?p.data:null,x=v?this._ghNotes(v.name):{},w=String(x.problem||"").trim(),f=String(x.role||"").trim(),E=String(x.result||"").trim(),_=e&&e.text?e.text:"this question",k=[];if(k.push("SITUATION"),v){const d=v.repo||{},$=d.description?String(d.description).replace(/\s+/g," ").replace(/[.!?]+$/,""):"";k.push('"'+(o!=="the company"?"At "+o+" ":"")+"I built "+v.name+(v.language?" - a "+v.language+" project":"")+($?": "+$:"")+". The problem it solved was "+(w||"[the one-line problem - name it]")+".")}else y?k.push('"'+(o!=="the company"?"At "+o+" ":"")+"I worked on "+(y.title||"a project")+(y.role?" as a "+y.role:"")+". The problem we needed to solve was [the one-line problem - name it]."):k.push('"The context is [where and when]. Something needed to change: [the problem in one line].');k.push(""),k.push("TASK"),v?k.push(f?"My role: "+f+".":"I owned "+(n[0]?n[0]+" work":"the build")+" end to end in "+v.name+" - [the outcome you were responsible for, and any constraint you had]."):y?k.push("I was responsible for [the outcome you owned], working with [who], and I had to do it within [constraint]."):k.push("I owned [the outcome], which meant [the scope you personally carried]."),k.push(""),k.push("ACTION");const g=(y&&Array.isArray(y.takeaways)?y.takeaways:[]).filter(d=>d);if(v){const d=String(x.hard||"").trim(),$=String(x.stack||"").trim();k.push("- What it is: "+(v.repo&&v.repo.description||v.name)+"."),$?k.push("- Tech and why: "+$+"."):k.push("- Stack: "+(v.language||"the languages you used")+(v.matchedSkills&&v.matchedSkills.length?", chosen for "+v.matchedSkills.join(", "):"")+" - [why you chose it and what you gave up]."),k.push("- The hard part: "+(d||"[the one problem that took real effort - performance, scale, a nasty bug].")),k.push("- How you checked it worked: [tests, benchmarks, users, monitoring].")}else g.length?(g.slice(0,3).forEach(d=>k.push("- "+d)),(!n.length||n.some(d=>g.join(" ").toLowerCase().indexOf(d)===-1))&&k.push("- I also made sure "+(n[0]||"the key skill here")+" was part of how I did it, because that is what the job asks for.")):(k.push("- I "+(n[0]?"used "+n[0]+" to ":"")+"[what you personally did - step one]."),k.push("- [step two - the hard part, and how you decided]."),k.push("- [step three - how you checked it worked]."));return k.push(""),k.push("RESULT"),E?k.push("The outcome: "+E+". For "+a+" at "+o+" specifically, that is the same kind of problem you are hiring to solve."):k.push("The outcome was [the number - e.g. cut X by 40%, shipped Y to Z users, won the deal]. After that, [what changed because of you]. For "+a+" at "+o+" specifically, this is the same problem you are hiring to solve."),"Q: "+_+`

`+k.join(`
`)}copyModelAnswer(){const e=this._interviewCurrentQuestion,t=this._modelAnswer(e);if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(()=>this.showToast("Model answer copied."));else{const s=document.createElement("textarea");s.value=t,document.body.appendChild(s),s.select(),document.execCommand("copy"),document.body.removeChild(s),this.showToast("Model answer copied.")}}copyInterviewQuestions(){const e=this._interviewQuestions||{description:[],role:[],skills:[],behavioral:[],askThem:[]},t=a=>(a||[]).map((o,n)=>`${n+1}. ${typeof o=="string"?o:o.text}`),i=["STRAIGHT FROM THIS JOB DESCRIPTION",...t(e.description),"","ABOUT THIS ROLE",...t(e.role),"",e.skills&&e.skills.length?"BUILT ON THE LISTED SKILLS":null,...e.skills&&e.skills.length?t(e.skills):[],"","BEHAVIOURAL",...t(e.behavioral),"","QUESTIONS TO ASK THEM",...t(e.askThem)].filter(a=>a!==null).join(`
`).replace(/\n{3,}/g,`

`).trim();if(i)if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(i).then(()=>this.showToast("Question bank copied."));else{const a=document.createElement("textarea");a.value=i,document.body.appendChild(a),a.select(),document.execCommand("copy"),document.body.removeChild(a),this.showToast("Question bank copied.")}}_ghStateKey(){return"swapiki_github_state"}_ghLoad(){try{return JSON.parse(localStorage.getItem(this._ghStateKey())||"{}")}catch(e){return{}}}_ghSave(e){const t=Object.assign(this._ghLoad(),e||{});try{localStorage.setItem(this._ghStateKey(),JSON.stringify(t))}catch(s){}return this._gh=t,t}_ghClientId(){return(window.SWAPIKI_CONFIG||{}).GITHUB_CLIENT_ID||""}async ghConnect(){const e=this._ghClientId();if(!e){this.ghFocusLink();return}const t=document.getElementById("gh-connect-box");t&&(t.innerHTML='<p class="text-[12px] text-slate-500">Starting GitHub sign-in...</p>');try{const i=await(await fetch("https://github.com/login/device/code",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({client_id:e,scope:"read:user public_repo"})})).json();if(i.error||!i.device_code)throw new Error(i.error_description||i.error||"GitHub did not start the sign-in.");this._ghDevice=i,this._ghRenderDevice();try{window.open(i.verification_uri,"_blank","noopener")}catch(a){}}catch(s){this.ghError("Could not start GitHub sign-in ("+(s&&s.message||"network error")+"). You can still paste your GitHub link below."),this.ghFocusLink()}}_ghRenderDevice(){const e=document.getElementById("gh-connect-box");e&&(e.innerHTML=this._ghDeviceBoxHtml())}_ghDeviceBoxHtml(){const e=this._ghDevice;return e?`
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
      </div>`:""}_ghCopyCode(){const e=this._ghDevice&&this._ghDevice.user_code;e&&navigator.clipboard&&navigator.clipboard.writeText&&navigator.clipboard.writeText(e).then(()=>this.showToast("Code copied."))}async _ghPollDevice(){const e=this._ghDevice;if(e)try{const s=await(await fetch("https://github.com/login/oauth/access_token",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({client_id:this._ghClientId(),device_code:e.device_code,grant_type:"urn:ietf:params:oauth:grant-type:device_code"})})).json();if(s.error==="authorization_pending"){this.showToast("Not yet - approve it on GitHub, then check again.");return}if(s.error==="slow_down"){this.showToast("Slow down a moment, then check again.");return}if(s.error||!s.access_token){this.ghError("GitHub sign-in "+(s.error||"failed")+(s.error_description?" - "+s.error_description:"")+".");return}this._ghSave({token:s.access_token}),this._ghDevice=null,this.showToast("GitHub connected. Reading your repos..."),await this.ghFetchRepos(!0)}catch(t){this.ghError("Could not finish GitHub sign-in. Paste your GitHub link below instead."),this.ghFocusLink()}}_ghCancelDevice(){this._ghDevice=null,this.renderGitHubPicker()}_ghParseUsername(e){let t=String(e==null?"":e).trim();if(!t)return"";if(t=t.replace(/^[a-z][a-z0-9+.-]*:\/\//i,"").replace(/^www\./i,""),/^github\.com(\/|$)/i.test(t))t=t.replace(/^github\.com/i,"");else if(/[/:]/.test(t))return"";return t=t.split(/[?#]/)[0].replace(/^\/+/,"").split("/")[0].split("@").pop(),t=t.replace(/[\s.]+$/,""),/^[A-Za-z0-9-]{1,39}$/.test(t)?t:""}async ghConnectFromLink(){const e=document.getElementById("gh-link"),t=this._ghParseUsername(e&&e.value);if(!t){this.ghError("That does not look like a GitHub link. It should look like github.com/yourname.");return}this._ghSave({username:t,token:""}),await this.ghFetchRepos(!0)}async ghFetchRepos(e){const t=this._ghLoad(),s=1200*1e3;if(!e&&t.repos&&t.fetchedAt&&Date.now()-t.fetchedAt<s){this._gh=t,this.renderGitHubPicker();return}this.ghBusy("Reading your GitHub repos...");try{let i;if(t.token)i="https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner";else if(t.username)i="https://api.github.com/users/"+encodeURIComponent(t.username)+"/repos?per_page=100&sort=updated&type=owner";else{this.renderGitHubPicker();return}const a={Accept:"application/vnd.github+json"};t.token&&(a.Authorization="Bearer "+t.token);const o=await fetch(i,{headers:a});if(o.status===401){this.ghError("GitHub rejected the sign-in. Disconnect and connect again.");return}if(o.status===403){this.ghError("GitHub rate limit hit. Wait a few minutes and press Refresh.");return}if(!o.ok){this.ghError("GitHub returned "+o.status+". Try again in a moment.");return}const n=await o.json();let r=t.username||"";if(t.token)try{const m=await fetch("https://api.github.com/user",{headers:a});m.ok&&(r=(await m.json()).login||r)}catch(m){}const l=(Array.isArray(n)?n:[]).map(m=>({name:m.name,description:m.description||"",language:m.language||"",topics:Array.isArray(m.topics)?m.topics:[],stargazers_count:m.stargazers_count||0,fork:!!m.fork,archived:!!m.archived,size:m.size||0,pushed_at:m.pushed_at,html_url:m.html_url}));this._ghSave({repos:l,fetchedAt:Date.now(),login:r,error:""}),this.showToast(l.length+" repos matched against this job.")}catch(i){this.ghError("Could not reach GitHub. Check your connection and try again.")}}ghDisconnect(){this._ghSave({token:"",username:"",repos:[],fetchedAt:0,login:"",error:""}),this._gh={},this.showToast("GitHub disconnected."),this.renderGitHubPicker()}ghBusy(e){const t=document.getElementById("gh-connect-status");t&&(t.textContent=e||"",t.classList.toggle("hidden",!e))}ghError(e){this._ghSave({error:e}),this.renderGitHubPicker(),this.ghFocusLink()}ghFocusLink(){const e=document.getElementById("gh-link");if(e)try{e.focus()}catch(t){}}_ghReason(e){return e?e.matchedSkills&&e.matchedSkills.length?"Ranks here because it uses "+e.matchedSkills.slice(0,3).join(", ")+", which this listing asks for. "+(e.score>=75?"Strong match - lead with it.":"Worth mentioning."):e.matched&&e.matched.length?"No required skill overlap, but it touches "+e.matched.slice(0,3).join(", ")+" from the description.":"Nothing in the listing matches this one - only pick it if you have a strong story for it.":""}_ghNotesKey(e){return"swapiki_repo_notes_"+String(e||"x")}_ghNoteFields(){return window.swapikiGitHub&&window.swapikiGitHub.NOTE_FIELDS||[]}_ghNoteEnvelope(e){let t={};try{t=JSON.parse(localStorage.getItem(this._ghNotesKey(e))||"{}")||{}}catch(s){}return!t||typeof t!="object"?{n:{},u:0,s:!1}:t.n&&typeof t.n=="object"?{n:t.n,u:Number(t.u)||0,s:!!t.s}:{n:t,u:0,s:!1}}_ghNotes(e){const t=this._ghNoteEnvelope(e).n,s={};return this._ghNoteFields().forEach(i=>{const a=String(t[i.key]||"").trim();a&&(s[i.key]=a)}),s}_ghWriteNotes(e,t,s,i){const a={n:t||{},u:typeof i=="number"?i:Date.now(),s:!!s};try{localStorage.setItem(this._ghNotesKey(e),JSON.stringify(a))}catch(n){}let o=[];try{o=JSON.parse(localStorage.getItem("swapiki_repo_notes_index")||"[]")||[]}catch(n){}if(o.indexOf(e)===-1){o.push(e);try{localStorage.setItem("swapiki_repo_notes_index",JSON.stringify(o))}catch(n){}}return a}_ghNotesCloudState(){return!this.isAuthenticated()||swapikiStore._repoNotesUnavailable?"device":"account"}_ghNoteWhereText(e){return e===!0?"Saved to your account. Here on every device you sign in on.":this.isAuthenticated()?"Saved on this device only - the account copy is not reachable right now.":"Saved on this device. Sign in to keep it on all your devices."}async _ghSyncNotes(e){if(this._ghNotesCloudState()!=="account"||typeof swapikiStore.saveRepoNote!="function")return!1;const t=this._ghNoteEnvelope(e).u,s=this._ghNotes(e),i=await swapikiStore.saveRepoNote(e,s);return this._ghWriteNotes(e,s,i,i?Date.now():t),i}_ghNoteSyncLabel(e){const t=document.getElementById("gh-note-where");t&&(t.textContent=this._ghNoteWhereText(e))}async _ghFlushNotes(){if(this._ghNotesCloudState()!=="account")return 0;let e=[];try{e=JSON.parse(localStorage.getItem("swapiki_repo_notes_index")||"[]")||[]}catch(s){}let t=0;for(const s of e){const i=this._ghNoteEnvelope(s);i.s||!Object.keys(i.n).length||await this._ghSyncNotes(s)&&t++}return t}async _ghHydrateNotes(){if(this._ghNotesCloudState()!=="account"||typeof swapikiStore.fetchRepoNotes!="function")return 0;const e=await swapikiStore.fetchRepoNotes();let t=0;return Object.keys(e||{}).forEach(s=>{const i=e[s]||{},a=this._ghNoteEnvelope(s),o=Date.parse(i.updatedAt||"")||0,n=Object.keys(a.n).length;if(n&&a.u>o){this._ghWriteNotes(s,a.n,!1,a.u);return}n&&a.u===o&&a.s||(this._ghWriteNotes(s,i.notes||{},!0,o||Date.now()),Object.keys(i.notes||{}).length&&t++)}),t+await this._ghFlushNotes()}_ghNoteCount(){const e=document.getElementById("gh-note-count");if(!e)return;const t=window.swapikiGitHub&&window.swapikiGitHub.NOTE_FIELDS||[];let s=0;t.forEach(i=>{const a=document.getElementById("gh-note-"+i.key);a&&String(a.value||"").trim()&&s++}),e.textContent=s+" of "+t.length+" filled in",e.className="text-[10px] font-bold shrink-0 "+(s===t.length?"text-emerald-700":"text-primary")}async _ghSaveNotes(e,t){const s=t||{},i=document.activeElement&&document.activeElement.id||"",a=this._ghNoteFields(),o={};a.forEach(c=>{const h=document.getElementById("gh-note-"+c.key),u=h?String(h.value||"").replace(/\s+/g," ").trim().slice(0,400):"";u&&(o[c.key]=u)}),this._ghWriteNotes(e,o,!1);const n=window.swapikiGitHub.blankFields(o);this._ghNoteOpen=s.close?"":e,this.renderGitHubPicker();const r=document.getElementById("iv-feedback");r&&(r.innerHTML="");const l=document.getElementById("gh-note-saved");if(l&&(l.textContent=n.length?"Saved. Still worth adding: "+n.map(c=>c.label.toLowerCase()).join(", ")+".":"Saved - your 60-second answer is complete.",l.classList.remove("hidden")),s.close){const c=await this._ghSyncNotes(e);this.showToast(c?n.length?"Saved to your account.":"Saved to your account - your 60-second answer is complete.":n.length?"Saved on this device. Still worth adding: "+n.map(h=>h.label.toLowerCase()).join(", ")+".":"Saved on this device - your 60-second answer is complete.");return}const m=(i?document.getElementById(i):null)||(n.length?document.getElementById("gh-note-"+n[0].key):null);if(m)try{m.focus()}catch(c){}this.showToast(n.length?"Saved.":"Saved - your 60-second answer is complete."),this._ghSyncNotes(e).then(c=>this._ghNoteSyncLabel(c)).catch(()=>{})}_ghNoteFormHtml(e){const t=this._ghNotes(e.name),s=(window.swapikiGitHub&&window.swapikiGitHub.NOTE_FIELDS||[]).map(r=>{const l=r.key==="result"?"e.g. cut checkout time from 2.8s to 1.6s":r.key==="role"?"e.g. I owned the front end end to end":r.key==="problem"?"e.g. checkout drop-off was costing us sales":r.key==="hard"?"e.g. keeping cart state consistent across tabs":"e.g. why that stack, and what you gave up for it";return`
        <label class="block">
          <span class="text-[10px] font-bold uppercase tracking-wide text-slate-500">${this.escapeHtml(r.label)}</span>
          <input id="gh-note-${r.key}" type="text" value="${this.escapeHtml(t[r.key]||"")}" placeholder="${this.escapeHtml(l)}"
            oninput="app._ghNoteCount()"
            class="mt-1 w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-[12px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all" />
        </label>`}).join(""),i=(window.swapikiGitHub.NOTE_FIELDS||[]).length-window.swapikiGitHub.blankFields(t).length,a=(window.swapikiGitHub.NOTE_FIELDS||[]).length,o=this.escapeHtml(e.name).replace(/[^A-Za-z0-9._-]/g,""),n=this._ghNoteJustOpened===e.name;return this._ghNoteJustOpened="",`
      <div class="mt-3 rounded-xl border border-primary/25 bg-primary/[0.03] p-4"
        onkeydown="if (event.key === 'Enter') { event.preventDefault(); app._ghSaveNotes('${o}') }">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[13px] font-bold text-slate-900">What did you actually do in ${this.escapeHtml(e.name)}?</p>
            <p class="text-[11px] text-slate-500 mt-0.5">GitHub cannot know this, and it is exactly what interviewers ask about. Fill it in once and every answer and pitch uses it.</p>
            ${n?'<p class="text-[11px] font-bold text-primary mt-1.5">This project now leads your interview answers.</p>':""}
          </div>
          <span class="text-[10px] font-bold text-primary shrink-0" id="gh-note-count">${i} of ${a} filled in</span>
        </div>
        <div class="grid sm:grid-cols-2 gap-3 mt-3">${s}</div>
        <div class="flex items-center gap-2 mt-3.5">
          <button onclick="app._ghSaveNotes('${o}')" class="px-4 py-2.5 bg-primary text-white text-[12px] font-bold rounded-lg hover:bg-primary/90">Save my details</button>
          <button onclick="app._ghNoteDone('${o}')" class="px-3.5 py-2.5 border border-slate-200 bg-white text-[12px] font-bold text-slate-600 rounded-lg hover:border-slate-300">Done</button>
          <span id="gh-note-where" class="text-[11px] text-slate-400 ml-auto text-right">${this._ghNoteWhereText(this._ghNoteEnvelope(e.name).s)}</span>
        </div>
        <p class="text-[11px] text-slate-500 mt-2.5 hidden" id="gh-note-saved"></p>
        <p class="text-[10px] text-slate-400 mt-1.5">Enter saves from any box. Save keeps the form open so you can carry on; Done saves and closes it.</p>
        <p class="text-[10px] text-slate-400 mt-2.5">
          <button onclick="app._ghClearNotes('${o}')" class="underline hover:text-slate-600">Forget these details</button>
          <span class="ml-1">Deletes them from your account and this device.</span>
        </p>
      </div>`}async _ghClearNotes(e){const t=String(e||"").trim();if(t){try{localStorage.removeItem(this._ghNotesKey(t))}catch(s){}try{const i=(JSON.parse(localStorage.getItem("swapiki_repo_notes_index")||"[]")||[]).filter(a=>a!==t);localStorage.setItem("swapiki_repo_notes_index",JSON.stringify(i))}catch(s){}if(this._ghNoteOpen="",this._ghNoteJustOpened="",this.renderGitHubPicker(),this.showToast("Details for "+t+" deleted."),this._ghNotesCloudState()==="account"&&typeof swapikiStore.deleteRepoNote=="function")try{await swapikiStore.deleteRepoNote(t)}catch(s){}}}_ghNoteDone(e){if(this._ghNoteOpen===e){this._ghSaveNotes(e,{close:!0});return}this._ghNoteOpen="",this.renderGitHubPicker()}toggleRepoNotes(e){if(!this._ghRanked().find(a=>a.name===e)){this.showToast("Could not find that project.");return}if(this._ghNoteOpen===e){this._ghNoteDone(e);return}const s=this._ghHydrateStory()!==e;if(s){this._interviewStory=e;try{localStorage.setItem("swapiki_interview_story_"+(this._interviewJobId||"x"),e)}catch(a){}}this._ghNoteOpen=e,this._ghNoteJustOpened=s?e:"",this.renderGitHubPicker();const i=document.getElementById("gh-note-problem");if(i)try{i.focus()}catch(a){}}copyRepoPitch(e){const t=this._interviewGhContext(),s=this._ghRanked().find(a=>a.name===e);if(!s){this.showToast("Could not find that project.");return}const i=window.swapikiGitHub.buildRepoPitch(s,t,this._ghNotes(s.name));if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(i).then(()=>this.showToast("Pitch copied for "+s.name+"."));else{const a=document.createElement("textarea");a.value=i,document.body.appendChild(a),a.select(),document.execCommand("copy"),document.body.removeChild(a),this.showToast("Pitch copied for "+s.name+".")}}useRepoStory(e){const t=this._ghRanked().find(a=>a.name===e);if(!t){this.showToast("Could not find that project.");return}const s=this._ghHydrateStory()!==e;this._interviewStory=t.name;try{localStorage.setItem("swapiki_interview_story_"+(this._interviewJobId||"x"),t.name)}catch(a){}this._ghNoteOpen="",s&&this.showToast("Your answers will now lead with "+t.name+"."),this.renderGitHubPicker();const i=document.getElementById("iv-feedback");i&&(i.innerHTML="")}_ghRanked(){const e=this._ghLoad();if(!e.repos||!e.repos.length||!window.swapikiGitHub)return[];const t=this._interviewJob||{},s=window.swapikiGitHub.rankRepos(e.repos,window.swapikiGitHub.buildJobContext(t));return this._ghRankResult=s,s.ranked}_interviewGhContext(){return(!this._interviewGhCtx||this._interviewGhCtxJob!==(this._interviewJob&&this._interviewJob.id))&&(this._interviewGhCtx=window.swapikiGitHub.buildJobContext(this._interviewJob||{}),this._interviewGhCtxJob=this._interviewJob&&this._interviewJob.id),this._interviewGhCtx}_ghHydrateStory(){const e="swapiki_interview_story_"+(this._interviewJobId||"x");if(this._ghStoryKey!==e&&(this._ghStoryKey=e,this._interviewStory=""),!this._interviewStory)try{this._interviewStory=localStorage.getItem(e)||""}catch(t){}if(this._interviewStory&&this._ghRanked){const t=this._ghRanked();if(t.length&&!t.some(s=>s.name===this._interviewStory)){this._interviewStory="";try{localStorage.removeItem(e)}catch(s){}}}return this._interviewStory}_ghOrdered(){const e=this._ghRanked().slice(),t=["match","recent","stars"].indexOf(this._ghSort)!==-1?this._ghSort:"match";return t==="recent"?e.sort((s,i)=>String((i.repo||{}).pushed_at||"").localeCompare(String((s.repo||{}).pushed_at||""))):t==="stars"&&e.sort((s,i)=>(i.stars||0)-(s.stars||0)),e.forEach((s,i)=>{s.rank=i+1}),{sort:t,ordered:e}}renderGitHubPicker(){const e=document.getElementById("gh-picker");if(!e)return;if(!window.swapikiGitHub){e.innerHTML='<p class="text-[12px] text-slate-500">Loading GitHub project matching...</p>';return}const t=this._ghLoad(),s=!!this._ghClientId(),i=t.repos?this._ghRanked():[],a=this._ghRankResult||{hidden:0,total:0},o=this._ghShowAll===!0,n=this._ghOrdered(),r=n.sort,l=o?n.ordered:n.ordered.slice(0,5),m=this._ghHydrateStory(),c=`
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
          <div id="gh-connect-box">${this._ghDeviceBoxHtml()||c}</div>
        </div>`;return}const h=(window.swapikiGitHub.NOTE_FIELDS||[]).length,u=l.map(p=>{const b=p.name===m,y=p.score>=70?"bg-emerald-500":p.score>=45?"bg-amber-500":"bg-slate-300",v=this._ghNoteOpen===p.name,x=h-window.swapikiGitHub.blankFields(this._ghNotes(p.name)).length;return`
        <div class="rounded-xl border ${b?"border-primary bg-primary/[0.04]":"border-slate-200"} p-3.5">
          <div class="flex items-start gap-3">
            <span class="w-6 h-6 rounded-lg ${p.rank===1?"bg-primary text-white":"bg-slate-100 text-slate-500"} text-[11px] font-bold flex items-center justify-center shrink-0">${p.rank}</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <a href="${this.escapeHtml(p.url)}" target="_blank" rel="noopener" class="text-[13px] font-bold text-slate-900 hover:underline truncate">${this.escapeHtml(p.name)}</a>
                ${p.rank===1?'<span class="text-[10px] font-bold text-white bg-primary rounded px-1.5 py-0.5">Talk about this one first</span>':""}
                ${b?'<span class="text-[10px] font-bold text-primary border border-primary/30 rounded px-1.5 py-0.5">Leading your answers</span>':""}
                <span class="text-[11px] font-bold text-slate-500 ml-auto">${p.score}% match</span>
              </div>
              <div class="h-1 rounded-full bg-slate-100 overflow-hidden mt-1.5">
                <div class="h-full ${y} rounded-full" style="width:${p.score}%"></div>
              </div>
              ${p.repo.description?`<p class="text-[12px] text-slate-600 leading-relaxed mt-2 line-clamp-2">${this.escapeHtml(p.repo.description)}</p>`:""}
              <div class="flex flex-wrap items-center gap-1.5 mt-2">
                ${p.matchedSkills.map(w=>`<span class="bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2 py-0.5 text-[10px] font-bold">${this.escapeHtml(w)}</span>`).join("")}
                ${p.language?`<span class="text-[10px] font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">${this.escapeHtml(p.language)}</span>`:""}
                ${p.stars?`<span class="text-[10px] font-bold text-slate-500 inline-flex items-center gap-0.5"><span class="material-symbols-outlined text-[12px]">star</span>${p.stars}</span>`:""}
                <span class="text-[10px] font-bold text-slate-400">updated ${this.escapeHtml(p.updated)}</span>
                ${p.flags.map(w=>`<span class="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">${this.escapeHtml(w)}</span>`).join("")}
              </div>
              <p class="text-[11px] text-slate-500 mt-2 leading-relaxed">${this.escapeHtml(this._ghReason(p))}</p>
              <div class="flex items-center gap-2 mt-2.5 flex-wrap">
                <button onclick="app.copyRepoPitch('${this.escapeHtml(p.name)}')" class="text-[11px] font-bold text-primary border border-primary/30 rounded-lg px-2.5 py-1 hover:bg-primary/5">Copy 60-sec pitch</button>
                <button onclick="app.useRepoStory('${this.escapeHtml(p.name)}')" class="text-[11px] font-bold ${b?"text-white bg-primary":"text-slate-600 border border-slate-200"} rounded-lg px-2.5 py-1 hover:border-primary">${b?"Leading my answers":"Lead my answers with this"}</button>
                <button onclick="app.toggleRepoNotes('${this.escapeHtml(p.name)}')" class="text-[11px] font-bold ${v?"text-slate-900 bg-slate-100 border border-slate-200":"text-slate-500 hover:text-slate-800"} rounded-lg px-2.5 py-1 inline-flex items-center gap-1"><span class="material-symbols-outlined text-[13px]">${v?"expand_less":"add"}</span>${v?"Hide my details":"Add what you did"}</button>
                ${x?`<span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">${x}/${h} details added</span>`:""}
              </div>
              ${v?this._ghNoteFormHtml(p):""}
            </div>
          </div>
        </div>`}).join("");e.innerHTML=`
      <div class="bg-white border border-slate-200 rounded-2xl p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="flex items-start gap-3 min-w-0">
            <div class="w-10 h-10 rounded-xl bg-[#24292f] text-white flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-xl">code</span></div>
            <div class="min-w-0">
              <h2 class="text-sm font-bold text-slate-900">Your GitHub projects, ranked for this job</h2>
              <p class="text-[12px] text-slate-500 mt-0.5" id="gh-status">${this.escapeHtml(t.login?"@"+t.login:"")}${t.login&&a.total?" \xB7 "+a.total+" repos":""}${a.hidden?" \xB7 "+a.hidden+" forks/archived hidden":""}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            ${i.length>5?`<button onclick="app._ghShowAll = ${!o}; app.renderGitHubPicker()" class="text-[11px] font-bold text-slate-500 hover:text-slate-800">${o?"Show top 5":"Show all "+i.length}</button>`:""}
            <button onclick="app.ghFetchRepos(true)" class="text-[11px] font-bold text-primary border border-primary/30 rounded-lg px-2.5 py-1 hover:bg-primary/5">Refresh</button>
            <button onclick="app.ghDisconnect()" class="text-[11px] font-bold text-slate-400 hover:text-slate-700">Disconnect</button>
          </div>
        </div>
        ${i.length>1?`
        <div class="flex items-center gap-1.5 mt-3">
          <span class="text-[10px] font-bold uppercase tracking-wide text-slate-400 mr-1">Sort</span>
          ${[["match","Best match"],["recent","Most recent"],["stars","Most stars"]].map(([p,b])=>`
            <button onclick="app._ghSort = '${p}'; app.renderGitHubPicker()" class="text-[11px] font-bold rounded-lg px-2.5 py-1 ${r===p?"bg-primary text-white":"text-slate-500 border border-slate-200 hover:border-primary"}">${b}</button>`).join("")}
        </div>`:""}
        </div>
        ${t.error?`<p class="text-[12px] text-rose-600 font-bold mt-3">${this.escapeHtml(t.error)}</p>`:""}
        <div class="space-y-2.5 mt-3.5">
          ${i.length?u:'<p class="text-[12px] text-slate-500">No public repositories found for this username.</p>'}
        </div>
        ${i.length?`<p class="text-[11px] text-slate-400 mt-3">Score = how much of this job's skill list your repo actually shows, plus how alive it is. Forks and archived repos are hidden because they are never the story you tell.</p>`:""}
      </div>`}renderDashboard(){var f,E;const e=swapikiStore.getProfile();this.setPageMeta("Dashboard | Swapiki","Your Swapiki candidate dashboard \u2014 edit your profile, record statements, and publish your proof profile.");const t=document.getElementById("dash-welcome-title");if(t){const _=e.name?e.name.split(" ")[0]:"there",k=swapikiStore.currentUser;let g=!1;if(k&&k.created_at&&k.last_sign_in_at){const d=new Date(k.created_at).getTime(),$=new Date(k.last_sign_in_at).getTime();g=Math.abs($-d)<1e4}t.textContent=g?`Welcome, ${_}!`:`Welcome back, ${_}.`}const s=document.getElementById("dash-status-subtitle");s&&(s.textContent=e.profileStatus==="published"?"Your proof profile is published and visible to hiring managers across India.":"Your proof profile is still in draft. Your link already works \u2014 publishing just marks it as ready for review.");const i=document.getElementById("dash-profile-status"),a=document.getElementById("btn-publish-profile"),o=document.getElementById("dash-status-dot");i&&(i.textContent=e.profileStatus==="published"?"Published and visible to hiring managers":"Draft \u2014 link is live, not yet marked ready",i.className="font-label-sm text-label-sm text-emerald-300 font-bold uppercase tracking-wider"),o&&(o.className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"),a&&(a.textContent=e.profileStatus==="published"?"Unpublish Profile":"Publish Profile",a.onclick=()=>this.publishProfile());const n=document.getElementById("dash-stat-views"),r=document.getElementById("dash-stat-shares");n&&(n.textContent=(f=e.views)!=null?f:0),r&&(r.textContent=(E=e.shares)!=null?E:0),this.renderProfileChecklist();const l=this.maxProjects||4,m=e.projects.length,c=document.getElementById("dash-projects-slot-label"),h=document.getElementById("dash-projects-slot-bar");c&&(c.textContent=`${m} / ${l} Slots Active`),h&&(h.style.width=`${l>0?m/l*100:0}%`);const u=e.projects.filter(_=>!!_.audioUrl).length,p=m>0?Math.round(u/m*100):0,b=document.getElementById("dash-audio-verified-label"),y=document.getElementById("dash-audio-verified-bar");b&&(b.textContent=`${p}% with audio`),y&&(y.style.width=`${p}%`),this.renderVoiceVerificationStatus(e);const v=document.getElementById("dash-proof-nudge");v&&(m===0?(v.textContent="Your profile has no proof projects yet \u2014 add at least one so hiring managers have something real to look at.",v.classList.remove("hidden")):u===0?(v.textContent="Add a voice walkthrough to at least one project \u2014 profiles with voice proof stand out far more than text alone.",v.classList.remove("hidden")):(v.textContent="",v.classList.add("hidden")));const x=document.getElementById("stitch-dash-projects-grid");if(!x)return;x.innerHTML="",e.projects.length===0&&(x.innerHTML=`
        <div class="md:col-span-2 bg-white border-2 border-dashed border-slate-300 rounded-2xl p-12 flex flex-col items-center text-center">
          <span class="material-symbols-outlined text-5xl text-slate-300 mb-3">folder_open</span>
          <h3 class="font-bold text-slate-800 text-lg mb-1">No proof projects yet</h3>
          <p class="text-sm text-slate-500 max-w-sm mb-5">Add your first project and record a 2-minute voice walkthrough \u2014 this is the proof anyone opening your link actually sees.</p>
          <button onclick="router.navigate('add-project')" class="px-5 py-2.5 bg-primary text-white rounded-lg font-bold text-sm shadow-md hover:bg-primary/90 transition-colors flex items-center gap-1.5">
            <span class="material-symbols-outlined text-lg">add_circle</span> Add Your First Project
          </button>
        </div>
      `),e.projects.forEach((_,k)=>{const g=!!_.imageUrl,d=e.profileStatus==="published"?"Published":"Draft",$=e.profileStatus==="published"?"bg-on-tertiary-container text-tertiary-container":"bg-slate-200 text-slate-700",S=document.createElement("div");S.className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col bento-card group",S.innerHTML=`
        <div class="relative h-48 w-full bg-slate-100 overflow-hidden flex items-center justify-center">
          ${g?`<img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src="${_.imageUrl}" alt="${_.title}"/>`:`<div class="flex flex-col items-center justify-center text-slate-300">
                 <span class="material-symbols-outlined text-5xl">image</span>
                 <span class="text-[11px] font-bold text-slate-400 mt-1">No image added</span>
               </div>`}
          <div class="absolute top-4 right-4">
            <span class="${$} font-label-sm text-label-sm py-1 px-3 rounded-full flex items-center gap-1 shadow-sm font-bold">
              <span class="w-2 h-2 rounded-full bg-current opacity-70"></span> ${d}
            </span>
          </div>
        </div>
        <div class="p-6 flex-1 flex flex-col">
          <h3 class="font-headline-sm text-headline-sm font-bold text-slate-900 mb-2">${_.title}</h3>
          <p class="font-body-md text-body-md text-on-surface-variant line-clamp-2 mb-4">${_.impact}</p>
          <div class="mt-auto pt-6 border-t border-slate-100 flex justify-between items-center flex-wrap gap-2">
            <button onclick="app.openEditProjectModal('${_.id}')" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg flex items-center gap-1 transition-colors">
              <span class="material-symbols-outlined text-sm">edit</span> Edit Details
            </button>
            <button onclick="app.openAudioModal('${_.id}')" class="text-primary font-bold font-label-md text-label-md flex items-center gap-1 hover:underline">
              ${_.audioUrl?"Re-record Audio":"Record Audio"} <span class="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        </div>
      `,x.appendChild(S)});const w=document.getElementById("dash-projects-slot-count");if(w&&(w.textContent=`${e.projects.length} / 4 slots used (Min 1, Max 4)`),e.projects.length>0&&e.projects.length<4){const _=document.createElement("div");_.className="bg-surface-container-lowest border-2 border-dashed border-outline-variant rounded-xl flex flex-col items-center justify-center p-12 text-center group cursor-pointer hover:border-primary hover:bg-white transition-all bento-card h-[420px]",_.onclick=()=>router.navigate("add-project"),_.innerHTML=`
        <div class="w-16 h-16 bg-surface-container-high rounded-full flex items-center justify-center mb-6 group-hover:bg-primary-fixed group-hover:text-primary transition-colors">
          <span class="material-symbols-outlined text-3xl">add_circle</span>
        </div>
        <h3 class="font-headline-sm text-headline-sm font-bold mb-2 text-slate-900">Add Proof Project</h3>
        <p class="font-body-md text-on-surface-variant max-w-xs mb-6">Document another technical initiative with proof and audio.</p>
        <button class="bg-primary text-on-primary px-6 py-2.5 rounded-lg font-label-md font-bold transition-all shadow-sm">Add Project ${e.projects.length+1}</button>
      `,x.appendChild(_)}this.maybeShowOnboardingGuide(e)}renderProfileChecklist(){const e=swapikiStore.getProfile();let t;try{t=window.profileChecklist.buildProfileChecklist(e)}catch(l){console.error("Checklist module unavailable \u2014 skipping checklist render:",l);return}const s=t.percent,i=document.getElementById("dash-checklist-percent"),a=document.getElementById("dash-checklist-bar");i&&(i.textContent=`${s}% Complete`),a&&(a.style.width=`${s}%`);const o=document.getElementById("dash-completion-percent"),n=document.getElementById("dash-completion-bar");o&&(o.textContent=`${s}% Complete`),n&&(n.style.width=`${s}%`);const r=document.getElementById("dash-checklist-items");r&&(r.innerHTML=t.items.map(l=>`
      <div data-key="${l.key}" data-done="${l.done}"
        class="flex items-center justify-between gap-3 py-2.5 cursor-pointer select-none
               hover:bg-slate-50 ${l.done?"opacity-70":""}">
        <div class="flex items-center gap-3 min-w-0">
          <span class="material-symbols-outlined ${l.done?"text-emerald-500":"text-slate-300"} shrink-0">${l.done?"check_circle":"radio_button_unchecked"}</span>
          <span class="text-sm ${l.done?"text-slate-400 line-through":"text-slate-700 font-medium"}">${l.label}</span>
        </div>
        ${l.done?'<span class="text-xs font-bold text-emerald-600 shrink-0">Done</span>':l.action==="add-project"?'<a href="#add-project" class="text-xs font-bold text-primary shrink-0 flex items-center gap-0.5">Fix it <span class="material-symbols-outlined text-sm">chevron_right</span></a>':'<span class="text-xs font-bold text-primary shrink-0 flex items-center gap-0.5">Fix it <span class="material-symbols-outlined text-sm">chevron_right</span></span>'}
      </div>`).join(""),r.removeEventListener("click",this._checklistClick),this._checklistClick=l=>{if(l.target.closest('a[href^="#"]'))return;const m=l.target.closest("[data-key]");if(m)try{this.checklistAction(m.dataset.key)}catch(c){console.error("Checklist action failed:",c),this.showToast(`Couldn't open that step (${c.message}). Try the menu instead.`)}},r.addEventListener("click",this._checklistClick))}checklistAction(e){const t=typeof performance!="undefined"?performance.now():0,s=swapikiStore.getProfile();if(e==="edit-profile"){this.openEditProfileModal(),this._reportChecklistPerf(e,t);return}if(e==="add-project"){window.router.navigate("add-project"),this._reportChecklistPerf(e,t);return}if(e==="publish"){this.publishProfile(),this._reportChecklistPerf(e,t);return}if(e==="voice"){const i=Array.isArray(s.projects)&&s.projects.length?s.projects[0]:null;i?this.openAudioModal(i.id):window.router.navigate("add-project"),this._reportChecklistPerf(e,t);return}}_reportChecklistPerf(e,t){try{const s=typeof performance!="undefined"?performance.now()-t:0;s>800?(console.warn(`[perf] checklistAction '${e}' took ${s.toFixed(0)}ms`,new Date().toISOString()),this.showToast(`Opened in ${Math.round(s)}ms \u2014 slower than it should be. Share this number.`)):s>200&&this.showToast(`Opened in ${Math.round(s)}ms.`)}catch(s){}}maybeShowOnboardingGuide(e){const t=swapikiStore.currentUser&&swapikiStore.currentUser.id;if(!t)return;const s=`swapiki_onboarding_seen_${t}`;try{if(localStorage.getItem(s))return}catch(i){}this.openOnboardingGuide(e);try{localStorage.setItem(s,"1")}catch(i){}}openOnboardingGuide(e){e=e||swapikiStore.getProfile();const t=e.username||e.id||"ananya-sharma",s=document.getElementById("onboarding-share-link");s&&(s.textContent=`${t}.swapiki.com`);const i=document.getElementById("modal-onboarding-guide");i&&i.classList.remove("hidden")}closeOnboardingGuide(){const e=document.getElementById("modal-onboarding-guide");e&&e.classList.add("hidden")}openTrustSecurityModal(){const e=document.getElementById("modal-trust-security");e&&e.classList.remove("hidden")}closeTrustSecurityModal(){const e=document.getElementById("modal-trust-security");e&&e.classList.add("hidden")}finishOnboardingGuide(){this.closeOnboardingGuide(),this.copyShareLink()}adminViewCandidateProfile(e){if(!e){this.showToast("This candidate has no handle set yet, so there's no profile page to view.");return}this.publicUsername=e,this._adminPreviewMode=!0,window.location.hash="admin-preview/"+encodeURIComponent(e),router.navigate("candidate",!1)}_recordPublicProfileView(e,t){try{if(!this.publicUsername||t||!e||!e.id)return;const s=swapikiStore&&swapikiStore.currentUser&&swapikiStore.currentUser.id;if(s&&e.userId&&e.userId===s)return;const i=`sw:profile-viewed:${e.id}`;if(typeof sessionStorage!="undefined"){if(sessionStorage.getItem(i))return;sessionStorage.setItem(i,"1")}swapikiStore.recordProfileView(e.id)}catch(s){console.warn("Profile view not logged:",s&&s.message)}}async renderCandidateProfile(){const e=!!this._adminPreviewMode;let t;if(this.publicUsername){if(t=await swapikiStore.getProfileByUsername(this.publicUsername,{includeUnpublished:!0}),!t){const w=document.getElementById("candidate-not-found");if(w){const E=document.getElementById("candidate-not-found-handle");E&&(E.textContent=`${this.publicUsername}.swapiki.com`),w.classList.remove("hidden")}const f=document.querySelector("#view-candidate > main");f&&[...f.children].forEach(E=>{E!==w&&E.classList.add("hidden")}),this.showNotFoundToast(this.publicUsername),this.setPageMeta("Profile not found","This Swapiki profile could not be found or is not published yet.");return}this.clearNotFoundPanel(),this._recordPublicProfileView(t,e)}else t=swapikiStore.getProfile();const s=this.publicUsername||t.username||t.id||"ananya-sharma",i=t.title||"Software Professional",a=`https://${s}.swapiki.com/`;this.setPageMeta(`${t.name} \u2014 ${i} | Swapiki`,`${t.name} (${i}${t.status?", "+t.status:""}) \xB7 statement on Swapiki. Open the link on a computer or the Swapiki app for the full profile video.`,{url:a});const o=document.getElementById("preview-subdomain-url");o&&(o.textContent=`${s}.swapiki.com`),document.getElementById("rec-name-text").textContent=t.name,document.getElementById("rec-title-text").textContent=`${t.title} \u2022 ${t.experience}`,this.applyVoiceVerifiedBadge(t),this.applyProfileAttestation(t),document.getElementById("rec-expertise-text").textContent=Array.isArray(t.expertise)&&t.expertise.length>0?t.expertise.slice(0,2).join(" & "):t.expertise||"No skills listed yet",document.getElementById("rec-status-text").textContent=t.status,document.getElementById("rec-education-text").textContent=t.education;const n=document.getElementById("rec-avatar-img"),r="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%2364748B' viewBox='0 0 24 24'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";n&&(n.onerror=()=>{n.src=r},n.src=t.avatar||r);const l=document.getElementById("rec-linkedin-link");l&&(t.linkedin?(l.href=t.linkedin,l.classList.remove("hidden")):l.classList.add("hidden"));const m=document.getElementById("rec-twitter-link");m&&(t.twitter?(m.href=t.twitter,m.classList.remove("hidden")):m.classList.add("hidden"));const c=document.getElementById("rec-portfolio-link");c&&(t.portfolio?(c.href=t.portfolio,c.classList.remove("hidden")):c.classList.add("hidden"));const h=document.getElementById("rec-resume-link");h&&(t.resumeLink?(h.href=t.resumeLink,h.classList.remove("hidden")):h.classList.add("hidden"));const u=t.name?t.name.split(" ")[0]:"Candidate",p=document.getElementById("rec-about-heading"),b=document.getElementById("rec-about-bio"),y=document.getElementById("rec-about-location");p&&(p.textContent=`About ${u}`),b&&(b.textContent=t.bio||`${u} hasn't added a bio yet.`),y&&(y.textContent=t.location||"Not specified");const v=document.getElementById("rec-projects-count");v&&(v.textContent=String(t.projects.length));const x=document.getElementById("stitch-candidate-projects-container");x&&(x.innerHTML="",!t.projects||t.projects.length===0?x.innerHTML=`
        <div class="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center">
          <span class="material-symbols-outlined text-4xl text-slate-300 mb-2">folder_open</span>
          <p class="font-bold text-slate-700">No proof projects added yet.</p>
          <p class="text-sm text-slate-400 mt-1">Once this candidate adds a project with a voice walkthrough, it'll show up here.</p>
        </div>
      `:t.projects.forEach((w,f)=>{const E=!!w.imageUrl,_=f===t.projects.length-1,k=document.createElement("div");k.className="relative flex gap-4 md:gap-5 proof-entry",k.style.animationDelay=`${Math.min(f*.08,.32)}s`,k.innerHTML=`
        <!-- Proof ledger rail: numbered node + connecting line -->
        <div class="flex flex-col items-center shrink-0 pt-1">
          <div class="proof-rail-node w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs shrink-0 z-10">
            ${String(f+1).padStart(2,"0")}
          </div>
          ${_?"":'<div class="w-px flex-1 bg-slate-200 mt-1 mb-1"></div>'}
        </div>

        <article class="flex-1 min-w-0 bg-surface-container-lowest border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow ${_?"":"mb-6"}">
        <div class="p-6 md:p-8">
          <div class="flex flex-col lg:flex-row gap-8">
            <div class="lg:w-1/3">
              <div class="aspect-square rounded-lg bg-surface-container-high overflow-hidden mb-4 flex items-center justify-center">
                ${E?`<img class="w-full h-full object-cover" src="${w.imageUrl}" alt="${w.title}"/>`:`<div class="flex flex-col items-center justify-center text-slate-300">
                       <span class="material-symbols-outlined text-5xl">image</span>
                       <span class="text-[11px] font-bold text-slate-400 mt-1">No image added</span>
                     </div>`}
              </div>
              <h3 class="font-headline-sm text-primary font-bold mb-2">${w.title}</h3>
              <p class="text-on-surface-variant font-body-md mb-4">${w.role}</p>
              
              <!-- Module 4: GitHub Repository Proof Component -->
              ${w.githubUrl&&(w.githubUrl.startsWith("http://")||w.githubUrl.startsWith("https://"))?`
                  <div class="mb-4 p-3 bg-slate-900 text-white rounded-xl text-xs space-y-2 shadow-sm">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-1.5 font-bold text-slate-200">
                        <span class="material-symbols-outlined text-sm">code</span> GitHub Repository
                      </div>
                      <span class="bg-emerald-400/20 text-emerald-400 text-[10px] font-extrabold px-2 py-0.5 rounded border border-emerald-400/30 uppercase">Verified Repo</span>
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-slate-400">
                      <span>\u2B50 148 Stars</span>
                      <span>\u{1F374} 34 Forks</span>
                      <span>TypeScript</span>
                    </div>
                    <a href="${w.githubUrl}" target="_blank" rel="noopener noreferrer" class="block text-center text-[11px] font-bold text-blue-300 hover:text-blue-200 underline pt-1 border-t border-slate-800">
                      Inspect Public Code Base &rarr;
                    </a>
                  </div>
                `:`
                    <div class="mb-4 p-3 bg-slate-100 text-slate-700 rounded-xl text-xs space-y-1 border border-slate-200">
                      <div class="flex items-center justify-between font-bold">
                        <span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-sm">code</span> Repository Link</span>
                        <span class="bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded">Unverified</span>
                      </div>
                      <p class="text-[11px] text-slate-500 italic">No working public repository link provided for this project.</p>
                    </div>
                  `}

              <div class="flex flex-wrap gap-2">
                ${w.tags.map(g=>`<span class="px-2 py-1 bg-surface-container text-on-surface-variant rounded font-label-sm font-semibold">${g}</span>`).join("")}
              </div>
            </div>
            <div class="lg:w-2/3 space-y-6">
              <div class="bg-gradient-to-r from-primary-container via-primary to-slate-900 p-5 md:p-6 rounded-2xl mb-6 text-white shadow-xl relative overflow-hidden">
                <div class="flex items-center justify-between mb-4">
                  <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-tertiary-fixed animate-ping"></span>
                    <span class="text-xs font-extrabold tracking-wider uppercase text-tertiary-fixed">${w.audioUrl?"CANDIDATE VOICE WALKTHROUGH":"AI-GENERATED PRODUCT DEMO VOICE"}</span>
                  </div>
                  <span class="bg-white/10 text-white/90 text-xs px-2.5 py-1 rounded-full font-mono font-bold">${w.audioDuration||"01:45"}</span>
                </div>
                <div class="flex items-center gap-5">
                  <button onclick="app.playProjectAudio('${w.id}')" class="w-14 h-14 rounded-full bg-white text-primary flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all shrink-0">
                    <span id="play-icon-${w.id}" class="material-symbols-outlined text-3xl font-extrabold">play_arrow</span>
                  </button>
                  <div class="flex-1">
                    <p class="text-xs font-bold text-blue-100 mb-2">${w.audioUrl?"Candidate recording: impact & technical logic":"Product demo narration, not a candidate recording"}</p>
                    <div class="audio-wave-anim flex-1 justify-between px-1 cursor-pointer" onclick="app.playProjectAudio('${w.id}')">
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
                  <p class="font-body-md text-on-surface">${w.takeaways[0]||"Overcoming fragmented workflows and high cognitive load."}</p>
                </div>
                <div>
                  <h4 class="font-label-sm text-outline uppercase mb-2 tracking-widest font-bold">MY IMPACT</h4>
                  <p class="font-body-md text-primary font-bold">${w.impact}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        </article>
      `,x.appendChild(k)}))}playProjectAudio(e){var n;const t=document.getElementById(`play-icon-${e}`),s=t?(n=t.closest(".bg-gradient-to-r"))==null?void 0:n.querySelector(".audio-wave-anim"):null,i=swapikiStore.getProfile(),a=i.projects.find(r=>r.id===e),o=r=>{s&&(r?s.classList.add("audio-playing"):s.classList.remove("audio-playing"))};if(a&&a.audioUrl){if(this.activeAudioElement&&this.activeAudioElement.src===a.audioUrl&&!this.activeAudioElement.paused){this.activeAudioElement.pause(),t&&(t.textContent="play_arrow"),o(!1);return}this.activeAudioElement&&this.activeAudioElement.pause(),this.activeAudioElement=new Audio(a.audioUrl),this.activeAudioElement.onended=()=>{t&&(t.textContent="play_arrow"),o(!1),this.activeAudioElement=null},this.activeAudioElement.play().then(()=>{t&&(t.textContent="pause"),o(!0)}).catch(()=>this.showToast("Unable to play this recording."));return}if(t)if(t.textContent==="play_arrow"){if(t.textContent="pause",o(!0),this.showToast("Playing demo voice preview. This is not a real candidate recording."),"speechSynthesis"in window){window.speechSynthesis.cancel();const r=i&&i.name?i.name.split(" ")[0]:"the candidate";let l="";e==="p1"||!a?l="Hi, I am Ananya Sharma. In this project at Razorpay, I architected the Vernacular UPI Payment Flow across six Indian languages. Our team reduced payment drop-offs by 34% across 12 million monthly transactions by designing a simplified one-tap intent interaction model.":e==="p2"?l="Hello! I am Ananya Sharma. For Swiggy Instamart, I led UX research and product design for dark store logistics. We cut order dispatch preparation time by 3.5 minutes per delivery partner by implementing audio-assisted inventory picking workflows across 120 hubs.":l=`Hi, I am ${r}. In this project ${a.title}, my primary impact was ${a.impact}. Here is how we executed: ${a.takeaways.join(". ")}.`;const m=new SpeechSynthesisUtterance(l);m.rate=.92,m.pitch=1.25;const c=window.speechSynthesis.getVoices(),h=c.find(u=>(u.name.includes("Female")||u.name.includes("Heera")||u.name.includes("Kalpana")||u.name.includes("Veena")||u.name.includes("Neerja")||u.name.includes("Google UK English Female")||u.name.includes("Samantha")||u.name.includes("Zira")||u.name.includes("Victoria")||u.name.includes("Karen"))&&(u.lang.includes("en")||u.lang.includes("hi")))||c.find(u=>u.lang.includes("en-IN")||u.name.includes("India"));h&&(m.voice=h),m.onend=()=>{t.textContent="play_arrow",o(!1)},window.speechSynthesis.speak(m)}}else t.textContent="play_arrow",o(!1),"speechSynthesis"in window&&window.speechSynthesis.cancel()}handleProjectImageSelect(e){const t=e.target.files[0];if(!t)return;if(t.size>2*1024*1024){this.showToast("Image file size must be less than 2MB.");return}const s=new FileReader;s.onload=i=>{this.selectedProjectImageUrl=i.target.result;const a=document.getElementById("proj-image-name"),o=document.getElementById("proj-image-preview-box"),n=document.getElementById("proj-image-preview");a&&(a.textContent=t.name),n&&(n.src=i.target.result),o&&o.classList.remove("hidden"),this.showToast("Project cover image attached!")},s.readAsDataURL(t)}openEditProjectModal(e){const s=swapikiStore.getProfile().projects.find(o=>o.id===e);if(!s){this.showToast("Project not found.");return}if(document.getElementById("proj-edit-id").value=s.id,document.getElementById("proj-input-title").value=s.title||"",document.getElementById("proj-input-role").value=s.role||"",document.getElementById("proj-input-problem").value=s.problem||"",document.getElementById("proj-input-ownership").value=s.ownership||"",document.getElementById("proj-input-impact").value=s.impact||"",document.getElementById("proj-input-github").value=s.githubUrl||"",document.getElementById("proj-input-live").value=s.liveUrl||"",document.getElementById("proj-input-takeaways").value=Array.isArray(s.takeaways)?s.takeaways.join(`
`):s.takeaways||"",s.imageUrl){this.selectedProjectImageUrl=s.imageUrl;const o=document.getElementById("proj-image-preview-box"),n=document.getElementById("proj-image-preview"),r=document.getElementById("proj-image-name");n&&(n.src=s.imageUrl),r&&(r.textContent="Existing image attached"),o&&o.classList.remove("hidden")}const i=document.getElementById("proj-form-heading"),a=document.getElementById("proj-form-subheading");i&&(i.textContent="Edit Project Details"),a&&(a.textContent="Fine-tune your project impact, repository proof, and takeaways."),router.navigate("add-project")}handleProjectSubmit(e){e.preventDefault();const t=swapikiStore.getProfile(),s=document.getElementById("proj-edit-id").value;if(!s&&t.projects.length>=4){this.showToast("A profile can contain no more than 4 proof projects.");return}const i=document.getElementById("proj-input-title").value,a=document.getElementById("proj-input-role").value,o=document.getElementById("proj-input-problem").value,n=document.getElementById("proj-input-ownership").value,r=document.getElementById("proj-input-impact").value,l=document.getElementById("proj-input-github").value,m=document.getElementById("proj-input-live").value,c=document.getElementById("proj-input-takeaways").value,h=this.selectedProjectImageUrl||null,p=[["Project title",i,200],["Role",a,100],["Problem",o,500],["Ownership",n,500],["Impact",r,500]].find(([,v,x])=>v.length>x);if(p){this.showToast(`${p[0]} must be ${p[2]} characters or fewer.`);return}const b=c?c.split(`
`).filter(v=>v.trim().length>0):["Designed solution focused on system scalability","Delivered measurable impact within schedule"];let y;try{s?(y=swapikiStore.updateProject(s,{title:i,role:a,problem:o,ownership:n,impact:r,githubUrl:l,liveUrl:m,imageUrl:h,takeaways:b}).id,this.showToast("Project details updated successfully!")):(y=swapikiStore.addProject({title:i,role:a,problem:o,ownership:n,impact:r,githubUrl:l,liveUrl:m,imageUrl:h,tags:["Figma","React","B2B SaaS"],takeaways:[o,n,...b]}).id,this.showToast("Project details saved! Record your audio walkthrough.")),document.getElementById("add-project-form").reset(),document.getElementById("proj-edit-id").value="",this.selectedProjectImageUrl=null;const v=document.getElementById("proj-image-preview-box");v&&v.classList.add("hidden");const x=document.getElementById("proj-form-heading"),w=document.getElementById("proj-form-subheading");x&&(x.textContent="Add New Project"),w&&(w.textContent="Document your impact with high-velocity trust. Be concise, be data-driven.")}catch(v){this.showToast(v.message);return}this.openAudioModal(y)}setVoiceFilter(e){window.swapikiAudioEngine.setAudioFilterPreset(e),document.querySelectorAll(".voice-filter-btn").forEach(i=>{i.className="voice-filter-btn px-2.5 py-1 bg-slate-800 text-slate-200 text-[10px] font-bold rounded-full border border-slate-700 hover:bg-slate-700"});const t=document.getElementById(`vfilter-${e}`);t&&(t.className="voice-filter-btn px-2.5 py-1 bg-primary text-white text-[10px] font-bold rounded-full border border-blue-400 shadow-xs");const s=e==="studio"?"\u2728 Studio Clarity":e==="warm"?"\u{1F399}\uFE0F Warm Vocal Tone":"\u{1F3A7} Noise Suppression Filter";this.showToast(`Voice Filter set to ${s}!`)}downloadPdfPortfolio(){const e=swapikiStore.getProfile();this.showToast(`Generating verified PDF portfolio for ${e.name}...`);const t=window.open("","_blank");if(!t){this.showToast("Please allow popups to download your PDF portfolio!");return}const s=`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${e.name} - Verified Swapiki Portfolio</title>
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
          <span class="badge">VERIFIED AUDIO PROOF ATTACHED</span>
        </div>

        <div class="section">
          <div class="section-title">ABOUT CANDIDATE</div>
          <p style="font-size: 13px; color: #334155;">${e.bio||"Experienced product and engineering lead with a focus on scalable systems and verified candidate proof."}</p>
        </div>

        <div class="section">
          <div class="section-title">VERIFIED PROOF PROJECTS & TECHNICAL IMPACT</div>
          ${e.projects.map(i=>`
            <div class="project-card">
              <h3 class="project-title">${i.title}</h3>
              <div class="project-role">${i.role}</div>
              <p style="font-size: 12px; color: #475569; margin: 4px 0;"><strong>Problem Statement:</strong> ${i.takeaways[0]||"High cognitive friction and operational drop-offs."}</p>
              <div class="impact-box">
                <div class="impact-title">MEASURABLE IMPACT ACHIEVED</div>
                <div class="impact-text">${i.impact}</div>
              </div>
              <p style="font-size: 11px; color: #64748b; margin-top: 8px;"><strong>Voice Walkthrough Attached:</strong> ${i.audioDuration||"01:45"} Verified Speech</p>
            </div>
          `).join("")}
        </div>

        <div class="footer">
          Verified via Swapiki Audio-First Verification Platform \u2022 100% Guaranteed Human Evaluation \u2022 ID: #IN-84092
        </div>
        <script>
          window.onload = function() { window.print(); }
        <\/script>
      </body>
      </html>
    `;t.document.write(s),t.document.close()}renderVoiceVerificationStatus(e){const t=document.getElementById("dash-voice-verify-status");if(!t)return;const s=e.voiceVerificationCount||0;if(e.voiceVerified&&s>0){const i=e.voiceVerifiedAt?new Date(e.voiceVerifiedAt):null,a=i&&!isNaN(i.getTime())?i.toLocaleDateString(void 0,{day:"numeric",month:"short",year:"numeric"}):"recently";t.innerHTML=`
        <span class="material-symbols-outlined text-[14px] text-emerald-600 shrink-0">verified</span>
        <span><strong class="text-emerald-700">Live recording confirmed</strong> - read a random code into your mic on ${a} (${s} attempt${s===1?"":"s"}). It proves the recording is not a replay, not who you are.</span>`}else s>0?t.innerHTML=`
        <span class="material-symbols-outlined text-[14px] text-amber-600 shrink-0">gpp_bad</span>
        <span><strong class="text-amber-700">Recording not confirmed</strong> - ${s} attempt${s===1?"":"s"} so far. Re-record and read the code at the end of the phrase, clearly.</span>`:t.innerHTML=`
        <span class="material-symbols-outlined text-[14px] text-slate-400 shrink-0">record_voice_over</span>
        <span>Record your first walkthrough and read the random code aloud. Confirmed live recordings carry a badge on your profile.</span>`;t.classList.remove("hidden")}applyVoiceVerifiedBadge(e){const t=document.getElementById("voice-verified-badge");if(!t)return;e.voiceVerified?t.classList.remove("hidden"):t.classList.add("hidden");const s=document.getElementById("staff-review-badge");s&&(e.staffReviewedAt?s.classList.remove("hidden"):s.classList.add("hidden"))}applyProfileAttestation(e){const t=document.getElementById("rec-attested-line"),s=document.getElementById("rec-attested-date");if(!t)return;const i=e&&e.profileAttestedAt?new Date(e.profileAttestedAt):null;if(!i||isNaN(i.getTime())){t.classList.add("hidden"),s&&(s.textContent="");return}s&&(s.textContent=i.toLocaleDateString(void 0,{day:"numeric",month:"short",year:"numeric"})),t.title=e.profileAttestedName?`Signed as "${e.profileAttestedName}" at the time of saving. This is the candidate's own statement, not a Swapiki review of their work.`:"This is the candidate's own statement, not a Swapiki review of their work.",t.classList.remove("hidden")}openAudioModal(e){this.currentRecordingProjectId=e;const t=document.getElementById("modal-audio-studio");t&&t.classList.remove("hidden");const s=window.swapikiAudioEngine,i=swapikiStore.getProfile(),a=s.beginVerificationChallenge(i&&i.name?i.name:""),o=document.getElementById("challenge-banner"),n=document.getElementById("challenge-phrase-text"),r=document.getElementById("challenge-verify-hint");o&&o.classList.remove("hidden"),n&&(n.textContent=a),r&&(r.textContent=s.isSpeechSupported()?"The random code is new every time, so it can't be pre-recorded. Read the three code words out loud at the end of the sentence, clearly, so the browser can hear them.":"This browser can't check the spoken code (Chrome or Edge can). Your recording will still be saved to your profile, but it won't earn the live-recording badge here.")}closeAudioModal(){window.swapikiAudioEngine.isRecording&&window.swapikiAudioEngine.stopRecording();const e=document.getElementById("challenge-banner");e&&e.classList.add("hidden");const t=document.getElementById("modal-audio-studio");t&&t.classList.add("hidden"),router.navigate("dashboard")}async toggleRecording(){const e=document.getElementById("icon-record"),t=document.getElementById("audio-recording-status"),s=document.getElementById("audio-timer-display"),i=document.getElementById("waveform-canvas"),a=document.getElementById("teleprompter-step-text"),o=document.getElementById("teleprompter-badge");if(window.swapikiAudioEngine.isRecording){window.swapikiAudioEngine.stopRecording(),e&&(e.textContent="mic"),t&&(t.textContent="Recording stopped. Preview & AI transcript generated below.");const n=document.getElementById("btn-pause-record");n&&(n.style.display="none")}else{if(this.recordingValid=!1,!await window.swapikiAudioEngine.startRecording(i,(l,m)=>{s&&(s.textContent=m);const c=document.getElementById("audio-live-dot");c&&(c.className="w-3 h-3 rounded-full bg-red-500 animate-ping");const h=document.getElementById("audio-progress-bar");h&&(h.style.width=`${Math.min(100,l/120*100)}%`),l<30?(a&&(a.textContent="Step 1 (0\u201330s): State the core business/technical problem you solved."),o&&(o.textContent="0\u201330s Prompt")):l<90?(a&&(a.textContent="Step 2 (30\u201390s): Detail your exact contribution, architecture & trade-offs."),o&&(o.textContent="30\u201390s Prompt")):(a&&(a.textContent="Step 3 (90\u2013120s): Summarize measurable metric impact achieved."),o&&(o.textContent="90\u2013120s Prompt"))},(l,m,c)=>{this.recordedAudioUrl=l,this.recordedDurationStr=m,this.recordingValid=c;const h=document.getElementById("audio-preview-container"),u=document.getElementById("audio-preview-element"),p=document.getElementById("ai-transcript-preview-text");if(h&&u&&(h.classList.remove("hidden"),l&&(u.src=l)),p){const b=swapikiStore.getProfile();p.textContent=`"Hi, I am ${b.name}. In this project, I architected the core product solution, overcoming high operational friction and reducing transaction failure rates significantly across 12M users."`}this.showToast(c?"Audio recording complete & ready to save.":"Recording must be at least 30 seconds long.")})){e&&(e.textContent="mic"),t&&(t.textContent=window.swapikiAudioEngine.lastError||"Microphone access is required to record."),this.showToast(window.swapikiAudioEngine.lastError||"Microphone access is required to record.");return}e&&(e.textContent="stop"),t&&(t.textContent="Recording live... Read the anti-fraud phrase first, then follow the prompts above.");const r=document.getElementById("btn-pause-record");r&&(r.style.display="flex"),this.showToast("Recording started! Microphone & AI teleprompter active.")}}togglePauseRecording(){const e=window.swapikiAudioEngine,t=document.getElementById("btn-pause-record"),s=document.getElementById("icon-pause-record"),i=document.getElementById("audio-recording-status");e.isRecording&&(e.isPaused?(e.resumeRecording(),s&&(s.textContent="pause"),t&&(t.title="Pause recording"),i&&(i.textContent="Recording resumed...")):(e.pauseRecording(),s&&(s.textContent="play_arrow"),t&&(t.title="Resume recording"),i&&(i.textContent="Recording paused.")))}async saveRecordedAudio(){const e=window.swapikiAudioEngine;if(e.isRecording){this.showToast("Stop your recording first, then save.");return}if(!this.recordedAudioUrl&&!this.recordingValid){this.showToast("No recording found. Click the mic button to record your walkthrough.");return}if(!this.recordingValid){const t=e.secondsRecorded,s=`${Math.floor(t/60).toString().padStart(2,"0")}:${(t%60).toString().padStart(2,"0")}`;this.showToast(`Recording is only ${s} \u2014 minimum is 30 seconds. Please re-record.`);return}if(this.currentRecordingProjectId){if(swapikiStore.updateProjectAudio(this.currentRecordingProjectId,this.recordedAudioUrl,this.recordedDurationStr||"01:45"),e.getRecordedBlob()){const t=new File([e.getRecordedBlob()],"walkthrough.webm",{type:"audio/webm"}),s=document.getElementById("audio-recording-status");s&&(s.textContent="Saving your recording\u2026 (one moment)");try{console.log("Persisting recording to storage\u2026"),await swapikiStore.uploadProjectAudio(this.currentRecordingProjectId,t,this.recordedDurationStr||"01:45")}catch(i){console.warn("Audio upload to storage failed (profile keeps the local recording):",i)}}await this.runVoiceVerificationPipeline()}this.closeAudioModal()}async runVoiceVerificationPipeline(){const e=window.swapikiAudioEngine,t=this.currentRecordingProjectId,s=e.getChallengeInfo(),i=e.getRecordedBlob(),a=e.wasLiveMic(),o=e.secondsRecorded,n=l=>swapikiStore.markProjectVoiceCheck(t,{status:l.status,reason:l.reason||null,sessionId:s?s.sessionId:null,code:s?s.code:null,phrase:s?s.phrase:null,durationSeconds:o,liveMic:a,...l});if(!a||!s){n({status:"failed",reason:"not_live"}),this.showToast("This recording did not come from a live microphone, so it cannot be confirmed. Please re-record.");return}if(!i){n({status:"failed",reason:"no_audio"}),this.showToast("No audio data could be read. Please re-record.");return}this.showToast("Checking your recording... (one moment)");const r=await e.verifySpokenChallenge();if(r.reason==="unsupported"){n({status:"skipped",reason:"speech_unsupported",speechSupported:!1}),this.showToast("Recorded and saved. This browser cannot check the spoken code, so no badge was added - try Chrome or Edge.");return}if(!r.verified){const l=r.reason==="no_transcript";n({status:"failed",reason:l?"no_speech_detected":"code_mismatch",speechSupported:!0,transcript:r.transcript,missingWords:r.missing}),swapikiStore.recordVoiceVerification({verified:!1});const m=l?"No speech was detected in that recording.":`The code didn't come through (missing: ${r.missing.join(", ")}).`;this.showToast(`${m} It's saved but not confirmed - try again and read the code clearly at the end of the phrase.`),this.renderDashboard();return}n({status:"verified",reason:"code_confirmed",speechSupported:!0,transcript:r.transcript}),swapikiStore.recordVoiceVerification({verified:!0}),this.showToast('Recording confirmed live. Your profile now shows "Live recording confirmed".'),this.renderDashboard()}checkNicknameAvailability(e){const t=document.getElementById("edit-nickname-status"),s=document.getElementById("edit-subdomain-preview"),i=swapikiStore.formatNickname(e);if(s&&(s.textContent=i?`${i}.swapiki.com`:"your-handle.swapiki.com"),!i)return t&&(t.textContent="\u26A0\uFE0F Handle required",t.className="normal-case text-[11px] font-bold text-amber-600"),s&&(s.className="font-bold text-amber-600 transition-colors"),this.isCurrentNicknameValid=!1,!1;if(i.length<5)return t&&(t.textContent="\u26A0\uFE0F Min 5 characters required",t.className="normal-case text-[11px] font-bold text-amber-600"),s&&(s.className="font-bold text-amber-600 transition-colors"),this.isCurrentNicknameValid=!1,!1;if(!swapikiStore.handleHasNameAndNumber(i))return t&&(t.textContent="\u26A0\uFE0F Add both a name and a number (e.g. rahul92)",t.className="normal-case text-[11px] font-bold text-amber-600"),s&&(s.className="font-bold text-amber-600 transition-colors"),this.isCurrentNicknameValid=!1,!1;const a=swapikiStore.getProfile();return swapikiStore.isNicknameTakenSync(i,a.id)?(t&&(t.textContent=`\u274C "${i}" is already taken!`,t.className="normal-case text-[11px] font-bold text-rose-600 animate-pulse"),s&&(s.className="font-bold text-rose-600 transition-colors"),this.isCurrentNicknameValid=!1,!1):(t&&(t.textContent=`\u2705 "${i}" is available!`,t.className="normal-case text-[11px] font-bold text-emerald-600"),s&&(s.className="font-bold text-emerald-600 transition-colors"),this.isCurrentNicknameValid=!0,!0)}updateHandleLockNotice(e){const t=document.getElementById("handle-lock-notice"),s=document.getElementById("handle-lock-icon"),i=document.getElementById("handle-lock-title"),a=document.getElementById("handle-lock-subtext");!t||!s||!i||!a||(t.className="bg-rose-50/80 border border-rose-200 rounded-xl p-3.5 space-y-1.5 text-xs text-rose-900",e?(s.textContent="\u{1F512}",i.textContent="Handle & email are permanent",a.textContent="This handle is locked and cannot be changed."):(s.textContent="\u{1F513}",i.textContent="Handle & email are permanent",a.textContent="Add both a name and a number (e.g. rahul92) in handle to register \u2014 once the handle is locked, it cannot be changed."))}openEditProfileModal(){if(!this.isAuthenticated()){this.showToast("Please log in to edit a profile."),this.openLoginModal();return}const e=swapikiStore.getProfile();document.getElementById("edit-name").value=e.name;const t=!!e.locked&&!!e.username,s=document.getElementById("edit-nickname"),i=document.getElementById("edit-nickname-status");if(s){const c=e.username||e.id||"";if(s.value=c,s.disabled=t,s.placeholder=t?"":"try your nick here",s.classList.toggle("bg-slate-100",t),s.classList.toggle("cursor-not-allowed",t),s.classList.toggle("text-slate-500",t),t){i&&(i.textContent="\u{1F512} Locked",i.className="normal-case text-[11px] font-bold text-rose-600");const h=document.getElementById("edit-subdomain-preview");h&&(h.className="font-bold text-slate-500 transition-colors"),this.isCurrentNicknameValid=!0}else typeof window.checkHandleDirect=="function"&&window.checkHandleDirect(c)}this.updateHandleLockNotice(t),document.getElementById("edit-title").value=e.title||"",document.getElementById("edit-experience").value=e.experience||"",document.getElementById("edit-expertise").value=Array.isArray(e.expertise)?e.expertise.join(", "):e.expertise||"",document.getElementById("edit-location").value=e.location||"",document.getElementById("edit-status").value=e.status||"",document.getElementById("edit-education").value=e.education||"",document.getElementById("edit-bio").value=e.bio||"",document.getElementById("edit-linkedin").value=e.linkedin||"";const a=document.getElementById("edit-twitter");a&&(a.value=e.twitter||"");const o=document.getElementById("edit-resume-link");o&&(o.value=e.resumeLink||"");const n=document.getElementById("edit-portfolio");n&&(n.value=e.portfolio||"");const r=document.getElementById("edit-resume-status");r&&(r.textContent=e.resumeUrl?"\u2705 Custom resume PDF attached.":"No custom resume attached yet. Uploading replaces default PDF download.");const l=document.getElementById("edit-avatar-preview");l&&e.avatar&&(l.src=e.avatar),this.uploadedAvatarUrl=e.avatar||null,this.uploadedResumeUrl=e.resumeUrl||null;const m=document.getElementById("modal-edit-profile");m&&m.classList.remove("hidden"),this.resetTruthAttestation()}onTruthAttestationChange(){const e=document.getElementById("edit-truth-attestation"),t=document.getElementById("edit-profile-save-btn");t&&e&&(t.disabled=!e.checked)}resetTruthAttestation(){const e=document.getElementById("edit-truth-attestation");e&&(e.checked=!1);const t=document.getElementById("edit-profile-save-btn");t&&(t.disabled=!0)}maybeShowProfileReminder(){const e=swapikiStore.getProfile();if(!!e.locked&&!!e.username)return;const s=swapikiStore.incrementLoginReminderCount();this.openProfileReminderModal(s>2)}openProfileReminderModal(e){const t=document.getElementById("modal-profile-reminder");if(!t)return;const s=document.getElementById("profile-reminder-close-btn"),i=document.getElementById("profile-reminder-later-btn"),a=document.getElementById("profile-reminder-title"),o=document.getElementById("profile-reminder-text");e?(a&&(a.textContent="Complete your profile to continue"),o&&(o.textContent="You'll need to finish setting up your profile \u2014 including locking in your handle \u2014 before you can move forward on Swapiki."),s&&s.classList.add("hidden"),i&&i.classList.add("hidden")):(a&&(a.textContent="Set your handle & complete your profile"),o&&(o.textContent="You haven't set your handle yet. Head to Edit Profile to lock it in and finish filling out your profile."),s&&s.classList.remove("hidden"),i&&i.classList.remove("hidden")),t.classList.remove("hidden")}closeProfileReminderModal(){const e=document.getElementById("modal-profile-reminder");e&&e.classList.add("hidden")}openEditProfileFromReminder(){this.closeProfileReminderModal(),this.openEditProfileModal()}async handleAvatarFileSelect(e){const t=e.target.files[0];if(!t)return;const s=URL.createObjectURL(t),i=document.getElementById("edit-avatar-preview");i&&(i.src=s),this.showToast("Uploading photo\u2026");try{const a=await swapikiStore.uploadFile(t,"avatar");this.uploadedAvatarUrl=a,i&&(i.src=a),this.showToast("Profile photo uploaded!")}catch(a){this.showToast(`\u274C ${a&&a.message||"Photo upload failed."}`),e.target.value=""}}async handleResumeFileSelect(e){const t=e.target.files[0];if(!t)return;if(t.size>2*1024*1024){this.showToast("\u26A0\uFE0F Resume file size must be under 2MB!"),e.target.value="";return}const s=document.getElementById("edit-resume-status");s&&(s.textContent=`Uploading "${t.name}"\u2026`);try{const i=await swapikiStore.uploadFile(t,"resume");this.uploadedResumeUrl=i,s&&(s.textContent=`\u2705 Attached: ${t.name}`),this.showToast(`Resume "${t.name}" uploaded!`)}catch(i){this.showToast(`\u274C ${i&&i.message||"Resume upload failed."}`),s&&(s.textContent="Upload failed. Please try again."),e.target.value=""}}closeEditProfileModal(){const e=document.getElementById("modal-edit-profile");e&&e.classList.add("hidden")}async handleProfileSave(e){e.preventDefault();const t=document.getElementById("edit-truth-attestation");if(t&&!t.checked){this.showToast("Please confirm your profile information is true before saving.");return}const s=swapikiStore.getProfile(),i=!!s.locked&&!!s.username;let a;if(i)a=s.username;else{const l=document.getElementById("edit-nickname").value;if(a=swapikiStore.formatNickname(l),!await this.checkNicknameAvailability(a)){this.showToast(`\u26A0\uFE0F Cannot save: "${a}" is unavailable or invalid.`);return}if(!confirm(`Once you save, your handle "${a}" will be locked and cannot be changed again. All other profile fields can still be edited any time. Continue?`))return}const o=document.getElementById("edit-expertise").value,n=o?o.split(",").map(l=>l.trim()).filter(l=>l.length>0):["Design Systems"],r={name:document.getElementById("edit-name").value,username:a,title:document.getElementById("edit-title").value,experience:document.getElementById("edit-experience").value,expertise:n,location:document.getElementById("edit-location").value,status:document.getElementById("edit-status").value,education:document.getElementById("edit-education").value,bio:document.getElementById("edit-bio").value,linkedin:document.getElementById("edit-linkedin").value,twitter:document.getElementById("edit-twitter")?document.getElementById("edit-twitter").value.trim():"",resumeLink:document.getElementById("edit-resume-link")?document.getElementById("edit-resume-link").value.trim():"",portfolio:document.getElementById("edit-portfolio")?document.getElementById("edit-portfolio").value.trim():"",locked:!0};this.uploadedAvatarUrl&&(r.avatar=this.uploadedAvatarUrl),this.uploadedResumeUrl&&(r.resumeUrl=this.uploadedResumeUrl),i||swapikiStore.registerNickname(a,r.id),swapikiStore.updateProfile(r),swapikiStore.recordProfileAttestation({name:r.name,attestedAt:new Date().toISOString()}),this.updateHandleLockNotice(!0),this.closeEditProfileModal(),this.showToast(i?"Profile updated!":`Profile updated & handle "${a}.swapiki.com" locked.`),router.navigate(router.currentView,!1)}handleResumeUpload(e){const t=e.target.files[0];t&&(this.showToast(`Parsing resume "${t.name}"...`),setTimeout(()=>{document.getElementById("proj-input-title").value="Payment Intent Retry & Webhook Engine",document.getElementById("proj-input-role").value="Senior Backend Architect",document.getElementById("proj-input-problem").value="Payment webhooks were delayed or duplicated during high-volume checkout events.",document.getElementById("proj-input-ownership").value="Owned the retry architecture, idempotency model, and Redis-backed event recovery flow.",document.getElementById("proj-input-impact").value="Achieved 99.98% payment webhook delivery SLA across 15M daily checkout transactions",document.getElementById("proj-input-github").value="https://github.com/example/webhook-retry-engine",document.getElementById("proj-input-live").value="https://example.com/payment-engine",document.getElementById("proj-input-takeaways").value=`Architected idempotent webhook event retry log with Redis cache
Reduced payment reconciliation latency from 45 mins to 1.2 seconds`,this.showToast("Resume parsed! Form auto-filled with project details & GitHub link.")},1e3))}openNotificationsModal(){const e=document.getElementById("modal-notifications");e&&e.classList.remove("hidden")}closeNotificationsModal(){const e=document.getElementById("modal-notifications");e&&e.classList.add("hidden")}openTermsModal(){const e=document.getElementById("modal-terms");e&&e.classList.remove("hidden")}closeTermsModal(){const e=document.getElementById("modal-terms");e&&e.classList.add("hidden")}openContactModal(){const e=document.getElementById("modal-contact");e&&e.classList.remove("hidden")}closeContactModal(){const e=document.getElementById("modal-contact");e&&e.classList.add("hidden")}openSupportModal(){const e=document.getElementById("modal-support");e&&e.classList.remove("hidden")}closeSupportModal(){const e=document.getElementById("modal-support");e&&e.classList.add("hidden")}openFeedbackModal(){const e=document.getElementById("modal-feedback");e&&e.classList.remove("hidden");const t=document.getElementById("feedback-message");t&&!t.value&&setTimeout(()=>t.focus(),50)}closeFeedbackModal(){const e=document.getElementById("modal-feedback");e&&e.classList.add("hidden")}async submitFeedback(e){e&&e.preventDefault();const t=document.getElementById("feedback-message"),s=document.getElementById("feedback-category"),i=document.getElementById("feedback-email"),a=t?t.value.trim():"";if(!a){this.showToast("Please write a sentence or two first.");return}const o=swapikiStore.submitFeedback({category:s?s.value:"general",message:a,email:i?i.value.trim():""});o&&o.ok?(t&&(t.value=""),i&&(i.value=""),this.closeFeedbackModal(),this.showToast("Thanks \u2014 feedback received and read.")):this.showToast(`\u274C ${o&&o.error||"Could not send feedback."}`)}openSignupModal(){const e=document.getElementById("modal-signup");e&&e.classList.remove("hidden"),this.initGoogleButtons()}closeSignupModal(){const e=document.getElementById("modal-signup");e&&e.classList.add("hidden")}async handleSignup(e){e.preventDefault();const t=document.getElementById("terms-agree-checkbox");if(t&&!t.checked){this.showToast("You must agree to the Terms of Service & Privacy Policy.");return}const s=document.getElementById("signup-name-input"),i=document.getElementById("signup-email-input"),a=document.getElementById("signup-handle-input"),o=document.getElementById("signup-password-input"),n=s&&s.value.trim()?s.value.trim():"New Candidate",r=i?i.value.trim():"",l=o?o.value:"",m=a?a.value.trim():"",c=swapikiStore.formatNickname(m);if(!c||c.length<5){this.showToast("\u26A0\uFE0F Handle must be at least 5 characters long.");return}if(/^\d+$/.test(c)){this.showToast("\u26A0\uFE0F Numbers-only handles are not allowed.");return}if(!swapikiStore.handleHasNameAndNumber(c)){this.showToast("\u26A0\uFE0F Handle needs both a name and a number to register (e.g. rahul92).");return}if(!r){this.showToast("\u26A0\uFE0F Work email is required.");return}if(!l||l.length<8){this.showToast("\u26A0\uFE0F Password must be at least 8 characters long.");return}if(swapikiStore.isNicknameTakenSync(c)){this.showToast(`\u274C "${c}" is already taken or restricted.`);return}const u=document.getElementById("signup-honey-email");if(u&&u.value.trim()){this.showToast("Something went wrong. Please try again.");return}if(isDisposableEmail(r)){this.showToast("\u26A0\uFE0F Please use a permanent (non-temporary) email address.");return}try{const y=await fetch("/api/signup-guard",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:r,honeypot:u?u.value.trim():""})}).then(v=>v.json()).catch(()=>null);if(y&&y.allowed===!1){y.reason==="rate_limit"?this.showToast("Too many signup attempts from this device. Wait a few minutes and try again."):y.reason==="disposable"?this.showToast("\u26A0\uFE0F Please use a permanent (non-temporary) email address."):this.showToast("Something went wrong. Please try again.");return}}catch(y){}const p=e.target.querySelector('button[type="submit"]'),b=p?p.textContent:"";p&&(p.disabled=!0,p.textContent="Creating account\u2026");try{const{user:y,session:v}=await swapikiStore.signUpWithPassword(r,l,n);y&&swapikiStore.registerNickname(c,y.id),v&&y?(await swapikiStore.loadProfileForUser(y,c),this.refreshAuthUI(),this.closeSignupModal(),this.showToast(`Welcome to Swapiki, ${n.split(" ")[0]}! Build your proof profile.`),router.navigate("dashboard")):(this._pendingSignup={email:r,cleanHandle:c,name:n},this.closeSignupModal(),this.openOtpModal(r))}catch(y){this.showToast(`\u274C ${y&&y.message||"Could not create your account. Please try again."}`)}finally{p&&(p.disabled=!1,p.textContent=b)}}openOtpModal(e){const t=document.getElementById("modal-otp");if(!t)return this.showToast(`Almost there \u2014 check ${e} for the 6-digit confirmation code.`);t.classList.remove("hidden");const s=document.getElementById("otp-email-address");s&&(s.textContent=e||"");const i=document.getElementById("otp-code-input");i&&(i.value="",i.focus());const a=document.getElementById("otp-submit-btn");a&&(a.disabled=!1)}closeOtpModal(){const e=document.getElementById("modal-otp");e&&e.classList.add("hidden")}async handleOtpSubmit(e){e.preventDefault();const t=this._pendingSignup,s=document.getElementById("otp-code-input"),i=s?s.value.replace(/\s+/g,"").trim():"";if(!t||!t.email){this.showToast("Please start signing up first.");return}if(!/^\d{6}$/.test(i)){this.showToast("Enter the 6-digit code from the email.");return}const a=document.getElementById("otp-submit-btn"),o=a?a.textContent:"";a&&(a.disabled=!0,a.textContent="Verifying\u2026");try{const{user:n,session:r}=await swapikiStore.verifyEmailOtp(t.email,i);r&&n?(await swapikiStore.loadProfileForUser(n,t.cleanHandle),this.refreshAuthUI(),this.closeOtpModal(),this.showToast(`Welcome to Swapiki, ${t.name.split(" ")[0]}! Build your proof profile.`),router.navigate("dashboard")):n&&(this.closeOtpModal(),this.showToast("Email verified! Now log in with your password."),this.openLoginModal())}catch(n){const r=n&&n.message||"Could not verify the code.";this.showToast(`\u274C ${r}`)}finally{a&&(a.disabled=!1,a.textContent=o)}}async resendOtp(){const e=this._pendingSignup;if(!e||!e.email)return this.showToast("Please start signing up first.");try{await swapikiStore.resendEmailOtp(e.email);const t=document.getElementById("otp-resend-btn");if(t){const s=t.textContent;t.textContent="Sent! Check your inbox.",t.disabled=!0,setTimeout(()=>{t.textContent=s,t.disabled=!1},4e3)}this.showToast(`A fresh code is on its way to ${e.email}`)}catch(t){this.showToast(`\u274C ${t&&t.message||"Could not resend the code."}`)}}publishProfile(){const e=swapikiStore.getProfile();if(e.profileStatus==="published")swapikiStore.unpublishProfile(),this.showToast("Profile unpublished and hidden from public view.");else if(e.projects.length<1){this.showToast("Add at least one proof project before publishing.");return}else swapikiStore.publishProfile(),this.showToast("Profile published and ready to share.");this.renderDashboard()}}window.app=new SwapikiApp,document.addEventListener("DOMContentLoaded",()=>window.app.init());
