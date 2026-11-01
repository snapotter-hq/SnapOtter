// The semantic-release plugins ship no declaration files. Declare only the
// entry points that the release commit-analysis test calls.
declare module "@semantic-release/commit-analyzer" {
  export function analyzeCommits(config: object, context: object): Promise<string | null>;
}

declare module "@semantic-release/release-notes-generator" {
  export function generateNotes(config: object, context: object): Promise<string>;
}
