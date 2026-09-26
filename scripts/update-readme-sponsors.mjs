#!/usr/bin/env node
// Rewrites the README's <!-- sponsors --> block from GitHub Sponsors (issue #1076).
// Everyone who has ever sponsored publicly stays listed, including lapsed one-time
// sponsors; private sponsorships are left out. Order is by first sponsorship, so a
// new sponsor appends to the end and existing entries never reshuffle. Pure Node,
// no deps.
//
// Env:
//   SPONSORS_TOKEN   classic PAT with read:user for the sponsored account.
//                    GITHUB_TOKEN cannot read sponsorship data.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { escapeXml } from "./lib/xml-escape.mjs";

const MARKER = "<!-- sponsors -->";
// A User account, not an Organization: org-shaped sponsor queries return null.
const LOGIN = "snapotter-hq";
const README_PATH = "README.md";

// Organization fields need read:org, so logins come through the Actor interface
// and only Users contribute a display name (orgs fall back to their login). If a
// future org sponsor still trips a scope error, the run fails loudly.
const QUERY = `query($login: String!, $after: String) {
  user(login: $login) {
    sponsorshipsAsMaintainer(first: 100, after: $after, activeOnly: false, includePrivate: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        createdAt
        privacyLevel
        sponsorEntity {
          ... on Actor { login }
          ... on User { name }
        }
      }
    }
  }
}`;

export function selectSponsors(nodes) {
  const firstSeen = new Map();
  for (const n of nodes) {
    const login = n.sponsorEntity?.login;
    if (!login || n.privacyLevel !== "PUBLIC") continue;
    const prior = firstSeen.get(login);
    if (!prior || n.createdAt < prior.createdAt) {
      firstSeen.set(login, {
        login,
        name: n.sponsorEntity.name || login,
        createdAt: n.createdAt,
      });
    }
  }
  return [...firstSeen.values()]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(({ login, name }) => ({ login, name }));
}

export function renderSponsorsBlock(sponsors) {
  // An empty result means the query or token broke, not that every sponsor
  // vanished. Writing it would silently erase the list.
  if (sponsors.length === 0)
    throw new Error("No public sponsors returned; refusing to empty the block");
  const avatars = sponsors
    .map(
      (s) =>
        `  <a href="https://github.com/${s.login}"><img src="https://github.com/${s.login}.png?size=72" width="72" height="72" alt="${escapeXml(s.name)}"></a>`,
    )
    .join("\n");
  const handles = sponsors
    .map((s) => `<a href="https://github.com/${s.login}">@${s.login}</a>`)
    .join(" &nbsp;&middot;&nbsp; ");
  return [
    '<p align="center">',
    "  SnapOtter is free and open source, made possible by the people below.",
    "</p>",
    "",
    '<p align="center">',
    avatars,
    "</p>",
    "",
    '<p align="center">',
    `  ${handles}`,
    "</p>",
  ].join("\n");
}

export function replaceSponsorsBlock(readme, block) {
  const start = readme.indexOf(MARKER);
  const end = readme.indexOf(MARKER, start + MARKER.length);
  if (start === -1 || end === -1) throw new Error(`README is missing the paired ${MARKER} markers`);
  return `${readme.slice(0, start + MARKER.length)}\n${block}\n${readme.slice(end)}`;
}

async function fetchSponsorships(token, login) {
  const nodes = [];
  let after = null;
  do {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "snapotter-readme-sponsors",
      },
      body: JSON.stringify({ query: QUERY, variables: { login, after } }),
    });
    if (!res.ok)
      throw new Error(`GitHub GraphQL ${res.status} ${res.statusText}: ${await res.text()}`);
    const body = await res.json();
    if (body.errors?.length)
      throw new Error(`GitHub GraphQL errors: ${JSON.stringify(body.errors)}`);
    const page = body.data?.user?.sponsorshipsAsMaintainer;
    if (!page)
      throw new Error(
        `No sponsorship data for ${login}; is it a User account and does the token have read:user?`,
      );
    nodes.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return nodes;
}

async function main() {
  const token = process.env.SPONSORS_TOKEN;
  if (!token) throw new Error("SPONSORS_TOKEN is required (classic PAT with read:user)");

  const nodes = await fetchSponsorships(token, LOGIN);
  const orphaned = nodes.filter((n) => !n.sponsorEntity?.login).length;
  // Usually a deleted or suspended account. Say so, since it drops off the list.
  if (orphaned)
    console.warn(`Skipped ${orphaned} sponsorship(s) with no resolvable sponsor account`);
  const sponsors = selectSponsors(nodes);
  const readme = readFileSync(README_PATH, "utf8");
  const next = replaceSponsorsBlock(readme, renderSponsorsBlock(sponsors));
  if (next === readme) {
    console.log(`README sponsors block already current (${sponsors.length} sponsors)`);
    return;
  }
  writeFileSync(README_PATH, next);
  console.log(`README sponsors block rewritten (${sponsors.length} sponsors)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
