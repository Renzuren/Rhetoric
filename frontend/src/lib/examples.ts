export interface Example {
  id: string;
  name: string;
  description: string;
  tag: string;
  text: string;
}

export const EXAMPLES: Example[] = [
  {
    id: "twitter-thread",
    name: "Twitter thread",
    description:
      "A numbered thread arguing about the causes of inflation, with two opposing views.",
    tag: "social",
    text: `1/ @User123: Government spending is the real cause of inflation.
2/ Cites 2021-2024 federal spending data (US Treasury).
3/ @AnotherUser: Actually, it's corporate greed, not government spending, that's the real cause.
4/ Cites record corporate profits and price markups (from company reports).
5/ Appeal to emotion ("greedy corporations are to blame").
6/ @SomeoneElse: Btw, have you considered that both could be true? It's a combination.
7/ @User123: So basically, government spending is the main driver, not corporate greed.`,
  },
  {
    id: "debate-transcript",
    name: "Debate transcript",
    description:
      "A short moderated debate on banning cars from city centers. Two speakers.",
    tag: "transcript",
    text: `Moderator: Should cities ban private cars from their centers?

Alice: Yes. Studies from three European cities show traffic drops of about 30% after such bans.
Air quality also improves measurably within weeks.

Bob: That's shortsighted. A 2024 study of Madrid found retail revenue fell 8% in the restricted zone.

Alice: But retail sales in Oslo actually rose 4% after their restriction. The economic argument cuts both ways.

Bob: Oslo is a special case. You're cherry-picking the data.`,
  },
  {
    id: "op-ed",
    name: "Op-ed paragraph",
    description:
      "Continuous prose. Tests the sentence-splitting fallback.",
    tag: "prose",
    text: `The argument that government spending caused the recent inflation is incomplete. While federal spending did rise sharply in 2021 and 2022, corporate profit margins expanded during the same period at rates not seen in decades. A serious analysis has to weigh both factors rather than pinning the blame on one. Unfortunately, most public debate ignores this complexity entirely, preferring a simple villain to a complicated cause.`,
  },
  {
    id: "reddit-discussion",
    name: "Reddit discussion",
    description:
      "Threaded comments with usernames. Multi-turn back and forth.",
    tag: "social",
    text: `u/skeptic42: Remote work is obviously better for productivity.

u/datadriven: A 2023 Stanford study of 16,000 workers found a 13% productivity gain for remote workers.

u/datadriven: But a Microsoft study found remote workers were less collaborative across teams.

u/skeptic42: Collaboration isn't the same as productivity. You're moving the goalposts.

u/quietobserver: Have you considered that productivity might vary by role? Knowledge workers vs. manufacturing.`,
  },
];