/**
 * GAME REGISTRY
 * ─────────────
 * To add a new game, just push an entry to this array.
 * The hub reads from this list to render the game grid.
 *
 * Fields:
 *   id          – unique slug (also the folder name under /games/)
 *   title       – display name
 *   subtitle    – short tagline
 *   category    – "card" | "board" | "strategy" | "party"
 *   players     – e.g. "2–5"
 *   duration    – e.g. "30–60 min"
 *   icon        – emoji for the card
 *   accentColor – hex color for the card accent
 *   status      – "playable" | "coming-soon"
 */

const GAMES = [
    {
    id: "five-crowns",
    title: "Five Crowns",
    subtitle: "The games not over until the Kings go wild!",
    category: "card",
    players: "2–7",
    duration: "45–90 min",
    icon: "👑",
    accentColor: "#c9a84c",
    status: "playable",
  },
  {
    id: "glory-to-rome",
    title: "Glory to Rome",
    subtitle: "Build the eternal city",
    category: "strategy",
    players: "2–5",
    duration: "45–90 min",
    icon: "🦅",
    accentColor: "#c9a84c",
    status: "playable",
  },
  {
    id: "shithead",
    title: "Bastard",
    subtitle: "Don't be the last one holding cards",
    category: "card",
    players: "2–5",
    duration: "15–30 min",
    icon: "💩",
    accentColor: "#c0392b",
    status: "playable",
  },
  {
    id: "lotr-deckbuilder",
    title: "Lord of the Rings Deckbuilder",
    subtitle: "Destroy the Ring",
    category: "strategy",
    players: "1",
    duration: "45–90 min",
    icon: "🧙‍♂️",
    accentColor: "#c9a84c",
    status: "playable",
  },
  {
    id: "five-hundred",
    title: "500",
    subtitle: "The classic trick-taking game",
    category: "card",
    players: "4",
    duration: "30–45 min",
    icon: "🃏",
    accentColor: "#2ecc71",
    status: "playable",
  },
     {
    id: "for-sale",
    title: "For Sale",
    subtitle: "The Game of Property and Prosperity",
    category: "card",
    players: "3-5",
    duration: "30–45 min",
    icon: "🏡",
    accentColor: "#2ecc71",
    status: "playable",
  }, 
  {
    id: "wotr-cardgame",
    title: "War of the Rings Deckbuilder",
    subtitle: "The Card Game",
    category: "strategy",
    players: "1",
    duration: "45–90 min",
    icon: "🧙‍♂️",
    accentColor: "#c9a84c",
    status: "playable",
  },
  { 
    id: "escalation-engine",
    title: "Trick Escalation Engine",
    subtitle: "Getting Higher and Higher",
    category: "strategy",
    players: "1",
    duration: "45–90 min",
    icon: "🏎️",
    accentColor: "#c9a84c",
    status: "playable",
  },
  {
    id: "spades",
    title: "Spades",
    subtitle: "Bid, bluff & beat your rivals",
    category: "card",
    players: "4",
    duration: "20–40 min",
    icon: "♠️",
    accentColor: "#3498db",
    status: "coming-soon",
  },
  {
    id: "hearts",
    title: "Hearts",
    subtitle: "Avoid the Queen at all costs",
    category: "card",
    players: "4",
    duration: "20–30 min",
    icon: "♥️",
    accentColor: "#e74c3c",
    status: "coming-soon",
  },
];
