# ── CELL 5: Jurisdiction & Court Formats ─────────────────────────────────────
COURT_FORMATS = {
    "Sindh HC": {
        "full_name": "IN THE HIGH COURT OF SINDH AT KARACHI",
        "city":      "Karachi",
        "ag":        "Advocate General, Sindh",
        "home_sec":  "Home Secretary, Government of Sindh",
        "short":     "Sindh High Court"
    },
    "Lahore HC": {
        "full_name": "IN THE HIGH COURT OF LAHORE AT LAHORE",
        "city":      "Lahore",
        "ag":        "Advocate General, Punjab",
        "home_sec":  "Home Secretary, Government of Punjab",
        "short":     "Lahore High Court"
    },
    "Islamabad HC": {
        "full_name": "IN THE HIGH COURT OF ISLAMABAD",
        "city":      "Islamabad",
        "ag":        "Advocate General, Islamabad",
        "home_sec":  "Home Secretary, ICT Administration",
        "short":     "Islamabad High Court"
    },
    "Sessions Court Karachi": {
        "full_name": "IN THE COURT OF SESSIONS JUDGE, KARACHI",
        "city":      "Karachi",
        "ag":        "N/A",
        "home_sec":  "N/A",
        "short":     "Sessions Court Karachi"
    },
    "Sessions Court Lahore": {
        "full_name": "IN THE COURT OF SESSIONS JUDGE, LAHORE",
        "city":      "Lahore",
        "ag":        "N/A",
        "home_sec":  "N/A",
        "short":     "Sessions Court Lahore"
    }
}

STRATEGY_TEMPLATES = {
    "Habeas Corpus": """
STRATEGY: Habeas Corpus

CORE THEORY:
- Detention is illegal, mala fide, and without lawful authority
- No FIR / no warrant / no Magistrate production within 24 hours
- Article 9 (liberty) + Article 10 (arrest procedure) violated

MUST INCLUDE IN GROUNDS:
- Failure to produce before Magistrate within 24h (Article 10 + Section 61 CrPC)
- Plain-clothes/unidentified officers → unlawful arrest
- No detention order under any statute produced
- Call for production through SSP/IG chain of command

PRAYER MUST INCLUDE:
- "produce the detenu forthwith before this Honourable Court"
- "respondents submit para-wise comments"
- "intimate rank and identity of arresting officers"
- "interim order: produce detenu by [date]"

TONE:
- Urgent and alarming — "mala fide", "without lawful authority", "patent violation"
- Frame as constitutional emergency, not a routine application
""",

    "Post-Arrest Bail": """
STRATEGY: Post-Arrest Bail (Section 497 CrPC)

DETERMINE SEVERITY FIRST (injected via red_flags):
- HIGH severity: lead with Section 497(2) "further inquiry" route
- MEDIUM/LOW: lead with twin test (not flight risk, no previous record)

CORE THEORY:
- Bail is the rule, jail is the exception (Supreme Court consistent position)
- Continued detention is punitive, not preventive — violates Article 10A
- Investigation is incomplete — bail will not hamper it

MUST INCLUDE IN GROUNDS:
- "further inquiry within the meaning of Section 497(2) CrPC is required"
  (for HIGH-severity sections — this is the PRIMARY route)
- No direct incriminating evidence on record
- Applicant poses no flight risk — deep community ties, family, employment
- No previous criminal record
- Article 10A fair trial right — applicant needs access to counsel, documents
- Inordinate delay in investigation / arrest

PRAYER MUST INCLUDE:
- "admit the applicant to bail in the sum of Rs. ___ with surety of like amount"
- "interim bail during pendency of this application"
- "respondents submit challan / investigation report"

AVOID:
- Never say the offence is "not serious" if it is HIGH severity
- Do not conflate Section 497(1) and 497(2) tests
""",

    "Pre-Arrest Bail": """
STRATEGY: Pre-Arrest Bail (Section 498 CrPC)

KEY DOCTRINE:
- Pre-arrest bail is an EXTRAORDINARY remedy — concession not right
- Must show MALA FIDE / ULTERIOR MOTIVE behind FIR
- Must show arrest would cause irreparable harm

CORE THEORY:
- FIR is result of personal/civil dispute dressed as criminal complaint
- Registered with undue delay (showing afterthought and mala fide)
- Applicant is willing to cooperate with investigation — no flight risk

MUST INCLUDE IN GROUNDS:
- Delay in FIR registration + reason for delay (mala fide inference)
- Nature of dispute is civil/commercial — misuse of criminal process
- Applicant's willingness to cooperate (undertaking in prayer)
- Arrest would cause irreparable reputational + financial harm
- "extraordinary relief" + "no direct evidence" language

PRAYER MUST INCLUDE:
- "grant pre-arrest bail in the sum of Rs. ___ with surety"
- "applicant shall join investigation whenever called"
- "applicant shall not leave the country without court permission"
- "interim pre-arrest bail during pendency"
""",

    "Quashment": """
STRATEGY: Quashment of FIR (Article 199)

CORE THEORY:
- FIR discloses no cognizable offence on its face
- AND/OR FIR is mala fide — filed to harass, coerce, or extort
- This Court's inherent jurisdiction to prevent abuse of process

MUST INCLUDE IN GROUNDS:
- "FIR does not disclose ingredients of the alleged offence"
  (analyse each element of the section vs facts alleged)
- Complainant's motive — prior civil dispute, property matter, family feud
- Inordinate delay in reporting (belated FIR = mala fide)
- "permitting FIR to continue = abuse of process"
- Cite Supreme Court: mala fide FIRs must be quashed at earliest stage

PRAYER MUST INCLUDE:
- "quash/set aside FIR No. ___ dated ___ at ___ Police Station"
- "all consequential proceedings arising from impugned FIR"
- "interim: stay arrest of petitioner during pendency"
""",

    "Property/Encroachment": """
STRATEGY: Constitutional Petition (Property / SBCA / Encroachment)

UPDATED AUTHORITY NAME:
- Use "Sindh Building Control Authority (SBCA)" — KBCA was renamed
- Cite: Sindh Building Control Ordinance, 1979 (as amended)

CORE THEORY:
- Sealing/demolition without notice violates natural justice (audi alteram partem)
- Article 10A: right to be heard before adverse order
- Article 23: right to acquire and hold property

MUST INCLUDE IN GROUNDS:
- No show-cause notice issued before sealing/demolition order
- Petitioner was not heard — violation of audi alteram partem
- Authority acted ultra vires its statutory mandate
- Cite SBCO 1979 — specific sections on notice and hearing requirements
- Economic loss + fundamental rights violation

PRAYER MUST INCLUDE (CRITICAL — INTERIM RELIEF):
- "suspend operation of impugned sealing/demolition order"
- "de-seal the premises forthwith"
- "respondents not to interfere with petitioner's possession during pendency"
- "show cause why petition should not be allowed"
""",
}

CITATION_TIER_MAP = {
    "PLD":   1,   # Pakistan Legal Decisions — highest authority
    "SCMR":  2,   # Supreme Court Monthly Review
    "YLR":   3,   # Yearly Law Reporter
    "CLC":   4,   # Civil Law Cases
    "CPLA":  5,   # Civil Petition for Leave to Appeal — WEAKEST (not a judgment)
    "MLD":   4,
}


BAIL_STRATEGY_MAP = {
    "HIGH": {
        "approach": "exceptional circumstances + further inquiry",
        "key_points": [
            "no direct incriminating evidence",
            "further inquiry required under Section 497(2) CrPC",
            "applicant poses no flight risk + has deep community ties",
            "complainant's version uncorroborated",
            "section is not a bar to bail — bail is the rule (AIR 1977 SC)",
        ],
        "avoid": "never argue the offence is 'not serious' — concede seriousness, argue circumstances",
    },
    "MEDIUM": {
        "approach": "mala fide + twin test",
        "key_points": [
            "no previous criminal record",
            "not a flight risk",
            "FIR registered with delay — suggests mala fide",
            "dispute is civil/commercial in nature",
        ],
        "avoid": "do not overclaim — focus on twin test criteria",
    },
    "LOW": {
        "approach": "straightforward bail — bailable offence",
        "key_points": [
            "offence is bailable as of right",
            "bail cannot be withheld for bailable offence",
            "Section 496 CrPC: bail is mandatory",
        ],
        "avoid": "none",
    },
}

INTERIM_RELIEF_MAP = {
    "Habeas Corpus": """i. This Honourable Court may be pleased to issue a Rule Nisi calling upon the Respondents to show cause why the detenu should not be released forthwith;
ii. During the pendency of the above rule, the Respondents be directed to produce the detenu before this Honourable Court on the next date of hearing;
iii. The Respondents be directed to intimate this Honourable Court of the place of detention and the identity and rank of the arresting/detaining officers forthwith;
iv. Any other interim order this Honourable Court may deem fit in the interest of justice.""",

    "Post-Arrest Bail": """i. The Applicant be admitted to interim bail during the pendency of this application, on such terms and conditions as this Honourable Court may deem fit;
ii. The Investigating Officer be directed to submit the investigation report / challan before the next date of hearing;
iii. Any other interim relief this Honourable Court deems appropriate.""",

    "Pre-Arrest Bail": """i. The Applicant be granted interim pre-arrest bail forthwith during the pendency of this application;
ii. The Respondents be restrained from arresting the Applicant during the pendency of this application;
iii. Subject to grant of bail, the Applicant undertakes to join investigation whenever called upon and shall not leave the country without prior permission of this Honourable Court;
iv. Any other interim order this Honourable Court may deem fit.""",

    "Quashment": """i. During the pendency of this petition, the Respondents be restrained from arresting the Petitioner in pursuance of the impugned FIR;
ii. A Rule Nisi be issued calling upon the Respondents to show cause why the impugned FIR should not be quashed;
iii. Any consequential proceedings arising from the impugned FIR be stayed during pendency;
iv. Any other interim relief this Honourable Court deems fit.""",

    "Property/Encroachment": """i. During the pendency of this petition, the operation of the impugned sealing/demolition order be suspended forthwith;
ii. The Respondents be directed to de-seal the premises of the Petitioner and restore possession immediately;
iii. The Respondents be restrained from causing any further damage, encroachment, or interference with the Petitioner's property during pendency;
iv. A Rule Nisi be issued calling upon the Respondents to show cause why the impugned order be not set aside;
v. Any other interim relief this Honourable Court deems fit in the interest of justice.""",
}

SECTION_SEVERITY = {
    # PPC sections — seriousness tier
    "302": ("non-bailable", "murder", "HIGH"),
    "324": ("non-bailable", "attempt to murder", "HIGH"),
    "392": ("non-bailable", "robbery", "HIGH"),
    "395": ("non-bailable", "dacoity", "HIGH"),
    "409": ("non-bailable", "criminal breach of trust", "HIGH"),
    "411": ("non-bailable", "receiving stolen property", "MEDIUM"),
    "420": ("bailable", "cheating/fraud", "MEDIUM"),
    "489-F": ("non-bailable", "dishonoured cheque", "MEDIUM"),
    "506": ("bailable", "criminal intimidation", "LOW"),
    "447": ("bailable", "criminal trespass", "LOW"),
    "337": ("bailable", "hurt", "LOW"),
    "379": ("non-bailable", "theft", "MEDIUM"),
    "376": ("non-bailable", "rape", "HIGH"),
    "354": ("non-bailable", "assault on woman", "HIGH"),
    "7-ATA": ("non-bailable", "Anti-Terrorism Act offence", "HIGH"),
    "9-CNS": ("non-bailable", "Control of Narcotic Substances Act", "HIGH"),
}
