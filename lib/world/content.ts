import type {
  Belief,
  Character,
  Fact,
  Goal,
  Id,
  Location,
  Organization,
  Traits,
  World,
  WorldObject,
} from "./types";

function fact(f: Partial<Fact> & Pick<Fact, "id" | "text" | "truth" | "topics">): Fact {
  return { secret: false, ...f };
}

function beliefs(entries: [Id, number][]): Record<Id, Belief> {
  const out: Record<Id, Belief> = {};
  for (const [factId, confidence] of entries) {
    out[factId] = {
      factId,
      confidence,
      source: "initial",
      day: 0,
      corroboration: confidence >= 70 ? 2 : 1,
    };
  }
  return out;
}

function rels(entries: [Id, number, number][]): Character["relationships"] {
  const out: Character["relationships"] = {};
  for (const [id, trust, suspicion] of entries) out[id] = { trust, suspicion };
  return out;
}

function goal(g: Goal): Goal {
  return g;
}

function traits(
  curiosity: number,
  caution: number,
  loyalty: number,
  ambition: number,
  credulity: number,
  courage: number
): Traits {
  return { curiosity, caution, loyalty, ambition, credulity, courage };
}

const ACTIVITY_ZARA = "activity:zara:investigating";

export function createFacts(): Record<Id, Fact> {
  const list: Fact[] = [
    fact({
      id: "company.harms_students",
      text: "The company's program isolates the students it recruits and pressures them into silence",
      truth: true,
      topics: ["company", "harm", "students"],
      secret: true,
      threatens: "company",
    }),
    fact({
      id: "company.pays_informants",
      text: "The company pays students to identify anyone who investigates it",
      truth: true,
      topics: ["company", "informants"],
      secret: true,
      threatens: "company",
    }),
    fact({
      id: "daniel.is_informant",
      text: "Daniel is reporting on students to the company",
      truth: true,
      topics: ["daniel", "informants", "company"],
      secret: true,
      about: "daniel",
      valence: -1,
    }),
    fact({
      id: "company.approaches_privately",
      text: "The company approaches students privately",
      truth: true,
      topics: ["company", "recruit"],
    }),
    fact({
      id: "company.research_program",
      text: "The company has launched a paid student research program",
      truth: true,
      topics: ["company", "program", "recruit"],
    }),
    fact({
      id: "students.isolated",
      text: "Students recruited by the company have cut off friends and family",
      truth: true,
      topics: ["students", "harm", "company"],
      threatens: "company",
    }),
    fact({
      id: "uni.funding_dependence",
      text: "The university's research funding depends on the company's partnership",
      truth: true,
      topics: ["university", "funding"],
      threatens: "university",
    }),
    fact({
      id: "rumor.data_breach",
      text: "The company leaked students' phone data",
      truth: false,
      topics: ["company", "harm", "data"],
      threatens: "company",
    }),
    fact({
      id: ACTIVITY_ZARA,
      text: "Zara is investigating the company",
      truth: true,
      topics: ["activity", "company", "investigation"],
      about: "zara",
      hostileTo: "company",
    }),
  ];
  const out: Record<Id, Fact> = {};
  for (const f of list) out[f.id] = f;
  return out;
}

export function createLocations(): Record<Id, Location> {
  const list: Location[] = [
    {
      id: "campus",
      name: "University Campus",
      purpose: "Central quad where students cross paths, news travels and recruiters can be seen",
      affordances: ["public", "social", "recruit", "news", "publish"],
      connectedTo: ["campus-cafe", "library", "faculty", "hostel", "company-office"],
      privacy: 25,
      security: 0,
    },
    {
      id: "campus-cafe",
      name: "Campus Café",
      purpose: "Busy café where conversations attract little attention",
      affordances: ["private-talk", "social"],
      connectedTo: ["campus", "company-office", "library"],
      privacy: 55,
      security: 0,
    },
    {
      id: "library",
      name: "Library",
      purpose: "Research, records and quiet meetings",
      affordances: ["research", "evidence", "private-talk", "academic"],
      connectedTo: ["campus", "campus-cafe", "faculty"],
      privacy: 60,
      security: 0,
    },
    {
      id: "faculty",
      name: "Faculty Building",
      purpose: "Lecturers, departmental politics and student recruiting",
      affordances: ["academic", "recruit", "faculty"],
      connectedTo: ["campus", "library", "research-facility"],
      privacy: 45,
      security: 10,
    },
    {
      id: "hostel",
      name: "Student Hostel",
      purpose: "Private conversations, hiding, unexpected encounters",
      affordances: ["private-talk", "rest", "social"],
      connectedTo: ["campus"],
      privacy: 85,
      security: 0,
    },
    {
      id: "company-office",
      name: "Company Office",
      purpose: "Company staff, files and danger",
      affordances: ["evidence", "company", "program"],
      connectedTo: ["campus", "campus-cafe", "research-facility"],
      privacy: 90,
      security: 60,
      controlledBy: "company",
    },
    {
      id: "research-facility",
      name: "Research Facility",
      purpose: "Where the program actually runs",
      affordances: ["program", "evidence", "company"],
      connectedTo: ["company-office", "faculty"],
      privacy: 92,
      security: 75,
      controlledBy: "company",
    },
  ];
  const out: Record<Id, Location> = {};
  for (const l of list) out[l.id] = l;
  return out;
}

export function createObjects(): Record<Id, WorldObject> {
  const list: WorldObject[] = [
    {
      id: "internal-memo",
      name: "internal memo",
      locationId: "company-office",
      factIds: ["company.harms_students"],
      confidenceOnRead: 80,
      readBy: [],
    },
    {
      id: "payment-ledger",
      name: "payment ledger",
      locationId: "company-office",
      factIds: ["company.pays_informants", "daniel.is_informant"],
      confidenceOnRead: 75,
      readBy: [],
    },
    {
      id: "program-files",
      name: "program files",
      locationId: "research-facility",
      factIds: ["company.harms_students", "students.isolated"],
      confidenceOnRead: 85,
      readBy: [],
    },
    {
      id: "funding-contract",
      name: "funding contract",
      locationId: "library",
      factIds: ["uni.funding_dependence"],
      confidenceOnRead: 80,
      readBy: [],
    },
    {
      id: "student-forum-thread",
      name: "student forum thread",
      locationId: "hostel",
      factIds: ["students.isolated"],
      confidenceOnRead: 50,
      readBy: [],
    },
    {
      id: "leaked-documents",
      name: "leaked documents",
      locationId: null, // surfaces via world event
      factIds: ["company.harms_students", "company.pays_informants"],
      confidenceOnRead: 65,
      readBy: [],
    },
  ];
  const out: Record<Id, WorldObject> = {};
  for (const o of list) out[o.id] = o;
  return out;
}

function org(o: Partial<Organization> & Pick<Organization, "id" | "name" | "kind">): Organization {
  return {
    funds: 50,
    influence: 40,
    secrecy: 30,
    scrutiny: 10,
    demand: 0,
    pool: {},
    leverage: {},
    ...o,
  };
}

export function createOrgs(): Record<Id, Organization> {
  const company = org({
    id: "company",
    name: "The Company",
    kind: "company",
    funds: 60,
    influence: 55,
    secrecy: 70,
    scrutiny: 8,
    leverage: { daniel: 60, okafor: 80, tobi: 35 },
    pool: {
      [ACTIVITY_ZARA]: {
        factId: ACTIVITY_ZARA,
        confidence: 45,
        source: "initial",
        day: 0,
        corroboration: 1,
      },
    },
  });
  const university = org({
    id: "university",
    name: "University of Lagos",
    kind: "university",
    funds: 40,
    influence: 50,
    secrecy: 20,
    scrutiny: 5,
  });
  const association = org({
    id: "student-association",
    name: "Student Association",
    kind: "association",
    funds: 15,
    influence: 25,
    secrecy: 5,
    scrutiny: 0,
  });
  const group = org({
    id: "investigation-group",
    name: "Student Investigation Group",
    kind: "group",
    funds: 5,
    influence: 10,
    secrecy: 80,
    scrutiny: 0,
  });
  return {
    [company.id]: company,
    [university.id]: university,
    [association.id]: association,
    [group.id]: group,
  };
}

export function createCharacters(): Record<Id, Character> {
  const base = () => ({
    stress: 20,
    alarm: 5,
    lastActions: [],
    lastTalkDay: {},
    stayDays: 0,
    visits: {},
  });

  const zara: Character = {
    ...base(),
    id: "zara",
    name: "Zara",
    role: "Student investigator",
    traits: traits(85, 45, 60, 55, 50, 60),
    goals: [
      goal({
        id: "zara-uncover",
        text: "Discover what the company is doing and whether students are being harmed",
        topics: ["company", "harm", "students"],
        wantedFacts: ["company.harms_students", "students.isolated", "company.pays_informants"],
        weight: 90,
        affordances: ["evidence", "research", "recruit", "private-talk"],
      }),
      goal({
        id: "zara-daniel",
        text: "Find out what Daniel is hiding",
        topics: ["daniel", "informants"],
        wantedFacts: ["daniel.is_informant"],
        weight: 50,
        affordances: ["private-talk", "social"],
      }),
    ],
    fear: { text: "The company discovers she is investigating them", orgId: "company" },
    expertise: ["students", "campus"],
    capabilities: ["observe", "investigate", "publish"],
    location: "campus",
    beliefs: beliefs([
      ["company.approaches_privately", 75],
      ["students.isolated", 60],
    ]),
    relationships: rels([
      ["daniel", 45, 55],
      ["femi", 50, 10],
      ["tobi", 40, 10],
      ["amara", 50, 10],
      ["okafor", 10, 45],
    ]),
    orgIds: ["investigation-group"],
    secretFactIds: [],
  };

  const daniel: Character = {
    ...base(),
    id: "daniel",
    name: "Daniel",
    role: "Student and company contact",
    traits: traits(40, 70, 75, 50, 40, 35),
    goals: [
      goal({
        id: "daniel-family",
        text: "Protect his family while keeping financial security",
        topics: ["family", "company"],
        wantedFacts: [],
        weight: 70,
        affordances: ["campus", "social", "private-talk"],
      }),
      goal({
        id: "daniel-zara",
        text: "Stay close to Zara without betraying her",
        topics: ["zara"],
        wantedFacts: [],
        weight: 45,
        affordances: ["social", "private-talk"],
      }),
    ],
    fear: { text: "The company harms his family if he disobeys", orgId: "company" },
    expertise: ["students", "company"],
    capabilities: ["persuade", "conceal"],
    location: "campus",
    beliefs: beliefs([
      ["company.pays_informants", 100],
      ["daniel.is_informant", 100],
      ["company.approaches_privately", 100],
      ["students.isolated", 70],
      [ACTIVITY_ZARA, 90],
    ]),
    relationships: rels([
      ["zara", 60, 40],
      ["tobi", 70, 5],
      ["okafor", 35, 50],
      ["femi", 45, 15],
      ["amara", 50, 10],
    ]),
    orgIds: ["company"],
    secretFactIds: ["company.pays_informants", "daniel.is_informant"],
    stress: 45,
    alarm: 25,
  };

  const femi: Character = {
    ...base(),
    id: "femi",
    name: "Femi",
    role: "Student journalist",
    traits: traits(80, 35, 45, 80, 65, 75),
    goals: [
      goal({
        id: "femi-story",
        text: "Find a story about the company worth publishing",
        topics: ["company", "harm"],
        wantedFacts: [
          "company.harms_students",
          "students.isolated",
          "company.pays_informants",
          "uni.funding_dependence",
        ],
        weight: 85,
        affordances: ["evidence", "research", "news", "public"],
      }),
    ],
    fear: { text: "Publishing something false and losing credibility" },
    expertise: ["news", "campus"],
    capabilities: ["publish", "observe"],
    location: "campus-cafe",
    beliefs: beliefs([["company.approaches_privately", 40]]),
    relationships: rels([
      ["zara", 40, 10],
      ["daniel", 45, 15],
      ["tobi", 45, 10],
      ["amara", 55, 5],
      ["okafor", 30, 25],
    ]),
    orgIds: [],
    secretFactIds: [],
  };

  const tobi: Character = {
    ...base(),
    id: "tobi",
    name: "Tobi",
    role: "Recruited student (Daniel's friend)",
    traits: traits(35, 65, 70, 60, 55, 30),
    goals: [
      goal({
        id: "tobi-place",
        text: "Keep his place and stipend in the research program",
        topics: ["program", "company"],
        wantedFacts: [],
        weight: 75,
        affordances: ["program", "company"],
      }),
      goal({
        id: "tobi-friends",
        text: "Stay connected to his friends",
        topics: ["students"],
        wantedFacts: [],
        weight: 40,
        affordances: ["social", "private-talk"],
      }),
    ],
    fear: { text: "Losing his place and stipend", orgId: "company" },
    expertise: ["program", "students"],
    capabilities: [],
    location: "research-facility",
    beliefs: beliefs([
      ["company.harms_students", 55],
      ["students.isolated", 70],
      ["company.approaches_privately", 100],
    ]),
    relationships: rels([
      ["daniel", 70, 5],
      ["zara", 40, 10],
      ["femi", 45, 10],
      ["okafor", 55, 25],
    ]),
    orgIds: ["company"],
    secretFactIds: ["students.isolated", "company.harms_students"],
    stress: 40,
  };

  const okafor: Character = {
    ...base(),
    id: "okafor",
    name: "Mrs. Okafor",
    role: "Company recruiter",
    traits: traits(55, 60, 85, 70, 30, 55),
    goals: [
      goal({
        id: "okafor-program",
        text: "Recruit eligible students and protect the program",
        topics: ["company", "recruit", "program"],
        wantedFacts: ["activity:*:investigating"],
        weight: 80,
        affordances: ["recruit", "public", "company"],
      }),
    ],
    fear: { text: "An investigation derails the program", orgId: "company" },
    expertise: ["company", "program", "recruit"],
    capabilities: ["recruit", "report"],
    location: "company-office",
    beliefs: beliefs([
      [ACTIVITY_ZARA, 70],
      ["company.pays_informants", 100],
      ["company.harms_students", 70],
      ["company.approaches_privately", 100],
    ]),
    relationships: rels([
      ["zara", 10, 55],
      ["daniel", 50, 20],
      ["tobi", 55, 10],
      ["femi", 25, 35],
      ["amara", 40, 20],
    ]),
    orgIds: ["company"],
    secretFactIds: ["company.pays_informants", "company.harms_students"],
  };

  const amara: Character = {
    ...base(),
    id: "amara",
    name: "Dr. Amara",
    role: "Lecturer",
    traits: traits(55, 70, 60, 40, 45, 40),
    goals: [
      goal({
        id: "amara-students",
        text: "Protect her students and her career",
        topics: ["students", "university", "funding"],
        wantedFacts: ["uni.funding_dependence", "students.isolated"],
        weight: 60,
        affordances: ["faculty", "academic"],
      }),
    ],
    fear: { text: "Losing her position", orgId: "university" },
    expertise: ["university", "funding", "academic"],
    capabilities: ["teach"],
    location: "faculty",
    beliefs: beliefs([["uni.funding_dependence", 40]]),
    relationships: rels([
      ["zara", 55, 10],
      ["daniel", 50, 10],
      ["femi", 55, 5],
      ["tobi", 50, 10],
      ["okafor", 35, 25],
    ]),
    orgIds: ["university"],
    secretFactIds: [],
  };

  return {
    zara,
    daniel,
    femi,
    tobi,
    okafor,
    amara,
  };
}

export function createWorld(
  seed = 1,
  mutate?: (w: World) => void
): World {
  const w: World = {
    seed,
    day: 1,
    facts: createFacts(),
    characters: createCharacters(),
    orgs: createOrgs(),
    locations: createLocations(),
    objects: createObjects(),
    publicAwareness: {},
    firedEvents: {},
    flags: {
      eligibleStudents: 0,
      recruitedCount: 0,
      companyBreach: 0,
      universityDependence: 50,
      examWeekUntil: -1,
      reviewOpen: -1,
    },
    traces: [],
    log: [],
  };
  for (const c of Object.values(w.characters)) {
    c.visits[c.location] = 1;
  }
  mutate?.(w);
  return w;
}
