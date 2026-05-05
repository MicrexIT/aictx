const starTargets = [...document.querySelectorAll("[data-star-count]")];

function formatStars(count) {
  if (!Number.isFinite(count)) {
    return "GitHub";
  }

  if (count >= 1000) {
    return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`;
  }

  return String(count);
}

async function loadStars() {
  if (
    window.location.protocol === "file:" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    return;
  }

  try {
    const response = await fetch("https://api.github.com/repos/MicrexIT/aictx", {
      headers: {
        accept: "application/vnd.github+json"
      }
    });

    if (!response.ok) {
      return;
    }

    const repo = await response.json();
    const formatted = `${formatStars(Number(repo.stargazers_count))} stars`;

    for (const target of starTargets) {
      target.textContent = formatted;
      target.setAttribute("aria-label", `${formatted} GitHub stars`);
    }
  } catch {
    // Keep static GitHub label if the public API is unavailable.
  }
}

void loadStars();
