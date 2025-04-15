/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 925:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {


var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
const fs_1 = __nccwpck_require__(147);
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
function getAllProjects() {
    return __awaiter(this, void 0, void 0, function* () {
        const projects = [];
        let continuationToken = undefined;
        do {
            const url = new URL(`${host}/_apis/projects`);
            url.searchParams.append('api-version', apiVersion);
            if (continuationToken) {
                url.searchParams.append('continuationToken', continuationToken);
            }
            const response = yield fetch(url.toString(), {
                headers: {
                    'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) {
                console.error('Error fetching projects:', response.statusText);
                break;
            }
            const data = yield response.json();
            projects.push(...data.value);
            // Get continuation token from response headers
            continuationToken = response.headers.get('x-ms-continuation');
        } while (continuationToken);
        return projects;
    });
}
// Function to fetch all repositories for a specific project with throttling
function getProjectRepositories(projectId, maxRequestsPerMinute) {
    return __awaiter(this, void 0, void 0, function* () {
        const repositories = [];
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
            const response = yield fetch(url.toString(), {
                headers: {
                    'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) {
                console.error('Error fetching repositories:', response.statusText);
                break;
            }
            const data = yield response.json();
            if (data.value) {
                repositories.push(...data.value.map((repo) => ({
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
                    yield new Promise(resolve => setTimeout(resolve, delay));
                }
                remainingRequests = maxRequestsPerMinute;
            }
            // Get continuation token from response headers
            continuationToken = response.headers.get('x-ms-continuation');
        } while (continuationToken);
        return repositories;
    });
}
// Function to find all contributing users for a repository within the last 90 days
function getContributors(repo_id, repo_name, projectId) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('-Fetching commits for ' + repo_name);
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const sinceDate = ninetyDaysAgo.toISOString();
        let allContributors = [];
        let skip = 0;
        const top = 100;
        while (true) {
            try {
                const url = new URL(`${host}/${projectId}/_apis/git/repositories/${repo_id}/commits`);
                url.searchParams.append('api-version', apiVersion);
                url.searchParams.append('searchCriteria.fromDate', sinceDate);
                url.searchParams.append('$top', top.toString());
                url.searchParams.append('$skip', skip.toString());
                const response = yield fetch(url.toString(), {
                    headers: {
                        'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                        'Content-Type': 'application/json'
                    }
                });
                if (!response.ok) {
                    console.error('Error fetching commits:', response.statusText);
                    break;
                }
                const data = yield response.json();
                if (!data.value || data.value.length === 0) {
                    break;
                }
                allContributors = allContributors.concat(data.value);
                skip += top;
                // Delay to respect rate limits
                yield new Promise(resolve => setTimeout(resolve, 3000));
            }
            catch (error) {
                console.log('-Error fetching contributors for ' + repo_name + ': ' + error);
                break;
            }
        }
        return allContributors;
    });
}
// Function to write contributors to a CSV file
function writeContributorsToCSV(repo, contributors) {
    return __awaiter(this, void 0, void 0, function* () {
        const filePath = 'repos/' + repo + '-contributors.csv';
        const csvContent = JSON.stringify(contributors);
        yield fs_1.promises.writeFile(filePath, csvContent, 'utf8');
        console.log(`---Commits have been written to ${filePath}\n`);
    });
}
function storeReposToFile(repositories, filePath) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = JSON.stringify(repositories, null, 2);
        yield fs_1.promises.writeFile(filePath, data, 'utf8');
        console.log(`Repositories have been written to ${filePath}`);
    });
}
function wait(ms) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise(resolve => setTimeout(resolve, ms));
    });
}
function getAllUsers() {
    return __awaiter(this, void 0, void 0, function* () {
        // Create repos directory if it doesn't exist
        yield fs_1.promises.mkdir('repos', { recursive: true });
        let repositories = [];
        const repositoriesExist = yield fs_1.promises.access('repositories.json')
            .then(() => true)
            .catch(() => false);
        if (repositoriesExist) {
            console.log('File repositories.json exists - no need to fetch again');
            const data = yield fs_1.promises.readFile('repositories.json', 'utf8');
            repositories = JSON.parse(data);
        }
        else {
            // First get all projects
            console.log('Fetching projects from organization...');
            const projects = yield getAllProjects();
            console.log(`Found ${projects.length} projects`);
            // Then get repositories for each project
            for (const project of projects) {
                console.log(`Fetching repositories for project: ${project.name}`);
                const projectRepos = yield getProjectRepositories(project.id, maxRequestsPerMinute);
                repositories.push(...projectRepos.map(repo => (Object.assign(Object.assign({}, repo), { projectId: project.id }))));
                yield wait(1000); // Small delay between projects
            }
            yield storeReposToFile(repositories, 'repositories.json');
        }
        const numberOfRepos = repositories.length;
        console.log(numberOfRepos + ' repositories fetched');
        for (const repo of repositories) {
            yield wait(3000);
            console.log('Fetching contributors for ' + repo.name);
            const contributorFilesExist = yield fs_1.promises.access('repos/' + repo.name + '-contributors.csv')
                .then(() => true)
                .catch(() => false);
            if (contributorFilesExist) {
                console.log('Commits file for ' + repo.name + ' exists - no need to fetch again');
            }
            else {
                const contributors = yield getContributors(repo.id, repo.name, repo.projectId);
                const numberOfContributors = contributors.length;
                console.log('--Commits for ' + repo.name + ': ' + numberOfContributors);
                yield writeContributorsToCSV(repo.name, contributors);
            }
        }
        // Read all contributor files and consolidate to unique contributors
        const uniqueContributors = new Set();
        const uniqueContributorsOthers = new Set();
        for (const repo of repositories) {
            const contributorFilePath = `repos/${repo.name}-contributors.csv`;
            const contributorFileExists = yield fs_1.promises.access(contributorFilePath)
                .then(() => true)
                .catch(() => false);
            if (contributorFileExists) {
                const contributorFileContent = yield fs_1.promises.readFile(contributorFilePath, 'utf8');
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
                            }
                            else {
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
        yield fs_1.promises.writeFile(contributorsFilePath, contributorsContent);
        console.log(`Unique contributors have been written to ${contributorsFilePath}`);
        const contributorsFilePathOthers = 'unique-contributors-others.txt';
        const contributorsArrayOthers = Array.from(uniqueContributorsOthers);
        const contributorsCountOthers = contributorsArrayOthers.length;
        const contributorsContentOthers = 'Total number of unique contributors in the last 90 days: ' + contributorsCountOthers + '\n' + contributorsArrayOthers.join('\n');
        yield fs_1.promises.writeFile(contributorsFilePathOthers, contributorsContentOthers);
        console.log(`Unique contributors have been written to ${contributorsFilePathOthers}`);
    });
}
getAllUsers();


/***/ }),

/***/ 147:
/***/ ((module) => {

module.exports = require("fs");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId].call(module.exports, module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __nccwpck_require__(925);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;