import type { Character } from "./types";

export interface InfoItem {
  topic: string;
  text: string;
}

/**
 * Active investigation yields (per location).
 */
export const INVESTIGATION_POOL: Record<
  string,
  InfoItem[]
> = {
  campus: [
    {
      topic: "recruit",
      text: "Posters for a private paid research program target top engineering students.",
    },
    {
      topic: "recruit",
      text: "A student describes being approached by a company recruiter after class.",
    },
  ],
  "campus-cafe": [
    {
      topic: "recruit",
      text: "Recruited students are instructed never to discuss the program publicly.",
    },
  ],
  "company-office": [
    {
      topic: "evidence",
      text: "Documents reference a student pilot cohort with undisclosed terms.",
    },
    {
      topic: "evidence",
      text: "Emails suggest the company monitors students who ask questions.",
    },
  ],
};

/**
 * Passive/environmental yields (per location):
 * things visible or overheard without deep digging.
 */
export const SEARCH_POOL: Record<
  string,
  InfoItem[]
> = {
  campus: [
    {
      topic: "company",
      text: "A discarded envelope with the company logo near the faculty noticeboard.",
    },
    {
      topic: "recruit",
      text: "A flyer for paid campus research with a phone number.",
    },
  ],
  "campus-cafe": [
    {
      topic: "company",
      text: "A napkin with the company office address scribbled on it.",
    },
    {
      topic: "recruit",
      text: "Overheard: a student complaining about a company NDA.",
    },
  ],
  "company-office": [
    {
      topic: "evidence",
      text: "A visitor log lists several student names.",
    },
    {
      topic: "company",
      text: "Boxes of branded merchandise marked for campus distribution.",
    },
  ],
};

export const LOCATION_RISK: Record<
  string,
  number
> = {
  campus: 25,
  "campus-cafe": 20,
  "company-office": 55,
};

export function locationRisk(
  locationId: string
): number {
  return (
    LOCATION_RISK[locationId] ?? 25
  );
}

/**
 * Pool items the character does not already know.
 * This is what makes repeated INVESTIGATE/SEARCH
 * lose value honestly: the pool, not a day counter.
 */
export function getUnknownItems(
  pool: Record<string, InfoItem[]>,
  locationId: string,
  character: Character
): InfoItem[] {
  return (
    pool[locationId] ?? []
  ).filter(
    (item) =>
      !character.knowledge.includes(
        item.text
      )
  );
}
