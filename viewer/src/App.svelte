<script lang="ts">
  const buildLabel = "Viewer assets packaged";
</script>

<main class="viewer-shell" aria-labelledby="viewer-title">
  <section class="status-panel">
    <p class="eyebrow">Aictx local viewer</p>
    <h1 id="viewer-title">{buildLabel}</h1>
    <p>
      Static viewer assets are ready for the local runtime server integration.
    </p>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    min-width: 320px;
    min-height: 100vh;
    color: #172033;
    background: #f6f8fb;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
      sans-serif;
  }

  :global(*) {
    box-sizing: border-box;
  }

  .viewer-shell {
    display: grid;
    min-height: 100vh;
    place-items: center;
    padding: 32px;
  }

  .status-panel {
    width: min(100%, 560px);
    border: 1px solid #d8dee8;
    border-radius: 8px;
    padding: 28px;
    background: #ffffff;
    box-shadow: 0 16px 40px rgb(23 32 51 / 8%);
  }

  .eyebrow {
    margin: 0 0 8px;
    color: #52606d;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    color: #111827;
    font-size: 2rem;
    line-height: 1.04;
    letter-spacing: 0;
  }

  p {
    margin: 16px 0 0;
    max-width: 46ch;
    color: #3f4b5d;
    font-size: 1rem;
    line-height: 1.55;
  }

  @media (min-width: 700px) {
    h1 {
      font-size: 3rem;
    }
  }
</style>
