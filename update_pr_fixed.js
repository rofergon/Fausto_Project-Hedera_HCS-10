import { Octokit } from '@octokit/rest';

// GitHub configuration
const token = 'GITHUB_PAT_TOKEN'; // Token should be provided as environment variable
const owner = 'hashgraph-online';
const repo = 'standards-agent-kit';
const pr_number = 17; // The PR we want to update

// Initialize Octokit
const octokit = new Octokit({
  auth: token
});

// Read the PR description from file
import * as fs from 'fs';
import * as path from 'path';

async function updatePullRequestDescription() {
  try {
    console.log('Starting PR description update process...');
    
    // Read the PR description from file
    const prDescription = fs.readFileSync('PULL_REQUEST.md', 'utf8');
    console.log('PR description loaded from file');
    
    // Update the PR description
    console.log(`Updating PR #${pr_number} description...`);
    await octokit.pulls.update({
      owner: owner,
      repo: repo,
      pull_number: pr_number,
      body: prDescription
    });
    
    console.log('PR description updated successfully!');
  } catch (error) {
    console.error('Error updating PR description:', error);
  }
}

// Run the function
updatePullRequestDescription();
