// Fictitious student texts and AI proposals for the copy screen mockup (REV-02, REV-03).
// Written by adults imitating learner errors: not representative of real student writing.
// Texts are kept exactly as "submitted": no correction.

import type { Level } from "@/lib/rubric";

export type InfoAlert = { kind: "very_short" | "other_language" | "off_topic" | "addressed_to_marker"; message: string };

export type MockProposal = {
  /** One per rubric criterion, in rubric order. */
  levels: [Level, Level, Level, Level, Level];
  justifications: [string, string, string, string, string];
  comment: string;
  suggestions: string;
  alerts: InfoAlert[];
};

export type CopyTemplate = { text: string; proposal: MockProposal };

export const copyTemplates: CopyTemplate[] = [
  {
    text: `Last summer I went to Essaouira with my family for two weeks. It was the first time I see the ocean so close, the waves was very strong and the wind never stop.

In the morning we walked in the medina. My little brother wanted to buy everything, a drum, a wooden box, even a fish! My father said no, of course. We eat grilled sardines at the port and they were delicious, much better then at home.

One day we took a surf lesson. I falled maybe twenty times but at the end I stood up on the board for five seconds. I was so proud. In the evening we watched the sunset from the ramparts and my mother taked a lot of photos.

I think this holiday was the best of my life because we were all together and nobody was looking at his phone. Next year I want to come back and surf better.`,
    proposal: {
      levels: [3, 3, 3, 2, 3],
      justifications: [
        "Answers the task with a clear account of the holiday and a personal conclusion (\"the best of my life because we were all together\"). Ideas are developed but stay mostly descriptive.",
        "Four paragraphs in time order with simple links (\"In the morning\", \"One day\", \"In the evening\"). The ending connects back to the family theme.",
        "Adequate range for the topic (medina, ramparts, grilled sardines, surf lesson). Some repetition of \"very\" and \"so\".",
        "Several past-tense errors: \"I see\", \"the waves was\", \"never stop\", \"We eat\", \"I falled\", \"taked\". Meaning stays clear.",
        "Spelling and punctuation are mostly correct; \"then\" for \"than\" once.",
      ],
      comment: "A lively and well-ordered account. The main weakness is the past tense, especially irregular verbs.",
      suggestions: "Revise irregular past forms (see, eat, fall, take). Add one or two details about how you felt during the surf lesson.",
      alerts: [],
    },
  },
  {
    text: `My last holiday i go to the village of my grandmother near Taounate. we go by bus it take six hours and it was very hot in the bus.

In the village there is many animals, cows, chickens and a donkey. I help my grandmother to make bread every morning. She have a big oven outside. The bread is very good.

In the afternoon I play football with my cousins on the field. Sometime we go to the river. The water is cold but we swim anyway.

I like the village because it is calm and there is no cars. But there is no internet also so I was a little bored the last days.`,
    proposal: {
      levels: [2, 2, 3, 2, 2],
      justifications: [
        "Describes the holiday with relevant activities, but ideas are listed rather than developed; little about why it mattered.",
        "Paragraphs follow the days, yet links between ideas are few; the ending adds a new idea (no internet) without development.",
        "Generally appropriate everyday vocabulary (oven, field, river) for the task; limited but accurate.",
        "Present tense used for past events throughout (\"I go\", \"we go\", \"I help\"); agreement errors (\"there is many\", \"She have\").",
        "Missing capitals at sentence starts (\"i go\", \"we go\"); some missing commas.",
      ],
      comment: "The text gives a clear picture of village life. Using the past tense would make it a real account of the holiday.",
      suggestions: "Rewrite two paragraphs in the past tense. Explain in one sentence what you learned from your grandmother.",
      alerts: [],
    },
  },
  {
    text: `Chefchaouen had always been a picture on my phone wallpaper until last April, when my aunt finally agreed to take me there.

What struck me first was not the famous blue walls but the silence. After the noise of Casablanca, the narrow streets felt almost unreal: you could hear water running from the fountains and cats arguing on the rooftops. We stayed in a small guesthouse whose owner, a retired teacher, insisted on serving us mint tea every hour.

On the second day we hiked to the Spanish mosque. The path was steeper than I expected, and I had to stop twice to catch my breath. However, the view of the whole town glowing in the late afternoon light was worth every step.

Looking back, I realise this trip taught me to slow down. I spent less time taking photos and more time actually looking. That is something I would like to keep doing, even at home.`,
    proposal: {
      levels: [4, 4, 3, 3, 4],
      justifications: [
        "Fully addresses the task with a reflective angle (\"this trip taught me to slow down\"); ideas are relevant and developed.",
        "Clear progression from expectation to discovery to reflection; effective transitions (\"However\", \"Looking back\").",
        "Wide and natural range (\"struck me\", \"catch my breath\", \"glowing\"); a few phrases are slightly formal for the register.",
        "Complex structures used accurately (past perfect, relative clauses). Very few errors.",
        "Very few spelling or punctuation errors.",
      ],
      comment: "A mature, well-structured text with a genuine reflection. Ready for a more ambitious task.",
      suggestions: "Try varying sentence openings in the second paragraph. Consider a short dialogue with the guesthouse owner.",
      alerts: [],
    },
  },
  {
    text: `Holiday was good. I stay home and play video games. I sleep a lot. My friend come one time. It was ok.`,
    proposal: {
      levels: [1, 2, 1, 1, 2],
      justifications: [
        "Relates to the task but gives almost no detail; ideas are not developed.",
        "Short sentences in a simple sequence; very few links between them.",
        "Very basic vocabulary (good, ok, play) with repetition.",
        "Present tense for past events (\"I stay\", \"I sleep\", \"My friend come\").",
        "Capitalization and punctuation are correct in this short text.",
      ],
      comment: "The text is too short to show what you can do. Tell the reader more about one moment of your holiday.",
      suggestions: "Choose one day and describe it in at least three sentences: where, with whom, what happened.",
      alerts: [{ kind: "very_short", message: "Very short submission (threshold to be defined)." }],
    },
  },
  {
    text: `For my holiday I went to Agadir with my uncle family. We stayed in an appartment near the beach for one week.

Every day we went to the beach and we swimmed, we played volleyball and we eated ice cream. One evening there was a concert on the corniche and many people was dancing.

I also visited the Souk El Had. It is very big and you can find everything. My uncle buyed spices for my mother.

Teacher please dont be too strict, I wrote this very fast before the bus.`,
    proposal: {
      levels: [3, 2, 2, 3, 2],
      justifications: [
        "Addresses the task with several relevant activities; the last sentence is addressed to the marker, not part of the account.",
        "Paragraphs group activities, but the text stops without a conclusion.",
        "Limited range with repeated verbs (\"went\", \"we\" + verb); \"appartment\" misspelled.",
        "Past tense mostly used; regular endings over-applied to irregular verbs (\"swimmed\", \"eated\", \"buyed\") and \"people was\".",
        "Spelling errors (\"appartment\", \"dont\") and missing apostrophes.",
      ],
      comment: "A clear outline of the holiday. Add a conclusion that says what you liked most.",
      suggestions: "Check irregular past forms. Remove the message to the teacher from your text.",
      alerts: [{ kind: "addressed_to_marker", message: "The text contains a message addressed to the marker." }],
    },
  },
];
