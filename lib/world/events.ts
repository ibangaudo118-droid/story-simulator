import { makeRng, type Rng } from "./rng";
import { announce, clamp, learn, log } from "./ops";
import type { World } from "./types";

export interface EventDef {
  id: string;
  title: string;
  maxTimes: number;
  /** Exogenous events must depend only on (seed, day) so they fire identically across variants. */
  exogenous: boolean;
  trigger(w: World, rng: Rng): boolean;
  apply(w: World, rng: Rng): string[];
}

export const EVENTS: EventDef[] = [
  {
    id: "research-program-announced",
    title: "The company announces a paid student research program",
    maxTimes: 1,
    exogenous: true,
    trigger: (w, rng) => w.day >= 6 && (w.day >= 9 || rng.chance(0.4)),
    apply: (w) => {
      const company = w.orgs.company;
      w.flags.eligibleStudents = 20;
      company.funds += 15;
      company.influence += 5;
      company.secrecy += 6;
      announce(w, "company.research_program", 75, 85, "witnessed");
      w.characters.okafor.location = "campus";
      w.orgs["student-association"].demand += 10;
      company.leverage.daniel = (company.leverage.daniel ?? 0) + 10;
      return [
        "20 students become eligible for the program",
        "Mrs. Okafor begins recruiting on campus",
        "The Student Association starts asking questions",
        "Daniel is offered a paid liaison role",
        "The company polishes its public image, making investigation harder",
      ];
    },
  },
  {
    id: "exam-week",
    title: "Exam week begins",
    maxTimes: 1,
    exogenous: true,
    trigger: (w, rng) => w.day >= 14 && (w.day >= 20 || rng.chance(0.25)),
    apply: (w) => {
      w.flags.examWeekUntil = w.day + 6;
      return ["Students are stressed for a week", "The library is crowded and loses its privacy"];
    },
  },
  {
    id: "documents-surface",
    title: "Unmarked documents about the program surface in the library",
    maxTimes: 1,
    exogenous: true,
    trigger: (w, rng) => w.day >= 12 && rng.chance(0.03),
    apply: (w) => {
      w.objects["leaked-documents"].locationId = "library";
      return ["Anyone who finds the documents gets evidence without entering company property"];
    },
  },
  {
    id: "lecturer-queries-funding",
    title: "The university asks Dr. Amara to keep quiet about the partnership",
    maxTimes: 1,
    exogenous: true,
    trigger: (w, rng) => w.day >= 10 && rng.chance(0.05),
    apply: (w) => {
      learn(w, "amara", "uni.funding_dependence", 75, "document");
      w.characters.amara.alarm += 12;
      return ["Dr. Amara learns how dependent the university is on the company", "Dr. Amara is rattled"];
    },
  },
  {
    id: "data-leak-rumor",
    title: "A rumor spreads that the company leaked student phone data",
    maxTimes: 2,
    exogenous: true,
    trigger: (w, rng) => w.day >= 8 && rng.chance(0.04),
    apply: (w) => {
      announce(w, "rumor.data_breach", 35, 55, "rumor");
      w.orgs.company.scrutiny += 6;
      return ["The rumor is false, but credulous people believe it more readily", "Company scrutiny rises"];
    },
  },
  {
    id: "funding-cut",
    title: "The university loses a government grant",
    maxTimes: 1,
    exogenous: true,
    trigger: (w, rng) => w.day >= 18 && rng.chance(0.03),
    apply: (w) => {
      w.flags.universityDependence += 20;
      return ["The university leans harder on the company partnership"];
    },
  },
  {
    id: "security-audit",
    title: "The company brings in an external security review",
    maxTimes: 1,
    exogenous: false,
    trigger: (w, rng) =>
      w.orgs.company.scrutiny >= 35 || (w.day >= 30 && rng.chance(0.04)),
    apply: (w) => {
      for (const id of ["company-office", "research-facility"]) {
        w.locations[id].security += 12;
      }
      w.orgs.company.secrecy += 8;
      return ["Security tightens at the office and research facility"];
    },
  },
  {
    id: "students-go-silent",
    title: "Recruited students visibly go quiet",
    maxTimes: 3,
    exogenous: false,
    trigger: (w) =>
      w.flags.recruitedCount >= 8 * ((w.firedEvents["students-go-silent"] ?? 0) + 1),
    apply: (w) => {
      announce(w, "students.isolated", 25, 45, "rumor");
      w.orgs["student-association"].demand += 12;
      return ["Friends notice recruited students withdrawing", "The Student Association's demands grow"];
    },
  },
  {
    id: "audit-findings",
    title: "The university review publishes concerns about the program",
    maxTimes: 1,
    exogenous: false,
    trigger: (w) => w.flags.reviewOpen >= 0 && w.day - w.flags.reviewOpen >= 8,
    apply: (w) => {
      announce(w, "students.isolated", 40, 60, "published");
      w.orgs.company.scrutiny += 15;
      w.orgs.company.secrecy -= 15;
      return ["Company scrutiny jumps", "The company's secrecy erodes"];
    },
  },
];

export function runWorldEvents(w: World): void {
  for (const def of EVENTS) {
    const fired = w.firedEvents[def.id] ?? 0;
    if (fired >= def.maxTimes) continue;
    const rng = makeRng(w.seed, w.day, "event", def.id);
    if (!def.trigger(w, rng)) continue;
    w.firedEvents[def.id] = fired + 1;
    const data: Record<string, unknown> = { eventId: def.id, consequences: [] as string[] };
    log(w, { kind: "WORLD_EVENT", text: def.title, data });
    data.consequences = def.apply(w, rng);
  }
  w.orgs.company.scrutiny = clamp(w.orgs.company.scrutiny);
}
