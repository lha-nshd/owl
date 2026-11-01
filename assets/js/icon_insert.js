/* ============================================================
   OWL — Explore Topics
   /OWL/assets/js/icon_insert.js

   1. Loads Tabler Icons webfont from CDN
   2. Injects data-nav-icon on every sidebar nav link by
      matching the link text to an icon map
   3. Injects <i class="ti ti-X"> into h2 headings that have
      a data-icon attribute (set in the markdown via HTML)
   4. Sidebar summary scroll-spy — highlights active section
   ============================================================ */

(function () {
  "use strict";

  /* ── 2. Nav icon map ─────────────────────────────────────── */
  /* Keys are lowercase fragments of the link text.
     Values are Tabler icon names (outline set). */
  var NAV_ICONS = {
    /* Top-level pages */
    "home":                         "ti-home",
    "getting started":              "ti-compass",
    "where should i start":         "ti-traffic-lights",
    "how the site is organised":    "ti-map",
    "basket management":            "ti-basket-cog",
	"variable metadata":            "ti-file-description",
	"owl and condor": "ti-file-description",
	"nshd showcase":            	"ti-presentation-analytics",
	"cohort study jargon":      	"ti-vocabulary",
    "search data dictionary":       "ti-search",
    "browse by category":           "ti-layout-grid",
    "view popular variables":       "ti-star",
	"accessing nshd data":          "ti-database-share",
	"metadata enhancement project": "ti-sparkles",
	"data coverage": 				"ti-chart-histogram",
	"longitudinal variables":       "ti-repeat",
	"longitudinal search":          "ti-repeat",
	"the data dictionary":			"ti-book-2",
	"study timeline":				"ti-hourglass",
	"search by year":				"ti-calendar",
	"uk llc":						"ti-link",
    "discover projects": 			"ti-compass",
	"search overview":				"ti-search",
	"documentation hub":		"ti-versions",
    "search documentation":		"ti-compass",
    "writing documentation for owl":		"ti-file-pencil",
	"create documentation":		"ti-forms",
	"using doc builder":		"ti-forms",
	"apply for data":		"ti-share",
	"metrics":		"ti-chart-line",
	"faqs":						"ti-help-circle",


    /* Section labels handled separately */
    /* Questionnaire waves */
    "explore nshd questionnaires":  "ti-clipboard-list",
    "1946":                         "ti-calendar",
    "1947":                         "ti-calendar",
    "1948":                         "ti-calendar",
    "1950":                         "ti-calendar",
    "1952":                         "ti-calendar",
    "1953":                         "ti-calendar",
    "1954":                         "ti-calendar",
    "1955":                         "ti-calendar",
    "1956":                         "ti-calendar",
    "1957":                         "ti-calendar",
    "1959":                         "ti-calendar",
    "1961":                         "ti-calendar",
    "1962":                         "ti-calendar",
    "1963":                         "ti-calendar",
    "1964":                         "ti-calendar",
    "1965":                         "ti-calendar",
    "1954":                         "ti-calendar",
    "1966-67":                      "ti-calendar",
    "1968":                         "ti-calendar",
    "1969":                         "ti-calendar",
    "1970":                         "ti-calendar",
    "1971":                         "ti-calendar",
    "1972":                         "ti-calendar",
    "1977":                         "ti-calendar",
    "1982":                         "ti-calendar",
    "1985":                         "ti-calendar",
    "1989":                         "ti-calendar",
    "1993":                         "ti-calendar",
    "1994":                         "ti-calendar",
    "1995":                         "ti-calendar",
    "1996":                         "ti-calendar",
    "1997":                         "ti-calendar",
    "1998":                         "ti-calendar",
    "1999":                         "ti-calendar",
    "1993":                         "ti-calendar",
    "2000":                         "ti-calendar",
    "2003":                         "ti-calendar",
    "2005":                         "ti-calendar",
    "2008":                         "ti-calendar",
    "2010":                         "ti-calendar",
    "2014":                         "ti-calendar",
    "2015":                         "ti-calendar",
    "2018":                         "ti-calendar",
    "2019":                         "ti-calendar",
    "2020":                         "ti-calendar",
    "2022":                         "ti-calendar",
    "2025":                         "ti-calendar",
    /* Topic pages */
    "explore topics":               "ti-tags",
    "childhood health":             "ti-baby-carriage",
    "adult physical health":        "ti-heart-rate-monitor",
    "adult mental health":          "ti-brain",
    "adult health behaviours":      "ti-activity",
    "anthropometry":                "ti-ruler-measure",
    "lifetime social":              "ti-users",
    "biological samples":           "ti-test-pipe",
    "dna":                          "ti-dna",
    "structural assessments":       "ti-scan",
    "insight 46":                   "ti-microscope",
    "clinic visit":                 "ti-stethoscope",
    /* Sub-topics */
    "smoking":                      "ti-smoking-no",
    "drinking":                     "ti-beer-off",
    "alcohol":                      "ti-beer-off",
    "diet and nutrition":           "ti-salad",
    "physical activity":            "ti-run",
    "childhood cognitive":          "ti-bulb",
    "developmental milestones":     "ti-chart-line",
    "childhood development":    	 "ti-chart-line",
    "parental bonding":             "ti-heart-handshake",
	"longitudinal latent class":    "ti-chart-dots",
    "parental information":         "ti-user-heart",
    "childhood diet":               "ti-apple",
    "puberty":                      "ti-arrows-vertical",
    "childhood mental":             "ti-mood-happy",
    "general health":               "ti-shield-heart",
    "respiratory":                  "ti-lungs",
    "cardiovascular":               "ti-heart",
    "diabetes":                     "ti-droplet",
    "physical capability":          "ti-barbell",
    "urinary":                      "ti-droplet-half-2",
    "medication":                   "ti-pill",
    "cognitive function":           "ti-brain",
    "mental health and wellbeing":  "ti-mood-smile",
    "education":                    "ti-school",
    "employment":                   "ti-briefcase",
    "housing":                      "ti-home-2",
    "marital":                      "ti-rings-wedding",
    "social networks":              "ti-network",
    "fertility":                    "ti-egg",
    "household":                    "ti-building-community",
    "life events":                  "ti-calendar-event",
    "menopause":                    "ti-gender-female",
    "social class":                 "ti-award",
	"nursery": 					    "ti-lego",
	"bedwetting":     				"ti-bed",
	"early-indicators":				"ti-gauge",
	"marital":      				"ti-rings",
	"clinical data":                "ti-stethoscope",
	"imaging":                      "ti-scan",
	"physical measures":            "ti-ruler-measure",
	"physical performance":         "ti-walk",
	"blood assays":                 "ti-test-pipe",
	"urine assays":                 "ti-flask",
	"saliva assays":                "ti-droplet",
	"questionnaire data":           "ti-clipboard-text",
	"health and medical history":   "ti-file-report",
	"mental health":               	"ti-brain",
	"medical conditions":           "ti-vaccine",
	"covid symptoms":               "ti-virus",
	"healthcare":                   "ti-building-hospital",
	"hospital":                     "ti-building-hospital",
	"health checks":                "ti-clipboard-check",
	"fractures":                    "ti-bone",
	"fatigue":                      "ti-battery-1",
	"aches and pains":              "ti-bandage",
	"balance problems":             "ti-yoga",
	"female-specific factors":      "ti-gender-female",
	"incontinence":                 "ti-droplet-half-2",
	"blood sample":                 "ti-droplet",
	"wellbeing and mastery":        "ti-mood-smile",
	"temperament":                  "ti-sparkles",
	"sociodemographics":            "ti-users",
	"economic circumstances":       "ti-currency-pound",
	"lifestyle":                    "ti-activity",
	"eating habits":                "ti-salad",
	"social activities":            "ti-confetti",
	"electronic device use":        "ti-device-mobile",
	"local environment":            "ti-map-pin",
	"residential air pollution":    "ti-cloud-fog",
	"vitamin and mineral":          "ti-pill",
	"family history":               "ti-users-group",
	"parental death":               "ti-users-group",
	"data collection information":  "ti-database",
	"miscellaneous":                "ti-dots",
	"specialist questionnaire":     "ti-file-text",
	"cost of living":               "ti-receipt",
	"covid questionnaires":         "ti-virus",
	"serology":                     "ti-test-pipe-2",
	"womens health questionnaire":  "ti-gender-female",
	"hysterectomy":                 "ti-medical-cross",
	"menstrual cycle":              "ti-calendar-repeat",
	"hormone replacement":          "ti-pill",
	"diet diaries":                 "ti-book",
	"energy and macronutrients":    "ti-meat",
	"omic":                         "ti-dna-2",
	"genomics":                     "ti-dna",
	"telomeres":                    "ti-dna",
	"population characteristics":   "ti-chart-pie",
	"baseline characteristics":     "ti-flag",
	"ongoing characteristics":      "ti-refresh",
	"response status":              "ti-checklist",
	"sub-studies":                  "ti-flask-2",
	"insight46":                    "ti-microscope",
	"brain mri":                    "ti-brain",
	"brain volumes":                "ti-brain",
	"white matter":                 "ti-brain",
	"cortical thickness":           "ti-brain",
	"brain age":                    "ti-brain",
	"brain pet":                    "ti-radioactive",
	"amyloid":                      "ti-atom",
	"hearing test":                 "ti-ear",
	"smell test":                   "ti-air-conditioning",
	"gait assessment":              "ti-walk",
	"blood biomarkers":             "ti-test-pipe",
	"cerebrospinal fluid":          "ti-droplet",
	"head injury":                  "ti-first-aid-kit",
	"delirium":                     "ti-brain",
	"dental health":                "ti-tooth",
	"anxiety":                      "ti-mood-confuzed",
	"negative thinking":            "ti-cloud-storm",
	"wearables":                    "ti-device-watch",
	"myofit":                       "ti-barbell",
	"raw data":                     "ti-file-spreadsheet",
	"diet [5":                      "ti-salad",
/* ---- Browse by Category: cognitive sub-tests ---- */
	"childhood cognition":              "ti-bulb",
	"adulthood cognition":              "ti-bulb",
	"reading comprehension":            "ti-book",
	"peg placement":                    "ti-puzzle",
	"visual memory":                    "ti-eye",
	"word list memory test":            "ti-list-details",
	"processing speed":                 "ti-gauge",
	"national audit reading test":      "ti-book",
	"nart":                             "ti-book",
	"verbal fluency":                   "ti-message-2",
	"reaction time":                    "ti-bolt",
	"sensory difficulties":             "ti-ear",
	"memory difficulties":              "ti-brain",
	"ace-iii":                          "ti-clipboard-list",
	"finger tapping":                   "ti-hand-finger",
	"six day word recall":              "ti-calendar-event",
	"envelope test":                    "ti-mail",
	"memory test":                      "ti-brain",
	"mini-mental state examination":    "ti-brain",
	"fluid intelligence":               "ti-bulb",
	"symbol digit substitution":        "ti-abc",
	"picture vocabulary":               "ti-photo",
	"visuomotor performance":           "ti-hand-finger",
	"visual short-term memory":         "ti-eye",
	"associative episodic memory":      "ti-brain",
	"logical memory":                   "ti-brain",
	"visuo-constructional":             "ti-eye",
	"preclinical alzheimer":            "ti-brain",
	"pacc":                             "ti-brain",
	"informant interviews":             "ti-users",

	/* ---- Imaging / cardiovascular / scans ---- */
	"dxa assessment":                   "ti-bone",
	"bone size, mineral and density":   "ti-bone",
	"pulse wave analysis":              "ti-activity",
	"pulse wave velocity":              "ti-activity",
	"late gadolinium enhancement (lge)":		"ti-flare",
	"blood pool":		"ti-droplet-filled",
	"quantitative perfusion":		"ti-gauge",
	"heart tissue characteristics":		"ti-texture",
	"echocardiogram":                   "ti-heartbeat",
	"carotid ultrasound":               "ti-scan",
	"carotid intima-media thickness":   "ti-ruler",
	"cimt":                             "ti-ruler",
	"mammogram":                        "ti-scan",
	"actiheart monitor":                "ti-heart-rate-monitor",
	"blood pressure":                   "ti-heart-rate-monitor",
	"ecg at rest":                      "ti-heartbeat",
	"heart rate variability":           "ti-heartbeat",
	"spirometry":                       "ti-lungs",
	"hand examination":                 "ti-hand-stop",
	"hand grip strength":               "ti-barbell",
	"chair rises":                      "ti-armchair",
	"standing balance":                 "ti-yoga",
	"timed get up and go":              "ti-stopwatch",
	"walk test":                        "ti-walk",
	"updrs":                            "ti-activity",
	"stepper test":                     "ti-stairs",
	"bradykinesia":                     "ti-hand-finger",
	"body composition":                 "ti-scale",
	"body size":  			            "ti-ruler-measure",

	/* ---- Blood / biological samples ---- */
	"blood biochemistry":               "ti-test-pipe",
	"nmr metabolomics":                 "ti-chart-dots",
	"metabolon":                        "ti-chart-dots",
	"blood processing":                 "ti-test-pipe",
	"blood biomarkers":                 "ti-test-pipe",
	"cerebrospinal fluid":              "ti-droplet",
	"csf biomarkers":                   "ti-droplet",
	"genotype":                         "ti-dna",
	"family history of neurological":   "ti-dna",

	/* ---- Conditions / health history ---- */
	"self-rated health":                "ti-mood-smile",
	"heart and circulatory": 	        "ti-heart",
	"cancer":                           "ti-ribbon-health",
	"musculoskeletal":                  "ti-bone",
	"digestive and genitourinary":      "ti-stomach",
	"endocrine and metabolic":          "ti-droplet",
	"nervous system conditions":        "ti-brain",
	"mental and behavioural":           "ti-mood-confuzed",
	"eye conditions":                   "ti-eye",
	"clinical disorders":               "ti-clipboard-list",
	"other medical conditions":         "ti-first-aid-kit",
	"hospital":                         "ti-building-hospital",
	"other health problems":            "ti-first-aid-kit",
	"ad8 dementia":                     "ti-brain",
	"screening questions for cognitive":"ti-brain",
	"present state examination":        "ti-clipboard-list",
	"psychiatric symptom frequency":    "ti-clipboard-list",
	"longitudinal latent class":        "ti-chart-line",
	"head injury":                      "ti-first-aid-kit",
	"delirium":                         "ti-brain",
	"dental health":                    "ti-first-aid-kit",
	"anxiety":                          "ti-mood-confuzed",
	"negative thinking":                "ti-cloud-storm",
	"personal history of neurological": "ti-brain",

	/* ---- Medications ---- */
	"medication taken in last 24 hours":"ti-pill",
	"regular medication":               "ti-pill",
	"medication derivations":           "ti-pill",

	/* ---- Lifestyle / sociodemographic / other ---- */
	"epic physical activity":           "ti-run",
	"sleep":                            "ti-moon",
	"social support":                   "ti-heart-handshake",
	"religious beliefs":                "ti-heart",
	"household financial circumstances":"ti-cash",
	"physical and mental health [": 	"ti-heart",
	"family and home":                  "ti-home-2",
	"lifestyle habits":                 "ti-activity",
	"social life":                      "ti-confetti",
	"general life":                     "ti-heart",
	"children [":                	    "ti-baby-carriage",
	"weight of food groups consumed":   "ti-meat",
	"date information for diet diaries":"ti-calendar",
	"type of visit":                    "ti-door-enter",
	"empatica":                         "ti-device-watch",
	"raw diet diaries":                 "ti-file-spreadsheet",
	};

  /* ── 3. Section heading icon map ─────────────────────────── */
  /* Maps h2 text fragments → Tabler icon class */
  var HEADING_ICONS = {
    "main topics":              "ti-list",
    "sub-topics":               "ti-list-tree",
    "research visit":           "ti-building-hospital",
    "protocol papers":          "ti-file-description",
    "accessing insight":        "ti-database",
    "physical growth":          "ti-trending-up",
    "height and weight":        "ti-ruler",
    "anthropometry":            "ti-ruler-measure",
    "parental height":          "ti-users",
    "selected publications":    "ti-books",
    "blood":                    "ti-test-pipe",
    "urine":                    "ti-flask",
    "saliva":                   "ti-droplet",
    "biomarkers":               "ti-chart-dots",
    "age 53":                   "ti-calendar-stats",
    "age 60":                   "ti-calendar-stats",
    "age 68":                   "ti-calendar-stats",
    "age 76":                   "ti-calendar-stats",
    "background":               "ti-info-circle",
    "dna":                      "ti-dna",
    "about":                    "ti-info-circle",
    "default":                  "ti-chevron-right",
  };

  /* helper: find best icon for a string */
  function findIcon(map, text) {
    var t = (text || "").toLowerCase().trim();
    for (var key in map) {
      if (t.indexOf(key) !== -1) return map[key];
    }
    return null;
  }

  /* ── 4. Inject icons into sidebar nav links ──────────────── */
  function injectNavIcons() {
    var links = document.querySelectorAll(".site-nav .nav-list-link");
    links.forEach(function (a) {
      var text = a.textContent || "";
      var icon = findIcon(NAV_ICONS, text);
      if (!icon) return;
      /* avoid double injection */
      if (a.querySelector("i.ti")) return;
      var i = document.createElement("i");
      i.className = "ti " + icon;
      i.setAttribute("aria-hidden", "true");
      i.style.cssText =
        "font-size:14px;vertical-align:-2px;margin-right:6px;opacity:0.8;";
      a.insertBefore(i, a.firstChild);
    });
  }

  /* ── 5. Inject icons into h2 section headings ────────────── */
  function injectHeadingIcons() {
    var headings = document.querySelectorAll(
      ".page-topics .main-content h2, .page-topics .page-content h2"
    );
    headings.forEach(function (h) {
      if (h.querySelector("i.ti")) return;
      var text = h.textContent || "";
      var icon = findIcon(HEADING_ICONS, text) || "ti-chevron-right";
      var i = document.createElement("i");
      i.className = "ti " + icon;
      i.setAttribute("aria-hidden", "true");
      i.style.cssText =
        "font-size:18px;vertical-align:-3px;margin-right:6px;color:#6a0dad;opacity:0.85;";
      h.insertBefore(i, h.firstChild);
    });
  }

  /* ── 6. Hero banner icon ─────────────────────────────────── */
  function injectHeroIcon() {
    var h1 = document.querySelector(".page-topics .hero-banner h1");
    if (!h1 || h1.querySelector("i.ti")) return;
    var page = document.body.className || "";
    var icon = "ti-tags"; /* default for topics parent */
    if (page.indexOf("insight") !== -1)      icon = "ti-microscope";
    else if (page.indexOf("anthropo") !== -1) icon = "ti-ruler-measure";
    else if (page.indexOf("biological") !== -1) icon = "ti-test-pipe";
    else if (page.indexOf("childhood") !== -1) icon = "ti-baby-carriage";
    else if (page.indexOf("adult-physical") !== -1) icon = "ti-heart-rate-monitor";
    else if (page.indexOf("mental") !== -1)   icon = "ti-brain";
    else if (page.indexOf("behaviour") !== -1) icon = "ti-activity";
    else if (page.indexOf("lifetime") !== -1) icon = "ti-users";
    /* also try h1 text */
    var txt = (h1.textContent || "").toLowerCase();
    var mapped = findIcon(NAV_ICONS, txt);
    if (mapped) icon = mapped;

    var i = document.createElement("i");
    i.className = "ti " + icon;
    i.setAttribute("aria-hidden", "true");
    i.style.cssText =
      "font-size:28px;vertical-align:-4px;margin-right:8px;color:#6a0dad;opacity:0.85;";
    h1.insertBefore(i, h1.firstChild);
  }


  /* ── 7. Run everything ───────────────────────────────────── */
  function run() {
    injectNavIcons();
    injectHeadingIcons();
    injectHeroIcon();
  }

  /* ── 8. Re-run if JtD loads content dynamically ──────────── */
  /* IMPORTANT: document.body does not exist yet if this script
     is loaded in <head> (e.g. via head_custom). The observer
     must only be created once the DOM — and therefore
     document.body — is guaranteed to exist. */
  function startObserver() {
    var obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.addedNodes.length) {
          injectNavIcons();
          injectHeadingIcons();
        }
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      run();
      startObserver();
    });
  } else {
    run();
    startObserver();
  }
})();