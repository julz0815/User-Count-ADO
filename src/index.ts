import { promises as fs } from 'fs';
import * as readline from 'readline';

interface Commit {
  author: {
    email: string;
    name: string;
  };
}

interface Repository {
  name: string;
  id: string;
  project: string;
  projectId: string;
  selected?: boolean;
}

// Parse command line arguments
const args = process.argv.slice(2);
const organization = args[0];
const token = args[1];
let forceReload = false;
let interactive = false;
let regexPattern = '/microsoft\\.com$/i';
let regexFile: string | undefined;
const maxRequestsPerMinute = 30;

// Parse additional arguments
for (let i = 2; i < args.length; i++) {
  if (args[i] === '--force-reload') {
    forceReload = true;
  } else if (args[i] === '--interactive') {
    interactive = true;
  } else if (args[i] === '--regex' && i + 1 < args.length) {
    regexPattern = args[++i];
  } else if (args[i] === '--regex-file' && i + 1 < args.length) {
    regexFile = args[++i];
  }
}

if (!organization || !token) {
  console.error('Error: Please provide the Azure DevOps organization name and personal access token as arguments.');
  console.error('Usage: ts-node src/index.ts <organization> <pat> [options]');
  console.error('Options:');
  console.error('  --force-reload    Force reload of repositories');
  console.error('  --interactive    Enable interactive repository selection');
  console.error('  --regex <pattern> Use custom regex pattern for email categorization');
  console.error('  --regex-file <file> Read regex pattern from file');
  process.exit(1);
}

const host = `https://dev.azure.com/${organization}`;
const apiVersion = '7.1-preview.1';

// Create readline interface for interactive mode
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to prompt user for input
const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

// Function to get regex pattern
async function getRegexPattern(): Promise<RegExp> {
  if (regexFile) {
    try {
      const pattern = await fs.readFile(regexFile, 'utf8');
      return new RegExp(pattern.trim());
    } catch (error) {
      console.error(`Error reading regex file: ${error}`);
      process.exit(1);
    }
  }
  
  // Handle regex pattern with flags
  const match = regexPattern.match(/^\/(.*)\/([a-z]*)$/);
  if (match) {
    const [, pattern, flags] = match;
    console.log(`Using regex pattern: ${pattern} with flags: ${flags}`);
    return new RegExp(pattern, flags);
  }
  
  // If no slashes, treat as a simple pattern
  console.log(`Using simple pattern: ${regexPattern}`);
  return new RegExp(regexPattern, 'i');
}

// Function to get all projects in the organization
async function getAllProjects() {
  const projects: any[] = [];
  let continuationToken = undefined;

  do {
    const url = new URL(`${host}/_apis/projects`);
    url.searchParams.append('api-version', apiVersion);
    if (continuationToken) {
      url.searchParams.append('continuationToken', continuationToken);
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error('Error fetching projects:', response.statusText);
      break;
    }

    const data = await response.json();
    projects.push(...data.value);

    // Get continuation token from response headers
    continuationToken = response.headers.get('x-ms-continuation');
  } while (continuationToken);

  return projects;
}

// Function to fetch all repositories for a specific project with throttling
async function getProjectRepositories(projectId: string, maxRequestsPerMinute: number) {
  const repositories: Repository[] = [];
  let continuationToken = undefined;
  const maxRequestsPerSecond = maxRequestsPerMinute / 60;
  let remainingRequests = maxRequestsPerMinute;

  do {
    const startTime = Date.now();

    const url = new URL(`${host}/${projectId}/_apis/git/repositories`);
    url.searchParams.append('api-version', apiVersion);
    if (continuationToken) {
      url.searchParams.append('continuationToken', continuationToken);
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error('Error fetching repositories:', response.statusText);
      break;
    }

    const data = await response.json();
    
    if (data.value) {
      repositories.push(...data.value.map((repo: any) => ({
        name: repo.name,
        id: repo.id,
        project: repo.project.name,
        projectId: projectId,
        selected: true
      })));
    }

    remainingRequests--;

    if (remainingRequests === 0) {
      const elapsedTime = Date.now() - startTime;
      const delay = Math.ceil(1000 / maxRequestsPerSecond) - elapsedTime;
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      remainingRequests = maxRequestsPerMinute;
    }

    // Get continuation token from response headers
    continuationToken = response.headers.get('x-ms-continuation');
  } while (continuationToken);

  return repositories;
}

// Function to find all contributing users for a repository within the last 90 days
async function getContributors(repo_id: string, repo_name: string, projectId: string) {
  console.log(`-Fetching commits for ${repo_name}`);
  
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const sinceDate = ninetyDaysAgo.toISOString();

  let allContributors: any = [];
  let skip = 0;
  const top = 100;

  while (true) {
    try {
      const url = new URL(`${host}/${projectId}/_apis/git/repositories/${repo_id}/commits`);
      url.searchParams.append('api-version', apiVersion);
      url.searchParams.append('searchCriteria.fromDate', sinceDate);
      url.searchParams.append('$top', top.toString());
      url.searchParams.append('$skip', skip.toString());

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('Error fetching commits:', response.statusText);
        break;
      }

      const data = await response.json();
      
      if (!data.value || data.value.length === 0) {
        break;
      }

      allContributors = allContributors.concat(data.value);
      skip += top;

      // Delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.log(`-Error fetching contributors for ${repo_name}: ${error}`);
      break;
    }
  }

  return allContributors;
}

// Function to write contributors to a CSV file
async function writeContributorsToCSV(repo: string, contributors: any) {
  const filePath = `repos/${repo}-contributors.csv`;
  const csvContent = JSON.stringify(contributors);
  await fs.writeFile(filePath, csvContent);
  console.log(`---Commits have been written to ${filePath}\n`);
}

async function storeReposToFile(repositories: Repository[]) {
  const filePath = 'repositories.json';
  const data = JSON.stringify(repositories, null, 2);
  await fs.writeFile(filePath, data);
  console.log(`Repositories have been written to ${filePath}`);
}

async function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to delete cached commit files
async function deleteCachedCommitFiles(): Promise<void> {
  try {
    const files = await fs.readdir('repos');
    for (const file of files) {
      if (file.endsWith('-contributors.csv')) {
        await fs.unlink(`repos/${file}`);
        console.log(`Deleted cached file: repos/${file}`);
      }
    }
  } catch (error) {
    console.error('Error deleting cached files:', error);
  }
}

// Function to write committers per repo to a file
async function writeCommittersPerRepo(committers: Map<string, Set<string>>): Promise<void> {
  const filePath = 'committers-per-repo.txt';
  let content = '';
  
  for (const [repo, committerSet] of committers) {
    content += `${repo}\n`;
    for (const committer of committerSet) {
      content += `  ${committer}\n`;
    }
    content += '\n';
  }
  
  await fs.writeFile(filePath, content);
  console.log(`Committers per repo saved to ${filePath}`);
  console.log(`Total repositories with committers: ${committers.size}`);
  let totalCommitters = 0;
  for (const committerSet of committers.values()) {
    totalCommitters += committerSet.size;
  }
  console.log(`Total unique committers across all repositories: ${totalCommitters}`);
}

async function getAllUsers() {
  console.log('Starting contributor analysis...');
  console.log(`Azure DevOps Organization: ${organization}`);
  console.log(`Time period: Last 90 days`);

  let repositories: Repository[] = [];
  const regex = await getRegexPattern();
  const committersPerRepo = new Map<string, Set<string>>();

  try {
    // Check if repositories.json exists and force reload is not set
    const repositoriesExist = await fs.access('repositories.json')
      .then(() => true)
      .catch(() => false);

    if (repositoriesExist && !forceReload) {
      console.log('Using cached repositories from repositories.json');
      const data = await fs.readFile('repositories.json', 'utf8');
      repositories = JSON.parse(data);
    } else {
      // Delete cached files if force-reload is specified
      if (forceReload) {
        console.log('Force reload specified, deleting cached files...');
        await deleteCachedCommitFiles();
        try {
          await fs.access('repositories.json');
          await fs.unlink('repositories.json');
          console.log('Deleted repositories.json');
        } catch (error) {
          // File doesn't exist, which is fine
        }
      }

      console.log('Fetching projects from organization...');
      const projects = await getAllProjects();
      console.log(`Found ${projects.length} projects`);

      // Then get repositories for each project
      for (const project of projects) {
        console.log(`Fetching repositories for project: ${project.name}`);
        const projectRepos = await getProjectRepositories(project.id, maxRequestsPerMinute);
        repositories.push(...projectRepos);
        await wait(1000); // Small delay between projects
      }

      // Save repositories to file
      await storeReposToFile(repositories);

      // Show instructions for repository selection
      console.log('\nInitial repository fetch complete!');
      console.log('The repositories.json file has been created with all repositories.');
      console.log('\nTo adjust which repositories should be analyzed:');
      console.log('1. Open repositories.json in a text editor');
      console.log('2. Each repository entry has a "selected" field (true/false)');
      console.log('   - Set to "true" to include the repository in the analysis');
      console.log('   - Set to "false" to exclude the repository from the analysis');
      console.log('3. Save the file and run the script again without --force-reload');
      console.log('\nTo proceed with the current selection, run the script again without any changes');
      console.log('To fetch repositories again, use --force-reload');
      console.log('To use interactive selection, use --interactive');
      
      // Ask user if they want to proceed
      const answer = await question('\nDo you want to proceed with the current repository selection? (y/n): ');
      if (answer.toLowerCase() !== 'y') {
        console.log('\nPlease adjust the repositories.json file and run the script again.');
        process.exit(0);
      }
    }

    // Filter repositories based on selection
    const selectedRepositories = repositories.filter(repo => repo.selected);
    console.log(`\nProcessing ${selectedRepositories.length} selected repositories`);

    // Create repos directory if it doesn't exist
    try {
      await fs.mkdir('repos', { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }

    // Process each selected repository
    for (const [index, repo] of selectedRepositories.entries()) {
      console.log(`\nProcessing repository ${index + 1}/${selectedRepositories.length}: ${repo.name}`);
      
      const contributorFilePath = `repos/${repo.name}-contributors.csv`;
      const contributorFileExists = await fs.access(contributorFilePath)
        .then(() => true)
        .catch(() => false);

      if (forceReload || !contributorFileExists) {
        console.log(`Fetching commits for ${repo.name}...`);
        const contributors = await getContributors(repo.id, repo.name, repo.projectId);
        if (contributors.length > 0) {
          await writeContributorsToCSV(repo.name, contributors);
          console.log(`Found ${contributors.length} commits for ${repo.name}`);
          
          // Only read the file if we found commits and wrote them
          const repoCommitters = new Set<string>();
          try {
            const contributorFileContent = await fs.readFile(contributorFilePath, 'utf8');
            const contributors = JSON.parse(contributorFileContent) as Commit[];
            
            for (const contributor of contributors) {
              const email = contributor.author.email.toLowerCase();
              repoCommitters.add(email);
            }
            console.log(`Found ${repoCommitters.size} unique committers for ${repo.name}`);
            
            // Get the full repo name with project
            const fullRepoName = `${repo.project}/${repo.name}`;
            committersPerRepo.set(fullRepoName, repoCommitters);
          } catch (error) {
            console.error(`Error reading contributors for ${repo.name}:`, error);
          }
        } else {
          console.log(`No commits found for ${repo.name} in the last 90 days`);
        }
      } else {
        console.log(`Using cached commits for ${repo.name}`);
        // Read from existing file
        const repoCommitters = new Set<string>();
        try {
          const contributorFileContent = await fs.readFile(contributorFilePath, 'utf8');
          const contributors = JSON.parse(contributorFileContent) as Commit[];
          
          for (const contributor of contributors) {
            const email = contributor.author.email.toLowerCase();
            repoCommitters.add(email);
          }
          console.log(`Found ${repoCommitters.size} unique committers for ${repo.name}`);
          
          // Get the full repo name with project
          const fullRepoName = `${repo.project}/${repo.name}`;
          committersPerRepo.set(fullRepoName, repoCommitters);
        } catch (error) {
          console.error(`Error reading contributors for ${repo.name}:`, error);
        }
      }
    }

    // Write committers per repo to file
    await writeCommittersPerRepo(committersPerRepo);

    // Consolidate unique contributors
    console.log('\nConsolidating unique contributors...');
    const uniqueContributors: Set<string> = new Set();
    const uniqueContributorsOthers: Set<string> = new Set();

    for (const repo of selectedRepositories) {
      const contributorFilePath = `repos/${repo.name}-contributors.csv`;
      const contributorFileExists = await fs.access(contributorFilePath)
        .then(() => true)
        .catch(() => false);

      if (contributorFileExists) {
        const contributorFileContent = await fs.readFile(contributorFilePath, 'utf8');
        const contributors = JSON.parse(contributorFileContent) as Commit[];
        
        for (const contributor of contributors) {
          const email = contributor.author.email.toLowerCase();
          const matches = regex.test(email);
          
          if (matches) {
            // If email matches the pattern (e.g., microsoft.com), put it in others
            uniqueContributorsOthers.add(email);
          } else {
            // If email doesn't match the pattern, put it in regular contributors
            uniqueContributors.add(email);
          }
        }
      }
    }

    // Save results
    const contributorsArray = Array.from(uniqueContributors);
    const contributorsArrayOthers = Array.from(uniqueContributorsOthers);
    
    const contributorsContent = `Total number of unique contributors in the last 90 days: ${contributorsArray.length}\n${contributorsArray.join('\n')}`;
    const contributorsContentOthers = `Total number of unique contributors in the last 90 days: ${contributorsArrayOthers.length}\n${contributorsArrayOthers.join('\n')}`;

    await fs.writeFile('unique-contributors.txt', contributorsContent);
    await fs.writeFile('unique-contributors-others.txt', contributorsContentOthers);

    console.log('\nAnalysis complete!');
    console.log(`Total unique contributors: ${contributorsArray.length}`);
    console.log(`Total unique Microsoft contributors: ${contributorsArrayOthers.length}`);
    console.log('Results saved to unique-contributors.txt and unique-contributors-others.txt');

  } catch (error) {
    console.error('Error during analysis:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run the analysis
getAllUsers().catch(error => {
  console.error('Fatal error:', error instanceof Error ? error.message : 'Unknown error');
  process.exit(1);
});