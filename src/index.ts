import { promises as fs } from 'fs';

const organization = process.argv[2];
const token = process.argv[3];

if (!organization || !token) {
  console.error('Error: Please provide the Azure DevOps organization name and personal access token as arguments.');
  console.error('Usage: node dist/index.js <organization> <pat>');
  process.exit(1);
}

const host = `https://dev.azure.com/${organization}`;
const apiVersion = '7.1-preview.1';
const maxRequestsPerMinute = 30;

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
  const repositories: any[] = [];
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
        project: repo.project.name
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
  console.log('-Fetching commits for ' + repo_name);
  
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
      console.log('-Error fetching contributors for ' + repo_name + ': ' + error);
      break;
    }
  }

  return allContributors;
}

// Function to write contributors to a CSV file
async function writeContributorsToCSV(repo: any, contributors: any) {
  const filePath = 'repos/' + repo + '-contributors.csv';
  const csvContent = JSON.stringify(contributors);
  await fs.writeFile(filePath, csvContent, 'utf8');
  console.log(`---Commits have been written to ${filePath}\n`);
}

async function storeReposToFile(repositories: any[], filePath: string) {
  const data = JSON.stringify(repositories, null, 2);
  await fs.writeFile(filePath, data, 'utf8');
  console.log(`Repositories have been written to ${filePath}`);
}

async function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAllUsers() {
  // Create repos directory if it doesn't exist
  await fs.mkdir('repos', { recursive: true });

  let repositories: any = [];

  const repositoriesExist = await fs.access('repositories.json')
    .then(() => true)
    .catch(() => false);

  if (repositoriesExist) {
    console.log('File repositories.json exists - no need to fetch again');
    const data = await fs.readFile('repositories.json', 'utf8');
    repositories = JSON.parse(data);
  } else {
    // First get all projects
    console.log('Fetching projects from organization...');
    const projects = await getAllProjects();
    console.log(`Found ${projects.length} projects`);

    // Then get repositories for each project
    for (const project of projects) {
      console.log(`Fetching repositories for project: ${project.name}`);
      const projectRepos = await getProjectRepositories(project.id, maxRequestsPerMinute);
      repositories.push(...projectRepos.map(repo => ({
        ...repo,
        projectId: project.id
      })));
      await wait(1000); // Small delay between projects
    }

    await storeReposToFile(repositories, 'repositories.json');
  }

  const numberOfRepos = repositories.length;
  console.log(numberOfRepos + ' repositories fetched');

  for (const repo of repositories) {
    await wait(3000);
    console.log('Fetching contributors for ' + repo.name);
    
    const contributorFilesExist = await fs.access('repos/' + repo.name + '-contributors.csv')
      .then(() => true)
      .catch(() => false);

    if (contributorFilesExist) {
      console.log('Commits file for ' + repo.name + ' exists - no need to fetch again');
    } else {
      const contributors = await getContributors(repo.id, repo.name, repo.projectId);
      const numberOfContributors = contributors.length;
      console.log('--Commits for ' + repo.name + ': ' + numberOfContributors);
      await writeContributorsToCSV(repo.name, contributors);
    }
  }

  // Read all contributor files and consolidate to unique contributors
  const uniqueContributors: Set<string> = new Set();
  const uniqueContributorsOthers: Set<string> = new Set();

  for (const repo of repositories) {
    const contributorFilePath = `repos/${repo.name}-contributors.csv`;
    const contributorFileExists = await fs.access(contributorFilePath)
      .then(() => true)
      .catch(() => false);

    if (contributorFileExists) {
      const contributorFileContent = await fs.readFile(contributorFilePath, 'utf8');
      const contributors = JSON.parse(contributorFileContent);
      const countFromFile = contributors.length;
      console.log('Contributors for ' + repo.name + ': ' + countFromFile);

      if (countFromFile > 0) {
        for (const commit of contributors) {
          const email = commit.author.email;
          if (email) {
            const pattern = new RegExp(`${organization}\\.visualstudio\\.com|${organization}\\.azure\\.com`, 'i');
            if (pattern.test(email)) {
              uniqueContributorsOthers.add(email);
            } else {
              uniqueContributors.add(email);
            }
          }
        }
      }
    }
  }

  // Save unique contributors to files
  const contributorsFilePath = 'unique-contributors.txt';
  const contributorsArray = Array.from(uniqueContributors);
  const contributorsCount = contributorsArray.length;
  const contributorsContent = 'Total number of unique contributors in the last 90 days: ' + contributorsCount + '\n' + contributorsArray.join('\n');
  await fs.writeFile(contributorsFilePath, contributorsContent);
  console.log(`Unique contributors have been written to ${contributorsFilePath}`);

  const contributorsFilePathOthers = 'unique-contributors-others.txt';
  const contributorsArrayOthers = Array.from(uniqueContributorsOthers);
  const contributorsCountOthers = contributorsArrayOthers.length;
  const contributorsContentOthers = 'Total number of unique contributors in the last 90 days: ' + contributorsCountOthers + '\n' + contributorsArrayOthers.join('\n');
  await fs.writeFile(contributorsFilePathOthers, contributorsContentOthers);
  console.log(`Unique contributors have been written to ${contributorsFilePathOthers}`);
}

getAllUsers();