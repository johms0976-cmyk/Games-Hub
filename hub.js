/**
 * GAME HUB — UI Controller
 * Renders the game grid from the GAMES registry and handles filtering.
 */

let activeFilter = "all";

function renderGames(filter = "all") {
  const grid = document.getElementById("games-grid");
  const filtered =
    filter === "all" ? GAMES : GAMES.filter((g) => g.category === filter);

  grid.innerHTML = filtered
    .map((game) => {
      const isPlayable = game.status === "playable";
      const href = isPlayable ? `games/${game.id}/index.html` : "#";
      const cardClass = `game-card${isPlayable ? "" : " coming-soon"}`;

      return `
      <a href="${href}" class="${cardClass}" style="--card-accent: ${game.accentColor}"
         ${isPlayable ? "" : 'onclick="return false"'}>
        <span class="game-icon">${game.icon}</span>
        <div class="game-name">${game.title}</div>
        <div class="game-tagline">${game.subtitle}</div>
        <div class="game-meta">
          <span>👥 ${game.players}</span>
          <span>⏱ ${game.duration}</span>
          <span style="text-transform:capitalize">📂 ${game.category}</span>
        </div>
        <div class="game-badge ${isPlayable ? "playable" : "soon"}">
          ${isPlayable ? "Play Now" : "Coming Soon"}
        </div>
      </a>
    `;
    })
    .join("");
}

function setFilter(category, btn) {
  activeFilter = category;
  document
    .querySelectorAll(".filter-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  renderGames(category);
}

// Build filter buttons dynamically from game categories
function initFilters() {
  const bar = document.getElementById("filter-bar");
  const categories = [...new Set(GAMES.map((g) => g.category))];

  let html = `<button class="filter-btn active" onclick="setFilter('all', this)">All Games</button>`;
  categories.forEach((cat) => {
    const label = cat.charAt(0).toUpperCase() + cat.slice(1);
    html += `<button class="filter-btn" onclick="setFilter('${cat}', this)">${label}</button>`;
  });
  bar.innerHTML = html;
}

// ── Init ──
document.addEventListener("DOMContentLoaded", () => {
  initFilters();
  renderGames();
});
