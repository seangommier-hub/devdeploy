export interface GitHubRepoRef {
  owner: string;
  repo: string;
}

/** Parses both HTTPS and SSH GitHub remote URL forms into an owner/repo pair. */
export function parseGitHubRepo(gitRepoUrl: string): GitHubRepoRef {
  const httpsMatch = gitRepoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+?)(\.git)?$/);
  if (!httpsMatch) {
    throw new Error(`Not a recognizable GitHub repo URL: ${gitRepoUrl}`);
  }
  return { owner: httpsMatch[1], repo: httpsMatch[2] };
}
