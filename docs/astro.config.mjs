import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightLlmsTxt from "starlight-llms-txt";

export default defineConfig({
  site: "https://docs.aictx.dev",
  integrations: [
    starlight({
      title: "Aictx",
      description: "Local-first project memory for AI coding agents.",
      customCss: ["./src/styles/aictx.css"],
      editLink: {
        baseUrl: "https://github.com/MicrexIT/aictx/edit/main/docs/"
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/MicrexIT/aictx"
        }
      ],
      sidebar: [
        {
          label: "Start Here",
          items: [
            "getting-started",
            "capabilities",
            "mental-model",
            "specializing-aictx",
            "demand-driven-memory"
          ]
        },
        {
          label: "Use Aictx",
          items: ["cli", "mcp", "agent-integration", "viewer", "troubleshooting"]
        },
        {
          label: "Reference",
          items: ["reference"]
        }
      ],
      plugins: [starlightLlmsTxt()]
    })
  ]
});
