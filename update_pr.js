import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';

// GitHub configuration
const token = 'GITHUB_PAT_TOKEN'; // Token should be provided as environment variable
const owner = 'hashgraph-online';
const repo = 'standards-agent-kit';
const fork_owner = 'hashgraphonlineintern';
const base_branch = 'main';
const head_branch = 'feature/plugin-system-fixed';
const pr_number = 17; // The PR we want to update

// Initialize Octokit
const octokit = new Octokit({
  auth: token
});

async function updatePullRequest() {
  try {
    console.log('Starting PR update process...');
    
    // Get the current commit SHA from our local branch
    const localCommitSha = fs.readFileSync('.git/refs/heads/feature/plugin-system-clean', 'utf8').trim();
    console.log(`Local commit SHA: ${localCommitSha}`);
    
    // Create a new reference (branch) in the fork
    console.log(`Creating new branch ${head_branch} in fork...`);
    await octokit.git.createRef({
      owner: fork_owner,
      repo: repo,
      ref: `refs/heads/${head_branch}`,
      sha: localCommitSha
    });
    
    // Update the PR to use the new branch
    console.log(`Updating PR #${pr_number} to use the new branch...`);
    await octokit.pulls.update({
      owner: owner,
      repo: repo,
      pull_number: pr_number,
      head: `${fork_owner}:${head_branch}`
    });
    
    console.log('PR update completed successfully!');
  } catch (error) {
    console.error('Error updating PR:', error);
  }
}

// Run the function
updatePullRequest();
