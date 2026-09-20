import { createContext, useContext, useState, type ReactNode } from 'react';

export type Language = 'en' | 'ta' | 'hi';

export interface Translations {
  // Navigation & General
  nav_dashboard: string;
  nav_trace: string;
  nav_atm: string;
  trigger_payment: string;
  online_status: string;
  
  // Dashboard Header & Metrics
  system_dashboard: string;
  metric_transactions: string;
  metric_active_complaints: string;
  metric_suspicious_chains: string;
  metric_high_risk: string;
  
  // Active Threat Protocol
  active_threat_protocol: string;
  target_prefix: string;
  complaint_id: string;
  top_prediction_confidence: string;
  flagged_amount: string;
  time_detected: string;
  target_account_routing: string;
  in_transit: string;
  analyze_incident_routing: string;
  
  // Threat Tracking Incidents Table
  threat_incidents_title: string;
  unique_complaints: string;
  table_hint: string;
  col_incident_time: string;
  col_mule_amount: string;
  col_ranked_atms: string;
  col_shap_drivers: string;
  col_actions: string;
  top_target_badge: string;
  all_atms_btn: string;
  collapse_btn: string;
  mark_reviewed: string;
  reviewed: string;
  saving: string;
  trace_route: string;
  no_incidents: string;
  full_risk_breakdown: string;
  rank_prefix: string;
  pinpoint_on_map: string;

  // Pinpoint Modal
  modal_complaint: string;
  modal_alert: string;
  modal_confidence: string;
  switch_atm: string;
  shap_explanation_title: string;
  no_shap_factors: string;
  gps_coords: string;
  account_route: string;
  review_status: string;
  status_verified: string;
  status_pending: string;
  marked_as_reviewed: string;
  mark_as_reviewed: string;
  launch_live_trace: string;
  close: string;

  // ATM Intelligence Page
  atm_title: string;
  atm_subtitle: string;
  atm_total_nodes: string;
  atm_high_risk_nodes: string;
  atm_network_density: string;
  atm_search_placeholder: string;
  atm_status_active: string;
  atm_status_flagged: string;
  atm_last_activity: string;
  atm_cashout_risk: string;
  
  // Live Trace Page
  trace_title: string;
  trace_analyzing: string;
  trace_detected_hops: string;
  trace_predicted_atm: string;
  trace_back_to_dashboard: string;

  // Filters & Drill-down
  filter_search_placeholder: string;
  filter_time_label: string;
  filter_time_all: string;
  filter_time_today: string;
  filter_time_1h: string;
  filter_time_7d: string;
  filter_zone_label: string;
  filter_zone_all: string;
  filter_zone_central: string;
  filter_zone_south: string;
  filter_zone_north: string;
  filter_crime_label: string;
  filter_crime_all: string;
  filter_crime_phishing: string;
  filter_crime_mule: string;
  filter_crime_investment: string;
  filter_crime_atm: string;
  filter_status_label: string;
  filter_status_all: string;
  filter_status_pending: string;
  filter_status_verified: string;
  filter_reset: string;
  filter_showing: string;
  filter_of: string;
  filter_incidents: string;

  // Dossier / Case Report
  dossier_btn: string;
  dossier_title: string;
  dossier_print_btn: string;
  dossier_evidence_cert: string;
  dossier_cert_body: string;
  dossier_hash_label: string;
  dossier_officer_sig: string;
  dossier_station_stamp: string;
}

const translations: Record<Language, Translations> = {
  en: {
    nav_dashboard: "Command Dashboard",
    nav_trace: "Live Threat Trace",
    nav_atm: "ATM Intelligence",
    trigger_payment: "TRIGGER SIMULATED PAYMENT",
    online_status: "SYSTEM ACTIVE",

    system_dashboard: "SYSTEM COMMAND DASHBOARD",
    metric_transactions: "Transactions",
    metric_active_complaints: "Active Complaints",
    metric_suspicious_chains: "Suspicious Chains",
    metric_high_risk: "High-Risk Accounts",

    active_threat_protocol: "ACTIVE THREAT PROTOCOL",
    target_prefix: "#1 TARGET",
    complaint_id: "Complaint ID",
    top_prediction_confidence: "Top Prediction Confidence",
    flagged_amount: "Flagged Amount",
    time_detected: "Time Detected",
    target_account_routing: "Target Account Routing",
    in_transit: "IN-TRANSIT",
    analyze_incident_routing: "Analyze Incident Routing",

    threat_incidents_title: "THREAT TRACKING INCIDENTS",
    unique_complaints: "Unique Complaints",
    table_hint: "Ranked #1 to #3 ATMs grouped per complaint • Click any ATM to pinpoint",
    col_incident_time: "Incident / Time",
    col_mule_amount: "Mule & Amount",
    col_ranked_atms: "Ranked ATM Predictions (#1 Top Priority & Runners-up)",
    col_shap_drivers: "Primary SHAP Drivers",
    col_actions: "Actions",
    top_target_badge: "TOP TARGET",
    all_atms_btn: "All 3 ATMs",
    collapse_btn: "Collapse",
    mark_reviewed: "Mark Reviewed",
    reviewed: "Reviewed",
    saving: "Saving...",
    trace_route: "Trace Route",
    no_incidents: "No recent threat incidents detected in the system.",
    full_risk_breakdown: "Full Cash-Out Risk Breakdown for Complaint",
    rank_prefix: "Rank",
    pinpoint_on_map: "Pinpoint on Map",

    modal_complaint: "Complaint",
    modal_alert: "Alert",
    modal_confidence: "Confidence",
    switch_atm: "Switch ATM",
    shap_explanation_title: "SHAP Tree-Attribution Explanation & Root Causes",
    no_shap_factors: "No individual SHAP factors available.",
    gps_coords: "GPS Coordinates",
    account_route: "Account Route",
    review_status: "Review Status",
    status_verified: "Verified & Reviewed",
    status_pending: "Pending Action",
    marked_as_reviewed: "Marked as Reviewed",
    mark_as_reviewed: "Mark as Reviewed",
    launch_live_trace: "Launch Live Trace",
    close: "Close",

    atm_title: "ATM INTELLIGENCE NETWORK",
    atm_subtitle: "Spatial monitoring and predictive cash-out surveillance grid across Chennai metropolitan zone.",
    atm_total_nodes: "Total ATM Nodes",
    atm_high_risk_nodes: "High-Risk Hubs",
    atm_network_density: "Surveillance Density",
    atm_search_placeholder: "Search ATM ID, bank name, or locality...",
    atm_status_active: "Active Monitoring",
    atm_status_flagged: "Flagged Hub",
    atm_last_activity: "Last Cash-Out Activity",
    atm_cashout_risk: "Predicted Cash-Out Risk",

    trace_title: "LIVE MULE ROUTING TRACE",
    trace_analyzing: "Analyzing real-time multi-hop transaction chain...",
    trace_detected_hops: "Detected Mules / Hops",
    trace_predicted_atm: "Predicted Cash-Out Point",
    trace_back_to_dashboard: "Return to Dashboard",

    filter_search_placeholder: "Search Complaint ID, Account, or ATM...",
    filter_time_label: "Time Window",
    filter_time_all: "All Time",
    filter_time_today: "Today (24h)",
    filter_time_1h: "Last 1 Hour",
    filter_time_7d: "Past 7 Days",
    filter_zone_label: "Location Zone",
    filter_zone_all: "All Zones (Chennai)",
    filter_zone_central: "Central (T. Nagar / Mylapore)",
    filter_zone_south: "South (Velachery / Tambaram)",
    filter_zone_north: "North & West (Anna Nagar / Porur)",
    filter_crime_label: "Crime Category",
    filter_crime_all: "All Crime Types",
    filter_crime_phishing: "UPI Phishing Scam",
    filter_crime_mule: "Mule Layering Ring",
    filter_crime_investment: "Investment / Ponzi Fraud",
    filter_crime_atm: "Unauthorized ATM Cash-Out",
    filter_status_label: "Triage Status",
    filter_status_all: "All Status",
    filter_status_pending: "Pending Action",
    filter_status_verified: "Verified & Intercepted",
    filter_reset: "Reset Filters",
    filter_showing: "Showing",
    filter_of: "of",
    filter_incidents: "incidents",

    dossier_btn: "Evidence Dossier",
    dossier_title: "LAW ENFORCEMENT INVESTIGATION DOSSIER",
    dossier_print_btn: "Print / Export PDF",
    dossier_evidence_cert: "Section 65B Indian Evidence Act Certificate",
    dossier_cert_body: "This electronic record was generated by T.R.A.C.E. Automated Cybercrime Interception Engine for official law enforcement triage and judicial proceedings. The cryptographic data hash guarantees electronic integrity.",
    dossier_hash_label: "SHA-256 Tamper-Evident Audit Hash",
    dossier_officer_sig: "Investigating Officer (Signature & Badge)",
    dossier_station_stamp: "Cyber Crime Police Station Stamp",
  },
  ta: {
    nav_dashboard: "கட்டுப்பாட்டு மையம்",
    nav_trace: "நேரடி தடமறிதல்",
    nav_atm: "ஏடிஎம் நுண்ணறிவு",
    trigger_payment: "பரிவர்த்தனையை உருவகப்படுத்துக",
    online_status: "கணினி இயங்குகிறது",

    system_dashboard: "கணினி கட்டளை கட்டுப்பாட்டு மையம்",
    metric_transactions: "பரிவர்த்தனைகள்",
    metric_active_complaints: "செயலில் உள்ள புகார்கள்",
    metric_suspicious_chains: "சந்தேகத்திற்கிடமான சங்கிலிகள்",
    metric_high_risk: "அதிக ஆபத்துள்ள கணக்குகள்",

    active_threat_protocol: "நேரடி அச்சுறுத்தல் நெறிமுறை",
    target_prefix: "#1 முதன்மை இலக்கு",
    complaint_id: "புகார் எண்",
    top_prediction_confidence: "கணிப்பு துல்லியம்",
    flagged_amount: "கொடியிடப்பட்ட தொகை",
    time_detected: "கண்டறியப்பட்ட நேரம்",
    target_account_routing: "இலக்கு கணக்கு வழித்தடம்",
    in_transit: "பரிமாற்றத்தில் உள்ளது",
    analyze_incident_routing: "சம்பவ வழித்தடத்தை பகுப்பாய்வு செய்க",

    threat_incidents_title: "அச்சுறுத்தல் கண்காணிப்பு சம்பவங்கள்",
    unique_complaints: "தனித்துவமான புகார்கள்",
    table_hint: "ஒவ்வொரு புகாருக்கும் #1 முதல் #3 ஏடிஎம்கள் • வரைபடத்தில் காண கிளிக் செய்யவும்",
    col_incident_time: "சம்பவம் / நேரம்",
    col_mule_amount: "கணக்கு & தொகை",
    col_ranked_atms: "தரவரிசைப்படுத்தப்பட்ட ஏடிஎம் கணிப்புகள் (#1 முதன்மை & பிற)",
    col_shap_drivers: "முதன்மை SHAP காரணிகள்",
    col_actions: "நடவடிக்கைகள்",
    top_target_badge: "முதன்மை இலக்கு",
    all_atms_btn: "3 ஏடிஎம்களும்",
    collapse_btn: "சுருக்குக",
    mark_reviewed: "மதிப்பாய்வு செய்க",
    reviewed: "சரிபார்க்கப்பட்டது",
    saving: "சேமிக்கிறது...",
    trace_route: "வழித்தடம் அறிக",
    no_incidents: "கணினியில் அச்சுறுத்தல் சம்பவங்கள் எதுவும் இல்லை.",
    full_risk_breakdown: "புகாருக்கான முழுமையான பணப்பறிப்பு இடர் விவரம்",
    rank_prefix: "தரவரிசை",
    pinpoint_on_map: "வரைபடத்தில் காட்டு",

    modal_complaint: "புகார்",
    modal_alert: "எச்சரிக்கை",
    modal_confidence: "நம்பகத்தன்மை",
    switch_atm: "ஏடிஎம் மாற்று",
    shap_explanation_title: "SHAP மரப் பண்புக்கூறு விளக்கம் மற்றும் மூலக் காரணங்கள்",
    no_shap_factors: "தனிப்பட்ட SHAP காரணிகள் கிடைக்கவில்லை.",
    gps_coords: "ஜிபிஎஸ் ஒருங்கிணைப்புகள்",
    account_route: "கணக்கு வழித்தடம்",
    review_status: "மதிப்பாய்வு நிலை",
    status_verified: "சரிபார்க்கப்பட்டு மதிப்பாய்வு செய்யப்பட்டது",
    status_pending: "நடவடிக்கை நிலுவையில் உள்ளது",
    marked_as_reviewed: "மதிப்பாய்வு செய்யப்பட்டதாக குறிக்கப்பட்டது",
    mark_as_reviewed: "மதிப்பாய்வு செய்ததாகக் குறிக்கவும்",
    launch_live_trace: "நேரடி தடமறிதலைத் தொடங்கு",
    close: "மூடுக",

    atm_title: "ஏடிஎம் நுண்ணறிவு வலையமைப்பு",
    atm_subtitle: "சென்னை பெருநகரப் பகுதியில் பணப்பறிப்பு கண்காணிப்பு மற்றும் பகுப்பாய்வு வலையமைப்பு.",
    atm_total_nodes: "மொத்த ஏடிஎம் முனையங்கள்",
    atm_high_risk_nodes: "அதிக ஆபத்துள்ள மையங்கள்",
    atm_network_density: "கண்காணிப்பு அடர்த்தி",
    atm_search_placeholder: "ஏடிஎம் எண், வங்கி பெயர் அல்லது பகுதியைத் தேடுக...",
    atm_status_active: "செயலில் உள்ள கண்காணிப்பு",
    atm_status_flagged: "கொடியிடப்பட்ட மையம்",
    atm_last_activity: "கடைசி பணப்பறிப்பு செயல்பாடு",
    atm_cashout_risk: "கணிக்கப்பட்ட பணப்பறிப்பு ஆபத்து",

    trace_title: "நேரடி வழித்தடத் தடமறிதல்",
    trace_analyzing: "நிகழ்நேர பரிவர்த்தனை சங்கிலி பகுப்பாய்வு செய்யப்படுகிறது...",
    trace_detected_hops: "கண்டறியப்பட்ட இடைநிலை கணக்குகள்",
    trace_predicted_atm: "கணிக்கப்பட்ட பணப்பறிப்பு ஏடிஎம்",
    trace_back_to_dashboard: "கட்டுப்பாட்டு மையத்திற்குத் திரும்பு",

    filter_search_placeholder: "புகார் எண், கணக்கு அல்லது ஏடிஎம் தேடுக...",
    filter_time_label: "கால அளவு",
    filter_time_all: "அனைத்து நேரம்",
    filter_time_today: "இன்று (24 மணி)",
    filter_time_1h: "கடந்த 1 மணிநேரம்",
    filter_time_7d: "கடந்த 7 நாட்கள்",
    filter_zone_label: "மண்டலம்",
    filter_zone_all: "அனைத்து மண்டலங்கள்",
    filter_zone_central: "மத்திய சென்னை (தி. நகர் / மயிலாப்பூர்)",
    filter_zone_south: "தெற்கு சென்னை (வேளச்சேரி / தாம்பரம்)",
    filter_zone_north: "வடக்கு & மேற்கு (அண்ணா நகர் / போரூர்)",
    filter_crime_label: "குற்றப் பிரிவு",
    filter_crime_all: "அனைத்துப் பிரிவுகள்",
    filter_crime_phishing: "யுபிஐ ஃபிஷிங் மோசடி",
    filter_crime_mule: "பினாமி கணக்கு அடுக்கு",
    filter_crime_investment: "முதலீட்டு மோசடி",
    filter_crime_atm: "அங்கீகரிக்கப்படாத பணப்பறிப்பு",
    filter_status_label: "நிலை",
    filter_status_all: "அனைத்தும்",
    filter_status_pending: "நடவடிக்கை நிலுவையில்",
    filter_status_verified: "சரிபார்க்கப்பட்டது",
    filter_reset: "வடிப்பான்களை மீட்டமை",
    filter_showing: "காட்டப்படுகிறது",
    filter_of: "/",
    filter_incidents: "சம்பவங்கள்",

    dossier_btn: "சான்றுக் கோப்பு",
    dossier_title: "காவல்துறை புலனாய்வு ஆவணக் கோப்பு",
    dossier_print_btn: "அச்சிடு / PDF சேமி",
    dossier_evidence_cert: "பிரிவு 65B இந்திய சாட்சியச் சட்டம் சான்றிதழ்",
    dossier_cert_body: "இந்த மின்னணு ஆவணம் சட்ட அமலாக்க மற்றும் நீதிமன்ற நடவடிக்கைகளுக்காக T.R.A.C.E. தானியங்கி அமைப்பால் உருவாக்கப்பட்டது. தரவு குறியாக்கம் பாதுகாப்பானது.",
    dossier_hash_label: "SHA-256 தணிக்கைக் குறியீடு",
    dossier_officer_sig: "புலனாய்வு அதிகாரி (கையொப்பம் & எண்)",
    dossier_station_stamp: "சைபர் க்ரைம் காவல் நிலைய முத்திரை",
  },
  hi: {
    nav_dashboard: "कमांड डैशबोर्ड",
    nav_trace: "लाइव खतरा ट्रेस",
    nav_atm: "एटीएम इंटेलिजेंस",
    trigger_payment: "सिम्युलेटेड भुगतान ट्रिगर करें",
    online_status: "सिस्टम सक्रिय है",

    system_dashboard: "सिस्टम कमांड डैशबोर्ड",
    metric_transactions: "कुल लेनदेन",
    metric_active_complaints: "सक्रिय शिकायतें",
    metric_suspicious_chains: "संदिग्ध लेन-देन श्रृंखलाएं",
    metric_high_risk: "उच्च जोखिम वाले खाते",

    active_threat_protocol: "सक्रिय खतरा प्रोटोकॉल",
    target_prefix: "#1 शीर्ष लक्ष्य",
    complaint_id: "शिकायत आईडी",
    top_prediction_confidence: "पूर्वानुमान विश्वास",
    flagged_amount: "चिह्नित राशि",
    time_detected: "पहचान का समय",
    target_account_routing: "लक्षित खाता रूटिंग",
    in_transit: "पारगमन में",
    analyze_incident_routing: "घटना रूटिंग का विश्लेषण करें",

    threat_incidents_title: "खतरा ट्रैकिंग घटनाएं",
    unique_complaints: "अद्वितीय शिकायतें",
    table_hint: "प्रति शिकायत #1 से #3 एटीएम रैंक • मानचित्र पर देखने के लिए क्लिक करें",
    col_incident_time: "घटना / समय",
    col_mule_amount: "खाता और राशि",
    col_ranked_atms: "रैंक किए गए एटीएम पूर्वानुमान (#1 शीर्ष प्राथमिकता और अन्य)",
    col_shap_drivers: "प्राथमिक SHAP कारक",
    col_actions: "कार्रवाई",
    top_target_badge: "शीर्ष लक्ष्य",
    all_atms_btn: "तीनों एटीएम",
    collapse_btn: "संक्षिप्त करें",
    mark_reviewed: "समीक्षा चिह्नित करें",
    reviewed: "सत्यापित",
    saving: "सहेजा जा रहा है...",
    trace_route: "रूट ट्रेस करें",
    no_incidents: "सिस्टम में कोई हालिया खतरा घटना नहीं मिली।",
    full_risk_breakdown: "शिकायत के लिए पूर्ण कैश-आउट जोखिम विवरण",
    rank_prefix: "रैंक",
    pinpoint_on_map: "मानचित्र पर देखें",

    modal_complaint: "शिकायत",
    modal_alert: "चेतावनी",
    modal_confidence: "विश्वास स्तर",
    switch_atm: "एटीएम बदलें",
    shap_explanation_title: "SHAP ट्री-विशेषता स्पष्टीकरण और मूल कारण",
    no_shap_factors: "कोई व्यक्तिगत SHAP कारक उपलब्ध नहीं है।",
    gps_coords: "जीपीएस निर्देशांक",
    account_route: "खाता मार्ग",
    review_status: "समीक्षा स्थिति",
    status_verified: "सत्यापित और समीक्षित",
    status_pending: "कार्रवाई लंबित",
    marked_as_reviewed: "समीक्षित के रूप में चिह्नित",
    mark_as_reviewed: "समीक्षा संपन्न चिह्नित करें",
    launch_live_trace: "लाइव ट्रेस शुरू करें",
    close: "बंद करें",

    atm_title: "एटीएम इंटेलिजेंस नेटवर्क",
    atm_subtitle: "चेन्नई महानगर क्षेत्र में स्थानिक निगरानी और पूर्वानुमानित कैश-आउट ग्रिड।",
    atm_total_nodes: "कुल एटीएम नोड्स",
    atm_high_risk_nodes: "उच्च जोखिम वाले केंद्र",
    atm_network_density: "निगरानी घनत्व",
    atm_search_placeholder: "एटीएम आईडी, बैंक का नाम या स्थान खोजें...",
    atm_status_active: "सक्रिय निगरानी",
    atm_status_flagged: "चिह्नित केंद्र",
    atm_last_activity: "अंतिम कैश-आउट गतिविधि",
    atm_cashout_risk: "पूर्वानुमानित निकासी जोखिम",

    trace_title: "लाइव म्यूल रूटिंग ट्रेस",
    trace_analyzing: "वास्तविक समय मल्टी-हॉप लेन-देन श्रृंखला का विश्लेषण हो रहा है...",
    trace_detected_hops: "पहचाने गए म्यूल खाते",
    trace_predicted_atm: "पूर्वानुमानित निकासी एटीएम",
    trace_back_to_dashboard: "डैशबोर्ड पर वापस लौटें",

    filter_search_placeholder: "शिकायत आईडी, खाता या एटीएम खोजें...",
    filter_time_label: "समय सीमा",
    filter_time_all: "सभी समय",
    filter_time_today: "आज (24 घंटे)",
    filter_time_1h: "पिछला 1 घंटा",
    filter_time_7d: "पिछले 7 दिन",
    filter_zone_label: "क्षेत्र मंडल",
    filter_zone_all: "सभी क्षेत्र (चेन्नई)",
    filter_zone_central: "मध्य चेन्नई (टी नगर / मायलापुर)",
    filter_zone_south: "दक्षिण चेन्नई (वेलाचेरी / तांबरम)",
    filter_zone_north: "उत्तर व पश्चिम (अन्ना नगर / पोरूर)",
    filter_crime_label: "अपराध श्रेणी",
    filter_crime_all: "सभी अपराध श्रेणियां",
    filter_crime_phishing: "यूपीआई फ़िशिंग घोटाला",
    filter_crime_mule: "म्यूल लेयरिंग गिरोह",
    filter_crime_investment: "निवेश / पोंजी धोखाधड़ी",
    filter_crime_atm: "अनधिकृत एटीएम निकासी",
    filter_status_label: "स्थिति",
    filter_status_all: "सभी",
    filter_status_pending: "कार्रवाई लंबित",
    filter_status_verified: "सत्यापित",
    filter_reset: "फ़िल्टर रीसेट",
    filter_showing: "दिखाए गए",
    filter_of: "कुल",
    filter_incidents: "घटनाएं",

    dossier_btn: "साक्ष्य डोजियर",
    dossier_title: "कानून प्रवर्तन जांच डोजियर",
    dossier_print_btn: "प्रिंट / पीडीएफ सहेजें",
    dossier_evidence_cert: "धारा 65B भारतीय साक्ष्य अधिनियम प्रमाणन",
    dossier_cert_body: "यह इलेक्ट्रॉनिक रिकॉर्ड कानून प्रवर्तन और न्यायिक कार्यवाही के लिए T.R.A.C.E. स्वचालित इंजन द्वारा तैयार किया गया है। डेटा हैश इसकी अखंडता सुनिश्चित करता है।",
    dossier_hash_label: "क्रिप्टोग्राफिक SHA-256 ऑडिट हैश",
    dossier_officer_sig: "जांच अधिकारी (हस्ताक्षर व बिल्ला संख्या)",
    dossier_station_stamp: "साइबर अपराध पुलिस स्टेशन मुहर",
  }
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('trace_lang') as Language;
    if (saved && (saved === 'en' || saved === 'ta' || saved === 'hi')) {
      return saved;
    }
    return 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('trace_lang', lang);
  };

  const value = {
    language,
    setLanguage,
    t: translations[language] || translations.en
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
