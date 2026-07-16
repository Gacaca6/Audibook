import { Book } from "../types";

// The starter audiobook every new user gets, narrated by the device's own voice.
export const sampleBook: Book = {
  id: "audi-adventures",
  title: "Audi's Adventures in Language Land",
  author: "Professor Owl",
  fileName: "audi_adventures.txt",
  uploadDate: new Date("2026-01-01").toISOString(),
  chaptersCount: 2,
  totalWords: 160,
  status: "ready",
  xpReward: 150,
  chapters: [
    {
      id: 1,
      title: "The Mysterious Book of Sound",
      text: "Deep inside the Whispering Woods, Audi the little owl found a dusty book with headphones drawn on its cover. 'Hoot!' she gasped as the book spoke to her: 'Welcome, listener!' Audi learned that audiobooks are magic scrolls that paint pictures in your mind through words you hear instead of read. To master this magic, Audi had to listen carefully to the tone, the rhythm, and the secrets hidden in every spoken sentence.",
      duration: 35,
      summary:
        "Audi discovers a magical talking book and learns that audiobooks paint pictures in your mind using pitch, tone, and pacing.",
      quiz: [
        {
          question: "Where did Audi find the mysterious talking book?",
          options: [
            "In a dusty library basement",
            "Deep inside the Whispering Woods",
            "On top of a snowy mountain peak",
            "Inside her cozy treehouse kitchen",
          ],
          correctOptionIndex: 1,
          explanation:
            "The story states that Audi found the mysterious talking book 'Deep inside the Whispering Woods'.",
        },
        {
          question: "What was drawn on the cover of the mysterious book?",
          options: ["A golden key", "A magical magnifying glass", "A pair of headphones", "A sleeping star"],
          correctOptionIndex: 2,
          explanation: "The book featured 'headphones drawn on its cover' symbolizing its spoken audiobook nature.",
        },
        {
          question: "According to the story, how do audiobooks paint pictures in your mind?",
          options: [
            "By shining colorful light beams",
            "Through spoken words that you listen to carefully",
            "By projecting hologram slides",
            "By releasing sweet forest fragrances",
          ],
          correctOptionIndex: 1,
          explanation:
            "Audiobooks paint pictures in your mind 'through words you hear instead of read' when you listen carefully.",
        },
      ],
    },
    {
      id: 2,
      title: "The Rhythm of the Hoot",
      text: "On the second day of her quest, Audi met Pip, a chatty chipmunk who spoke so fast that all his words blurred together like a runaway train. 'Slow down, Pip!' Audi laughed. 'A good audiobook needs a comfortable speed. Just like music, narration has a heartbeat. When we listen offline, we can take our time, breathe, and let each beautiful chapter settle into our memory.' Pip nodded, matching her slow, steady rhythm.",
      duration: 38,
      summary:
        "Audi teaches Pip the chipmunk that narration needs a controlled, musical pacing so listeners can digest every chapter.",
      quiz: [
        {
          question: "Who was Pip in Audi's second quest?",
          options: [
            "A sleepy badger scientist",
            "A tiny musical cricket",
            "A chatty chipmunk who spoke fast",
            "A majestic forest eagle",
          ],
          correctOptionIndex: 2,
          explanation: "Pip is introduced as 'a chatty chipmunk who spoke so fast' that his words blurred together.",
        },
        {
          question: "What did Audi compare audiobook narration to?",
          options: ["A heavy rain shower", "A heartbeat in music", "A crackling campfire", "A soaring wooden arrow"],
          correctOptionIndex: 1,
          explanation: "Audi says: 'Just like music, narration has a heartbeat' indicating its rhythmic nature.",
        },
        {
          question: "Why does Audi suggest listening offline or taking our time?",
          options: [
            "To save battery and data",
            "To avoid annoying forest interruptions",
            "To let each chapter settle into our memory",
            "To train our ears to speak faster",
          ],
          correctOptionIndex: 2,
          explanation:
            "Listening steadily allows us to 'take our time, breathe, and let each beautiful chapter settle into our memory'.",
        },
      ],
    },
  ],
};
