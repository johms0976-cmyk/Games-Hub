'use strict';
/* Android: Netrunner — How to play (LESSONS-CHECKLIST F2).
 *
 * A lobby mode on the real game: the Haas-Bioroid and Shaper starter decks, a
 * game to 5 agenda points, a gentle house (it never springs an ambush or plays
 * damage on the learner), a coach on the learner's phone, and these lessons:
 * cards held for the table the first time each kind of question comes to the
 * learner. No rulebook came with the box, so there is no walkthrough to script;
 * the lessons are raised from the learner's own open question (public: what
 * is about to happen), never from a logged event.
 */
(function (root) {
  const LESSONS = [
    { id: 'welcome', when: (pub, me, pr) => pr.what === 'mulligan', title: 'How to play Android: Netrunner',
      text: [
        'One player is the Corp, a megacorporation guarding its plans; the other is the Runner, a hacker breaking in to steal them.',
        'Those plans are agendas. The Corp scores an agenda by advancing it; the Runner steals one by finding it on a run. In this lesson game the first to 5 agenda points wins (a full game is 7).',
        'Everything happens a click at a time: the Corp has 3 clicks a turn, the Runner 4.',
        'Your phone has three tabs: Play (your hand and choices), Table (both sides, everything public) and Rules. The coach under each question shows what the house would do in your place.',
        'First: your opening hand. Keep it, or shuffle it away once for a new five.'] },
    { id: 'corpTurn', when: (pub, me, pr) => me.side === 'corp' && pr.t === 'turn', title: 'Your turn as the Corp',
      text: [
        'Your turn begins with a free draw. Then three clicks, each one an action:',
        'Gain a credit · draw a card · install a card · play an operation · advance a card (a click and a credit for one advancement token).',
        'Ice is installed in front of a server to protect it. Agendas and assets go in a remote server — a server you make by installing there.',
        'An agenda with enough advancement tokens can be scored at once, free. Advancing shows the Runner where to look, so many Corps install and advance in the same turn.'] },
    { id: 'runnerTurn', when: (pub, me, pr) => me.side === 'runner' && pr.t === 'turn', title: 'Your turn as the Runner',
      text: [
        'Four clicks, each one an action: gain a credit · draw a card · install a program, hardware or resource · play an event · or make a run.',
        'A run attacks one server: HQ (the Corp’s hand), R&D (its deck), Archives (its discard pile) or a remote server. Get past the ice and you access cards there — and steal any agenda you find.',
        'Programs use memory (4 to start). Icebreakers are the programs that get you through ice.'] },
    { id: 'install', when: (pub, me, pr) => me.side === 'corp' && pr.what === 'installTo', title: 'Where it goes',
      text: [
        'HQ, R&D and Archives are the central servers. Remote servers are the ones you make.',
        'Ice goes in front of a server, outermost last. Each ice already protecting a server makes the next one cost a credit more.',
        'Agendas and assets go in a remote server’s root (one at a time); upgrades can go in any server.',
        'Everything is installed face down: the Runner sees only that something is there.'] },
    { id: 'rezIce', when: (pub, me, pr) => me.side === 'corp' && pr.what === 'rezIce', title: 'Rezzing ice',
      text: [
        'The Runner is approaching one of your face-down ice. Rez it now — pay its rez cost and turn it face up — or leave it face down and let the Runner pass.',
        'Ice you cannot afford to rez stops nothing, so keep credits for the ice that matters.'] },
    { id: 'rezCard', when: (pub, me, pr) => me.side === 'corp' && (pr.what === 'rezServer' || pr.what === 'startRez'), title: 'Rezzing your other cards',
      text: [
        'Assets and upgrades are rezzed the same way: pay their cost and turn them face up. You may do it at the start of your turn, during it, or as the Runner reaches a server.',
        'You are asked whether or not you have anything worth rezzing, so your silence never tells the Runner what is face down. “Carry on” is always fine.'] },
    { id: 'encounter', when: (pub, me, pr) => me.side === 'runner' && pr.t === 'enc', title: 'Meeting ice',
      text: [
        'Ice has subroutines (the ↳ lines). Every one you do not break happens to you — “End the run” stops the run here.',
        'An icebreaker breaks the subroutines of its type of ice (a fracter barriers, a decoder code gates, a killer sentries), if its strength is at least the ice’s. Pay to raise its strength, then pay to break.',
        'The menu prices every plan. Breaking nothing is allowed: the subroutines just fire.'] },
    { id: 'jack', when: (pub, me, pr) => me.side === 'runner' && pr.what === 'jack', title: 'Pressing on',
      text: [
        'Between pieces of ice you may jack out: the run ends, nothing more happens to you, and you access nothing.',
        'Press on and you approach the next ice — or, past the last one, the server itself.'] },
    { id: 'access', when: (pub, me, pr) => me.side === 'runner' && pr.what === 'trash', title: 'Accessing cards',
      text: [
        'You are looking at one of the Corp’s cards. An agenda you access is stolen at once.',
        'Other cards with a trash cost (the number in the bottom corner) can be trashed if you pay it — a good way to cost the Corp its money-makers. Or leave it.'] },
    { id: 'score', when: (pub, me, pr) => me.side === 'corp' && pr.t === 'turn' && (pr.options || []).some(o => /^score:/.test(o.id)), title: 'Scoring',
      text: [
        'One of your agendas has as many advancement tokens as it needs. Score it now: it is free, and it can no longer be stolen.'] },
    { id: 'trace', when: (pub, me, pr) => pr.what === 'traceC' || pr.what === 'traceR', title: 'Traces',
      text: [
        'A trace is a bidding contest. The Corp’s strength is the trace’s number plus the credits it spends; the Runner’s is their link plus the credits they spend.',
        'If the Corp’s strength is higher, the trace succeeds and its effect happens (often a tag).'] },
    { id: 'tagged', when: (pub, me, pr) => me.side === 'runner' && pr.t === 'turn' && pub.runner.tags > 0, title: 'Tags',
      text: [
        'You have a tag. While tagged, the Corp may spend a click and 2 credits to trash one of your resources, and some Corp cards hurt tagged Runners.',
        'Remove a tag with a click and 2 credits.'] },
    { id: 'discard', when: (pub, me, pr) => pr.what === 'discard', title: 'Hand size',
      text: [
        'At the end of your turn you keep no more cards than your maximum hand size (5 to start). Choose what to discard.',
        'For the Runner, damage lowers the hand: lose a card you do not have, and you are flatlined — the Corp wins.'] }
  ];
  /* The next lesson for this seat's open question, or null. */
  function next(pub, me, seen) {
    const pr = me && me.prompt;
    if (!pr) return null;
    for (const L of LESSONS) {
      if (seen.indexOf(L.id) >= 0) continue;
      try { if (L.when(pub, me, pr)) return { id: L.id, title: L.title, text: L.text }; } catch (e) { /* a lesson never breaks the game */ }
    }
    return null;
  }
  function html(lesson, esc) {
    return '<div class="lesson"><div class="lesson-k">How to play</div><h2>' + esc(lesson.title) + '</h2>' + lesson.text.map(t => '<p>' + esc(t) + '</p>').join('') + '</div>';
  }
  const Learn = { VERSION: 1, LESSONS, next, html, DECKS: { corp: 'hb', runner: 'shaper' }, WIN: 5 };
  if (typeof module !== 'undefined' && module.exports) module.exports = Learn;
  else root.NrLearn = Learn;
})(typeof window !== 'undefined' ? window : this);
