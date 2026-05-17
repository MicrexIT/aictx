import { getCollection } from "astro:content";
import { buildSitemapXml, staticSitePaths } from "../seo";

export async function GET(): Promise<Response> {
  const posts = await getCollection("blog");
  const paths = [...staticSitePaths, ...posts.map((post) => `/blog/${post.id}/`)];

  return new Response(buildSitemapXml(paths), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8"
    }
  });
}
