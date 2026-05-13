const starTargets = [...document.querySelectorAll("[data-star-count]")];

function formatStars(count) {
  if (!Number.isFinite(count)) {
    return "";
  }

  if (count >= 1000) {
    return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`;
  }

  return String(count);
}

async function loadStars() {
  if (window.location.protocol === "file:") {
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
    const count = formatStars(Number(repo.stargazers_count));

    if (!count) {
      return;
    }

    for (const target of starTargets) {
      const compact = target.dataset.starCount === "compact";
      const formatted = compact ? `★ ${count}` : `${count} stars`;
      target.textContent = formatted;
      target.setAttribute("aria-label", `${count} GitHub stars`);
    }
  } catch {
    // Keep static GitHub label if the public API is unavailable.
  }
}

void loadStars();
