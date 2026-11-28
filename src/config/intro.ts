/** The opening story slides. A stand-in until the first chapter exists. */
export type SlideArt = 'ship' | 'shadow' | 'pod' | 'fall' | 'found' | 'dawn';

export interface Slide {
  art: SlideArt;
  lines: readonly string[];
}

export const INTRO: readonly Slide[] = [
  {
    art: 'ship',
    lines: ["YOUR PARENTS' CARGO SHIP, FAR OUT AMONG THE STARS.", 'IT WAS THE ONLY HOME YOU KNEW.'],
  },
  {
    art: 'shadow',
    lines: ['THEN A PIRATE SHIP BLOTTED OUT THE STARS.'],
  },
  {
    art: 'pod',
    lines: ['THEY SEALED YOU INTO THE ESCAPE POD.', 'THERE WAS ROOM FOR ONLY ONE.'],
  },
  {
    art: 'fall',
    lines: ['THE POD FELL TOWARDS A PLANET', 'HALF IN FIRE, HALF IN NIGHT.'],
  },
  {
    art: 'found',
    lines: ['HEADLIGHTS FOUND YOU IN THE SAND.', 'THEY BELONGED TO YOUR UNCLE.'],
  },
  {
    art: 'dawn',
    lines: ['"NIGHT LASTS A WEEK HERE," HE SAID.', "\"DON'T LET THE SUNRISE CATCH YOU.\""],
  },
];
