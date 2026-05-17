import { robotsTxt } from "../seo";

export function GET(): Response {
  return new Response(robotsTxt, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8"
    }
  });
}
